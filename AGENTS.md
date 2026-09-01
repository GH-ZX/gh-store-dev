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

Legacy "game" naming is being migrated to "product" everywhere:
- **Storage**: the table is already `products`; `product_id` is preferred over old FKs named `game_id`. Tables `game_regions`, `game_input_fields`, `provider_game_mappings` and columns `game_id` are being renamed to `product_*`.
- **Routes**: the legacy `/games/[slug]` URL is being replaced by the generic `/[category]/[slug]`; new code must not hard-code a `games` path.
- **Identifiers**: prefer admin names like `getAdminProduct`, `product-editor`, `product-edit-form`, `product-mapper` over `getAdminGame`, `game-editor`, etc. When touching a file that still uses `Game*` naming, rename it to the product term where the change stays localized (a symbol/file, not a shared API or DB column).

Do **not** rename a symbol that is a shared contract (a DB column/table referenced by migrations or provider integrations, or a URL another system depends on) without a matching migration and coordinated deploy.

<!-- END:product-terminology -->
