import type { SupabaseClient } from "@supabase/supabase-js";

/** Thrown when a non-admin reaches an admin-only write; routes map it to 403. */
export class AdminForbiddenError extends Error {
  constructor() {
    super("Administrator access required.");
    this.name = "AdminForbiddenError";
  }
}
export type SessionSummary = {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};

function toDisplayName(fullName: string | null, username: string | null, email: string | null): string {
  const candidate = fullName?.trim() || username?.trim();
  if (candidate) {
    return candidate;
  }
  return email?.split("@")[0] ?? "";
}

export function isAdminProfile(profile: { role?: string | null; is_active?: boolean | null } | null): boolean {
  return profile?.role === "admin" && profile.is_active === true;
}

export async function getSessionSummary(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<SessionSummary | null> {
  if (!userId) {
    return null;
  }
  try {
    const [{ data: claims }, { data: profile }] = await Promise.all([
      supabase.auth.getClaims(),
      supabase
        .from("profiles")
        .select("role, is_active, full_name, username, email, avatar_url")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const email =
      typeof profile?.email === "string"
        ? (profile.email as string)
        : typeof claims?.claims?.email === "string"
          ? (claims.claims.email as string)
          : null;
    return {
      userId,
      email,
      displayName: toDisplayName(
        (profile?.full_name as string | null) ?? null,
        (profile?.username as string | null) ?? null,
        email,
      ),
      avatarUrl: ((profile?.avatar_url as string | null)?.trim() || null) as string | null,
      isAdmin: isAdminProfile(profile as { role?: string | null; is_active?: boolean | null } | null),
    };
  } catch {
    return null;
  }
}

export type HeaderWalletPanel = { kind: "customer"; balance: number; currency: string };

/**
 * Wallet balance for the header's account menu. Admins get none — customer
 * balances live on the customers page, not the chrome.
 */
export async function getHeaderWalletPanel(
  supabase: SupabaseClient,
  session: SessionSummary | null,
): Promise<HeaderWalletPanel | null> {
  if (!session || session.isAdmin) {
    return null;
  }
  const { data } = await supabase
    .from("wallets")
    .select("balance, currency")
    .eq("user_id", session.userId)
    .maybeSingle();
  const row = data as unknown as { balance: number; currency: string } | null;
  return { kind: "customer", balance: row?.balance ?? 0, currency: row?.currency ?? "USD" };
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string | null,
): Promise<number> {
  if (!userId) {
    return 0;
  }
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_visible", true)
    .eq("is_read", false);
  return count ?? 0;
}
