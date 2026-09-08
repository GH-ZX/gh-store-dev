/**
 * Turning a supplier's cost into the price a customer pays.
 *
 * Here rather than beside one supplier, because it is the store's rule and not
 * theirs: a second supplier arriving must not bring a second answer to "what do
 * we charge". It moved out of the G2Bulk mapping when MaxStore needed the same
 * arithmetic, which is the moment a shared rule stops being a coincidence.
 */

export const MARKUP_LIMITS = {
  default: 15,
  min: 0,
  max: 500,
} as const;

export type RetailPriceInput = {
  /** Supplier cost in USD: `amount` from a catalogue, `unit_price` for a product. */
  supplierCostUsd: number;
  markupPercent: number;
};

/**
 * Customer-facing price for a supplier cost.
 *
 * Rounded **up** to the cent: rounding down would shave the margin on every
 * order, and a fraction of a cent is invisible to a customer. The result is also
 * floored at the supplier cost so a zero markup can never produce a loss. This
 * is the store price only — a supplier is never told what its product retails
 * for here.
 */
export function toRetailPrice({ supplierCostUsd, markupPercent }: RetailPriceInput): number {
  if (!Number.isFinite(supplierCostUsd) || supplierCostUsd < 0 || !Number.isFinite(markupPercent)) {
    throw new RangeError("Pricing requires a finite non-negative cost and a finite markup.");
  }
  const safeMarkup = Math.min(MARKUP_LIMITS.max, Math.max(MARKUP_LIMITS.min, markupPercent));
  const cost = decimalRatio(supplierCostUsd);
  const markup = decimalRatio(safeMarkup);
  // Compute cents as exact decimal arithmetic before rounding upward. A binary
  // product such as 25 * 1.12 is 28.000000000000004, which must still cost $28.
  const numerator = cost.units * (100n * markup.scale + markup.units);
  const denominator = cost.scale * markup.scale;
  const cents = (numerator + denominator - 1n) / denominator;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Retail price exceeds supported precision.");
  return Number(cents) / 100;
}

/** Use the provider's decimal value, including scientific notation, without an epsilon that erases a real fraction of a cent. */
function decimalRatio(value: number): { units: bigint; scale: bigint } {
  const [coefficient, exponentText] = value.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const places = fraction.length - Number(exponentText ?? 0);
  const units = BigInt(whole + fraction);
  return places >= 0
    ? { units, scale: 10n ** BigInt(places) }
    : { units: units * 10n ** BigInt(-places), scale: 1n };
}

/** A USD supplier cost cannot be subtracted from another currency without an exchange rate. */
export function supplierMarginUsd(price: number, currency: string, supplierCostUsd: number | null): number | null {
  if (currency.trim().toUpperCase() !== "USD" || supplierCostUsd === null || !Number.isFinite(supplierCostUsd) || supplierCostUsd < 0 || !Number.isFinite(price) || price < 0) return null;
  return price - supplierCostUsd;
}
