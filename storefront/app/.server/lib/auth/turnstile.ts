import { log } from "@server/lib/logging/logger";
import { getStoreEnv, type StoreEnvVars } from "@server/env";

/** Official Cloudflare Turnstile dummy testing keys that always pass verification */
export const CLOUDFLARE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const CLOUDFLARE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export const DEFAULT_HOSTNAMES = ["gh-store.me", "www.gh-store.me"] as const;
export const DEV_DEFAULT_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "gh-store.me",
  "www.gh-store.me",
] as const;

export type TurnstileConfig = {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
  hostnames: Set<string>;
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

  const isTest =
    typeof process !== "undefined" &&
    (process.env?.NODE_ENV === "test" || Boolean(process.env?.VITEST));

  const isDev = options?.isDev ?? (import.meta.env.DEV && !isTest);

  const rawHostnames = storeEnv.turnstileHostnames;
  const hostnames = new Set(
    rawHostnames
      ? rawHostnames
          .split(",")
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean)
      : isDev
        ? DEV_DEFAULT_HOSTNAMES
        : DEFAULT_HOSTNAMES,
  );

  // Explicit keys configured (production or custom test setup)
  if (siteKey && secretKey) {
    return {
      enabled: true,
      siteKey,
      secretKey,
      hostnames,
    };
  }

  if (isDev) {
    return {
      enabled: true,
      siteKey: siteKey || CLOUDFLARE_TEST_SITE_KEY,
      secretKey: secretKey || CLOUDFLARE_TEST_SECRET_KEY,
      hostnames,
    };
  }

  // Unconfigured in production or unit tests: fail-open gracefully so customers aren't locked out
  return {
    enabled: false,
    siteKey: "",
    secretKey: "",
    hostnames,
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
 * Follows Cloudflare's canonical server-side siteverify specifications:
 * - Token length verification (1–2048 chars)
 * - Required success === true
 * - Expected action verification (e.g. "login", "signup", "reset_password")
 * - Allowed hostname verification (e.g. "gh-store.me")
 * - Upstream 5xx or timeout fail-open resilience
 */
export async function verifyTurnstileToken(input: {
  token: string | null | undefined;
  expectedAction?: string;
  expectedHostnames?: string[] | Set<string>;
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

  const rawToken = typeof input.token === "string" ? input.token.trim() : "";
  if (!rawToken || rawToken.length > 2048) {
    log.warn("auth", "turnstile_token_missing_or_oversized", {
      clientIp,
      length: rawToken.length,
    });
    return { ok: false, reason: "missing_turnstile_token" };
  }

  try {
    const params = new URLSearchParams({
      secret: config.secretKey,
      response: rawToken,
    });
    if (clientIp && clientIp !== "127.0.0.1") {
      params.set("remoteip", clientIp);
    }

    const fetcher = input.fetcher ?? fetch;
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      log.warn("auth", "turnstile_verify_http_error", { status: response.status });
      // Upstream 5xx error: fail-open so users aren't locked out during Cloudflare blips
      return { ok: true };
    }

    const outcome = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

    if (outcome.success !== true) {
      log.warn("auth", "turnstile_verification_failed", {
        errors: outcome["error-codes"],
        clientIp,
      });
      return { ok: false, reason: "invalid_turnstile_token" };
    }

    // Verify action when provided
    if (input.expectedAction && outcome.action && outcome.action !== input.expectedAction) {
      log.warn("auth", "turnstile_action_mismatch", {
        expected: input.expectedAction,
        received: outcome.action,
        clientIp,
      });
      return { ok: false, reason: "invalid_turnstile_token" };
    }

    // Verify hostname when provided
    const allowedHostnames = input.expectedHostnames
      ? new Set(
          Array.isArray(input.expectedHostnames)
            ? input.expectedHostnames.map((h) => h.toLowerCase())
            : [...input.expectedHostnames].map((h) => h.toLowerCase()),
        )
      : config.hostnames;

    if (outcome.hostname && !allowedHostnames.has(outcome.hostname.toLowerCase())) {
      log.warn("auth", "turnstile_hostname_mismatch", {
        hostname: outcome.hostname,
        clientIp,
      });
      return { ok: false, reason: "invalid_turnstile_token" };
    }

    return { ok: true };
  } catch (error) {
    log.warn("auth", "turnstile_verify_exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    // On timeout or network exception communicating with Cloudflare verify, fail open
    return { ok: true };
  }
}
