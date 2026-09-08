import type { ReactNode } from "react";
import { useId } from "react";
import { Form, Link, useNavigate } from "react-router";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { SearchIcon } from "@/components/ui/icons";
import { StoreImage } from "@/components/store/store-image";
import { formatPrice } from "@/lib/format/money";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import "@/styles/storefront-catalog.css";

export function CatalogPage({ children }: { children: ReactNode }) {
  return <section className="sf-catalog-page"><div className="gh-page">{children}</div></section>;
}

export function CatalogHeading({ locale, title, description, total, item = "products" }: {
  locale: Locale; title: string; description?: string; total?: number; item?: "products" | "offers" | "results";
}) {
  const common = getMessages(locale, "common");
  const noun = locale === "ar" ? { products: "منتج", offers: "عرض", results: "نتيجة" }[item] : item;
  return <header className="sf-catalog-heading">
    <nav className="sf-catalog-breadcrumb" aria-label={locale === "ar" ? "مسار التنقل" : "Breadcrumb"}>
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
  return <div className="sf-catalog-toolbar">
    <Form action={`/${locale}/search`} method="get" role="search" className="sf-catalog-search-form">
      <label htmlFor={`${id}-query`}>{search.fieldLabel}</label>
      <div className="sf-catalog-search-control"><SearchIcon className="size-5" /><input id={`${id}-query`} name="q" type="search" placeholder={search.placeholder} maxLength={80} /><button type="submit">{search.submit}</button></div>
      {filter !== "all" ? <input type="hidden" name="type" value={filter} /> : null}
    </Form>
    {categories?.length ? <label className="sf-catalog-select-label" htmlFor={`${id}-category`}>
      <span>{locale === "ar" ? "الفئة" : "Category"}</span>
      <select id={`${id}-category`} value={activeCategory} onChange={(event) => navigate(`/${locale}/${event.target.value}`)}>
        <option value="products">{locale === "ar" ? "جميع المنتجات" : "All products"}</option>
        {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
      </select>
    </label> : null}
  </div>;
}

export function CatalogPager({ locale, path, page, pageSize, total }: { locale: Locale; path: string; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav className="sf-catalog-pager" aria-label={locale === "ar" ? "الصفحات" : "Pagination"}>
    {page > 1 ? <Link to={`/${locale}/${path}?page=${page - 1}`} rel="prev">{locale === "ar" ? "السابق" : "Previous"}</Link> : <span />}
    <span>{locale === "ar" ? "الصفحة" : "Page"} <bdi>{page} / {pages}</bdi></span>
    {page < pages ? <Link to={`/${locale}/${path}?page=${page + 1}`} rel="next">{locale === "ar" ? "التالي" : "Next"}</Link> : <span />}
  </nav>;
}

export function PurchaseSummary({ locale, product, offer }: { locale: Locale; product: StoreProduct; offer: StoreOffer | undefined }) {
  const common = getMessages(locale, "common");
  return <aside className="sf-purchase-summary" aria-labelledby="purchase-summary-heading">
    <h2 id="purchase-summary-heading">{locale === "ar" ? "ملخص الطلب" : "Order summary"}</h2>
    {offer ? <>
      <div className="sf-purchase-item"><div className="sf-purchase-art"><StoreImage src={product.logoUrl ?? offer.imageUrl ?? product.imageUrl} fit={product.logoUrl ? "contain" : "cover"} className={product.logoUrl ? "sf-catalog-logo" : undefined} alt="" sizes="64px" /></div><div><span>{product.name}</span><strong><bdi>{offer.name}</bdi></strong>{offer.regionCode ? <small><bdi>{offer.regionCode}</bdi></small> : null}</div></div>
      {offer.originalPrice !== null && offer.originalPrice > offer.price ? <p className="sf-purchase-original">{locale === "ar" ? "السعر السابق" : "Original price"} <del><bdi dir="ltr">{formatPrice(offer.originalPrice, offer.currency, locale)}</bdi></del></p> : null}
      <div className="sf-purchase-total" aria-live="polite"><span>{locale === "ar" ? "الإجمالي" : "Total"}</span><strong><bdi dir="ltr">{formatPrice(offer.price, offer.currency, locale)}</bdi></strong></div>
      {typeof offer.supplierCostUsd === "number" ? <p className="sf-catalog-muted">{common.price.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi></p> : null}
      <Link className="sf-catalog-primary" to={`/${locale}/checkout/${product.slug}/${offer.slug}`}>{locale === "ar" ? "المتابعة إلى إتمام الطلب" : "Continue to checkout"}</Link>
      <p className="sf-purchase-note">{locale === "ar" ? "يمكنك مراجعة التفاصيل قبل الدفع." : "You can review the details before paying."}</p>
    </> : <p className="sf-catalog-muted">{locale === "ar" ? "اختر عرضاً للمتابعة." : "Choose an offer to continue."}</p>}
  </aside>;
}
