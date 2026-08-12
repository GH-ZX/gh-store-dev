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
| `theme` | reserved for the admin theme editor | — |
| `payments`, `providers` | server-only configuration | payment and fulfilment services |
| `maintenance_mode`, `maintenance_message_*` | maintenance banner | storefront chrome |

A contact channel is `{ kind, label_ar, label_en, value, url? }` where `kind` is
one of `email`, `phone`, `whatsapp`, `telegram`, `link`. The href is derived from
`kind` and `value` when `url` is absent. Only `http`, `https`, `mailto`, and
`tel` URLs are rendered; anything else is dropped.

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
