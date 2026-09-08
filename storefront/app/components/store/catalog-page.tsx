import type { ReactNode } from "react";
import { useId } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { ArrowIcon } from "@/components/ui/icons";
import { SearchField } from "@/components/search/search-field";
import { StoreImage } from "@/components/store/store-image";
import { formatPrice } from "@/lib/format/money";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { getProductArtwork } from "@/lib/catalog/presentation";
import "@/styles/storefront-catalog.css";
import "@/styles/storefront-collections.css";

export function CatalogPage({ children }: { children: ReactNode }) {
  return <section className="sf-catalog-page"><div className="gh-page">{children}</div></section>;
}

export function CatalogHeading({ locale, title, description, total, item = "products" }: {
  locale: Locale; title: string; description?: string; total?: number; item?: "products" | "offers" | "results";
}) {
  const common = getMessages(locale, "common");
  const presentation = getMessages(locale, "presentation");
  const noun = presentation.countItems[item];
  return <header className="sf-catalog-heading">
    <nav className="sf-catalog-breadcrumb" aria-label={presentation.breadcrumbLabel}>
      <Link to={`/${locale}`}>{common.navigation.home}</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span>
    </nav>
    <div className="sf-catalog-title-row"><h1>{title}</h1>{total !== undefined ? <span className="sf-catalog-count"><bdi>{new Intl.NumberFormat(locale).format(total)}</bdi> {noun}</span> : null}</div>
    {description ? <p>{description}</p> : null}
  </header>;
}

export function CatalogNavigation({ locale, active }: { locale: Locale; active: string }) {
  const common = getMessages(locale, "common");
  const links = [
    ["products", common.navigation.allProducts], ["games", common.navigation.games],
    ["gift-cards", common.navigation.giftCards], ["sale", common.navigation.offers],
    ["best-sellers", common.navigation.bestSellers],
  ];
  return <nav className="sf-catalog-nav" aria-label={common.actions.browse}>
    {links.map(([path, label]) => <Link key={path} to={`/${locale}/${path}`} aria-current={active === path ? "page" : undefined}>{label}</Link>)}
  </nav>;
}

export function CatalogToolbar({ locale, filter = "all", categories, activeCategory = "products" }: {
  locale: Locale; filter?: "all" | "topup" | "gift_card" | "offers";
  categories?: { id: string; slug: string; name: string }[]; activeCategory?: string;
}) {
  const id = useId();
  const navigate = useNavigate();
  const search = getMessages(locale, "search");
  const common = getMessages(locale, "common");
  const presentation = getMessages(locale, "presentation");
  return <div className="sf-catalog-toolbar">
    <div className="sf-catalog-toolbar-search">
      <label className="sf-catalog-toolbar-label" htmlFor={`${id}-search`}>{search.fieldLabel}</label>
      <SearchField locale={locale} filter={filter} labels={search} inputId={`${id}-search`} className="sf-search" />
    </div>
    {categories?.length ? <label className="sf-catalog-select-label" htmlFor={`${id}-category`}>
      <span>{presentation.categoryLabel}</span>
      <select id={`${id}-category`} value={activeCategory} onChange={(event) => navigate(`/${locale}/${event.target.value}`)}>
        <option value="products">{common.navigation.allProducts}</option>
        {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
      </select>
    </label> : null}
  </div>;
}

export function CatalogPager({ locale, path, page, pageSize, total }: { locale: Locale; path: string; page: number; pageSize: number; total: number }) {
  const location = useLocation();
  const common = getMessages(locale, "common");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  function href(target: number) {
    const params = new URLSearchParams(location.search);
    if (target === 1) params.delete("page"); else params.set("page", String(target));
    return `/${locale}/${path}${params.size ? `?${params}` : ""}`;
  }
  return <nav className="sf-catalog-pager" aria-label={common.pagination.navLabel}>
    {page > 1 ? <Link to={href(page - 1)} rel="prev" aria-label={common.pagination.previous}><ArrowIcon direction="start" className="size-4 rtl:rotate-180" />{common.actions.previous}</Link> : <span className="sf-catalog-pager-disabled" aria-disabled="true">{common.actions.previous}</span>}
    <span className="sf-catalog-page-position">{formatMessage(common.pagination.position, { page, pages }, locale)}</span>
    {page < pages ? <Link to={href(page + 1)} rel="next" aria-label={common.pagination.next}>{common.actions.next}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></Link> : <span className="sf-catalog-pager-disabled" aria-disabled="true">{common.actions.next}</span>}
  </nav>;
}

export function PurchaseSummary({ locale, product, offer }: { locale: Locale; product: StoreProduct; offer: StoreOffer | undefined }) {
  const common = getMessages(locale, "common");
  const presentation = getMessages(locale, "presentation");
  const artwork = getProductArtwork({ ...product, imageUrl: offer?.imageUrl ?? product.imageUrl });
  return <aside className="sf-purchase-summary" aria-labelledby="purchase-summary-heading">
    <h2 id="purchase-summary-heading">{locale === "ar" ? "ملخص الطلب" : "Order summary"}</h2>
    {offer ? <>
      <div className="sf-purchase-item"><div className="sf-purchase-art"><StoreImage {...artwork} fit="contain" fallbackFit="contain" fallbackLabel={product.name} fallbackText={presentation.imageUnavailable} alt="" width={128} height={128} sizes="64px" /></div><div><span><bdi>{product.name}</bdi></span><strong><bdi>{offer.name}</bdi></strong>{offer.regionCode ? <small><bdi>{offer.regionCode}</bdi></small> : null}</div></div>
      {offer.originalPrice !== null && offer.originalPrice > offer.price ? <p className="sf-purchase-original">{locale === "ar" ? "السعر السابق" : "Original price"} <del><bdi dir="ltr">{formatPrice(offer.originalPrice, offer.currency, locale)}</bdi></del></p> : null}
      <div className="sf-purchase-total" aria-live="polite"><span>{locale === "ar" ? "الإجمالي" : "Total"}</span><strong><bdi dir="ltr">{formatPrice(offer.price, offer.currency, locale)}</bdi></strong></div>
      {typeof offer.supplierCostUsd === "number" ? <p className="sf-catalog-muted">{common.price.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi></p> : null}
      <Link className="sf-catalog-primary" to={`/${locale}/checkout/${encodeURIComponent(product.slug)}/${encodeURIComponent(offer.slug)}`}>{locale === "ar" ? "المتابعة إلى إتمام الطلب" : "Continue to checkout"}</Link>
      <p className="sf-purchase-note">{locale === "ar" ? "يمكنك مراجعة التفاصيل قبل الدفع." : "You can review the details before paying."}</p>
    </> : <p className="sf-catalog-muted">{locale === "ar" ? "اختر عرضاً للمتابعة." : "Choose an offer to continue."}</p>}
  </aside>;
}
