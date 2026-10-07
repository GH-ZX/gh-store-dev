import type { Locale } from "@/i18n/config";

/**
 * Region identity for products the same brand sells separately per region.
 *
 * The owner is explicit: "those MLBB are different regions, keep them, not
 * compatible with each other". So nothing here merges, redirects or renames a
 * product — it only states the region a shopper needs in order to pick the
 * right one, and links the siblings to each other.
 *
 * Every value is traceable to a supplier-published fact in
 * `provider_game_mappings.metadata->>'notes'` (G2Bulk, synced 2026-09-10/24)
 * and is mirrored into `products.metadata.region` by migration
 * `20261010050000_region_variant_disambiguation.sql`. Where the supplier names
 * no region, `regionLabel` is null and the family says so instead of guessing:
 * an invented region is exactly the ambiguity this is meant to remove.
 */

export type RegionFamilyId =
  | "mlbb"
  | "freefire"
  | "arena-breakout"
  | "turkey-store-credit";

export type RegionVariant = {
  slug: string;
  family: RegionFamilyId;
  /** Region name published by the supplier, or null when it published none. */
  regionLabel: string | null;
  regionLabelAr: string | null;
  /** Countries the supplier excludes, lower-case ISO codes (plus "me"). */
  excluded: readonly string[];
  /** The supplier's own note, shown so the shopper can judge for themselves. */
  supplierNote: string | null;
  supplierNoteAr: string | null;
  /** True when the supplier published no region for this package. */
  regionUnpublished: boolean;
};

const VARIANTS: readonly RegionVariant[] = [
  {
    slug: "mlbb",
    family: "mlbb",
    regionLabel: "Global",
    regionLabelAr: "عالمية",
    excluded: ["id", "sg", "my", "ph", "ru", "vn"],
    supplierNote:
      "Not available for Indonesia users, Indonesian users can use mlbb_global. Not available for SG/MY/PH/RU/VN",
    supplierNoteAr:
      "غير متاحة للمستخدمين في إندونيسيا؛ على مستخدمي إندونيسيا استخدام باقة mlbb_global. وغير متاحة في سنغافورة وماليزيا والفلبين وروسيا وفيتنام.",
    regionUnpublished: false,
  },
  {
    slug: "mlbb-special",
    family: "mlbb",
    regionLabel: null,
    regionLabelAr: null,
    excluded: ["id"],
    supplierNote:
      "Not available for Indonesia users, Indonesian users can use mlbb_global/mlbb_indo",
    supplierNoteAr:
      "غير متاحة لمستخدمي إندونيسيا؛ على مستخدمي إندونيسيا استخدام mlbb_global أو mlbb_indo.",
    regionUnpublished: true,
  },
  {
    slug: "mlbb-exclusive",
    family: "mlbb",
    regionLabel: null,
    regionLabelAr: null,
    excluded: ["id", "sg", "my", "ru", "vn"],
    supplierNote: "Not available for ID/SG/MY/RU/VN",
    supplierNoteAr: "غير متاحة في إندونيسيا وسنغافورة وماليزيا وروسيا وفيتنام.",
    regionUnpublished: true,
  },
  {
    slug: "freefire-me",
    family: "freefire",
    regionLabel: "Middle East",
    regionLabelAr: "الشرق الأوسط",
    excluded: [],
    supplierNote: "Available for Middle East Users",
    supplierNoteAr: "متاحة لمستخدمي الشرق الأوسط.",
    regionUnpublished: false,
  },
  {
    slug: "freefire-eu",
    family: "freefire",
    regionLabel: "Europe",
    regionLabelAr: "أوروبا",
    excluded: [],
    supplierNote: "Available for Europe Users",
    supplierNoteAr: "متاحة لمستخدمي أوروبا.",
    regionUnpublished: false,
  },
  {
    slug: "freefire-global",
    family: "freefire",
    regionLabel: "Global",
    regionLabelAr: "عالمية",
    excluded: ["vn", "th", "id", "me"],
    supplierNote:
      "Not available for Vietnam, Thailand and Indonesia users, not available for Middle East Users",
    supplierNoteAr:
      "غير متاحة لمستخدمي فيتنام وتايلاند وإندونيسيا، وغير متاحة لمستخدمي الشرق الأوسط.",
    regionUnpublished: false,
  },
  {
    slug: "arena-breakout",
    family: "arena-breakout",
    regionLabel: null,
    regionLabelAr: null,
    excluded: [],
    supplierNote: "Available for all users",
    supplierNoteAr: "متاحة لجميع المستخدمين.",
    regionUnpublished: false,
  },
  {
    slug: "arena-breakout-infinite",
    family: "arena-breakout",
    regionLabel: null,
    regionLabelAr: null,
    excluded: [],
    supplierNote: "Available for all users",
    supplierNoteAr: "متاحة لجميع المستخدمين.",
    regionUnpublished: false,
  },
  {
    slug: "psn-turkey",
    family: "turkey-store-credit",
    regionLabel: "Turkey",
    regionLabelAr: "تركيا",
    excluded: ["tr-exclusive"],
    supplierNote: null,
    supplierNoteAr: null,
    regionUnpublished: false,
  },
  {
    slug: "xbox-gift-card-turkey",
    family: "turkey-store-credit",
    regionLabel: "Turkey",
    regionLabelAr: "تركيا",
    excluded: ["tr-exclusive"],
    supplierNote: null,
    supplierNoteAr: null,
    regionUnpublished: false,
  },
  {
    slug: "valorant-riot-cash-turkey",
    family: "turkey-store-credit",
    regionLabel: "Turkey",
    regionLabelAr: "تركيا",
    excluded: ["tr-exclusive"],
    supplierNote: null,
    supplierNoteAr: null,
    regionUnpublished: false,
  },
];

const BY_SLUG = new Map(VARIANTS.map((variant) => [variant.slug, variant]));

/** Human-readable country names for the exclusion list, in both locales. */
const COUNTRY_NAMES: Record<string, { en: string; ar: string }> = {
  id: { en: "Indonesia", ar: "إندونيسيا" },
  sg: { en: "Singapore", ar: "سنغافورة" },
  my: { en: "Malaysia", ar: "ماليزيا" },
  ph: { en: "the Philippines", ar: "الفلبين" },
  ru: { en: "Russia", ar: "روسيا" },
  vn: { en: "Vietnam", ar: "فيتنام" },
  th: { en: "Thailand", ar: "تايلاند" },
  me: { en: "the Middle East", ar: "الشرق الأوسط" },
};

export function getRegionVariant(slug: string | null | undefined): RegionVariant | null {
  if (!slug) return null;
  return BY_SLUG.get(slug) ?? null;
}

export function regionFamilySlugs(family: RegionFamilyId): string[] {
  return VARIANTS.filter((variant) => variant.family === family).map((variant) => variant.slug);
}

export function regionVariantSlugs(): string[] {
  return VARIANTS.map((variant) => variant.slug);
}

/** Every sibling of this product's family, excluding the product itself. */
export function siblingVariantSlugs(slug: string): string[] {
  const variant = getRegionVariant(slug);
  if (!variant) return [];
  return regionFamilySlugs(variant.family).filter((candidate) => candidate !== slug);
}

/** "Indonesia, Singapore and Malaysia" / "إندونيسيا وسنغافورة وماليزيا". */
export function formatExcludedRegions(
  excluded: readonly string[],
  locale: Locale,
): string | null {
  const names = excluded
    .map((code) => COUNTRY_NAMES[code.toLowerCase()])
    .filter((entry): entry is { en: string; ar: string } => Boolean(entry))
    .map((entry) => (locale === "ar" ? entry.ar : entry.en));
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  const conjunction = locale === "ar" ? " و" : " and ";
  return `${names.slice(0, -1).join(locale === "ar" ? "، " : ", ")}${conjunction}${names[names.length - 1]}`;
}

/**
 * The region statement shown under the product name.
 *
 * `null` means "this product has no recorded regional split", which is the
 * signal to render nothing rather than a vague label.
 */
export function regionVariantLabel(
  variant: RegionVariant | null,
  locale: Locale,
): string | null {
  if (!variant) return null;
  const label = locale === "ar" ? variant.regionLabelAr : variant.regionLabel;
  return label?.trim() || null;
}

/**
 * How a region reads in a title, H1 or breadcrumb.
 *
 * The region is always parenthesised after the product name so the product
 * stays the subject and the region reads as a qualifier, not a second product.
 */
export function withRegionSuffix(name: string, regionName: string | null): string {
  return regionName ? `${name} (${regionName})` : name;
}

/**
 * Whether two products are region alternatives that a shopper could confuse.
 * Used by the internal-linking pass; deliberately narrow, so unrelated
 * products are never presented as interchangeable.
 */
export function isSameRegionFamily(a: string, b: string): boolean {
  const left = getRegionVariant(a);
  const right = getRegionVariant(b);
  return Boolean(left && right && left.family === right.family);
}
