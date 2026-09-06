import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestState, memoizeRequest } from "@server/request-context";

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

type ProfileAccess = {
  role: string | null;
  is_active: boolean | null;
};

export function isAdminProfile(profile: ProfileAccess | null | undefined): boolean {
  return profile?.role === "admin" && profile.is_active === true;
}

/**
 * Session user id from a request-bound client. The client is explicit —
 * loaders pass the one they already built, so one render pays one claims
 * check no matter how many services assert the session.
 */
export async function requireUserId(supabase: SupabaseClient): Promise<AuthenticatedUser> {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string" || !userId) {
    throw new UnauthorizedError();
  }

  return { id: userId };
}

export async function requireAdminId(supabase: SupabaseClient): Promise<AuthenticatedUser> {
  const user = await requireUserId(supabase);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !isAdminProfile(profile as ProfileAccess | null)) {
    throw new ForbiddenError();
  }

  return user;
}

export function requireAuth(): Promise<AuthenticatedUser> {
  return memoizeRequest("auth", () => requireUserId(getRequestState().supabase));
}

export function requireAdmin(): Promise<AuthenticatedUser> {
  return memoizeRequest("admin", () => requireAdminId(getRequestState().supabase));
}
