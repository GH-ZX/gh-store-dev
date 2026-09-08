import "server-only";
import { getOrders, type AdminOrderRow } from "@/lib/services/admin-orders.service";
import { listCustomerRecharges, type AdminRechargeRequest } from "@/lib/services/admin-recharge.service";

import { refuseActiveChange, refuseRoleChange } from "@/lib/auth/admin-changes";
import { requireAdmin } from "@/lib/auth/guards";
import { logOutcome } from "@/lib/logging/logger";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { notify } from "@/lib/services/notification.service";
import { enqueueTelegramAlert } from "@/lib/services/telegram-alerts.service";
import { safeFilterTerm } from "@/lib/supabase/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { HeaderWalletCustomer } from "@/lib/wallet-panel";
import type { WalletTransaction, WalletTransactionType } from "@/lib/services/wallet.service";

/**
 * Customer administration.
 *
 * Balances are only ever changed through the `admin_adjust_wallet` RPC, never by
 * writing `wallets.balance` or inserting a transaction directly. The RPC holds
 * the invariants that matter: it locks the wallet row, refuses to leave a
 * negative balance, writes the append-only audit row, and checks
 * `is_admin(auth.uid())` in the database rather than trusting this layer.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminCustomer = {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  balance: number;
  currency: string;
};

export class CustomerNotFoundError extends Error {
  constructor() {
    super("Customer not found.");
    this.name = "CustomerNotFoundError";
  }
}

export class NegativeBalanceError extends Error {
  constructor() {
    super("Adjustment would leave a negative balance.");
    this.name = "NegativeBalanceError";
  }
}

export class AdjustmentForbiddenError extends Error {
  constructor() {
    super("Administrator access required.");
    this.name = "AdjustmentForbiddenError";
  }
}

export async function listAdminCustomers(options: { query?: string } = {}): Promise<AdminCustomer[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  // One embedded read rather than a wallet query per customer.
  let request = supabase
    .from("profiles")
    .select("id, email, full_name, username, role, is_active, created_at, wallets (balance, currency)")
    .order("created_at", { ascending: false })
    .limit(200);

  const term = options.query?.trim();

  if (term) {
    const safe = safeFilterTerm(term);

    if (safe) {
      request = request.or(
        [`email.ilike.%${safe}%`, `full_name.ilike.%${safe}%`, `username.ilike.%${safe}%`].join(","),
      );
    }
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Reading customers failed: ${error.message}`);
  }

  return data.map((row) => {
    // A to-one embed can come back as an object or a single-element array.
    const wallet = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      username: row.username,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? "USD",
    };
  });
}

type WalletProfileEmbed = { id: string; email: string | null; full_name: string | null; username: string | null };

/**
 * The biggest wallets, for the header's admin panel.
 *
 * Deliberately not {@link listAdminCustomers}. That read serves the customers
 * page — two hundred profiles with their roles, activity and signup dates —
 * and the header used to make it on *every* page of the site, storefront
 * included, then serialise all of it into the RSC payload and again into a
 * client island. The panel paints a name and an amount, so this asks for a
 * name and an amount.
 *
 * Driven from `wallets` rather than `profiles` because the question is "where
 * does the money sit": that lets the database do the ordering and the cutting,
 * instead of shipping every customer so the browser can sort them. A wallet
 * exists for every customer and for no administrator, so the row set is the
 * same one the old query reached through an embed.
 */
export async function listTopWallets(limit = 25): Promise<HeaderWalletCustomer[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("wallets")
    .select("balance, currency, profiles!inner (id, email, full_name, username)")
    .order("balance", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Reading wallets failed: ${error.message}`);
  }

  return data.map((row) => {
    // `wallets.user_id` is a to-one key, so the embed is one profile, not a list.
    const profile = row.profiles as WalletProfileEmbed;

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      username: profile.username,
      balance: row.balance ?? 0,
      currency: row.currency || "USD",
    };
  });
}

export class AdminChangeRefusedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Change refused: ${reason}`);
    this.name = "AdminChangeRefusedError";
    this.reason = reason;
  }
}

/** Active administrators, for the rules that refuse to remove the last one. */
async function countActiveAdmins(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  return count ?? 0;
}

function auditPeopleChange(
  actorId: string,
  action: string,
  targetId: string,
  values: Record<string, unknown>,
): Promise<void> {
  return recordAudit({ actorId, action, entityType: "profile", entityId: targetId, values });
}

/**
 * Promote or demote an administrator.
 *
 * Until now this was a SQL statement run by hand, which the roadmap names as one
 * of the things standing between the dashboard and running the store without
 * touching the database.
 *
 * Written with service authority rather than the admin's own session: the
 * profiles policy deliberately does not let one row edit another's role, and
 * widening it would let any future bug in a customer-facing query do the same.
 * The refusals that protect the last way in are checked here and are covered by
 * their own tests.
 */
export async function setCustomerRole(userId: string, nextRole: string): Promise<void> {
  const admin = await requireAdmin();

  if (!UUID_PATTERN.test(userId)) {
    throw new CustomerNotFoundError();
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    throw new CustomerNotFoundError();
  }

  const refusal = refuseRoleChange({
    actorId: admin.id,
    targetId: userId,
    nextRole,
    targetIsAdmin: target.role === "admin",
    activeAdminCount: await countActiveAdmins(),
  });

  if (refusal) {
    throw new AdminChangeRefusedError(refusal);
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ role: nextRole })
    .eq("id", userId);

  if (error) {
    throw new Error(`Changing the role failed: ${error.message}`);
  }

  await auditPeopleChange(admin.id, "profile.role_changed", userId, {
    from: target.role,
    to: nextRole,
  });
}

/** Suspend or reactivate an account. */
export async function setCustomerActive(userId: string, nextActive: boolean): Promise<void> {
  const admin = await requireAdmin();

  if (!UUID_PATTERN.test(userId)) {
    throw new CustomerNotFoundError();
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    throw new CustomerNotFoundError();
  }

  const refusal = refuseActiveChange({
    actorId: admin.id,
    targetId: userId,
    nextActive,
    targetIsAdmin: target.role === "admin",
    activeAdminCount: await countActiveAdmins(),
  });

  if (refusal) {
    throw new AdminChangeRefusedError(refusal);
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ is_active: nextActive })
    .eq("id", userId);

  if (error) {
    throw new Error(`Changing the account status failed: ${error.message}`);
  }

  await auditPeopleChange(admin.id, nextActive ? "profile.reactivated" : "profile.suspended", userId, {
    is_active: nextActive,
  });
}

export type AdminCustomerDetail = {
  customer: AdminCustomer;
  transactions: WalletTransaction[];
  orders: AdminOrderRow[];
  recharges: AdminRechargeRequest[];
};

export async function getAdminCustomer(userId: string): Promise<AdminCustomerDetail | null> {
  await requireAdmin();

  // Reject a malformed id here: sending it to Postgres would raise a type error
  // rather than simply finding nothing.
  if (!UUID_PATTERN.test(userId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  // Four independent reads, one round trip's worth of waiting instead of four.
  const [{ data, error }, { data: transactions }, orders, recharges] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, username, role, is_active, created_at, wallets (balance, currency)")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("wallet_transactions")
      .select("id, type, amount, balance_after, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    getOrders({ userId, limit: 25 }),
    listCustomerRecharges(userId, 20),
  ]);

  if (error || !data) {
    return null;
  }

  const wallet = Array.isArray(data.wallets) ? data.wallets[0] : data.wallets;

  return {
    customer: {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      username: data.username,
      role: data.role,
      isActive: data.is_active,
      createdAt: data.created_at,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? "USD",
    },
    orders,
    recharges,
    transactions: (transactions ?? []).map((row) => ({
      id: row.id,
      type: row.type as WalletTransactionType,
      amount: row.amount,
      balanceAfter: row.balance_after,
      description: row.description,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Correct a balance.
 *
 * A positive amount credits, a negative one deducts. The idempotency key makes a
 * resubmitted form return the original result instead of adjusting twice, which
 * is the difference between a corrected balance and a doubled one.
 */
export async function adjustCustomerBalance(input: {
  userId: string;
  amount: number;
  description: string;
  idempotencyKey: string;
}): Promise<{ balance: number; idempotent: boolean }> {
  await requireAdmin();

  if (!UUID_PATTERN.test(input.userId)) {
    throw new CustomerNotFoundError();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("admin_adjust_wallet", {
      p_user_id: input.userId,
      p_amount: input.amount,
      p_description: input.description,
      p_idempotency_key: input.idempotencyKey,
    })
    .maybeSingle();

  if (error) {
    // The RPC raises these by message; map them so the action can answer with
    // the right explanation instead of a generic failure.
    const message = error.message.toLowerCase();

    if (message.includes("negative balance")) {
      throw new NegativeBalanceError();
    }

    if (message.includes("wallet not found")) {
      throw new CustomerNotFoundError();
    }

    if (message.includes("administrator access")) {
      throw new AdjustmentForbiddenError();
    }

    throw new Error(`Adjusting the balance failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("The wallet adjustment returned no result.");
  }

  if (!data.idempotent) {
    await notify({
      userId: input.userId,
      type: "wallet_adjusted",
      titleAr: input.amount > 0 ? "تم تعديل رصيدك" : "تم خصم من رصيدك",
      titleEn: input.amount > 0 ? "Your balance was adjusted" : "An amount was deducted from your balance",
      bodyAr: input.description || (input.amount > 0 ? `تمت إضافة ${input.amount.toFixed(2)} إلى محفظتك.` : `تم خصم ${Math.abs(input.amount).toFixed(2)} من محفظتك.`),
      bodyEn: input.description || (input.amount > 0 ? `${input.amount.toFixed(2)} was added to your wallet.` : `${Math.abs(input.amount).toFixed(2)} was deducted from your wallet.`),
      href: "/wallet",
      entityType: "wallet",
      entityId: input.userId,
    });
    await enqueueTelegramAlert({
      type: "wallet_adjusted",
      userId: input.userId,
      payload: { user_id: input.userId, amount: input.amount, balance: data.balance },
    });
  }

  return { balance: data.balance, idempotent: data.idempotent };
}

export type CustomerMessageResult = { ok: true } | { ok: false; reason: "not_found" | "unknown" };

/** Long enough for an explanation, short enough to stay a notification. */
const MESSAGE_TITLE_MAX = 120;
const MESSAGE_BODY_MAX = 1000;

/**
 * Write to one customer, by hand.
 *
 * Deliveries, refunds and top-up decisions already notify on their own. What had
 * no home was the message with a person behind it — "your top-up needs a
 * reference number", "we are out of stock until Sunday" — which until now meant
 * an owner had no way to reach a customer inside the store at all.
 *
 * The text is stored into both language columns as written. A notification's
 * schema wants Arabic and English, and asking for both every time would mean
 * writing each message twice; the alternative — one language stored and the
 * other blank — shows a customer an empty message. So the owner writes once, in
 * whichever language they and that customer share, and the panel says plainly
 * that it is shown as typed either way.
 *
 * Sent with service authority, like every other notification: the customer must
 * not be able to author one, and an admin's own session deliberately cannot
 * write this table. Audited, because a message signed by the store is something
 * that may later need attributing to a person.
 */
export async function sendCustomerMessage(input: {
  userId: string;
  title: string;
  body: string;
}): Promise<CustomerMessageResult> {
  const admin = await requireAdmin();

  const title = input.title.trim();
  const body = input.body.trim();

  if (!UUID_PATTERN.test(input.userId)) {
    return { ok: false, reason: "not_found" };
  }

  if (
    title.length === 0 ||
    title.length > MESSAGE_TITLE_MAX ||
    body.length === 0 ||
    body.length > MESSAGE_BODY_MAX
  ) {
    return { ok: false, reason: "unknown" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.userId)
    .maybeSingle();

  if (!target) {
    return { ok: false, reason: "not_found" };
  }

  const sent = await notify({
    userId: input.userId,
    type: "admin_message",
    titleAr: title,
    titleEn: title,
    bodyAr: body,
    bodyEn: body,
    // Nowhere to go: the message is the whole thing, and a link to the list the
    // reader is already on is a dead end dressed as an action.
    href: null,
    entityType: "profile",
    entityId: input.userId,
  });

  const result: CustomerMessageResult = sent ? { ok: true } : { ok: false, reason: "unknown" };

  if (sent) {
    await recordAudit({
      actorId: admin.id,
      action: "customer.message_sent",
      entityType: "profile",
      entityId: input.userId,
      // The message itself, so the audit row says what was sent and not merely
      // that something was.
      values: { title, body },
    });
  }

  logOutcome("admin.customers", "customer_message_sent", result, { userId: input.userId });

  return result;
}
