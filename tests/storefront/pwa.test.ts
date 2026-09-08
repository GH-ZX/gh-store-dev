import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PWA manifest and assets", () => {
  const publicDir = resolve(__dirname, "../../storefront/public");
  const manifestPath = resolve(publicDir, "manifest.webmanifest");
  const swPath = resolve(publicDir, "sw.js");

  it("provides a valid manifest.webmanifest with required PWA metadata", () => {
    expect(existsSync(manifestPath)).toBe(true);

    const content = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBe("GH Store");
    expect(manifest.start_url).toBe("/ar");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#101218");
    expect(manifest.background_color).toBe("#101218");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("ar");

    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    // Verify all icon files exist on disk
    for (const icon of manifest.icons) {
      const iconPath = resolve(publicDir, icon.src.replace(/^\//, ""));
      expect(existsSync(iconPath), `Icon file missing: ${icon.src}`).toBe(true);
    }
  });

  it("includes apple-touch-icon and maskable icon", () => {
    expect(existsSync(resolve(publicDir, "apple-touch-icon.png"))).toBe(true);
    expect(existsSync(resolve(publicDir, "pwa-maskable-512x512.png"))).toBe(true);
  });

  it("provides a resilient service worker sw.js", () => {
    expect(existsSync(swPath)).toBe(true);

    const swContent = readFileSync(swPath, "utf-8");
    expect(swContent).toContain("addEventListener(\"install\"");
    expect(swContent).toContain("addEventListener(\"activate\"");
    expect(swContent).toContain("addEventListener(\"fetch\"");
    expect(swContent).toContain("caches.open");
  });
});
