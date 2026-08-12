# GH Store Storefront Design Contract

Every customer-facing page follows this contract. It exists so pages built
independently still read as one storefront.

## Visual language

Deep-space glass. A near-black canvas, ambient mesh glow behind hero areas, glass
panels with hairline borders, wide geometric headings, and generous whitespace.
Cyan is the interactive accent, violet is the secondary glow, amber marks a sale.

## Hard rules

- **Never use a raw colour, radius, shadow, or easing value.** Only
  `var(--token)` from `src/styles/tokens.css`. No `#hex`, no `rgba()`, no
  `shadow-md`, no `text-gray-400`.
- **No harsh shadows and no plain 1px grey borders.** Use `--elevation-*` and
  `--line` / `--line-strong`.
- **Logical properties only.** `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*` —
  never `ml-*`, `pr-*`, `left-*`, `right-*`. Arabic is the default locale and
  renders RTL; a hardcoded side is a bug.
- **Directional glyphs flip, layouts do not.** Add `rtl:rotate-180` to an arrow;
  never mirror an entire container.
- **Motion:** `duration-[var(--duration)]` with `ease-[var(--ease-spring)]`. Never
  `ease-in-out` or `linear`. Reduced motion is already handled globally — do not
  add media queries for it.
- **Touch targets are at least 44px** (`min-h-11`).
- **No inline locale ternaries in components.** Every string comes from a message
  namespace. Placeholders go through `formatMessage`.
- **Server Components by default.** Add `"use client"` only for interaction or a
  browser API, and keep the client component as small as possible.

## Building blocks — use these, do not re-invent them

| Need | Import |
|------|--------|
| Page/section wrapper, heading, view-all | `@/components/ui/section` (`Section`, `SectionHeader`) |
| Buttons and CTA links | `@/components/ui/button` (`Button`, `ButtonLink`) |
| Panels | `@/components/ui/card` (`Card`, `Bezel`) |
| Status pills, eyebrow labels | `@/components/ui/badge` (`Badge`, `Eyebrow`) |
| Prices | `@/components/ui/price` (`Price`) |
| Horizontal scroll rows | `@/components/ui/rail` (`Rail`, `RailItem`) |
| Icons | `@/components/ui/icons` |
| Empty / error / notice / skeleton | `@/components/shared/states` |
| Game and offer tiles | `@/components/store/game-card`, `offer-card` |
| Grids and rails of tiles | `@/components/store/collections` (`GameGrid`, `OfferGrid`) |
| Card label bundles | `@/lib/catalog/labels` |
| Artwork | `@/components/store/store-image` (`StoreImage`) |
| Search input | `@/components/search/search-field` |

## Page anatomy

1. `Section` with `spacing="page"` and `mesh` for the first section.
2. `SectionHeader` with `as="h1"`, an eyebrow, the title, and a description.
3. Content, wrapped in `Section` blocks with `spacing="normal"`.
4. Every list renders an `EmptyState` when it has no items, and an `ErrorState`
   when its read failed. A catalog read failure must never produce a blank page.

## Data rules

- Pages call services from `src/lib/services/`. No Supabase client in a page.
- Catch `CatalogReadError` and render `ErrorState`; let anything else throw.
- `notFound()` for a missing entity, never an empty page.
- Every page exports `generateMetadata` built with `buildPageMetadata` from
  `@/lib/seo`, so canonical URLs and language alternates stay consistent.

## Accessibility

- One `h1` per page, headings in order.
- Icon-only controls carry `aria-label`; decorative icons stay `aria-hidden`
  (the default in the icon set).
- Lists of cards are `ul`/`li`.
- Never encode meaning in colour alone — pair it with text.
