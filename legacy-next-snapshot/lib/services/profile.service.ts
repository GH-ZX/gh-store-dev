import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in customer's own profile.
 *
 * Writes are restricted to presentation fields. `role`, `is_active`, and `email`
 * are never in an update payload here: the RLS policy lets a customer update
 * their own row, so anything this function is willing to write is something a
 * customer could grant themselves.
 */

export type MyProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export class UsernameTakenError extends Error {
  constructor() {
    super("That username is already taken.");
    this.name = "UsernameTakenError";
  }
}

const UNIQUE_VIOLATION = "23505";

export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, role, is_active, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    username: data.username,
    role: data.role,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}

export async function updateMyProfile(input: {
  fullName: string | null;
  username: string | null;
}): Promise<void> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  if (input.username) {
    const { data: clash } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .neq("id", user.id)
      .maybeSingle();

    if (clash) {
      throw new UsernameTakenError();
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.fullName, username: input.username })
    .eq("id", user.id);

  if (error) {
    // Between the check above and this write another request can claim the same
    // username, so the constraint is the real guard.
    if (error.code === UNIQUE_VIOLATION) {
      throw new UsernameTakenError();
    }

    throw new Error(`Updating the profile failed: ${error.message}`);
  }
}
