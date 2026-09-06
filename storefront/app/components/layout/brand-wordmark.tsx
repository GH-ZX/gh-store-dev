"use client";

import { useEffect, useRef } from "react";
import { BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS } from "@/lib/brand-wordmark";

/*
 * Shared type classes so the base layer and the sweep overlay align
 * pixel-identically. "GH" is the strong part of the lockup; "STORE" is small
 * and wide-tracked, with trailing tracking pulled back so it does not look
 * lopsided next to the gap before it.
 */
const GH_TYPE = "font-brand text-[0.9375rem] font-bold sm:text-[1.0625rem]";
const STORE_TYPE = "font-brand text-[0.6875rem] tracking-[0.3em] sm:text-[0.75rem]";

/**
 * "GH Store" splits into the strong mark ("GH") and a wide-tracked
 * uppercase tail ("STORE") for the logo lockup. A single-word name has no
 * tail and renders the strong mark alone.
 */
function splitBrand(name: string): { mark: string; tail: string } {
  const [mark, ...tail] = name.trim().split(/\s+/);
  return { mark, tail: tail.join(" ").toUpperCase() };
}

/**
 * Site name logo lockup that sits beside the logo tile.
 *
 * Two stacked text layers: a static base (the resting state — the mark in the
 * accent gradient, the tail in ink) and an `aria-hidden` overlay holding a
 * highlight band clipped to the text. The overlay is `opacity-0` until JS runs,
 * then `element.animate()` sweeps it across once on page load and pins it
 * hidden again. Skipped entirely under `prefers-reduced-motion`.
 */
export function BrandWordmark({ name }: { name: string }) {
  const overlayRef = useRef<HTMLSpanElement>(null);
  const { mark, tail } = splitBrand(name);

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
    <span className="relative inline-flex items-baseline text-[var(--ink)]">
      <span
        ref={overlayRef}
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--ink)_20%,transparent)_50%,transparent)] bg-clip-text text-transparent opacity-0"
      >
        <span className={GH_TYPE}>{mark}</span>
        {tail ? <span className={`${STORE_TYPE} ms-1 me-[-0.3em]`}>{tail}</span> : null}
      </span>
      <span className={`${GH_TYPE} bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] bg-clip-text text-transparent`}>
        {mark}
      </span>
      {tail ? <span className={`${STORE_TYPE} ms-1 me-[-0.3em] text-[var(--ink)]`}>{tail}</span> : null}
    </span>
  );
}
