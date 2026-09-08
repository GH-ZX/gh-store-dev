import { Link } from "react-router";
import type { ReactNode } from "react";
import { StoreImage } from "@/components/store/store-image";
import type { Locale } from "@/i18n/config";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { ProductKind } from "@/lib/catalog/product-kind-mapper";
import { cn } from "@/lib/cn";

export type ProductCardProps = {
  product: StoreProduct;
  locale: Locale;
  labels: { featured: string; from?: string; productKinds?: Record<ProductKind, string> };
  /** Shown only when the catalog supplied an actual starting price. */
  meta?: { label: string; price: string };
  priority?: boolean;
  /** A sibling of the link, keeping live-edit controls independently operable. */
  overlay?: ReactNode;
  className?: string;
};

/** Artwork and product information have separate surfaces so any cover stays legible. */
export function ProductCard({ product, locale, labels, meta, priority = false, overlay, className }: ProductCardProps) {
  const kindLabel = product.kind !== "game" && product.kind !== "other"
    ? labels.productKinds?.[product.kind]
    : null;
  const card = (
    <Link
      to={`/${locale}/${product.categorySlug}/${product.slug}`}
      prefetch="intent"
      className={cn("sf-product-card", className)}
    >
      <div className="sf-product-cover">
        <StoreImage
          src={product.imageUrl}
          alt={product.name}
          category={product.categorySlug}
          priority={priority}
          focus={product.carouselFocus}
          sizes="(min-width: 1280px) 200px, (min-width: 1024px) 19vw, (min-width: 640px) 30vw, 46vw"
        />
        {product.isFeatured ? <span className="sf-product-featured">{labels.featured}</span> : null}
      </div>
      <div className="sf-product-copy">
        <h3 className="sf-product-title"><bdi>{product.name}</bdi></h3>
        {meta ? (
          <p className="sf-product-price">
            <span>{meta.label}</span> <bdi dir="ltr">{meta.price}</bdi>
          </p>
        ) : null}
        {kindLabel || product.pointsName ? (
          <p className="sf-product-kind"><bdi>{kindLabel ?? product.pointsName}</bdi></p>
        ) : null}
      </div>
    </Link>
  );
  return overlay ? (
    <div className="sf-product-wrapper">
      {card}
      <div className="sf-product-overlay">{overlay}</div>
    </div>
  ) : card;
}
