const DEVELOPMENT_SUPABASE_URL = "https://njlzgfddfnnqujaodbta.supabase.co";
const DEVELOPMENT_PUBLISHABLE_KEY = "sb_publishable_gtOxP1au24qFXwzVppy0vw_oFWaSIH2";

export class MissingStoreConfigurationError extends Error {
  constructor() {
    super("Supabase URL and publishable key must be configured in production.");
    this.name = "MissingStoreConfigurationError";
  }
}

function isProductionSite(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "gh-store.me";
  } catch {
    return false;
  }
}

function isSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export type StoreEnvVars = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  APP_URL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
};

/**
 * Resolve the public Supabase connection from Worker bindings. Production
 * fails loudly on missing config instead of sending customers to staging;
 * local dev falls back to the development project.
 */
export function getStoreEnv(env?: StoreEnvVars) {
  const url = env?.SUPABASE_URL?.trim();
  const publishableKey = env?.SUPABASE_PUBLISHABLE_KEY?.trim();
  const appUrl = env?.APP_URL?.trim() ?? "";
  const production = isProductionSite(appUrl);

  if (production && (!isSupabaseUrl(url) || !publishableKey)) {
    throw new MissingStoreConfigurationError();
  }
  return {
    url: url || DEVELOPMENT_SUPABASE_URL,
    publishableKey: publishableKey || DEVELOPMENT_PUBLISHABLE_KEY,
    serviceRoleKey: env?.SUPABASE_SERVICE_ROLE_KEY,
    appUrl: appUrl || "https://gh-store.me",
    turnstileSiteKey: (
      env?.TURNSTILE_SITE_KEY ||
      env?.TURNSTILE_SITEKEY ||
      env?.turnstileSiteKey
    )?.trim(),
    turnstileSecretKey: (
      env?.TURNSTILE_SECRET ||
      env?.TURNSTILE_SECRET_KEY ||
      env?.turnstileSecretKey
    )?.trim(),
    turnstileHostnames: env?.TURNSTILE_HOSTNAMES?.trim(),
    isProduction: production,
  } as const;
}
