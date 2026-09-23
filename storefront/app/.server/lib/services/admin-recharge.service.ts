import { verifyBep20Transfer } from "@server/payments/bep20";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";
type Client = SupabaseClient<Database>;


import { requireAdminId } from "@server/lib/auth/guards";
import { notify } from "@server/lib/services/notification.service";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { normalizeRechargeConfig, type RechargeConfig } from "@server/lib/settings/recharge-settings";
import type { Json } from "@server/types/database";
import type { RechargeRequestStatus } from "@server/lib/services/recharge.service";

/**
 * Recharge administration.
 *
 * Approval is the only thing that moves money, and it goes through the
 * admin-gated RPC — which checks `is_admin(auth.uid())` in the database and is
 * idempotent per request, so approving twice credits once.
 */

const SETTLED: RechargeRequestStatus[] = ["approved", "rejected", "expired", "cancelled"];

export type AdminRechargeRequest = {
  paymentNetwork?: string | null;
  paymentTxHash?: string | null;
  paymentDestination?: string | null;
  id: string;
  reference: string;
  requestedAmount: number;
  creditedAmount: number | null;
  currency: string;
  paymentMethod: string;
  status: RechargeRequestStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  customer: { id: string; email: string | null; name: string | null };
};

type RequestProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
};

type RequestRow = {
  payment_network?: string | null;
  payment_tx_hash?: string | null;
  payment_destination?: string | null;
  id: string;
  reference: string;
  requested_amount: number;
  wallet_credit_amount: number | null;
  requested_currency: string;
  payment_method: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_id: string;
  profiles: RequestProfile[] | RequestProfile | null;
};

function toRequest(row: RequestRow): AdminRechargeRequest {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    reference: row.reference,
    paymentNetwork: row.payment_network,
    paymentTxHash: row.payment_tx_hash,
    paymentDestination: row.payment_destination,
    requestedAmount: row.requested_amount,
    creditedAmount: row.wallet_credit_amount,
    currency: row.requested_currency,
    paymentMethod: row.payment_method,
    status: row.status as RechargeRequestStatus,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    customer: {
      id: row.user_id,
      email: profile?.email ?? null,
      name: profile?.full_name ?? profile?.username ?? null,
    },
  };
}

export type RechargeQueues = {
  open: AdminRechargeRequest[];
  settled: AdminRechargeRequest[];
  config: RechargeConfig;
};

const REQUEST_SELECT =
  "id, reference, requested_amount, wallet_credit_amount, requested_currency, payment_method, status, admin_note, created_at, reviewed_at, user_id, payment_network, payment_tx_hash, payment_destination, profiles!recharge_requests_user_id_fkey (id, email, full_name, username)";

/** Every recharge request one customer made, newest first. */
export async function listCustomerRecharges(supabase: Client, userId: string, limit = 20): Promise<AdminRechargeRequest[]> {
  await requireAdminId(supabase);
  
  const { data } = await supabase
    .from("recharge_requests")
    .select(REQUEST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => toRequest(row as unknown as RequestRow));
}

export async function getRechargeQueues(supabase: Client): Promise<RechargeQueues> {
  await requireAdminId(supabase);
  

  /*
   * `recharge_requests` references `profiles` twice — `user_id` and
   * `reviewed_by` — so a bare `profiles (...)` embed is ambiguous. Naming the
   * foreign key picks the requester rather than whoever reviewed it.
   */
  const select =
    "id, reference, requested_amount, wallet_credit_amount, requested_currency, payment_method, status, admin_note, created_at, reviewed_at, user_id, payment_network, payment_tx_hash, payment_destination, profiles!recharge_requests_user_id_fkey (id, email, full_name, username)";

  const [open, settled, settings] = await Promise.all([
    supabase
      .from("recharge_requests")
      .select(select)
      .not("status", "in", `(${SETTLED.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("recharge_requests")
      .select(select)
      .in("status", SETTLED)
      .order("created_at", { ascending: false })
      .limit(50),
    // Admins may read `payments` directly; a customer page never does.
    supabase.from("store_settings").select("payments").eq("id", "global").maybeSingle(),
  ]);

  return {
    open: (open.data ?? []).map((row) => toRequest(row as unknown as RequestRow)),
    settled: (settled.data ?? []).map((row) => toRequest(row as unknown as RequestRow)),
    config: normalizeRechargeConfig({
      methods: (settings.data?.payments as { manual_methods?: unknown } | null)?.manual_methods,
      min_amount: (settings.data?.payments as { min_amount?: unknown } | null)?.min_amount,
      max_amount: (settings.data?.payments as { max_amount?: unknown } | null)?.max_amount,
      currency: (settings.data?.payments as { currency?: unknown } | null)?.currency,
    }),
  };
}

export class RechargeSettledError extends Error {
  constructor() {
    super("This request is already settled.");
    this.name = "RechargeSettledError";
  }
}

export class RechargeNotFoundError extends Error {
  constructor() {
    super("Request not found.");
    this.name = "RechargeNotFoundError";
  }
}

export class RechargeForbiddenError extends Error {
  constructor() {
    super("Administrator access required.");
    this.name = "RechargeForbiddenError";
  }
}

function raiseFor(message: string): never {
  const text = message.toLowerCase();

  if (text.includes("already settled") || text.includes("cannot be rejected")) {
    throw new RechargeSettledError();
  }

  if (text.includes("not found")) {
    throw new RechargeNotFoundError();
  }

  if (text.includes("administrator access")) {
    throw new RechargeForbiddenError();
  }

  throw new Error(message);
}

export async function approveRecharge(supabase: Client, input: {
  requestId: string;
  creditAmount: number | null;
  note: string | null;
  payerVerified?: boolean;
}): Promise<{ credited: number; balance: number; idempotent: boolean }> {
  await requireAdminId(supabase);
  

  const { data: claim, error: claimError } = await supabase.from("recharge_requests")
    .select("payment_network,payment_tx_hash,payment_destination,created_at,requested_amount,status")
    .eq("id", input.requestId).maybeSingle();
  if (claimError || !claim) throw new RechargeNotFoundError();
  if (claim.payment_network === "BEP20" && claim.status !== "approved") {
    if (!input.payerVerified || !input.note || input.note.trim().length < 5) throw new Error("Confirm payer ownership and record the verification in the note. A public transaction hash alone does not identify the payer.");
    if (!claim.payment_tx_hash || !claim.payment_destination) throw new Error("Customer must submit the BEP20 transaction hash first.");
    const verification = await verifyBep20Transfer({ txHash: claim.payment_tx_hash, destination: claim.payment_destination, createdAt: claim.created_at });
    const credit = input.creditAmount ?? claim.requested_amount;
    if (credit > verification.received_amount) throw new Error(`Only ${verification.received_amount} USDT was received. Adjust the credit amount.`);
    const { data: result, error } = await (supabase as SupabaseClient).rpc("approve_verified_bep20_recharge", { p_request_id: input.requestId, p_tx_hash: claim.payment_tx_hash, p_credit_amount: credit, p_verification: verification, p_note: input.note }).maybeSingle();
    if (error) raiseFor(error.message);
    const approved = result as { credited: number; balance: number; idempotent: boolean } | null;
    if (!approved) throw new Error("Approval returned no result");
    if (!approved.idempotent) await notifyRechargeOutcome(supabase, input.requestId, "approved", approved.credited, input.note);
    return approved;
  }

  const { data, error } = await supabase
    .rpc("approve_recharge_request", {
      p_request_id: input.requestId,
      p_credit_amount: input.creditAmount ?? undefined,
      p_note: input.note ?? undefined,
    })
    .maybeSingle();

  if (error) {
    raiseFor(error.message);
  }

  if (!data) {
    throw new Error("The approval returned no result.");
  }

  /*
   * Only announce a credit that actually happened here. A re-approval reports
   * `idempotent`, and telling someone twice that their balance arrived reads as
   * two separate top-ups.
   */
  if (!data.idempotent) {
    await notifyRechargeOutcome(supabase, input.requestId, "approved", data.credited, input.note);
  }

  return { credited: data.credited, balance: data.balance, idempotent: data.idempotent };
}

export async function rejectRecharge(supabase: Client, input: { requestId: string; note: string | null }): Promise<void> {
  await requireAdminId(supabase);
  

  const { error } = await supabase.rpc("reject_recharge_request", {
    p_request_id: input.requestId,
    p_note: input.note ?? undefined,
  });

  if (error) {
    raiseFor(error.message);
  }

  await notifyRechargeOutcome(supabase, input.requestId, "rejected", null, input.note);
}

/**
 * Tell the customer what the owner decided.
 *
 * Reads the request back for its reference and owner, because a customer
 * identifies a top-up by the reference they were given, not by a row id. Runs
 * after the decision has been committed, and `notify` cannot throw, so a failure
 * here never undoes an approval.
 */
async function notifyRechargeOutcome(supabase: Client, 
  requestId: string,
  outcome: "approved" | "rejected",
  credited: number | null,
  note: string | null,
): Promise<void> {
  
  const { data } = await supabase
    .from("recharge_requests")
    .select("user_id, reference, requested_amount")
    .eq("id", requestId)
    .maybeSingle();

  if (!data) {
    return;
  }

  const amount = (credited ?? data.requested_amount).toFixed(2);
  const reason = note?.trim();

  if (outcome === "approved") {
    await notify({
      userId: data.user_id,
      type: "recharge_approved",
      titleAr: "تمت إضافة الرصيد",
      titleEn: "Your balance was topped up",
      bodyAr: `أضفنا ${amount} دولار إلى محفظتك (${data.reference}). يمكنك الشراء به الآن.`,
      bodyEn: `We added ${amount} USD to your wallet (${data.reference}). It is ready to spend.`,
      href: `/recharge/${requestId}/invoice`,
      entityType: "recharge",
      entityId: requestId,
    });

    await enqueueTelegramAlert({
      type: "recharge_approved",
      userId: data.user_id,
      payload: {
        request_id: requestId,
        reference: data.reference,
        amount: credited ?? data.requested_amount,
      },
    });

    return;
  }

  await notify({
    userId: data.user_id,
    type: "recharge_rejected",
    titleAr: "لم نتمكّن من تأكيد طلب التعبئة",
    titleEn: "We could not confirm your top-up",
    bodyAr: reason
      ? `طلب ${data.reference}: ${reason}`
      : `لم نتمكّن من تأكيد وصول المبلغ لطلب ${data.reference}. تواصل معنا مع إثبات التحويل.`,
    bodyEn: reason
      ? `Request ${data.reference}: ${reason}`
      : `We could not confirm the transfer for ${data.reference}. Contact us with proof of payment.`,
    href: "/recharge",
    entityType: "recharge",
    entityId: requestId,
  });

  await enqueueTelegramAlert({
    type: "recharge_rejected",
    userId: data.user_id,
    payload: {
      request_id: requestId,
      reference: data.reference,
      reason: reason ?? null,
    },
  });
}

/**
 * Write recharge configuration.
 *
 * Merges into `payments` rather than replacing it, so a save here never drops a
 * neighbouring key. There is no automatic-crediting setting: a manual request is
 * always reviewed, and the Sam API switch lives in `providers.sam`.
 */
export async function saveRechargeSettings(supabase: Client, update: {
  methods?: {
    id: string;
    label_ar: string;
    label_en: string;
    account: string;
    instructions_ar: string;
    instructions_en: string;
    enabled: boolean;
  }[];
  minAmount?: number;
  maxAmount?: number;
}): Promise<void> {
  await requireAdminId(supabase);
  

  const { data: current } = await supabase
    .from("store_settings")
    .select("payments")
    .eq("id", "global")
    .maybeSingle();

  const base: Record<string, Json | undefined> =
    current?.payments && typeof current.payments === "object" && !Array.isArray(current.payments)
      ? { ...current.payments }
      : {};

  if (update.methods !== undefined) {
    base.manual_methods = update.methods;
  }

  if (update.minAmount !== undefined) {
    base.min_amount = update.minAmount;
  }

  if (update.maxAmount !== undefined) {
    base.max_amount = update.maxAmount;
  }

  const { error } = await supabase
    .from("store_settings")
    .update({ payments: base as Json })
    .eq("id", "global");

  if (error) {
    throw new Error(`Saving recharge settings failed: ${error.message}`);
  }
}
