# Design: Configurable site name

## Problem

"GH Store" is hardcoded in `APP_NAME` (src/lib/config/app.ts) and
`BRAND.name` (src/lib/brand.ts) and reused everywhere: browser tab title,
header wordmark, footer name and copyright, invoice header, and SEO
`siteName`. The owner cannot change the name without a code change, and
cannot brand the site for a promotion (e.g. an event name on the homepage
tab).

The homepage tab title is also currently the SEO title, styled with the root
template into `%s · GH Store` — a long, non-configurable tab.

## Goal

Two dashboard settings on the Website settings page:

1. **Site name** — localized (Arabic + English) name fields.
2. **"Use this name everywhere"** switch — when on, the configured name
   replaces the hardcoded brand in the storefront chrome.

Behavior of the configured name:

- The **homepage browser tab** uses the localized site name directly (as an
  `absolute` title, so no `· GH Store` suffix). This happens whether or not
  the switch is on — the homepage tab is the owner's way to name a
  promotion.
- When the switch is **on**, the name also drives the header wordmark + logo
  tile, the footer name + copyright line, and the invoice header name.
- When the switch is **off**, the storefront chrome keeps the built-in brand
  (`GH Store`), and only the homepage tab uses the configured name.
- When a name field is **empty**, the storefront and chrome fall back to the
  built-in brand for that locale.

## Storage

New `branding` JSONB column on `public.store_settings`, consistent with the
existing `contact`/`theme`/`seo` presentation columns. Stored shape:

```json
{
  "name_ar": "",
  "name_en": "",
  "use_everywhere": false
}
```

- Included in `get_public_store_settings()` (presentation-safe; contains no
  secrets).
- Normalized in `src/lib/settings/public-settings.ts` with the other
  settings blocks; malformed rows fall back to defaults rather than breaking
  the page.
- Add `branding` to the presentation columns read/written by
  `admin-website.service.ts`.

## Dashboard

New **Branding** card at the top of the Website settings page
(`/dashboard/website`), above Homepage sections (a visitor meets the name
before the homepage):

- Name in Arabic (text field, RTL default)
- Name in English (text field, `dir="ltr"`)
- "Use this name everywhere" checkbox + hint
- Save button; saves only the `branding` column via a new server action
  `saveBrandingAction` and service `saveBranding`, with a `BrandingInput`
  type. Empty name saves as empty (fallback to built-in brand).

New UI copy in `admin.json` (en + ar): a `branding` section under `website`.

## Storefront data flow

The `<locale>` layout already calls `getPublicStoreSettings()` and passes
settings down. Derive a stable per-locale display name in one place:

- `buildBrandName(settings, locale): string` returns the configured localized
  name when non-empty, else the built-in `BRAND.name`.
- Chrome components receive a `name` (resolved display name) prop instead of
  importing `BRAND.name` directly:
  - `SiteHeader` → wordmark + logo tile initials.
  - `SiteFooter` → footer name + copyright.
  - `brand-wordmark.tsx` → split the resolved name instead of `BRAND.name`.
- The logo tile initials derive from the resolved name (e.g. "GH" for
  "GH Store").
- The invoice header (src/app/[locale]/orders/[orderId]/invoice/page.tsx)
  uses the resolved name from settings, falling back to `APP_NAME` when
  unset.

## Homepage tab

`/page.tsx` `generateMetadata` currently sets `title` to the SEO title
(which the root `layout.tsx` template wraps). Change it to a localized,
standalone title:

- If a configured site name exists for the locale → title is `{ absolute:
  name }`.
- Else → title is `{ absolute: APP_NAME }`.

Page metadata for non-homepage routes keeps the existing
`buildPageMetadata` behavior (title + template suffix).

## Edge cases

- Empty Arabic or English name: that locale falls back to `GH Store`.
- Malformed `branding` JSON: normalizer defaults (`{ "", "", false }`).
- Single-word name ("Nova"): wordmark has a mark but no tail; layout must not
  render a styled empty tail.
- The homepage heading (`<h1>`) is unchanged — it stays the SEO title /
  messages fallback; only the tab title uses the site name.

## Testing

- Unit: `public-settings` normalizer for `branding` (valid, empty, malformed).
- Unit: `buildBrandName` (configured wins, empty falls back).
- E2E: homepage tab reads the configured name after saving via the dashboard;
  "use everywhere" toggle swaps the header/footer name.
- Supabase test for the migration exposing the column through
  `get_public_store_settings()`.