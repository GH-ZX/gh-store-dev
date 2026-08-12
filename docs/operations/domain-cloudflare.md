# GH-Store Domain and Cloudflare

## Target Hosting

GH-Store runs on Cloudflare Workers through OpenNext. The future domain may be purchased through GoDaddy, but DNS should be managed by Cloudflare.

## Workers Builds Settings

The existing `gh-store` Worker should use Cloudflare Workers Builds, not Pages:

| Setting | Value |
|---------|-------|
| Root directory | `/` |
| Production branch | `main` |
| Build command | `pnpm exec opennextjs-cloudflare build` |
| Deploy command | `pnpm exec wrangler deploy` |
| Preview builds | Disabled until staging environments are configured |

Do not use `pnpm run build:cf`; that script is not part of GH-Store. Do not configure this application as a Pages static site because OpenNext produces a Worker runtime and server routes.

## Cutover Sequence

1. Purchase the domain through GoDaddy.
2. Add the domain to Cloudflare.
3. Replace GoDaddy nameservers with the Cloudflare nameservers.
4. Attach the domain to the GH-Store Worker.
5. Choose one canonical host, normally the apex or `www`, and redirect the other host with HTTPS 301.
6. Update Supabase Auth Site URL and redirect URLs.
7. Update canonical metadata, sitemap, robots, and provider webhook URLs.
8. Verify login, password recovery, checkout, payment callbacks, and fulfillment callbacks.

## Required Cloudflare Controls

- HTTPS and strict TLS.
- WAF and basic rate limiting for auth, checkout, and webhooks.
- Security headers through Worker/static asset configuration.
- Separate staging and production environments.
- Deployment rollback to the previous Worker version.

The old GitHub Pages DNS instructions are historical reference only and must not be used for GH-Store.
