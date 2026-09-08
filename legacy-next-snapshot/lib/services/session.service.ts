import "server-only";

import { cache } from "react";

import { isAdminProfile } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who is browsing, for the storefront chrome.
 *
 * Deliberately tolerant: a failed read means "signed out" rather than an error,
 * because the header must render for an anonymous visitor either way. Returns
 * only what the chrome needs — never a token.
 */
export type SessionSummary = {
  userId: string;
  email: string | null;
  displayName: string;
  /** Null when the account has no picture; the caller falls back to initials. */
  avatarUrl: string | null;
  isAdmin: boolean;
};

/** Fall back to the local part of the email so the header never shows a blank name. */
function toDisplayName(fullName: string | null, username: string | null, email: string | null): string {
  const candidate = fullName?.trim() || username?.trim();

  if (candidate) {
    return candidate;
  }

  return email?.split("@")[0] ?? "";
}

export const getSessionSummary = cache(async (): Promise<SessionSummary | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  if (!userId) {
    return null;
  }

  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, full_name, username, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    email: profile?.email ?? email,
    displayName: toDisplayName(
      profile?.full_name ?? null,
      profile?.username ?? null,
      profile?.email ?? email,
    ),
    avatarUrl: profile?.avatar_url?.trim() || null,
    isAdmin: isAdminProfile(profile ?? null),
  };
});

/**
 * Whether the requesting user is an active admin, as a boolean.
 *
 * `requireAdmin` throws for non-admins, which is right for guarded routes but
 * wrong where the response merely *enriches* a public page. Memoized with React's
 * `cache` so a request that loads several catalogs checks the profile once.
 */
export const currentUserIsAdmin = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;

    if (!userId) {
      return false;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();

    return isAdminProfile(profile ?? null);
  } catch {
    // A broken session read means "visitor", never a thrown page.
    return false;
  }
});
