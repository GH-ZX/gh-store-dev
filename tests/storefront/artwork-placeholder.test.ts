import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { ArtworkPlaceholder } from "../../storefront/app/components/store/artwork-placeholder";

const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement, Fragment } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");

describe("ArtworkPlaceholder component", () => {
  it("renders a rich 800x450 SVG with 5 visual layers", () => {
    const markup = renderToStaticMarkup(
      createElement(ArtworkPlaceholder, {
        title: "Gemini 18 Months",
        category: "ai",
      }),
    );

    // SVG container attributes
    expect(markup).toContain('viewBox="0 0 800 450"');
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');

    // Gradient definitions
    expect(markup).toContain("<linearGradient");
    expect(markup).toContain("<radialGradient");
    expect(markup).toContain("<pattern");

    // Abstract geometry
    expect(markup).toContain("<circle");
    expect(markup).toContain("<rect");

    // Vector typography and brand mark
    expect(markup).toContain("Gemini 18 Months");
    expect(markup).toContain("GH STORE");
  });

  it("gives repeated artwork independent paint definitions", () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      createElement(ArtworkPlaceholder, { title: "Same product", category: "ai" }),
      createElement(ArtworkPlaceholder, { title: "Same product", category: "ai" }),
    ));
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const references = [...markup.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(references.sort()).toEqual(ids.sort());
  });

  it("isolates Arabic title direction while keeping the wordmark left to right", () => {
    const markup = renderToStaticMarkup(createElement(ArtworkPlaceholder, { title: "اشتراك الذكاء الاصطناعي", category: "ai" }));
    expect(markup).toMatch(/<text[^>]+direction="rtl"[^>]+text-anchor="end"[^>]+unicode-bidi="isolate"/);
    expect(markup).toMatch(/<text[^>]+direction="ltr"[^>]+text-anchor="start"[^>]*>GH STORE<\/text>/);
  });

  it("applies category-specific palette colors for known categories", () => {
    // AI -> Violet/Indigo (#8b5cf6)
    const aiMarkup = renderToStaticMarkup(
      createElement(ArtworkPlaceholder, { title: "AI Tool", category: "ai" }),
    );
    expect(aiMarkup).toContain("#8b5cf6");

    // Games -> Blue (#2563eb)
    const gamesMarkup = renderToStaticMarkup(
      createElement(ArtworkPlaceholder, { title: "Game Pass", category: "games" }),
    );
    expect(gamesMarkup).toContain("#2563eb");

    // VPN -> Emerald (#10b981)
    const vpnMarkup = renderToStaticMarkup(
      createElement(ArtworkPlaceholder, { title: "Proton VPN", category: "vpn" }),
    );
    expect(vpnMarkup).toContain("#10b981");
  });
});
