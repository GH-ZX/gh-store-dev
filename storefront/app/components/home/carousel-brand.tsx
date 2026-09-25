import { useState } from "react";
import { resolveImageSource } from "@/lib/images";
import type { StoreProduct } from "@/lib/catalog/product-mapper";

/** A logo is the visible identity; the parent link/button retains the full accessible name. */
export function CarouselBrand({ product, priority = false }: { product: StoreProduct; priority?: boolean }) {
  return <BrandImage key={product.logoUrl ?? product.id} product={product} priority={priority} />;
}
function BrandImage({ product, priority }: { product: StoreProduct; priority: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = resolveImageSource(product.logoUrl);
  if (!source || failed) return <span className="sf-carousel-brand-fallback" dir="auto">{product.name}</span>;
  return <span className="sf-carousel-brand" aria-hidden="true">
    <img src={source} alt="" loading={priority ? "eager" : "lazy"} decoding="async"
      onError={() => setFailed(true)} data-logo-tone={product.carouselLogoTone ?? undefined}
      data-monochrome={product.carouselLogoTone || !/simpleicons\.org|\/storefront\/brands\//i.test(product.logoUrl ?? "") ? "true" : undefined} />
  </span>;
}
