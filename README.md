# GH Store

GH Store is a localized digital product store built with React Router, React,
Supabase, and Cloudflare Workers. Customers can browse products and offers, create accounts, recharge their wallet, purchase offers, track delivery,
open support tickets, and download invoices. Administrators manage catalog,
providers, payments, fulfillment, customers, reviews, support, website content,
and audit logs from the dashboard.

## Current status

The application is feature-complete for staging and is in final production
hardening. The production domain is `https://gh-store.me`; production Supabase
and Cloudflare configuration are maintained outside this repository and must be
verified with the release checklist before enabling real customer payments.

## Requirements

- Node.js 24
- pnpm 11
- A Supabase project with the approved migrations applied
- Cloudflare account for Worker preview/deployment

## Local development

```bash
pnpm install
pnpm --dir storefront install
# Optional: copy storefront/.dev.vars.example to storefront/.dev.vars for server integrations.
pnpm dev
```

Open <http://localhost:5173>. The local environment can use the development
Supabase fallback, but production always requires explicit Supabase variables.

## Environment variables

Public application settings:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_URL`
- Arabic is the default locale; routes also support English.

Server-only integration settings:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RECONCILE_CRON_SECRET`
- `G2BULK_API_KEY`
- `SAM_API_KEY`
- `BINANCE_PAY_API_KEY`
- `BINANCE_PAY_SECRET_KEY`
- `BINANCE_PAY_WEBHOOK_SECRET`

Never commit `.env.local`, `.dev.vars`, provider credentials, webhook secrets,
or customer data.

## Quality checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm build:cloudflare
```

Run the browser suite when Chrome and a configured environment are available:

```bash
pnpm test:e2e
```

A nightly workflow (`.github/workflows/nightly.yml`) applies every migration to
a fresh local database, runs the `supabase/tests/rls/` pgTAP suites against the
result, and runs the browser suite against staging when repository secrets
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` name a
project (`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are accepted as fallbacks).
The job installs both dependency sets and writes these values into an ephemeral
`storefront/.dev.vars`, so staging bindings override the checked-in Worker vars.
It uses bundled Chromium on port 5173 and removes the bindings file after the run.
It can also be triggered by hand from the Actions tab before a release.

Administrator browser tests additionally use `E2E_ADMIN_EMAIL` and
`E2E_ADMIN_PASSWORD`. Credentials remain local environment variables and are
never committed.

## Supabase

Migrations live in `supabase/migrations`. Apply only the approved migration set
to the intended project, then verify generated database types and RLS tests.
Supabase Edge Functions provide payment/provider callbacks and must be deployed
with their required secrets and JWT settings. The `Deploy Supabase Edge Functions`
workflow deploys `sam-webhook`, `g2bulk-webhook`, and `binance-webhook` after
relevant changes on `main` when the GitHub `SUPABASE_ACCESS_TOKEN` secret exists.
The project reference is `njlzgfddfnnqujaodbta`; database migrations remain an
explicit release step and are not pushed automatically by this workflow.

The Cloudflare Worker remains the only reconciliation scheduler. It runs every
five minutes and calls the reconciliation service directly; do not add a
second cron for the same work.

## Cloudflare preview and deployment

Cloudflare Workers Builds uses repository root `/`, build command
`pnpm --dir storefront install --frozen-lockfile && pnpm run build`, and deploy
command `pnpm --dir storefront exec wrangler deploy`. Its automatic root install
does not install the separate `storefront/` package. See
[Workers Builds settings](docs/operations/domain-cloudflare.md#workers-builds-settings).

After installing both dependency sets, local commands are:

```bash
pnpm run preview
pnpm run deploy
```

For riskier changes, `pnpm run upload` builds and uploads a new Worker version
without shifting any traffic — promote it gradually from the Cloudflare
dashboard or the interactive `pnpm --dir storefront exec wrangler versions deploy`
command, selecting the new and existing versions and their traffic percentages.
`pnpm run versions` lists what has been uploaded, and `pnpm run rollback`
sends traffic back to the previous version in seconds. Both need `wrangler`
authenticated locally (`pnpm --dir storefront exec wrangler login`). Direct
Wrangler commands run from `storefront/`, where the current Worker configuration
and generated deployment files live.

The Worker cron invokes reconciliation directly every five minutes. The protected
`POST /api/reconcile` endpoint remains available for authorized operational runs
using `RECONCILE_CRON_SECRET`. Missing or failed configuration is reported in Worker logs. This is
the only order-reconciliation scheduler; Supabase callbacks are event receivers,
not competing cron jobs.

The Worker also hosts the owner Telegram bot: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` must
be set as Worker secrets for alerts to be delivered. See
`docs/operations/telegram-bot.md` for the full setup.

Before production launch, verify the domain, Auth redirect URLs, payment and
provider callbacks, Worker secrets, reconciliation logs, smoke tests, and
rollback procedure using the release checklist in `ROADMAP.md`.

## Framework migration

The active application is `storefront/`. Root `dev`, `build`, `typecheck`,
`preview`, and deployment commands target React Router. The original Next.js
source remains in `src/` as a behavior reference; `dev:legacy`, `build:legacy`,
and `typecheck:legacy` are explicit reference commands.

`pnpm test` runs both the original domain regression suite and migrated runtime
tests. Browser tests use the React Router server; set `E2E_BASE_URL` for an
already running instance and `PLAYWRIGHT_BROWSER_CHANNEL=chrome` for installed
Chrome. Keep account credentials in local environment variables.
