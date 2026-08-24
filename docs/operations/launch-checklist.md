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
- [ ] Telegram bot connected for owner alerts (orders, failures, recharges,
      support, low supplier wallet) — verify one test alert arrives.
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

- [ ] WAF/rate-limit rules on `/auth/*`, checkout POSTs, and webhook paths.
- [ ] Confirm HTTPS/strict TLS and that alternate hosts 301 to `gh-store.me`.

## 8. Backups and hygiene

- [ ] Supabase: enable PITR / scheduled backups on the production project.
- [ ] Rotate every key that ever appeared in a chat, screenshot, or ticket:
      G2Bulk, Sam, Binance Pay, Telegram bot token, RECONCILE_CRON_SECRET.
- [ ] Run the rollback drill from `docs/operations/incident-response.md` once,
      before there is traffic to protect.
