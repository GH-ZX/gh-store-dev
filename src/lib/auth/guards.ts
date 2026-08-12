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

export async function requireAuth(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new UnauthorizedError();
  }

  return { id: userId };
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
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
}
