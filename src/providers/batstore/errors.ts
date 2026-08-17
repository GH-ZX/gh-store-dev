/**
 * BatStore failure classification.
 *
 * The same vocabulary the other suppliers use — `auth`, `rate_limit`, `request`,
 * `server`, `network`, `contract` — so a screen reporting a supplier failure
 * never has to know which supplier it was, and the message catalogue is written
 * once.
 *
 * BatStore (VenteBot Reseller) reports failures as a JSON body carrying a
 * `success: false` flag, a string `code` and a `message`; the HTTP status is the
 * reliable signal for grouping, so classification leans on it.
 */

export type BatStoreErrorKind =
  | "auth"
  | "rate_limit"
  | "server"
  | "request"
  | "network"
  | "contract";

export class BatStoreError extends Error {
  readonly kind: BatStoreErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(kind: BatStoreErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "BatStoreError";
    this.kind = kind;
    this.status = status;
    this.retryable = kind === "rate_limit" || kind === "server" || kind === "network";
  }
}

export class BatStoreAuthError extends BatStoreError {
  constructor(message = "BatStore rejected the API key.") {
    super("auth", message, 401);
    this.name = "BatStoreAuthError";
  }
}

/** Response body did not match what the documentation describes. */
export class BatStoreContractError extends BatStoreError {
  constructor(message: string) {
    super("contract", message);
    this.name = "BatStoreContractError";
  }
}

export function classifyBatStoreStatus(status: number, message: string): BatStoreError {
  if (status === 401 || status === 403) {
    return new BatStoreAuthError(message);
  }

  if (status === 429) {
    return new BatStoreError("rate_limit", message, status);
  }

  if (status >= 500) {
    return new BatStoreError("server", message, status);
  }

  return new BatStoreError("request", message, status);
}