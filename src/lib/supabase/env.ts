const DEFAULT_SUPABASE_URL = "https://njlzgfddfnnqujaodbta.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_gtOxP1au24qFXwzVppy0vw_oFWaSIH2";

export function getSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_PUBLISHABLE_KEY,
  } as const;
}
