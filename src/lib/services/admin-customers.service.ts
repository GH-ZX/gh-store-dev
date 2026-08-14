import "server-only";

import { refuseActiveChange, refuseRoleChange } from "@/lib/auth/admin-changes";
import { requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { safeFilterTerm } from "@/lib/supabase/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
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
};

export async function getAdminCustomer(userId: string): Promise<AdminCustomerDetail | null> {
  await requireAdmin();

  // Reject a malformed id here: sending it to Postgres would raise a type error
  // rather than simply finding nothing.
  if (!UUID_PATTERN.test(userId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, role, is_active, created_at, wallets (balance, currency)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const wallet = Array.isArray(data.wallets) ? data.wallets[0] : data.wallets;

  const { data: transactions } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, balance_after, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

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

  return { balance: data.balance, idempotent: data.idempotent };
}
