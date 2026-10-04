import { log } from "@server/lib/logging/logger";
import { getStoreEnv, type StoreEnvVars } from "@server/env";

/** Official Cloudflare Turnstile dummy testing keys that always pass verification */
export const CLOUDFLARE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const CLOUDFLARE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export type TurnstileConfig = {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
};

/**
 * Resolves Turnstile configuration from Worker bindings.
 * In development, automatically defaults to Cloudflare's always-pass test keys.
 * In production or unconfigured test environments, fails open gracefully.
 */
export function getTurnstileConfig(
  env?: StoreEnvVars,
  options?: { isDev?: boolean },
): TurnstileConfig {
  const storeEnv = getStoreEnv(env);
  const siteKey = storeEnv.turnstileSiteKey || "";
  const secretKey = storeEnv.turnstileSecretKey || "";

  // Explicit keys configured (production or custom test setup)
  if (siteKey && secretKey) {
    return {
      enabled: true,
      siteKey,
      secretKey,
    };
  }

  const isTest =
    typeof process !== "undefined" &&
    (process.env?.NODE_ENV === "test" || Boolean(process.env?.VITEST));

  const isDev = options?.isDev ?? (import.meta.env.DEV && !isTest);

  if (isDev) {
    return {
      enabled: true,
      siteKey: siteKey || CLOUDFLARE_TEST_SITE_KEY,
      secretKey: secretKey || CLOUDFLARE_TEST_SECRET_KEY,
    };
  }

  // Unconfigured in production or unit tests: fail-open gracefully so customers aren't locked out
  return {
    enabled: false,
    siteKey: "",
    secretKey: "",
  };
}

export type VerifyTurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing_turnstile_token" | "invalid_turnstile_token" };

export function getClientIp(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp?.trim()) return cloudflareIp.trim();
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
}

/**
 * Validates a Turnstile token against Cloudflare's siteverify endpoint.
 *
 * Designed for resilience:
 * - If Turnstile is unconfigured, permits the action.
 * - If token is missing while Turnstile is active, rejects immediately.
 * - If Cloudflare siteverify endpoint is temporarily unreachable, fails open with warning.
 * - If token is invalid or forged, rejects with reason.
 */
export async function verifyTurnstileToken(input: {
  token: string | null | undefined;
  request?: Request;
  clientIp?: string;
  env?: StoreEnvVars;
  fetcher?: typeof fetch;
}): Promise<VerifyTurnstileResult> {
  const config = getTurnstileConfig(input.env);
  if (!config.enabled) {
    return { ok: true };
  }

  const clientIp =
    input.clientIp ?? (input.request ? getClientIp(input.request) : undefined);

  const token = input.token?.trim();
  if (!token) {
    log.warn("auth", "turnstile_token_missing", { clientIp });
    return { ok: false, reason: "missing_turnstile_token" };
  }

  try {
    const formData = new FormData();
    formData.append("secret", config.secretKey);
    formData.append("response", token);
    if (clientIp && clientIp !== "127.0.0.1") {
      formData.append("remoteip", clientIp);
    }

    const fetcher = input.fetcher ?? fetch;
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      log.warn("auth", "turnstile_verify_http_error", { status: response.status });
      // Upstream 5xx error: fail-open so users aren't locked out during Cloudflare blips
      return { ok: true };
    }

    const outcome = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (outcome.success === true) {
      return { ok: true };
    }

    log.warn("auth", "turnstile_verification_failed", {
      errors: outcome["error-codes"],
      clientIp: input.clientIp,
    });
    return { ok: false, reason: "invalid_turnstile_token" };
  } catch (error) {
    log.warn("auth", "turnstile_verify_exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    // On timeout or network exception communicating with Cloudflare verify, fail open
    return { ok: true };
  }
}
