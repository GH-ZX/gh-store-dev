import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { normalizeRechargeConfig, type RechargeConfig } from "@/lib/settings/recharge-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { RechargeRequestStatus } from "@/lib/services/recharge.service";

/**
 * Recharge administration.
 *
 * Approval is the only thing that moves money, and it goes through the
 * admin-gated RPC — which checks `is_admin(auth.uid())` in the database and is
 * idempotent per request, so approving twice credits once.
 */

const SETTLED: RechargeRequestStatus[] = ["approved", "rejected", "expired", "cancelled"];

export type AdminRechargeRequest = {
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

export async function getRechargeQueues(): Promise<RechargeQueues> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  /*
   * `recharge_requests` references `profiles` twice — `user_id` and
   * `reviewed_by` — so a bare `profiles (...)` embed is ambiguous. Naming the
   * foreign key picks the requester rather than whoever reviewed it.
   */
  const select =
    "id, reference, requested_amount, wallet_credit_amount, requested_currency, payment_method, status, admin_note, created_at, reviewed_at, user_id, profiles!recharge_requests_user_id_fkey (id, email, full_name, username)";

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

export async function approveRecharge(input: {
  requestId: string;
  creditAmount: number | null;
  note: string | null;
}): Promise<{ credited: number; balance: number; idempotent: boolean }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

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

  return { credited: data.credited, balance: data.balance, idempotent: data.idempotent };
}

export async function rejectRecharge(input: { requestId: string; note: string | null }): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("reject_recharge_request", {
    p_request_id: input.requestId,
    p_note: input.note ?? undefined,
  });

  if (error) {
    raiseFor(error.message);
  }
}

/**
 * Write recharge configuration.
 *
 * Merges into `payments` rather than replacing it, so a save here never drops a
 * neighbouring key. There is no automatic-crediting setting: a manual request is
 * always reviewed, and the Sam API switch lives in `providers.sam`.
 */
export async function saveRechargeSettings(update: {
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
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

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
