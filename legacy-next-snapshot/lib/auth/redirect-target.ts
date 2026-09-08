/**
 * Post-authentication redirect target validation.
 *
 * The `next` parameter is attacker-controlled data, never a navigation target
 * until it passes here. String prefix checks alone are not safe: browsers
 * normalize `\` to `/`, so `/\evil.com` walks straight past a
 * "starts with `/` but not `//`" test and lands on an external host carrying a
 * fresh session.
 *
 * The rules:
 * 1. Reject anything that does not begin with exactly one `/`.
 * 2. Reject backslashes and control characters outright — in both the raw
 *    value and its percent-decoded form, so `%5C` cannot smuggle a slash
 *    past the raw check.
 * 3. Canonicalize with the WHATWG URL parser against a sentinel origin and
 *    require that origin back — protocol-relative (`//host`) and absolute
 *    URLs fail because their origin differs.
 * 4. Return only the normalized path, search, and hash of the parsed result,
 *    so dot segments arrive collapsed rather than as raw traversal text.
 *
 * Malformed percent-encoding is rejected instead of guessed at: a value the
 * parser cannot agree on with the browser is not worth the risk.
 */
const SENTINEL_BASE = "https://gh-store.internal.validate";

function hasBackslashOrControlCharacter(value: string): boolean {
  // C0 controls plus DEL: newlines would also poison headers like
  // `x-action-redirect`, which echoes this value during server-action redirects.
  return /[\u0000-\u001f\u007f]/.test(value) || value.includes("\\");
}

export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (hasBackslashOrControlCharacter(value)) {
    return null;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (hasBackslashOrControlCharacter(decoded)) {
    return null;
  }

  let target: URL;

  try {
    target = new URL(value, SENTINEL_BASE);
  } catch {
    return null;
  }

  if (target.origin !== SENTINEL_BASE) {
    return null;
  }

  if (!target.pathname.startsWith("/") || target.pathname.startsWith("//")) {
    return null;
  }

  return `${target.pathname}${target.search}${target.hash}`;
}
