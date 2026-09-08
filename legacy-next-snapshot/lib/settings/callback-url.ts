/**
 * Whether a payment provider could actually reach a callback URL.
 *
 * Sam calls this URL from its own servers, so a host that only resolves on the
 * developer's machine can never receive it. That failure is completely silent
 * from the store's side: the invoice is created, the customer pays, and the
 * notification is delivered to nobody. The dashboard uses this to say so out
 * loud rather than letting an owner conclude the integration is broken.
 *
 * `http` is rejected along with unreachable hosts. A secret travelling in a
 * query string over plain text is readable by anything on the path, and the
 * callback secret is the only thing standing between a stranger and a forged
 * payment notification.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export type CallbackReachability = "ok" | "insecure" | "local" | "invalid";

export function checkCallbackUrl(url: string): CallbackReachability {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Checked before the protocol, because "it only exists on your machine" is the
  // more useful thing to tell someone running a local server.
  if (
    LOCAL_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return "local";
  }

  if (parsed.protocol !== "https:") {
    return "insecure";
  }

  return "ok";
}

export function isCallbackReachable(url: string): boolean {
  return checkCallbackUrl(url) === "ok";
}
