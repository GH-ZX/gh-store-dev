import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { formatMessage } from "@/i18n/format";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { formatExcludedRegions, regionVariantLabel, getRegionVariant, type RegionVariant } from "@/lib/catalog/region-variants";

/**
 * Original, product-specific buying copy.
 *
 * The owner's site had templated titles and empty descriptions, so a product
 * page said almost nothing a buyer or a search engine could use. This composes
 * the five things a buyer actually needs — what the item is, which region it
 * belongs to, how delivery works, what the buyer must supply, and one practical
 * note before paying — from the catalog's own facts.
 *
 * Two rules shape every sentence:
 *   * nothing is invented. Delivery wording comes from the offer's
 *     `delivery_kind`, the required fields come from the product's own checkout
 *     fields, and the region comes from the supplier's published note.
 *   * nothing is promised. There is no delivery guarantee, no warranty claim and
 *     no support-hours claim, because the store cannot establish those facts —
 *     the repo's operating guide forbids inventing them.
 */

export type BuyingNote = {
  key: "what" | "region" | "delivery" | "supply" | "note";
  heading: string;
  body: string;
};

export type DeliveryKind = "account" | "direct" | "manual" | "stored";

/** Human names for the checkout fields, for the "what you must provide" line. */
const FIELD_NAMES: Record<string, { en: string; ar: string }> = {
  userid: { en: "player ID", ar: "معرّف اللاعب" },
  serverid: { en: "server ID", ar: "معرّف السيرفر" },
  activation_identifier: { en: "activation code", ar: "رمز التفعيل" },
  email: { en: "email address", ar: "البريد الإلكتروني" },
  charname: { en: "character name", ar: "اسم الشخصية" },
  account: { en: "account details", ar: "بيانات الحساب" },
  region: { en: "account region", ar: "منطقة الحساب" },
};

export const PRODUCT_KIND_COPY: Record<string, { en: string; ar: string }> = {
  game: {
    en: "in-game top-up for a game account",
    ar: "شحن داخل اللعبة يُضاف إلى حساب اللعبة",
  },
  virtual_currency: {
    en: "in-game currency package",
    ar: "باقة عملة داخل اللعبة",
  },
  subscription: {
    en: "subscription package",
    ar: "باقة اشتراك",
  },
  digital: {
    en: "digital product",
    ar: "منتج رقمي",
  },
  service: {
    en: "service package",
    ar: "باقة خدمة",
  },
  other: {
    en: "product",
    ar: "منتج",
  },
};

function joinFieldNames(keys: readonly string[], locale: Locale): string {
  const names = keys
    .map((key) => FIELD_NAMES[key.toLowerCase()] ?? null)
    .filter((entry): entry is { en: string; ar: string } => Boolean(entry))
    .map((entry) => (locale === "ar" ? entry.ar : entry.en));
  if (names.length === 0) {
    return locale === "ar" ? "بيانات حسابك" : "your account details";
  }
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(locale === "ar" ? " و" : " and ")}${locale === "ar" ? " و" : " and "}${names[names.length - 1]}`;
}

export function buildBuyingNotes({
  locale,
  product,
  deliveryKind,
  inputFieldKeys,
}: {
  locale: Locale;
  product: Pick<StoreProduct, "name" | "kind" | "pointsName" | "slug">;
  deliveryKind: DeliveryKind;
  inputFieldKeys: readonly string[];
}): BuyingNote[] {
  const copy = getMessages(locale, "catalog").productDetail;
  const variant: RegionVariant | null = getRegionVariant(product.slug);
  const region = regionVariantLabel(variant, locale);
  const excluded = variant ? formatExcludedRegions(variant.excluded, locale) : null;
  const kindCopy = (PRODUCT_KIND_COPY[product.kind] ?? PRODUCT_KIND_COPY.other)[locale === "ar" ? "ar" : "en"];
  const unit = product.pointsName?.trim();

  const what = locale === "ar"
    ? `${product.name} هو ${kindCopy}${unit ? ` بوحدة ${unit}` : ""}. اختر الباقة التي تحتاجها من القائمة أعلاه، ويظهر السعر بالعملة نفسها التي تُحاسب بها.`
    : `${product.name} is an ${kindCopy}${unit ? ` measured in ${unit}` : ""}. Pick the package you need from the list above; the price shown is the currency you are charged in.`;

  const regionBody = region
    ? (locale === "ar"
        ? `المنطقة المعلنة لهذه الباقة: ${region}.${excluded ? ` ويستثني المورّد: ${excluded}.` : ""} راجع صفحة المنتج الأخرى إن كنت في منطقة مختلفة، فالباقات الإقليمية غير متبادلة.`
        : `The published region for this package is ${region}.${excluded ? ` The supplier excludes ${excluded}.` : ""} If you are in a different region, check the other package pages: regional packages are not interchangeable.`)
    : (locale === "ar"
        ? "لم ينشر المورّد منطقة لهذه الباقة، ويذكر فقط الدول المستثناة. تحقق من معرّف اللاعب والسيرفر قبل الدفع، وأسأل الدعم إن لم تكن متأكدًا."
        : "The supplier has not published a region for this package, only the countries it excludes. Check your player and server IDs before paying, and ask support if you are unsure.");

  const deliveryBody = (() => {
    switch (deliveryKind) {
      case "stored": return copy.buyingDeliveryStored;
      case "direct": return copy.buyingDeliveryDirect;
      case "manual": return copy.buyingDeliveryManual;
      default: return copy.buyingDeliveryAccount;
    }
  })();

  const supplyBody = inputFieldKeys.length > 0
    ? formatMessage(copy.buyingSupplyFields, { fields: joinFieldNames(inputFieldKeys, locale) })
    : copy.buyingSupplyNone;

  return [
    { key: "what", heading: copy.buyingWhatHeading, body: what },
    ...(variant ? [{ key: "region" as const, heading: copy.buyingRegionHeading, body: regionBody }] : []),
    { key: "delivery", heading: copy.buyingDeliveryHeading, body: deliveryBody },
    { key: "supply", heading: copy.buyingSupplyHeading, body: supplyBody },
    {
      key: "note",
      heading: copy.buyingNoteHeading,
      body: `${copy.buyingNotePayment} ${copy.buyingNoteTerms} ${copy.buyingNoteSupport}`,
    },
  ];
}

/**
 * The page's `description` when the catalog has none.
 *
 * Structured, original and factual: it names the product, its region and what
 * the buyer supplies. It deliberately contains no duration or warranty wording,
 * because the catalog's own trigger parses product descriptions for those terms
 * and a description must never become a source of invented supplier facts.
 */
export function buildProductDescription({
  locale,
  product,
  deliveryKind,
  inputFieldKeys,
}: {
  locale: Locale;
  product: Pick<StoreProduct, "name" | "kind" | "pointsName" | "slug">;
  deliveryKind: DeliveryKind;
  inputFieldKeys: readonly string[];
}): string {
  const variant = getRegionVariant(product.slug);
  const region = regionVariantLabel(variant, locale);
  const kindCopy = (PRODUCT_KIND_COPY[product.kind] ?? PRODUCT_KIND_COPY.other)[locale === "ar" ? "ar" : "en"];
  const unit = product.pointsName?.trim();
  const delivery = (() => {
    const copy = getMessages(locale, "catalog").productDetail;
    switch (deliveryKind) {
      case "stored": return copy.buyingDeliveryStored;
      case "direct": return copy.buyingDeliveryDirect;
      case "manual": return copy.buyingDeliveryManual;
      default: return copy.buyingDeliveryAccount;
    }
  })();
  const supply = inputFieldKeys.length > 0
    ? formatMessage(getMessages(locale, "catalog").productDetail.buyingSupplyFields, {
        fields: joinFieldNames(inputFieldKeys, locale),
      })
    : getMessages(locale, "catalog").productDetail.buyingSupplyNone;

  if (locale === "ar") {
    return `${product.name} ${kindCopy}${unit ? ` بوحدة ${unit}` : ""} من GH Store.${region ? ` المنطقة المعلنة: ${region}.` : " لم ينشر المورّد منطقة لهذه الباقة."} ${delivery} ${supply}`;
  }
  return `${product.name} — ${kindCopy}${unit ? ` measured in ${unit}` : ""} at GH Store.${region ? ` Published region: ${region}.` : " The supplier has not published a region for this package."} ${delivery} ${supply}`;
}
