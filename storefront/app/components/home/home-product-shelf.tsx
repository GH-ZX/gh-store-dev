import { Link } from "react-router";
import { ProductGrid } from "@/components/store/collections";
import { ProductEditor } from "@/components/live-edit/product-editor";
import { ArrowIcon } from "@/components/ui/icons";
import { getMessages, type AdminMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { getProductCardLabels } from "@/lib/catalog/labels";

/** The existing featured selection, exposed as direct product links with prices. */
export function HomeProductShelf({ products, locale, liveEdit }: {
  products: StoreProduct[];
  locale: Locale;
  liveEdit?: AdminMessages["liveEdit"] | null;
}) {
  const home = getMessages(locale, "home");
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return (
    <section className="sf-home-products" aria-labelledby="home-products-title">
      <div className="sf-home-products-heading">
        <h2 id="home-products-title">{home.shop.featured}</h2>
        <Link to={`/${locale}/products`} className="sf-home-products-all">
          {common.actions.viewAll}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
        </Link>
      </div>
      <ProductGrid
        games={products}
        locale={locale}
        labels={getProductCardLabels(common, catalog)}
        priorityCount={2}
        renderOverlay={liveEdit ? (product) => (
          <ProductEditor gameId={product.id} gameSlug={product.slug} label={product.name} locale={locale} messages={liveEdit} />
        ) : undefined}
      />
    </section>
  );
}
