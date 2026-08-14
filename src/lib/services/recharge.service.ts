import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { logOutcome } from "@/lib/logging/logger";
import { normalizeRechargeConfig, type RechargeConfig } from "@/lib/settings/recharge-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Customer-facing recharge by a manual method.
 *
 * A request is a claim, not money: submitting one credits nothing, ever. Someone
 * saying they sent a transfer is not evidence that they did, so a manual request
 * is only ever credited by the owner approving it in the dashboard.
 *
 * Automatic crediting belongs to the Sam API path instead — see
 * `sam-recharge.service.ts` — where the server can ask the payment provider
 * whether the money actually arrived.
 */

export type RechargeRequestStatus =
  | "pending"
  | "payment_sent"
  | "processing"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export type MyRechargeRequest = {
  id: string;
  reference: string;
  requestedAmount: number;
  creditedAmount: number | null;
  currency: string;
  paymentMethod: string;
  status: RechargeRequestStatus;
  adminNote: string | null;
  createdAt: string;
};

export type SubmitResult =
  | { ok: true; reference: string; requestId: string; credited: boolean }
  | {
      ok: false;
      reason: "invalid_input" | "suspended" | "too_many" | "not_signed_in" | "unknown";
    };

/** Presentation-safe recharge configuration, via the RPC that hides secrets. */
export async function getRechargeConfig(): Promise<RechargeConfig> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_recharge_methods");

  return normalizeRechargeConfig(error ? {} : data);
}

export async function getMyRechargeRequests(limit = 20): Promise<MyRechargeRequest[]> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recharge_requests")
    .select(
      "id, reference, requested_amount, wallet_credit_amount, requested_currency, payment_method, status, admin_note, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    reference: row.reference,
    requestedAmount: row.requested_amount,
    creditedAmount: row.wallet_credit_amount,
    currency: row.requested_currency,
    paymentMethod: row.payment_method,
    status: row.status as RechargeRequestStatus,
    adminNote: row.admin_note,
    createdAt: row.created_at,
  }));
}

function reasonFor(message: string): SubmitResult {
  const text = message.toLowerCase();

  if (text.includes("too many")) {
    return { ok: false, reason: "too_many" };
  }

  if (text.includes("suspended")) {
    return { ok: false, reason: "suspended" };
  }

  if (text.includes("authentication required")) {
    return { ok: false, reason: "not_signed_in" };
  }

  if (text.includes("invalid amount") || text.includes("payment method")) {
    return { ok: false, reason: "invalid_input" };
  }

  return { ok: false, reason: "unknown" };
}

export async function submitRechargeRequest(input: {
  amount: number;
  method: string;
}): Promise<SubmitResult> {
  const result = await attemptRechargeRequest(input);

  logOutcome("recharge", "recharge_requested", result, {
    amount: input.amount,
    method: input.method,
    ...(result.ok ? { requestId: result.requestId } : {}),
  });

  return result;
}

async function attemptRechargeRequest(input: {
  amount: number;
  method: string;
}): Promise<SubmitResult> {
  const supabase = await createSupabaseServerClient();
  const config = await getRechargeConfig();

  // The stored limits are the authority, not anything the browser sent.
  if (input.amount < config.minAmount || input.amount > config.maxAmount) {
    return { ok: false, reason: "invalid_input" };
  }

  // A method must exist and be enabled; otherwise a crafted form could invent one.
  if (!config.methods.some((method) => method.id === input.method && method.enabled)) {
    return { ok: false, reason: "invalid_input" };
  }

  const { data, error } = await supabase
    .rpc("submit_recharge_request", {
      p_amount: input.amount,
      p_method: input.method,
      p_currency: config.currency,
    })
    .maybeSingle();

  if (error) {
    return reasonFor(error.message);
  }

  if (!data) {
    return { ok: false, reason: "unknown" };
  }

  return { ok: true, requestId: data.request_id, reference: data.reference, credited: false };
}

export async function markRechargePaid(requestId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_recharge_paid", { p_request_id: requestId });

  // A customer saying they have paid is the start of a money trail, so it is
  // recorded whether or not the write landed.
  logOutcome(
    "recharge",
    "recharge_marked_paid",
    error ? { ok: false, reason: "write_failed" } : { ok: true },
    { requestId, ...(error ? { error: error.message } : {}) },
  );

  return !error;
}
