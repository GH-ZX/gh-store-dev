import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { getProductArtwork } from "@/lib/catalog/presentation";
import { StoreImage } from "@/components/store/store-image";
/** One branded composition for every product, including future provider imports. */
export function ProductArtwork({ product, priority = false, large = false }: { product: StoreProduct; priority?: boolean; large?: boolean }) {
  const artwork = getProductArtwork(product, large ? "large" : "thumbnail");
  if (!large) return <StoreImage {...artwork} alt="" fallbackLabel={product.name} category={product.categorySlug} priority={priority} width={640} sizes="(min-width: 1024px) 240px, 160px" />;
  return <div className="sf-product-stage" data-kind={product.kind} data-large={large} aria-hidden="true">
    <span className="sf-product-stage-brand">GH STORE</span>
    <div className="sf-product-stage-image"><StoreImage {...artwork} alt="" fallbackLabel={product.name} category={product.categorySlug} priority={priority} width={large ? 960 : 640} sizes={large ? "(max-width: 719px) 90vw, 420px" : "(min-width: 1024px) 240px, 160px"} /></div>
    <span className="sf-product-stage-name" dir="auto">{product.name}</span>
  </div>;
}
