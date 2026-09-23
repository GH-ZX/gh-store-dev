import type { Locale } from "@/i18n/config";
import { formatOfferTerms, type OfferTerms as Terms } from "@/lib/catalog/offer-terms";
export function OfferTerms({ terms, locale }: { terms: Terms | undefined; locale: Locale }) {
  const facts = formatOfferTerms(terms, locale);
  return facts.length ? <dl className="sf-offer-terms">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null;
}
