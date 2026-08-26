import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Administrator access required");
    this.name = "ForbiddenError";
  }
}

export type AuthenticatedUser = {
  id: string;
};

type ProfileAccess = Pick<Tables<"profiles">, "role" | "is_active">;

export function isAdminProfile(profile: ProfileAccess | null): boolean {
  return profile?.role === "admin" && profile.is_active;
}

/*
 * Both guards are memoized per request.
 *
 * Authorization is asserted at the top of nearly every service function, which
 * is the right shape for a security boundary but the wrong shape for a network
 * call: one dashboard render reaches `requireAdmin` thirteen times, and the
 * answer cannot change mid-render. Un-memoized, that was thirteen `profiles`
 * round-trips to a database ~500ms away — several seconds of the page's life
 * spent re-asking a question it had already answered.
 *
 * `cache()` scopes the memo to the request, so a fresh render — and therefore a
 * revoked admin or a deactivated account — is still re-checked.
 */
export const requireAuth = cache(async (): Promise<AuthenticatedUser> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new UnauthorizedError();
  }

  return { id: userId };
});

export const requireAdmin = cache(async (): Promise<AuthenticatedUser> => {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !isAdminProfile(profile)) {
    throw new ForbiddenError();
  }

  return user;
});
