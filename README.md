# GH Store

GH Store is a localized digital gaming store built with Next.js 16, Supabase,
and Cloudflare Workers through OpenNext. Customers can browse games and gift
cards, create accounts, recharge their wallet, purchase offers, track delivery,
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
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. The local environment can use the development
Supabase fallback, but production always requires explicit Supabase variables.

## Environment variables

Public application settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_DEFAULT_LOCALE`

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
five minutes and calls the protected `POST /api/reconcile` endpoint; do not add a
second cron for the same work.

## Cloudflare preview and deployment

```bash
pnpm run preview
pnpm run deploy
```

The Worker cron invokes `POST /api/reconcile` every five minutes. It requires
both `NEXT_PUBLIC_APP_URL` and `RECONCILE_CRON_SECRET`; missing or failed
configuration is reported in Worker logs rather than silently ignored. This is
the only order-reconciliation scheduler; Supabase callbacks are event receivers,
not competing cron jobs.

The Worker also hosts the owner Telegram bot: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` must
be set as Worker secrets for alerts to be delivered. See
`docs/operations/telegram-bot.md` for the full setup.

Before production launch, verify the domain, Auth redirect URLs, payment and
provider callbacks, Worker secrets, reconciliation logs, smoke tests, and
rollback procedure using the release checklist in `ROADMAP.md`.
