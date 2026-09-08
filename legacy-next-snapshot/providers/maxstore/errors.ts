/**
 * MaxStore failure classification.
 *
 * Deliberately the same vocabulary G2Bulk failures use — `auth`, `rate_limit`,
 * `request`, `server`, `network`, `contract` — so a screen reporting a supplier
 * failure never has to know which supplier it was, and the message catalogue is
 * written once.
 *
 * MaxStore reports failures twice over: an HTTP status, and a numeric code
 * inside `detail`. The code is the more precise of the two and is preferred
 * where present; the status is the fallback for a response that does not carry
 * one.
 */

export type MaxStoreErrorKind =
  | "auth"
  | "rate_limit"
  | "server"
  | "request"
  | "network"
  | "contract";

export class MaxStoreError extends Error {
  readonly kind: MaxStoreErrorKind;
  readonly status: number | null;
  /** MaxStore's own numeric code, when the body carried one. */
  readonly code: number | null;
  readonly retryable: boolean;

  constructor(
    kind: MaxStoreErrorKind,
    message: string,
    status: number | null = null,
    code: number | null = null,
  ) {
    super(message);
    this.name = "MaxStoreError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.retryable = kind === "rate_limit" || kind === "server" || kind === "network";
  }
}

export class MaxStoreAuthError extends MaxStoreError {
  constructor(message = "MaxStore rejected the API token.", code: number | null = null) {
    super("auth", message, 401, code);
    this.name = "MaxStoreAuthError";
  }
}

/** Response body did not match what the documentation describes. */
export class MaxStoreContractError extends MaxStoreError {
  constructor(message: string) {
    super("contract", message);
    this.name = "MaxStoreContractError";
  }
}

/**
 * The documented `detail.code` values.
 *
 * 123 (IP blocked) and 122 (API use not permitted) are grouped with `auth`
 * rather than `request`: all three mean this key cannot be used from here, and
 * all three must stop a caller rather than feed a retry.
 *
 * 130 (maintenance) is `server` because it is temporary and retrying is exactly
 * the right response to it.
 */
const AUTH_CODES = new Set([120, 121, 122, 123]);
const RATE_LIMIT_CODES = new Set([111]);
const SERVER_CODES = new Set([130, 114]);

export function classifyMaxStoreCode(
  code: number,
  message: string,
  status: number | null = null,
): MaxStoreError {
  if (AUTH_CODES.has(code)) {
    return new MaxStoreAuthError(message, code);
  }

  if (RATE_LIMIT_CODES.has(code)) {
    return new MaxStoreError("rate_limit", message, status ?? 429, code);
  }

  if (SERVER_CODES.has(code)) {
    return new MaxStoreError("server", message, status, code);
  }

  /*
   * Everything else documented — insufficient balance, quantity unavailable, a
   * missing field, a product that is gone — is a rejected request. Retrying
   * without changing it would produce the same answer.
   */
  return new MaxStoreError("request", message, status, code);
}

export function classifyMaxStoreStatus(status: number, message: string): MaxStoreError {
  if (status === 401 || status === 403) {
    return new MaxStoreAuthError(message);
  }

  if (status === 429) {
    return new MaxStoreError("rate_limit", message, status);
  }

  if (status >= 500) {
    return new MaxStoreError("server", message, status);
  }

  return new MaxStoreError("request", message, status);
}
