# Shared context for parallel upgrade agents (read first)

You are working in `C:\Users\Administrator\Coding\gh-store-dev`, the live GH Store
codebase (`https://gh-store.me`, Cloudflare Workers + React Router framework mode +
Supabase). Read `AGENTS.md` and `docs/store-upgrade/README.md` before you start.

## Absolute rules

1. **The user requests NO screenshots and NO image inspection.** Verify with code,
   SQL, DOM text fetched over HTTP, and automated tests only. Never call
   `read_image` or produce screenshots.
2. **Do not run `supabase db push` or `supabase db reset` against the linked
   remote project.** Three historical migrations dated `20260911` are absent from
   remote history and a blind push will try to insert them (they invent prices).
   Write migrations to `supabase/migrations/`; the parent agent applies reviewed
   migrations with `supabase migration up --linked` or the SQL editor path.
3. **Do not delete or reprice supplier data.** Preserve provider mappings, prices,
   and administrator overrides.
4. **Every user-facing string must be bilingual** (`ar` + `en`). Product
   terminology is *product* / *item* / *offer* — never "game" for the generic
   catalog entity (a category named `games` is fine, as are `game_regions` /
   `game_input_fields` DB names).
5. **This is React Router framework mode, not Next.js App Router.** Routes are
   `storefront/app/routes/*.tsx` registered in `storefront/app/routes.ts`. Server
   code lives in `storefront/app/.server/`. Imports use `@/`, `@server/`.
6. Your migration filenames must use **exactly** the timestamps assigned to you in
   your task, so parallel agents do not collide.
7. Before finishing run: `pnpm test` (root, vitest), and for typecheck/build changes
   `pnpm check` or the typecheck script in `package.json`. Report the exact
   commands and their results in your final answer. If a command fails for a
   pre-existing unrelated reason, say so explicitly and show the evidence.
8. Prefer editing existing files. Add tests for new behaviour under `tests/`.
9. Do not commit. Leave changes in the working tree and report what you touched.
10. **Do not manually deploy to Cloudflare (`wrangler deploy`)**: The GitHub repository is connected directly to Cloudflare. Pushing to `main` deploys the storefront automatically.

## Live database access for read-only inspection

Credentials are in `.env.local` at the repo root (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`). You may use the Supabase REST API with the service
role key for **reads** and for the specific writes your task authorises. Example:

```powershell
$u = (Get-Content .env.local | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' }) -replace '^NEXT_PUBLIC_SUPABASE_URL=',''
$s = (Get-Content .env.local | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' }) -replace '^SUPABASE_SERVICE_ROLE_KEY=',''
$h = @{ apikey = $s; Authorization = "Bearer $s" }
Invoke-RestMethod -Uri ($u + '/rest/v1/orders?select=id,status&limit=5') -Headers $h
```

Note: in PowerShell, never name a function `R` — `r` is an alias for
`Invoke-History`. Also escape `$` inside double-quoted strings as `` `$ `` or use
single quotes.

## Key facts about the live store (as of this upgrade)

- 80 active products, 663 active offers, 678 provider mappings
  (`g2bulk` 595, `batstore` 57, `maxstore` 26).
- Gross margin is a flat **13%** on almost every offer (markup config in
  `provider_offer_mappings.supplier_cost_usd` + `markup_percent`).
- Orders: 13 total, 6 completed, 5 failed, 2 refunded. Five failures were
  supplier-side: 3 × G2Bulk `Insufficient balance`, 2 × BatStore
  `Insufficient stock for product #16 (requested 1, available 0)`.
- `provider_offer_mappings.provider_name` identifies the supplier.
- `offers.delivery_kind` is one of `account` / `direct` / `manual` / `stored`.
- The scheduled Worker handler in `storefront/workers/app.ts` (`async scheduled`)
  already runs every 5 minutes (`wrangler.jsonc` → `triggers.crons`), calls the
  Telegram bot scheduler and `reconcileStuckOrders`.
- `isG2BulkOfferAffordable` in
  `storefront/app/.server/lib/services/g2bulk-availability.service.ts` is exported
  but has **no call sites** — it is currently dead code.
- `orders.status` check constraint currently allows:
  `pending, payment_pending, paid, processing, fulfilling, completed, failed,
  refunded, cancelled`.
- `fulfillment_attempts.status` values in use:
  `pending, processing, completed, failed, refunded, reconcile`.
- Image requests for product art currently go through `/api/media-proxy`
  (`storefront/app/routes/media-proxy.ts`); zero live HTML requests use
  Cloudflare image resizing (`cdn-cgi/image`).
- Homepage ships ~231 KB of HTML and 74 `<img>` tags; product art come from 10
  third-party hosts, including `www.google.com/s2/favicons` and a competitor CDN.

## Reporting format for your final answer

Return: (a) what you changed, file by file; (b) the migration you wrote and
whether it is applied; (c) the exact verification commands and their results;
(d) anything you deliberately did not do and why.
