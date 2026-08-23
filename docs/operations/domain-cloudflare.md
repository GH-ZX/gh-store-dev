# GH-Store Domain and Cloudflare

## Target Hosting

GH-Store runs on Cloudflare Workers through OpenNext at `https://gh-store.me`.
DNS and the domain are already configured outside this repository; keep the
canonical apex domain and redirect any alternate host to it with HTTPS 301.

## Workers Builds Settings

The existing `gh-store` Worker should use Cloudflare Workers Builds, not Pages:

| Setting | Value |
|---------|-------|
| Root directory | `/` |
| Production branch | `main` |
| Build command | `pnpm build:cloudflare` |
| Deploy command | `pnpm exec wrangler deploy` |
| Preview builds | Disabled until staging environments are configured |

Do not use `pnpm run build:cf`; that script is not part of GH-Store. Do not configure this application as a Pages static site because OpenNext produces a Worker runtime and server routes.

## Public production configuration

The public Supabase URL, publishable key, and canonical app URL are defined in
`wrangler.jsonc`. The production build command is `pnpm build:cloudflare`, which
validates these values before OpenNext bundles the browser assets. The publishable key is safe to ship to browsers; never replace
it with `SUPABASE_SERVICE_ROLE_KEY` or another secret. `pnpm check` runs
`pnpm validate:production-config`, which fails before a release if any of these
values is missing or points at the wrong project/domain.

The Worker also caches anonymous successful HTML for public storefront routes for
60 seconds, with stale content allowed while it revalidates. Requests with
cookies, RSC/prefetch headers, or account, checkout, search, support, dashboard,
and payment paths bypass that cache.

## Current release sequence

1. Push changes to `main`; GitHub Actions/Cloudflare Workers Builds deploy the
   Worker from the production branch.
2. Confirm `https://gh-store.me` serves the new Worker version and that the
   response is not an old cached deployment.
3. Keep Supabase Auth Site URL and redirect URLs aligned with the domain.
4. Keep canonical metadata, sitemap, robots, and provider webhook URLs on the
   same HTTPS origin.
5. Verify Google OAuth from `/ar/login` and `/en/login` in a clean browser
   session before opening new offers.
6. Verify payment callbacks, fulfillment callbacks, reconciliation, and the
   owner support workflow before opening new offers.

## Required Cloudflare Controls

- HTTPS and strict TLS.
- WAF and basic rate limiting for auth, checkout, and webhooks.
- Security headers through Worker/static asset configuration.
- Separate staging and production environments.
- Deployment rollback to the previous Worker version.

The old GitHub Pages DNS instructions are historical reference only and must not be used for GH-Store. Do not run a manual `wrangler deploy` from an unauthenticated workspace when the connected GitHub deployment is the source of truth.
