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

export class MfaChallengeRequiredError extends Error {
  constructor(message = "MFA challenge required") {
    super(message);
    this.name = "MfaChallengeRequiredError";
  }
}

export class MfaEnrollmentRequiredError extends Error {
  constructor(message = "Admin MFA enrollment required") {
    super(message);
    this.name = "MfaEnrollmentRequiredError";
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

export type AdminGuardOptions = {
  allowAal1?: boolean;
};

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

export async function requireAdminId(
  supabase: SupabaseClient,
  options?: AdminGuardOptions,
): Promise<AuthenticatedUser> {
  const user = await requireUserId(supabase);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !isAdminProfile(profile as ProfileAccess | null)) {
    throw new ForbiddenError();
  }

  if (!options?.allowAal1 && typeof supabase.auth?.mfa?.getAuthenticatorAssuranceLevel === "function") {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        if (aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
          throw new MfaChallengeRequiredError();
        }
        if (aalData.currentLevel === "aal1" && aalData.nextLevel === "aal1") {
          const { data: settings } = await supabase
            .from("store_settings")
            .select("admin_mfa_required")
            .eq("id", "global")
            .maybeSingle();
          if (settings?.admin_mfa_required) {
            throw new MfaEnrollmentRequiredError();
          }
        }
      }
    } catch (err) {
      if (err instanceof MfaChallengeRequiredError || err instanceof MfaEnrollmentRequiredError) {
        throw err;
      }
    }
  }

  return user;
}

export function requireAuth(): Promise<AuthenticatedUser> {
  return memoizeRequest("auth", () => requireUserId(getRequestState().supabase));
}

export function requireAdmin(options?: AdminGuardOptions): Promise<AuthenticatedUser> {
  const memoKey = options?.allowAal1 ? "admin_aal1" : "admin";
  return memoizeRequest(memoKey, () => requireAdminId(getRequestState().supabase, options));
}

