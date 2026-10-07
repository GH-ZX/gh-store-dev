import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminId, requireUserId } from "@server/lib/auth/guards";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { recordAudit } from "@server/lib/services/admin-audit.service";
import { logFailure } from "@server/lib/logging/logger";

/**
 * The referral loop.
 *
 * Two halves that must not be confused with each other:
 *
 *  - **Capture** happens once, at signup, through `apply_referral_signup`. It
 *    records *that* somebody was referred. It never moves money.
 *  - **Credit** happens once, when the referred customer's first order is
 *    delivered and paid, through `credit_referral_for_order`. The database
 *    enforces one credit per referred customer and refuses a self-referral.
 *
 * The rule this module is built around is that the customer never chooses when
 * money moves. {@link creditReferralForDeliveredOrder} is called from the
 * fulfilment path, not from a page.
 */

export type ReferralSummary = {
  code: string;
  link: string;
  enabled: boolean;
  referrerCredit: number;
  referredCredit: number;
  /** Customers who arrived through this code. */
  signups: number;
  /** Of those, the ones whose first order was delivered and paid. */
  credited: number;
  /** Credit this customer has actually received from referrals. */
  earned: number;
};

export type ReferralProgramStats = {
  enabled: boolean;
  referrerCredit: number;
  referredCredit: number;
  codesIssued: number;
  signups: number;
  pending: number;
  credited: number;
  rejected: number;
  creditIssued: number;
  topReferrers: {
    referrer_user_id: string;
    full_name: string | null;
    email: string | null;
    signups: number;
    credited: number;
  }[];
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The shareable link for a code, pointed at the sign-up form. */
export function referralLink(appUrl: string, locale: string, code: string): string {
  const base = appUrl.replace(/\/$/, "");

  return `${base}/${locale}/login?mode=sign-up&ref=${encodeURIComponent(code)}`;
}

async function readProgram(): Promise<{
  enabled: boolean;
  referrerCredit: number;
  referredCredit: number;
}> {
  const { data } = await createSupabaseServiceClient()
    .from("referral_program_settings")
    .select("enabled, referrer_credit, referred_credit")
    .eq("id", true)
    .maybeSingle();

  return {
    enabled: data?.enabled ?? false,
    referrerCredit: data?.referrer_credit ?? 1,
    referredCredit: data?.referred_credit ?? 1,
  };
}

/**
 * The signed-in customer's code and link, minting one on first read.
 *
 * Reading a page mints a code, which is a write inside a loader. It is a
 * one-time, idempotent write of a value derived from the account, and the
 * alternative — a "generate my link" button — is a step every customer would
 * skip.
 */
export async function getMyReferral(
  supabase: SupabaseClient,
  appUrl: string,
  locale: string,
): Promise<ReferralSummary> {
  const user = await requireUserId(supabase);
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc("ensure_referral_code", { p_user_id: user.id });

  if (error || typeof data !== "string") {
    logFailure("referral", "code_mint_failed", error, { userId: user.id });

    const program = await readProgram();

    return {
      code: "",
      link: "",
      ...program,
      signups: 0,
      credited: 0,
      earned: 0,
    };
  }

  const [program, claims, earned] = await Promise.all([
    readProgram(),
    service
      .from("referral_claims")
      .select("status")
      .eq("referrer_user_id", user.id),
    service
      .from("wallet_transactions")
      .select("amount")
      .eq("user_id", user.id)
      .eq("reference_type", "referral_referrer"),
  ]);

  const rows = (claims.data ?? []) as { status: string }[];

  return {
    code: data,
    link: referralLink(appUrl, locale, data),
    ...program,
    signups: rows.length,
    credited: rows.filter((row) => row.status === "credited").length,
    earned: ((earned.data ?? []) as { amount: number }[]).reduce(
      (total, row) => total + Number(row.amount ?? 0),
      0,
    ),
  };
}

/**
 * Record a signup that arrived through a link.
 *
 * Deliberately non-throwing: the account already exists by the time this runs,
 * and a bad code must not turn a successful signup into an error page. Every
 * refusal is returned as a word the caller can log.
 */
export async function applyReferralSignup(
  referredUserId: string,
  code: string,
): Promise<string> {
  const normalized = normalizeCode(code);

  if (!referredUserId || !normalized) {
    return "invalid";
  }

  try {
    const { data, error } = await createSupabaseServiceClient().rpc("apply_referral_signup", {
      p_referred_user_id: referredUserId,
      p_code: normalized,
    });

    if (error) {
      logFailure("referral", "signup_capture_failed", error, { referredUserId });

      return "unknown";
    }

    return typeof data === "string" ? data : "unknown";
  } catch (error) {
    logFailure("referral", "signup_capture_threw", error, { referredUserId });

    return "unknown";
  }
}

/**
 * Pay both sides for a delivered order.
 *
 * Called from the fulfilment path after a completed, paid order. The database
 * decides whether anything is owed — no claim, an already-credited claim, a
 * self-referral, or a switched-off program all come back as a word rather than
 * a transfer — so calling this twice is safe by construction.
 */
export async function creditReferralForDeliveredOrder(orderId: string): Promise<string> {
  try {
    const { data, error } = await createSupabaseServiceClient().rpc("credit_referral_for_order", {
      p_order_id: orderId,
    });

    if (error) {
      logFailure("referral", "credit_failed", error, { orderId });

      return "error";
    }

    const row = Array.isArray(data) ? data[0] : data;

    return (row as { status?: string } | null)?.status ?? "unknown";
  } catch (error) {
    logFailure("referral", "credit_threw", error, { orderId });

    return "error";
  }
}

export async function getReferralProgramStats(
  supabase: SupabaseClient,
): Promise<ReferralProgramStats> {
  await requireAdminId(supabase);

  const empty: ReferralProgramStats = {
    enabled: false,
    referrerCredit: 0,
    referredCredit: 0,
    codesIssued: 0,
    signups: 0,
    pending: 0,
    credited: 0,
    rejected: 0,
    creditIssued: 0,
    topReferrers: [],
  };

  const { data, error } = await supabase.rpc("referral_program_stats");

  if (error || !data) {
    return empty;
  }

  const raw = data as unknown as Partial<ReferralProgramStats>;

  return { ...empty, ...raw, topReferrers: raw.topReferrers ?? [] };
}

export type ReferralClaimRow = {
  id: string;
  code: string;
  status: string;
  reason: string | null;
  createdAt: string;
  creditedAt: string | null;
  referrerCredit: number | null;
  referredCredit: number | null;
  referrerName: string | null;
  referrerEmail: string | null;
  referredName: string | null;
  referredEmail: string | null;
};

export async function listReferralClaims(
  supabase: SupabaseClient,
  limit = 100,
): Promise<ReferralClaimRow[]> {
  await requireAdminId(supabase);

  const { data, error } = await supabase
    .from("referral_claims")
    .select(
      `id, code, status, reason, created_at, credited_at, referrer_amount, referred_amount,
       referrer:profiles!referral_claims_referrer_user_id_fkey (full_name, email),
       referred:profiles!referral_claims_referred_user_id_fkey (full_name, email)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  type Profile = { full_name: string | null; email: string | null } | null;
  type RawClaim = {
    id: string;
    code: string;
    status: string;
    reason: string | null;
    created_at: string;
    credited_at: string | null;
    referrer_amount: number | null;
    referred_amount: number | null;
    referrer: Profile | Profile[];
    referred: Profile | Profile[];
  };

  return (data as unknown as RawClaim[]).map((row) => {
    const referrer = Array.isArray(row.referrer) ? row.referrer[0] : row.referrer;
    const referred = Array.isArray(row.referred) ? row.referred[0] : row.referred;

    return {
      id: row.id,
      code: row.code,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      creditedAt: row.credited_at,
      referrerCredit: row.referrer_amount,
      referredCredit: row.referred_amount,
      referrerName: referrer?.full_name ?? null,
      referrerEmail: referrer?.email ?? null,
      referredName: referred?.full_name ?? null,
      referredEmail: referred?.email ?? null,
    };
  });
}

/**
 * Turn the program on and set the amounts.
 *
 * Both amounts are capped at $5 by the settings table's own check, and the
 * dashboard shows the arithmetic: two credits at $5 is $10 against a $2.50
 * gross profit, which is a decision the owner is allowed to make and should
 * have to see.
 */
export async function saveReferralProgram(
  supabase: SupabaseClient,
  input: { enabled: boolean; referrerCredit: number; referredCredit: number },
): Promise<boolean> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { error } = await service
    .from("referral_program_settings")
    .update({
      enabled: input.enabled,
      referrer_credit: input.referrerCredit,
      referred_credit: input.referredCredit,
    })
    .eq("id", true);

  if (error) {
    return false;
  }

  await recordAudit({
    actorId: actor.id,
    action: "referral_program_saved",
    entityType: "referral_program",
    entityId: null,
    values: { ...input },
  });

  return true;
}
