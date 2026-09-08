import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { ResolvedHomeSection } from "@server/lib/services/home.service";
import { requireAdmin } from "@server/lib/auth/guards";
import { getRequestState } from "@server/request-context";
import { offerPricingMapping, supplierCost, type ProviderOfferPricing } from "@server/lib/offer-pricing";

/**
 * Enrich only the current active administrator's response. Public catalog reads
 * and shared cached objects stay untouched; supplier mappings are read through
 * the administrator's own session, so RLS remains the final authority.
 */
export async function withAdminOfferCosts(offers: StoreOffer[]): Promise<StoreOffer[]> {
  const publicOffers = offers.map(({ supplierCostUsd: _cost, ...offer }) => offer);
  if (publicOffers.length === 0) return publicOffers;
  const { request, supabase } = getRequestState();
  if (!request.headers.has("cookie")) return publicOffers;

  try {
    await requireAdmin();
  } catch {
    // An unavailable profile/expired session must fail closed, without hiding
    // the otherwise readable public catalog.
    return publicOffers;
  }

  const { data, error } = await supabase
    .from("provider_offer_mappings")
    .select("offer_id, provider_name, supplier_cost_usd")
    .in("offer_id", [...new Set(publicOffers.map((offer) => offer.id))]);
  if (error) return publicOffers;
  const mappings = new Map<string, ProviderOfferPricing[]>();
  for (const row of data ?? []) {
    const group = mappings.get(row.offer_id) ?? [];
    group.push(row);
    mappings.set(row.offer_id, group);
  }
  return publicOffers.map((offer) => ({ ...offer, supplierCostUsd: supplierCost(offerPricingMapping(mappings.get(offer.id) ?? [])) }));
}

/** Batch all offer sections once, preserving the configured homepage order. */
export async function withAdminHomeCosts(sections: ResolvedHomeSection[]): Promise<ResolvedHomeSection[]> {
  const offers = await withAdminOfferCosts(sections.flatMap((section) => section.kind === "offers" ? section.offers : []));
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  return sections.map((section) => section.kind === "offers"
    ? { ...section, offers: section.offers.map((offer) => byId.get(offer.id)!) }
    : section);
}
