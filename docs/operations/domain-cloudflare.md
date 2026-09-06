# GH-Store Domain and Cloudflare

## Target Hosting

GH-Store runs on Cloudflare Workers through React Router and the Cloudflare
Vite plugin at `https://gh-store.me`. The active application is `storefront/`.
DNS and the domain are already configured outside this repository; keep the
canonical apex domain and redirect any alternate host to it with HTTPS 301.

## Workers Builds Settings

The existing `gh-store` Worker should use Cloudflare Workers Builds, not Pages:

| Setting | Value |
|---------|-------|
| Root directory | `/` |
| Production branch | `main` |
| Node.js | `24` (repository `.nvmrc`) |
| Package manager | `pnpm@11.17.0` (both package manifests) |
| Build command | `pnpm --dir storefront install --frozen-lockfile && pnpm run build` |
| Deploy command | `pnpm --dir storefront exec wrangler deploy` |
| Non-production branches | Upload versions only; preserve the existing preview trigger |

Workers Builds automatically installs the root dependencies. The nested
`storefront/` package has its own lockfile, so the build command explicitly
installs its dependencies too. A root-only install leaves `react-router` absent
and fails before compilation.

The Vite plugin generates `storefront/build/server/wrangler.json` and a deployment
redirect in `storefront/.wrangler/deploy/config.json`. Running Wrangler from
`storefront/` picks up those generated files and the matching client assets.
Root-level `npx wrangler deploy` cannot find that configuration. The application
requires a Worker runtime for server routes; a Pages static-site build is not
equivalent.

The existing non-production trigger includes all branches except `main`. It
uses the same build command and `pnpm --dir storefront exec wrangler versions upload`
as its deploy command, so branch builds upload a version without changing live
traffic. Keep its branch filters and upload-only behavior when updating commands.

## Public production configuration

The public Supabase URL, publishable key, and canonical app URL are defined in
`storefront/wrangler.jsonc`. Server integrations use secrets configured on the
existing `gh-store` Worker. The publishable key is safe to ship to browsers;
never replace it with `SUPABASE_SERVICE_ROLE_KEY` or another secret.
`pnpm check` runs lint and React Router type checks, and `pnpm build` creates
the Worker bundle. Verify production bindings separately; build success does
not verify deployed credentials or provider connectivity.

The Worker also caches anonymous successful HTML for public storefront routes for
30 seconds. Requests with cookies, React Router `.data` requests, and account,
checkout, search, support, dashboard, and payment paths bypass that cache.
Responses that set cookies or prohibit shared caching are never stored.

## Current release sequence

1. Push changes to `main`; GitHub Actions runs quality checks and Cloudflare
   Workers Builds independently builds and deploys the production branch.
   Confirm both checks pass for the intended commit.
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
