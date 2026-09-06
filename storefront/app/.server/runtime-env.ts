/**
 * Deployment-static Worker bindings carrier.
 *
 * Deep service code (provider credentials, secrets, base URLs) cannot receive
 * per-request context without churning dozens of signatures, and bindings do
 * not change between requests of one deployment — so the entry worker stores
 * them once per isolate and deep code reads them back. First write wins;
 * concurrent requests carry identical values, making the write idempotent.
 * Request-scoped state (cookies, sessions) never lives here — see session.ts.
 */
let current: Record<string, string | undefined> | null = null;

export function initRuntimeEnv(env: Record<string, string | undefined>): void {
  if (!current) {
    current = { ...env };
  }
}

function vars(): Record<string, string | undefined> {
  return current ?? {};
}

/** A Worker variable or secret, trimmed, or undefined when absent. */
export function runtimeVar(name: string): string | undefined {
  return vars()[name]?.trim() || undefined;
}
