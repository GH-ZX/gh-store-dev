# GH Store Wordmark — Animated "GH Store" Brand Name in Header

Date: 2026-08-14
Status: Approved design
Scope: Site header wordmark (logo link)

## Goal

Show the store name "GH Store" beside the logo tile on the header at every
viewport size (currently hidden below `sm` in `site-header.tsx:106`), with a
one-time gradient sweep on first page load, then a static state. Theme-aware via
CSS tokens (and will follow a future dashboard theme picker).

## Decisions (from brainstorming)

- Animation style: gradient sweep — a highlight band travels across the
  wordmark once.
- Replay: once per full page load; no replay on in-app (SPA) route changes.
- Static state: "GH" keeps an accent → accent-2 gradient; "Store" sits in
  `--ink`.
- Implementation: Web Animations API (`element.animate`) so future animations
  can be chained and extended (logo pop, scroll-triggered replays, stagger).

## Implementation

### New component: `src/components/layout/brand-wordmark.tsx` (`"use client"`)

Two-layer wordmark used inside the existing logo `Link` in
`src/components/layout/site-header.tsx` (replaces the `hidden sm:inline` name
span at line 106 so it renders at every width).

- Wrapper span: `relative inline-flex` with shared typography
  (`text-[0.875rem] sm:text-[0.9375rem] font-semibold tracking-tight`) so both
  layers align pixel-identically.
- Base layer (resting state, always rendered):
  - "GH" span: `bg-clip-text text-transparent` with
    `linear-gradient(120deg, var(--accent), var(--accent-2))`.
  - " Store" span: `text-[var(--ink)]`.
- Overlay layer (`aria-hidden`): identical "GH Store" text, highlight band
  clipped to text:
  `linear-gradient(90deg, transparent, color-mix(in_srgb, var(--ink) 20%, transparent) 50%, transparent)`
  with `background-clip: text`, default `opacity: 0` so nothing flashes before
  JS runs.

### Animation (WAAPI, client-only)

On mount, animate the overlay with `element.animate()`:

- `background-position` from `-120% 0` to `220% 0`
- `opacity` `0 → 1 → 1 → 0` (band fades in as it sweeps, fades out at the end)
- duration ~1400ms, delay 150ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`
  (matches `--ease-out-expo`), `fill: "forwards"` so it ends hidden.

The `Animation` object is kept in a ref so future work can chain or cancel it.

### Reduced motion

Skip the animation when `window.matchMedia("(prefers-reduced-motion: reduce)").
matches`; the overlay stays `opacity: 0`, leaving the static wordmark. The
existing CSS override in `globals.css:183` only shortens CSS animations, so
WAAPI needs the explicit check.

## Behavior notes

- The header lives in the root layout and persists across SPA route changes, so
  the animation runs once per full page load by construction.
- No hydration mismatch: the base layer renders identically server/client; the
  overlay is invisible until JS animates it.
- Direction: the header bar is pinned `dir="ltr"` and the wordmark is Latin, so
  the sweep is physical left→right regardless of locale (incl. Arabic default).

## Out of scope

- Brand instances in the footer or mobile drawer (future).
- Dashboard theme picker (user plans separately).
- Replay triggers (scroll, click) — the WAAPI structure makes these easy to add
  later.
