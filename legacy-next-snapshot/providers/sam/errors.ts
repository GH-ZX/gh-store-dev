/**
 * Sam API failure classification.
 *
 * Two kinds carry real consequences. `expired` means the 15-minute invoice is
 * dead and a new one is needed — the customer must be told, not silently
 * retried. `wallet` means the store's own receiving wallet is misconfigured or
 * its session lapsed at the provider, which is the owner's problem and must
 * never be shown to a customer as though they did something wrong.
 */

export type SamErrorKind =
  | "auth"
  | "wallet"
  | "expired"
  | "validation"
  | "provider"
  | "not_found"
  | "network"
  | "contract"
  | "unknown";

export class SamError extends Error {
  readonly kind: SamErrorKind;
  readonly status: number | null;
  /** Sam's own code, kept for the operator-facing log. */
  readonly providerCode: string | null;
  readonly retryable: boolean;

  constructor(
    kind: SamErrorKind,
    message: string,
    status: number | null = null,
    providerCode: string | null = null,
  ) {
    super(message);
    this.name = "SamError";
    this.kind = kind;
    this.status = status;
    this.providerCode = providerCode;
    this.retryable = kind === "network" || kind === "provider";
  }
}

/**
 * Map Sam's documented codes onto our own.
 *
 * Status alone is not enough: a 400 can be a bad amount (our bug) or an
 * unlinked wallet (the owner's setup), and those need different wording.
 */
export function classifySam(status: number, code: string | null, message: string): SamError {
  const providerCode = code?.trim().toUpperCase() || null;

  switch (providerCode) {
    case "MISSING_API_KEY":
    case "INVALID_API_KEY":
      return new SamError("auth", message, status, providerCode);
    case "EXPIRED":
      return new SamError("expired", message, status, providerCode);
    case "NOT_FOUND":
      return new SamError("not_found", message, status, providerCode);
    case "INVALID_IDENTIFIER":
    case "WALLET_SESSION_EXPIRED":
      return new SamError("wallet", message, status, providerCode);
    case "VALIDATION_ERROR":
      return new SamError("validation", message, status, providerCode);
    case "PROVIDER_ERROR":
    case "WALLET_UPSTREAM_ERROR":
      return new SamError("provider", message, status, providerCode);
    default:
      break;
  }

  if (status === 401) {
    return new SamError("auth", message, status, providerCode);
  }

  if (status === 404) {
    return new SamError("not_found", message, status, providerCode);
  }

  if (status === 410) {
    return new SamError("expired", message, status, providerCode);
  }

  if (status >= 500) {
    return new SamError("provider", message, status, providerCode);
  }

  if (status >= 400) {
    return new SamError("validation", message, status, providerCode);
  }

  return new SamError("unknown", message, status, providerCode);
}
