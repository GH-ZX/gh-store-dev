import { getRequestState } from "@server/request-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  return getRequestState().supabase as SupabaseClient<Database>;
}
