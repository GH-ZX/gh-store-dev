import { Link } from "react-router";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { formatMessage } from "@/i18n/format";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { productPath } from "@/lib/catalog/paths";
import {
  formatExcludedRegions,
  getRegionVariant,
  regionVariantLabel,
  siblingVariantSlugs,
  withRegionSuffix,
  type RegionVariant,
} from "@/lib/catalog/region-variants";
import { cn } from "@/lib/cn";

/**
 * Region identity for a product that the same brand sells per region.
 *
 * The store sells Mobile Legends as three separate regional packages, Free Fire
 * as three more, and three region-locked Turkish products. A shopper could not
 * previously tell them apart, and the three MLBB pages competed with each
 * other for the same query. This component states the region, states what the
 * supplier excludes, warns that the variants are not interchangeable, and
 * links the siblings — clarity instead of consolidation, because the owner was
 * explicit that the packages must stay separate.
 *
 * Nothing here is invented: every region name and exclusion comes from the
 * supplier's published notes (see `@/lib/catalog/region-variants`).
 */

type RegionCopy = ReturnType<typeof getMessages<"catalog">>["productDetail"];

export function regionVariantOf(product: Pick<StoreProduct, "slug">): RegionVariant | null {
  return getRegionVariant(product.slug);
}

/** The region qualifier used in a title, H1 and breadcrumb. */
export function regionQualifiedName(
  product: Pick<StoreProduct, "slug" | "name">,
  locale: Locale,
): string {
  const variant = regionVariantOf(product);
  return withRegionSuffix(product.name, regionVariantLabel(variant, locale));
}

/** `<title>`/`og:title` value: product name plus its region, when it has one. */
export function regionQualifiedTitle(
  product: Pick<StoreProduct, "slug" | "name">,
  locale: Locale,
): string {
  const variant = regionVariantOf(product);
  const region = regionVariantLabel(variant, locale);
  if (!region) return product.name;
  return locale === "ar" ? `${product.name} — ${region}` : `${product.name} — ${region}`;
}

/**
 * The region facts block: label, exclusions, and the non-interchangeable
 * warning. Rendered on the product page for every product with a recorded
 * regional split.
 */
export function RegionNotice({
  product,
  locale,
  locked,
}: {
  product: Pick<StoreProduct, "slug" | "name">;
  locale: Locale;
  /** True for a product whose whole point is that it is bound to one region. */
  locked?: boolean;
}) {
  const variant = regionVariantOf(product);
  if (!variant) return null;
  const copy: RegionCopy = getMessages(locale, "catalog").productDetail;
  const region = regionVariantLabel(variant, locale);
  const excluded = formatExcludedRegions(variant.excluded, locale);

  return (
    <section className="sf-region-notice" data-region-family={variant.family} aria-labelledby="region-heading">
      <h2 id="region-heading" className="sf-region-notice-heading">
        {locked ? copy.regionLockedHeading : copy.regionHeading}
      </h2>
      <dl className="sf-region-facts">
        <div>
          <dt>{copy.regionFactLabel}</dt>
          <dd data-region-published={region ? "true" : "false"}>
            <bdi>{region ?? copy.regionUnverified}</bdi>
          </dd>
        </div>
        {excluded ? (
          <div>
            <dt>{copy.regionExcludedLabel.replace("{regions}", "")}</dt>
            <dd><bdi>{excluded}</bdi></dd>
          </div>
        ) : null}
      </dl>
      {locked && region ? (
        <p className="sf-region-locked">{formatMessage(copy.regionLockedNotice, { region })}</p>
      ) : null}
      {variant.regionUnpublished ? (
        <p className="sf-region-unpublished">{copy.regionUnpublishedNotice}</p>
      ) : null}
      {excluded ? (
        <p className="sf-region-excluded">
          {formatMessage(copy.regionExcludedLabel, { regions: excluded })}
        </p>
      ) : variant.regionUnpublished ? null : (
        <p className="sf-region-open">{copy.regionAllRegions}</p>
      )}
      {variant.supplierNote ? (
        <p className="sf-region-supplier-note">
          <span>{locale === "ar" ? "ملاحظة المورّد" : "Supplier note"}: </span>
          <bdi dir="ltr">{variant.supplierNote}</bdi>
        </p>
      ) : null}
      <p className="sf-region-verify">{copy.regionVerifyHint}</p>
    </section>
  );
}

/**
 * "Looking for another region?" — the cross-link between variants.
 *
 * Only products from the same family are shown, so an unrelated product is
 * never presented as an alternative region of this one.
 */
export function RegionSiblingLinks({
  product,
  siblings,
  locale,
}: {
  product: Pick<StoreProduct, "slug" | "name">;
  siblings: StoreProduct[];
  locale: Locale;
}) {
  const variant = regionVariantOf(product);
  if (!variant) return null;
  const copy: RegionCopy = getMessages(locale, "catalog").productDetail;
  if (siblings.length === 0) return null;

  const expected = new Set(siblingVariantSlugs(product.slug));
  const shown = siblings.filter((candidate) => expected.has(candidate.slug));
  if (shown.length === 0) return null;

  return (
    <nav className="sf-region-siblings" aria-labelledby="region-siblings-heading">
      <h2 id="region-siblings-heading">{copy.regionSiblingsHeading}</h2>
      <p>{copy.regionSiblingsDescription}</p>
      <ul>
        {shown.map((candidate) => {
          const candidateRegion = regionVariantLabel(regionVariantOf(candidate), locale);
          return (
            <li key={candidate.id}>
              <Link to={productPath(locale, candidate)} prefetch="intent">
                <span className="sf-region-sibling-name"><bdi>{candidate.name}</bdi></span>
                <span className="sf-region-sibling-region">
                  <bdi>{candidateRegion ?? copy.regionUnverified}</bdi>
                </span>
                <span className="sf-region-sibling-note">{copy.regionSiblingSeparate}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Compact badge for a card or offer row. */
export function RegionBadge({ product, locale, className }: {
  product: Pick<StoreProduct, "slug">;
  locale: Locale;
  className?: string;
}) {
  const region = regionVariantLabel(regionVariantOf(product), locale);
  if (!region) return null;
  return <span className={cn("sf-region-badge", className)} data-region-badge="true"><bdi>{region}</bdi></span>;
}
