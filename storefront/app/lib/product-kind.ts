export type ProductKind =
  | "game"
  | "digital"
  | "subscription"
  | "service"
  | "virtual_currency"
  | "other";

/** All valid product kinds, in display order. */
export const PRODUCT_KINDS = [
  "game",
  "digital",
  "subscription",
  "service",
  "virtual_currency",
  "other",
] as const satisfies readonly ProductKind[];

export const PRICING_MODES = ["default", "custom", "fixed"] as const;

export type PricingMode = (typeof PRICING_MODES)[number];
