/**
 * G2Bulk failure classification.
 *
 * The distinction that matters most is {@link G2BulkAuthError}: the provider
 * bans an IP that keeps sending a bad key, so a 401 must stop the caller dead
 * rather than feed a retry loop.
 */

export type G2BulkErrorKind = "auth" | "rate_limit" | "server" | "request" | "network" | "contract";

export class G2BulkError extends Error {
  readonly kind: G2BulkErrorKind;
  readonly status: number | null;
  /** Whether retrying the same call could plausibly succeed. */
  readonly retryable: boolean;

  constructor(kind: G2BulkErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "G2BulkError";
    this.kind = kind;
    this.status = status;
    this.retryable = kind === "rate_limit" || kind === "server" || kind === "network";
  }
}

export class G2BulkAuthError extends G2BulkError {
  constructor(message = "G2Bulk rejected the API key.") {
    super("auth", message, 401);
    this.name = "G2BulkAuthError";
  }
}

/** Response body did not match the documented contract. */
export class G2BulkContractError extends G2BulkError {
  constructor(message: string) {
    super("contract", message);
    this.name = "G2BulkContractError";
  }
}

export function classifyStatus(status: number, message: string): G2BulkError {
  if (status === 401 || status === 403) {
    return new G2BulkAuthError(message);
  }

  if (status === 429) {
    return new G2BulkError("rate_limit", message, status);
  }

  if (status >= 500) {
    return new G2BulkError("server", message, status);
  }

  return new G2BulkError("request", message, status);
}
