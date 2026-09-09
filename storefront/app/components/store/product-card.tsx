import { Link } from "react-router";
import type { ReactNode } from "react";
import { StoreImage } from "@/components/store/store-image";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { ProductKind } from "@/lib/catalog/product-kind-mapper";
import { cn } from "@/lib/cn";
import { getProductArtwork } from "@/lib/catalog/presentation";
import { productPath } from "@/lib/catalog/paths";

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
  const presentation = getMessages(locale, "presentation");
  const artwork = getProductArtwork(product);
  const kindLabel = product.kind !== "game" && product.kind !== "other"
    ? labels.productKinds?.[product.kind]
    : null;
  const card = (
    <Link
      to={productPath(locale, product)}
      prefetch="intent"
      className={cn("sf-product-card", className)}
    >
      <div className="sf-product-cover" data-artwork-fit={artwork.fit}>
        <StoreImage
          {...artwork}
          alt=""
          fallbackLabel={product.name}
          category={product.categorySlug}
          fallbackText={presentation.imageUnavailable}
          priority={priority}
          focus={product.carouselFocus}
          width={640}
          height={640}
          sizes="(min-width: 1280px) 296px, (min-width: 1024px) 23vw, (min-width: 640px) 30vw, 176px"
        />
        {product.isFeatured ? <span className="sf-product-featured">{labels.featured}</span> : null}
      </div>
      <div className="sf-product-copy">
        {product.categoryName ? <p className="sf-product-category"><bdi>{product.categoryName}</bdi></p> : null}
        <h3 className="sf-product-title"><bdi>{product.name}</bdi></h3>
        {(kindLabel && kindLabel !== product.categoryName) || product.pointsName ? (
          <p className="sf-product-kind"><bdi>{kindLabel && kindLabel !== product.categoryName ? kindLabel : product.pointsName}</bdi></p>
        ) : null}
        <div className="sf-product-card-footer">
          {meta ? <p className="sf-product-price"><span>{meta.label}</span> <bdi dir="ltr">{meta.price}</bdi></p> : null}
          <span className="sf-product-cta">{presentation.viewProduct}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span>
        </div>
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
