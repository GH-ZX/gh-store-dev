"use client";

import { useEffect, useRef } from "react";
import { BRAND } from "@/lib/brand";
import { BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS } from "@/lib/brand-wordmark";

/**
 * "GH Store" wordmark that sits beside the logo tile.
 *
 * Two stacked text layers: a static base (the resting state — "GH" in the
 * accent gradient, "Store" in ink) and an `aria-hidden` overlay holding a
 * highlight band clipped to the text. The overlay is `opacity-0` until JS runs,
 * then `element.animate()` sweeps it across once on page load and pins it
 * hidden again. Skipped entirely under `prefers-reduced-motion`.
 */
export function BrandWordmark() {
  const overlayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // WAAPI is not covered by the CSS `prefers-reduced-motion` override, so it
    // needs its own check. When skipped the overlay stays at `opacity-0` and
    // only the static wordmark is visible.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sweep = overlay.animate(BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS);
    return () => sweep.cancel();
  }, []);

  return (
    <span className="relative inline-flex text-[0.875rem] font-semibold tracking-tight text-[var(--ink)] sm:text-[0.9375rem]">
      <span
        ref={overlayRef}
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--ink)_20%,transparent)_50%,transparent)] bg-clip-text text-transparent opacity-0"
      >
        {BRAND.name}
      </span>
      <span className="bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] bg-clip-text text-transparent">
        GH
      </span>
      <span> Store</span>
    </span>
  );
}
