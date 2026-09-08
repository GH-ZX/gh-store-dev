import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { getMessages } from "@/i18n/messages";
import type { AdminProduct } from "@server/legacy/lib/services/admin-catalog.service";

// Render with the application's React copy, as its Worker does.
const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");

function formsIn(markup: string) {
  const forms: string[] = [];
  let current = "";
  let depth = 0;
  for (const token of markup.split(/(<\/?form\b[^>]*>)/)) {
    if (/^<form\b/.test(token)) {
      expect(depth, "HTML forms cannot be nested; browsers detach their controls").toBe(0);
      depth += 1;
      current = token;
    } else if (/^<\/form\b/.test(token)) {
      depth -= 1;
      forms.push(current + token);
      current = "";
    } else if (depth) current += token;
  }
  expect(depth).toBe(0);
  return forms;
}

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  nameAr: "منتج تجريبي",
  nameEn: "Test product",
  slug: "test-product",
  imageUrl: null,
  logoUrl: null,
  productKind: "subscription",
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
  showInCarousel: false,
} as AdminProduct;

describe("product editor form ownership", () => {
  it("keeps artwork search separate and keeps every editable product field inside the save form", () => {
    const messages = getMessages("en", "admin").catalog;
    const markup = renderToStaticMarkup(createElement(ProductEditForm, {
      locale: "en", messages: messages.game, errors: messages.errors,
      categories: [], product,
    }));
    const forms = formsIn(markup);
    const artwork = forms.find((form) => form.includes('name="query"'));
    const save = forms.find((form) => form.includes('name="nameEn"'));
    expect(artwork).toBeDefined();
    expect(save).toBeDefined();
    expect(save).not.toContain('name="query"');
    for (const name of ["gameId", "slug", "categoryId", "descriptionEn", "imageUrl", "logoUrl", "carouselColor", "isActive", "showInCarousel"]) {
      expect(save).toContain(`name="${name}"`);
    }
    expect(artwork).not.toContain('name="gameId"');
    expect(forms).toHaveLength(3);
  });
});
