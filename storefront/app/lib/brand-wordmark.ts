/**
 * One-shot gradient sweep for the header wordmark.
 *
 * The band stays off-screen while it fades in, crosses the text, then fades
 * out after it has left — a single clean pass with no popping at either edge.
 * Exported separately from the component so the timing is unit-testable in the
 * node-only vitest environment and reusable by future wordmark animations.
 */
export const BRAND_SWEEP_KEYFRAMES: Keyframe[] = [
  { backgroundPosition: "-120% 0", opacity: 0 },
  { backgroundPosition: "-120% 0", opacity: 1, offset: 0.08 },
  { backgroundPosition: "220% 0", opacity: 1, offset: 0.78 },
  { backgroundPosition: "220% 0", opacity: 0 },
];

/**
 * Matches the site's `--ease-out-expo` token. `fill: "forwards"` pins the end
 * state so the overlay stays invisible after the sweep finishes.
 */
export const BRAND_SWEEP_OPTIONS: KeyframeAnimationOptions = {
  duration: 1400,
  delay: 150,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  fill: "forwards",
};
