# Launch Checklist

The owner-side actions that finish stage 12. Code and configuration in the
repository are done; everything here happens in dashboards or with real money.
Ordered so each step unblocks the next.

## 1. Auth (finish what was started)

- [ ] Supabase Dashboard → Authentication → URL Configuration:
      Site URL `https://gh-store.me`, Redirect URLs include
      `https://gh-store.me/auth/callback` (keep `http://localhost:3000/auth/callback`
      only if you develop against this project).
- [ ] Auth → Emails: templates point at `https://gh-store.me` (no localhost, no
      preview project ref). Sender name/address something a customer trusts.
- [ ] Custom SMTP configured — the built-in sender is rate-limited hard enough
      that password recovery breaks on a real launch day.

## 2. Catalog content pass

- [ ] Every published game/offer has real bilingual names (no supplier codes
      like `0106`, no instruction text as descriptions).
- [ ] Prices confirmed per package; sale prices intentional.
- [ ] Delivery type correct per offer (top-up vs redeem code vs gift card).
- [ ] Required account fields match what the supplier actually needs.
- [ ] Artwork loads and looks right on the phone view.
- [ ] Open with the curated set only; expand after the first smooth week.

## 3. Money rehearsal (small real amounts)

- [ ] Providers page: generate the G2Bulk callback secret — until then orders
      settle only through the sweep, never instantly.
- [ ] One wallet recharge through every enabled rail: manual ShamCash (approve
      it yourself), Sam invoice (SyriatelCash/ShamCash), Binance Pay.
- [ ] One UID top-up and one redeem-code order through G2Bulk, end to end,
      including the delivered code/top-up arriving in-game.
- [ ] Check Payments reconciliation shows every top-up paired with its credit.
- [ ] Refund one order through the dashboard once, to see the audit trail work.

## 4. Monitoring

- [ ] Uptime monitor (UptimeRobot/Better Stack/etc.) on `https://gh-store.me/ar`
      and `/en/login`, alerting to your phone.
- [ ] Add a second probe on `GET https://gh-store.me/api/reconcile`: it always
      answers **405** while the app is up. If that probe ever fails while the
      storefront probe passes, the API half of the app is broken in a way the
      homepage cannot show.
- [ ] Telegram bot connected for owner alerts (orders, failures, recharges,
      support, low supplier wallet, stalled fulfilment sweep) — verify one test
      alert arrives.
- [ ] Confirm the sweep heartbeat is alive: after the cron has run a few
      cycles, the `sweep_heartbeats` row (Supabase → Table Editor) shows
      `last_success_at` within the last ten minutes. From then on, a
      "Fulfilment sweep has stalled" Telegram alert means the cron, the secret,
      or the deploy broke — see `docs/operations/incident-response.md`.
- [ ] Bookmark the "needs attention" orders filter; check it daily at first.

## 5. SEO and analytics

- [ ] Search Console: verify the domain, submit `https://gh-store.me/sitemap.xml`,
      put the token into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- [ ] Analytics: set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=gh-store.me` as a build env
      var (Workers Builds settings or `.env.local`) — the script renders itself
      when present and not at all when absent.

## 6. Trust layer

- [ ] Read privacy, terms, and the new refund policy end to end; adjust wording
      to your business and local law. These are drafts written in good faith,
      not legal advice.
- [ ] Approve the first real reviews from the dashboard so the storefront does
      not launch with an empty testimonial strip.
- [ ] Contact channels seeded and actually answered by someone.

## 7. Cloudflare controls

- [ ] WAF rate-limiting rule on the credential paths. The app throttles login
      attempts in Worker memory, but every isolate counts separately, so with
      real traffic the effective ceiling is many times the configured one. Add
      a Cloudflare rule (Security → WAF → Rate limiting rules) matching
      `http.request.uri.path in {"/ar/login" "/en/login" "/ar/forgot-password"
      "/en/forgot-password"}` — with POST method — at something like **10
      requests / minute / IP**, action block or managed challenge. The login
      form is a server action POST to the page URL itself, so path + method is
      the right selector.
- [ ] WAF/rate-limit rules on `/auth/*`, checkout POSTs, and webhook paths.
- [ ] Confirm HTTPS/strict TLS and that alternate hosts 301 to `gh-store.me`.

## 8. Backups and hygiene

- [ ] Supabase: enable PITR / scheduled backups on the production project.
- [ ] Rotate every key that ever appeared in a chat, screenshot, or ticket:
      G2Bulk, Sam, Binance Pay, Telegram bot token, RECONCILE_CRON_SECRET.
- [ ] Run the rollback drill from `docs/operations/incident-response.md` once,
      before there is traffic to protect.

## 9. Performance: arm the incremental cache

Prepared in the repository and waiting on two resources that must exist first.
The Worker already caches anonymous HTML for sixty seconds; the incremental
cache is the layer beneath it — it stops every render of a cacheable page from
paying the Singapore round-trips again.

- [ ] `pnpm exec wrangler r2 bucket create gh-store-inc-cache`
- [ ] `pnpm exec wrangler d1 create gh-store-tag-cache` — paste the returned
      `database_id` into the `d1_databases` block in `wrangler.jsonc`.
- [ ] Uncomment, in the same commit: the `r2_buckets` block and the `d1_databases`
      block in `wrangler.jsonc`; the `incrementalCache` and `memoryQueue` lines
      and the `tagCache: d1NextTagCache` line in `open-next.config.ts` (import
      paths are in that file's comments).
- [ ] `pnpm check` — `scripts/validate-production-config.mjs` refuses the
      half-armed state (a binding without its override, or the reverse), so a
      mistake surfaces before a deploy does.
- [ ] Deploy, then verify: load a page twice and check
      `wrangler tail` for a drop in `get_public_store_settings` calls, and the
      R2 dashboard for data landing in the bucket.

## 10. Deploy discipline

Deploys already go through `pnpm deploy`. Two safer paths exist and cost
nothing to use:

- [ ] Canary a risky change: `pnpm upload` builds and uploads a new **version
      without shifting any traffic**; promote it from the Cloudflare dashboard
      (Deployments → the version → gradual deployment at 10%) or
      `pnpm exec wrangler versions deploy <version-id> --percentage 10`.
- [ ] `pnpm versions` lists what is live; `pnpm rollback` sends traffic back to
      the previous version in seconds — the fast path from the incident
      runbook. Both need `wrangler` authenticated locally (`pnpm exec wrangler
      login`).
