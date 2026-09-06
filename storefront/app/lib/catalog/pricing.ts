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
  const safeMarkup = Math.min(MARKUP_LIMITS.max, Math.max(MARKUP_LIMITS.min, markupPercent));
  const raw = supplierCostUsd * (1 + safeMarkup / 100);
  const rounded = Math.ceil(raw * 100) / 100;

  return Math.max(rounded, Math.ceil(supplierCostUsd * 100) / 100);
}
