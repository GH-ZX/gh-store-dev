import { getStoreEnv } from "@server/env";
import { runtimeVar } from "@server/runtime-env";

export function getSupabaseEnv() {
  return getStoreEnv({ SUPABASE_URL: runtimeVar("SUPABASE_URL"), SUPABASE_PUBLISHABLE_KEY: runtimeVar("SUPABASE_PUBLISHABLE_KEY"), SUPABASE_SERVICE_ROLE_KEY: runtimeVar("SUPABASE_SERVICE_ROLE_KEY"), APP_URL: runtimeVar("APP_URL") });
}
