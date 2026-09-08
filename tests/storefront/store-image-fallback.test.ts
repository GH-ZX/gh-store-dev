import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { StoreImage } from "@/components/store/store-image";

const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");

describe("StoreImage vector fallback", () => {
  it("retains the informative image name and terminal fallback hook", () => {
    const markup = renderToStaticMarkup(createElement(StoreImage, {
      src: null, alt: "Product details", fallbackLabel: "Gemini 18 Months", category: "ai", fallbackText: "Image unavailable",
    }));
    expect(markup).toContain('role="img" aria-label="Product details"');
    expect(markup).toContain('data-image-fallback="true"');
    expect(markup).toContain("Gemini 18 Months");
    expect(markup).toContain("#8b5cf6");
    expect(markup).toContain("Image unavailable");
    expect(markup).not.toContain("<img");
  });

  it("keeps repeated card artwork decorative and its vector palette unfiltered", () => {
    const markup = renderToStaticMarkup(createElement(StoreImage, {
      src: null, alt: "", fallbackLabel: "بطاقة ستيم", category: "gift-cards", logoTone: "light",
    }));
    expect(markup).toContain('aria-hidden="true" data-image-fallback="true"');
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain("data-logo-tone");
    expect(markup).toContain("بطاقة ستيم");
    expect(markup).toContain("#0891b2");
  });
});
