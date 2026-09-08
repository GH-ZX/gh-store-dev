const DEVELOPMENT_SUPABASE_URL = "https://njlzgfddfnnqujaodbta.supabase.co";
const DEVELOPMENT_PUBLISHABLE_KEY = "sb_publishable_gtOxP1au24qFXwzVppy0vw_oFWaSIH2";

export class MissingSupabaseConfigurationError extends Error {
  constructor() {
    super("Supabase URL and publishable key must be configured in production.");
    this.name = "MissingSupabaseConfigurationError";
  }
}

/**
 * Resolve the public Supabase connection without allowing production to silently
 * fall back to the development project. The fallback keeps a fresh local clone
 * convenient, while the production URL is a hard boundary: a missing Cloudflare
 * variable must fail loudly instead of sending customer traffic to staging.
 */
function isProductionSite(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname === "gh-store.me";
  } catch {
    return false;
  }
}

function isSupabaseUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const production = process.env.NODE_ENV === "production" || isProductionSite(process.env.NEXT_PUBLIC_APP_URL);

  if (production && (!isSupabaseUrl(url) || !publishableKey)) {
    throw new MissingSupabaseConfigurationError();
  }

  return {
    url: url || DEVELOPMENT_SUPABASE_URL,
    publishableKey: publishableKey || DEVELOPMENT_PUBLISHABLE_KEY,
  } as const;
}
