<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:product-terminology -->

# Product terminology (IMPORTANT)

This store sells **products** across categories — games, vouchers, AI, accounts,
subscriptions, programs, etc. **"Game" is just one category value, not the domain.**

Write all new user-facing and admin-facing copy as *product* / *item*, not *game*.
- The catalog entity is a **product** (catalog row in the `products` table).
- Its sellable packages are **offers** (table `offers`).
- A product's category is just data (`categories` / `[category]/[slug]` routes).

Legacy "game" naming is being migrated to "product" — but only where it refers to
the generic catalog entity, and only where the rename stays localized:

- **Storage**: the catalog entity lives in `products` (with `offers` packages). The
  DB is **not** up for wholesale renaming: `game_regions`, `game_input_fields` and
  their `game_id` FK columns are *game-domain* concepts (only games have top-up
  regions / input fields), and `provider_game_mappings` / `provider_offer_mappings`
  are provider-integration contracts. Keep all of those game-named. Do **not** push
  rename migrations for them.
- **Routes**: the legacy `/games/[slug]` URL is being replaced by the generic
  `/[category]/[slug]`; new code must not hard-code a `games` path. Existing shared
  URLs (`/games/...`, `/checkout/[gameSlug]`) are left as-is.
- **Identifiers**: prefer product terms in new code — `AdminProduct`, `product-editor`,
  `product-edit-form`, `product-card`, `getAdminProduct` — over `AdminGame`,
  `game-editor`, `game-card`, `getAdminGame`. When touching a file that still uses
  `Game*` naming for the *generic entity*, rename it to the product term where the
  change stays localized (a symbol/file, not a shared API or DB column), and update
  every import/caller so it still type-checks and passes tests.

<!-- END:product-terminology -->
