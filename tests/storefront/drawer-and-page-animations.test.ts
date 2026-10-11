import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HeaderMobileDrawer } from "../../storefront/app/components/layout/header-base";

describe("Mobile drawer and page entrance animations", () => {
  const cssPath = resolve(__dirname, "../../storefront/app/styles/storefront-shell.css");
  const css = readFileSync(cssPath, "utf-8");

  const localeLayoutPath = resolve(__dirname, "../../storefront/app/routes/locale-layout.tsx");
  const localeLayoutSource = readFileSync(localeLayoutPath, "utf-8");

  const dashboardLayoutPath = resolve(__dirname, "../../storefront/app/routes/dashboard-layout.tsx");
  const dashboardLayoutSource = readFileSync(dashboardLayoutPath, "utf-8");

  it("exports HeaderMobileDrawer as a callable React component", () => {
    expect(typeof HeaderMobileDrawer).toBe("function");
  });

  it("defines smooth entrance and exit keyframe animations for the mobile drawer in storefront-shell.css", () => {
    expect(css).toContain("@keyframes sf-drawer-enter");
    expect(css).toContain("@keyframes sf-drawer-exit");
    expect(css).toContain("@keyframes sf-backdrop-enter");
    expect(css).toContain("@keyframes sf-backdrop-exit");
    expect(css).toContain("@keyframes sf-drawer-content-enter");

    expect(css).toContain(".sf-mobile-drawer[open]");
    expect(css).toContain("animation: sf-drawer-enter 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards");
    expect(css).toContain(".sf-mobile-drawer.sf-mobile-drawer--closing");
    expect(css).toContain("animation: sf-drawer-exit 220ms cubic-bezier(0.32, 0.72, 0, 1) forwards !important");
  });

  it("defines staggered content animations inside the mobile drawer", () => {
    expect(css).toContain(".sf-mobile-drawer[open] .sf-drawer-header");
    expect(css).toContain(".sf-mobile-drawer[open] .sf-drawer-body");
    expect(css).toContain(".sf-mobile-drawer[open] .sf-drawer-footer");
  });

  it("defines page entrance animation tokens and classes in storefront-shell.css", () => {
    expect(css).toContain("@keyframes sf-page-enter");
    expect(css).toContain(".sf-page-transition");
    expect(css).toContain("animation: sf-page-enter 280ms cubic-bezier(0.16, 1, 0.3, 1) backwards");
  });

  it("disables all drawer and page animations under prefers-reduced-motion: reduce", () => {
    const reducedMotionSection = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotionSection).toContain(".sf-mobile-drawer[open]");
    expect(reducedMotionSection).toContain(".sf-mobile-drawer.sf-mobile-drawer--closing");
    expect(reducedMotionSection).toContain(".sf-page-transition");
    expect(reducedMotionSection).toContain("animation: none !important");
  });

  it("wraps Outlet with keyed sf-page-transition container in both storefront and dashboard layouts", () => {
    expect(localeLayoutSource).toContain('<div key={pathname} className="sf-page-transition');
    expect(localeLayoutSource).toContain("<Outlet />");

    expect(dashboardLayoutSource).toContain('<div key={pathname} className="sf-page-transition');
    expect(dashboardLayoutSource).toContain("<Outlet />");
  });
});
