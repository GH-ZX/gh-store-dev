# Animated Header Wordmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the "GH Store" wordmark beside the logo tile in the header at every viewport size, with a one-time gradient sweep on first page load that settles to "GH" in an accent gradient and "Store" in ink.

**Architecture:** A pure animation spec (`src/lib/brand-wordmark.ts`) holds the WAAPI keyframes/options and is unit-tested in the repo's node-only vitest environment. A thin `"use client"` component (`BrandWordmark`) renders two stacked text layers — a static base layer (the resting state) and an `aria-hidden` sweep overlay that `element.animate()` sweeps once on mount. The header lives in the root layout and persists across SPA route changes, so the sweep naturally plays once per full page load.

**Tech Stack:** React 19, Next.js 16 (App Router), Tailwind CSS v4, Web Animations API, Vitest (node environment — no jsdom/component tests).

## Global Constraints

- No new dependencies — no testing-library/jsdom; vitest runs with `environment: "node"`.
- Colour only through existing tokens (`--accent`, `--accent-2`, `--ink`) — never raw hex in components.
- `BRAND.name` is `"GH Store"` (`src/lib/brand.ts`) — do not hardcode a different string.
- Wordmark must render at all viewports (the current name span is `hidden sm:inline` and must be replaced, not kept).
- The header bar is pinned `dir="ltr"` and the wordmark is Latin — the sweep is physical left→right in every locale.
- Respect `prefers-reduced-motion` (WAAPI is not affected by the CSS override in `globals.css:183`).
- Easing must match the site token `--ease-out-expo` = `cubic-bezier(0.16, 1, 0.3, 1)`.
- Follow existing conventions: JSDoc on new modules/components, `cn()` for class joins, vitest contract-style tests.

---

### Task 1: Pure sweep animation spec

**Files:**
- Create: `src/lib/brand-wordmark.ts`
- Test: `tests/ui/brand-wordmark.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BRAND_SWEEP_KEYFRAMES: Keyframe[]` — 4 keyframes: band off-screen left and invisible; lit while still off-screen; swept to the right edge while visible; faded out off-screen right.
  - `BRAND_SWEEP_OPTIONS: KeyframeAnimationOptions` — `{ duration: 1400, delay: 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }`.
  - Later tasks consume both via `import { BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS } from "@/lib/brand-wordmark"`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/brand-wordmark.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BRAND_SWEEP_KEYFRAMES, BRAND_SWEEP_OPTIONS } from "@/lib/brand-wordmark";

describe("brand wordmark sweep animation spec", () => {
  it("starts off-screen left, sweeps across, and fades out after leaving the text", () => {
    expect(BRAND_SWEEP_KEYFRAMES.length).toBe(4);

    const [enter, ready, gone, done] = BRAND_SWEEP_KEYFRAMES;
    expect(enter.backgroundPosition).toBe("-120% 0");
    expect(enter.opacity).toBe(0);

    expect(ready.backgroundPosition).toBe("-120% 0");
    expect(ready.opacity).toBe(1);
    expect(ready.offset).toBeGreaterThan(0);

    expect(gone.backgroundPosition).toBe("220% 0");
    expect(gone.opacity).toBe(1);
    expect(gone.offset).toBeLessThan(1);

    expect(done.backgroundPosition).toBe("220% 0");
    expect(done.opacity).toBe(0);
  });

  it("uses the site easing, a fixed delay, and a forward fill", () => {
    expect(BRAND_SWEEP_OPTIONS).toMatchObject({
      duration: 1400,
      delay: 150,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/ui/brand-wordmark.test.ts`
Expected: FAIL — module `@/lib/brand-wordmark` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/brand-wordmark.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/ui/brand-wordmark.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-wordmark.ts tests/ui/brand-wordmark.test.ts
git commit -m "feat: add header wordmark sweep animation spec"
```

---

### Task 2: BrandWordmark component and header integration

**Files:**
- Create: `src/components/layout/brand-wordmark.tsx`
- Modify: `src/components/layout/site-header.tsx:99-109` (the logo `Link`'s name span)

**Interfaces:**
- Consumes: `BRAND_SWEEP_KEYFRAMES`, `BRAND_SWEEP_OPTIONS` (Task 1), `BRAND` from `@/lib/brand`.
- Produces: `BrandWordmark` (no props) — the animated wordmark to place inside the header's logo `Link`.

- [ ] **Step 1: Create the component**

Create `src/components/layout/brand-wordmark.tsx` (the `"use client"` directive is required — the component is rendered from the server component `SiteHeader`; without it `next build` fails with "You're importing a module that depends on `useEffect` into a React Server Component module"):

```tsx
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
```

- [ ] **Step 2: Integrate into the header**

In `src/components/layout/site-header.tsx`:

Add the import after line 5 (`import { MobileNav } ...`):

```tsx
import { BrandWordmark } from "@/components/layout/brand-wordmark";
```

Replace the name span inside the logo `Link` (current lines 106-108):

```tsx
            <span className="hidden text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)] sm:inline">
              {BRAND.name}
            </span>
```

with:

```tsx
            <BrandWordmark />
```

The logo `Link` becomes:

```tsx
          <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2.5" aria-label={BRAND.name}>
            <span
              className="grid size-9 place-items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent)_28%,var(--surface-strong)),var(--surface-strong))] text-xs font-bold text-[var(--accent-strong)]"
              aria-hidden="true"
            >
              GH
            </span>
            <BrandWordmark />
          </Link>
```

- [ ] **Step 3: Run tests and typecheck**

Run: `pnpm vitest run tests/ui/brand-wordmark.test.ts && pnpm typecheck`
Expected: both tests PASS; `tsc --noEmit` exits clean. The `BRAND.name` reference in `aria-label` stays valid, so the `BRAND` import in `site-header.tsx` must remain.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: clean. If a rule complains, fix it and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/brand-wordmark.tsx src/components/layout/site-header.tsx
git commit -m "feat: animate the GH Store wordmark in the header"
```

---

### Task 3: Full verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: Task 1 and Task 2 deliverables.

- [ ] **Step 1: Full check**

Run: `pnpm check`
Expected: lint, typecheck, and `next build` all pass.

- [ ] **Step 2: Manual QA checklist**

Start `pnpm dev`, open the storefront, and verify each item:

- Hard-refresh: the highlight band sweeps left→right over "GH Store" once (~1.4s, after a 150ms pause), then stays hidden.
- Static resting state: "GH" keeps the accent→accent-2 gradient; "Store" is in ink.
- SPA navigation: click between Home/Games/FAQ — the sweep does NOT replay.
- Mobile (<640px): "GH Store" is visible next to the logo tile and the sweep plays; nothing overflows the bar with the search + theme + menu buttons.
- Dark and light themes (toggle with the ThemeToggle): band is visible in both; resting gradient reads correctly in both.
- Arabic locale (`/ar`): wordmark reads left-to-right and the sweep travels left→right.
- Reduced motion (macOS: System Settings → Accessibility → Display → Reduce motion; or devtools emulation): no sweep, static wordmark only.

- [ ] **Step 3: Report results**

Summarize the QA findings. If any item fails, fix it, re-run `pnpm check`, and re-verify before declaring the plan complete.
