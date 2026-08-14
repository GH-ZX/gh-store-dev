# Store Settings Contract

`public.store_settings` is a single row (`id = 'global'`) holding everything an
admin controls about presentation. The table is **never** readable by visitors:
it also holds payment and provider configuration, so the storefront reads it
through two security-definer functions.

| Function | Returns | Granted to |
|----------|---------|------------|
| `get_public_store_settings()` | presentation-safe subset | `anon`, `authenticated` |
| `get_home_layout()` | `home_layout` array | `anon`, `authenticated` |

`payments` and `providers` are deliberately absent from both. A test in
`supabase/tests/hosted/storefront-settings.sql` fails if either leaks.

## Columns

| Column | Shape | Used by |
|--------|-------|---------|
| `home_layout` | array of sections (below) | homepage |
| `social_links` | array of `{ platform, label_ar, label_en, url }` | footer, `/links`, social section |
| `seo` | `{ title_ar, title_en, description_ar, description_en, og_image_url }` | homepage metadata |
| `contact` | `{ channels: [...], note_ar, note_en }` | `/contact` |
| `theme` | `{ accent, accent_2, default_mode, backdrop }` | every page, through the root layout |
| `payments`, `providers` | server-only configuration | payment and fulfilment services |
| `maintenance_mode`, `maintenance_message_*` | maintenance banner | storefront chrome |

A contact channel is `{ kind, label_ar, label_en, value, url? }` where `kind` is
one of `email`, `phone`, `whatsapp`, `telegram`, `link`. The href is derived from
`kind` and `value` when `url` is absent. Only `http`, `https`, `mailto`, and
`tel` URLs are rendered; anything else is dropped.

`kind` and a social link's `platform` also choose the mark shown beside the
label, from `src/components/ui/brand-icons.tsx`. An unknown value falls back to
a generic glyph rather than rendering nothing.

## Theme

`accent` and `accent_2` are hex colours and nothing else: they are written into a
`<style>` element, so `safeColour` accepts only `#rgb` / `#rrggbb` and discards
anything that could close a declaration. Every other shade is derived from them
with `color-mix`. `src/lib/settings/theme-presets.ts` holds ready-made pairs the
dashboard offers as one-press starting points; a test asserts each one's accent
clears 4.5:1 against the near-white it carries.

`default_mode` is `system` | `dark` | `light`, and only applies to a visitor who
has not chosen for themselves.

`backdrop` is `none` (default) | `aurora` | `mesh` | `grid`: one fixed,
unanimated CSS layer behind the storefront, drawn from the glow and line tokens
so it follows the accents and both themes. It is not rendered at all for `none`,
and the stylesheet keeps it off the dashboard.

## Home layout sections

Each entry is `{ id, type, enabled, title_ar, title_en, subtitle_ar, subtitle_en,
limit, interval_seconds, game_ids, offer_ids, review_ids, show_submit_form }`.
Only `type` is required.

| `type` | Content | Singleton |
|--------|---------|-----------|
| `carousel` | games with `show_in_carousel`, ordered by `carousel_order` | yes |
| `games` | active games, capped at `limit` | yes |
| `gift_cards` | `gift_card` and `redeem_code` offers | yes |
| `sale_offers` | offers with `is_sale` | no |
| `suggested_offers` | offers of featured games | no |
| `game_picks` | games listed in `game_ids`, in that order | no |
| `offer_picks` | offers listed in `offer_ids`, in that order | no |
| `customer_reviews` | approved reviews, optionally pinned via `review_ids` | no |
| `social_links` | buttons from `social_links` | yes |

## Normalization rules

`normalizeHomeLayout` in `src/lib/home/layout.ts` is the only way the layout
reaches a component. It is deliberately forgiving, because the JSON is
hand-editable and a bad edit must not blank the homepage:

- An unknown `type` drops that section. Everything else falls back per field.
- A repeated singleton type keeps the first instance; a repeated `id` is dropped.
- `limit` clamps to 1–12; `interval_seconds` clamps to 3–30.
- Malformed ids are dropped from a pick list; valid ones survive.
- An empty layout, or one with every section disabled, falls back to
  `DEFAULT_HOME_LAYOUT`.
- A section whose data resolves to nothing is not rendered, so enabling a
  section before adding content never leaves an empty heading behind.

Sections are resolved concurrently in `src/lib/services/home.service.ts`, and
each read is isolated: one failing section is dropped rather than failing the
page.

## Who edits this

Two places, one stored value.

`/dashboard/website` owns the whole layout: sections are added, removed,
reordered, retitled, subtitled and pointed at their handpicked items there. The
list the form submits *is* the layout, so a section that is not submitted has
been removed and one with a new id has been added — there is no separate add or
delete action, and a rearrangement saves in a single step. A type marked
singleton above is withheld from the add list rather than offered and then
silently dropped by the normalizer; `tests/home/home-layout.test.ts` asserts the
two lists agree.

The storefront owns the same fields in place. An administrator browsing the
homepage gets a toggle that puts a pencil beside every section heading and over
every game tile and carousel slide (`src/components/live-edit`), each opening a
sheet that writes through `src/lib/live-edit/actions.ts` and revalidates. Those
actions edit one record's shown fields and carry the rest across, so an open
panel cannot flatten what another one changed. What they deliberately do not
touch: a section's pick lists, and a game's slug, prices and packages — the
first is a long decision with a picker behind it, and the rest change what a
customer pays or where a link points.

Both paths run behind `requireAdmin`, and the storefront renders no part of the
editor for anyone else.
