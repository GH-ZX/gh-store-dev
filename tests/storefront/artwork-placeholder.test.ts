import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArtworkPlaceholder } from "../../storefront/app/components/store/artwork-placeholder";

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
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"');

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
