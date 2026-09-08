export type ProviderOfferPricing = {
  provider_name: string;
  supplier_cost_usd: number | null;
  pricing_mode?: string | null;
};

/** An offer is fulfilled by one supplier; conflicting mappings have no reliable cost preview. */
export function offerPricingMapping<T extends ProviderOfferPricing>(mappings: T[]): T | null {
  return mappings.length === 1 ? mappings[0] : null;
}

export function supplierCost(mapping: ProviderOfferPricing | null): number | null {
  const cost = mapping?.supplier_cost_usd;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
}
