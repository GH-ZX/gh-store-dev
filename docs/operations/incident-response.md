# Incident Response Runbook

What to do when the store is broken. Written before it is needed, because the
middle of an incident is the wrong time to learn where the rollback button is.

## Severity levels

| Level | Meaning | Example |
|-------|---------|---------|
| S1 | Store unusable, or money at risk | Homepage 500s, checkout double-charging, webhook replay crediting twice |
| S2 | A flow broken, store up | Google sign-in failing, deliveries not settling, emails not arriving |
| S3 | Degraded but working | Slow pages, one supplier image host down, a sync fell behind |

## First 10 minutes

1. **Confirm what is actually broken.** Open `https://gh-store.me/ar` and
   `/en/login` in a clean browser (private window). Check
   `https://www.cloudflare.com` → Workers & Pages → `gh-store` for deploy status,
   and Supabase Dashboard → Logs for database/auth errors.
2. **Decide: mitigate first, diagnose second.** Customers waiting beats root
   cause. The fastest mitigation is almost always a rollback.
3. **Tell customers early if buying is affected.** Pin a message in the Telegram
   channel / WhatsApp status: "نواجه مشكلة تقنية مؤقتة" / short honest note with
   no ETA you cannot keep.

## Rollback the Worker

Cloudflare keeps every deployment. From a machine with `wrangler` access:

```bash
pnpm versions                # what has been uploaded, and which is live
pnpm rollback                # traffic back to the previous version, in seconds
# or a specific known-good id:
pnpm exec wrangler rollback <version-id>
```

Rollback takes seconds and needs no rebuild. If the bad change was a migration,
rolling back code is not enough — see Database below.

If deploys come from GitHub, also stop the bleeding at the source: revert the
commit on `main` (or pause Workers Builds) so CI does not redeploy the broken
version over your rollback.

## Database incidents

- Supabase Dashboard → Database → Backups. Point-in-time recovery restores to a
  moment; a restore is disruptive, so prefer code-level mitigation unless data is
  being corrupted.
- Never hand-edit order/wallet rows during an incident except through the
  dashboard's audited operations (order refund, wallet adjustment) — freehand SQL
  during pressure is how a bad hour becomes a bad week.

## The sweep has stalled (S2)

A "🛑 Fulfilment sweep has stalled" Telegram alert means orders are no longer
being reconciled — new orders still check out, but anything the supplier did not
finish in ten seconds stays `fulfilling` until the sweep returns. The alert
names the last success and the last error. In order of likelihood:

1. **`RECONCILE_CRON_SECRET` was rotated on one side only.** The Worker's secret
   and the app's must match; a mismatch shows as `reconcile_unauthorized` in the
   Worker logs (`wrangler tail`).
2. **The cron stopped firing.** Cloudflare → Workers → `gh-store` → Settings →
   Triggers: the `*/5 * * * *` cron must be present and not erroring.
3. **The latest deploy broke the API.** `curl -s -o /dev/null -w "%{http_code}"
   https://gh-store.me/api/reconcile` must answer **405** (method not allowed —
   the app is up). A 500 with `reconciliation_failed` in the logs means the
   sweep itself is throwing; the alert's `last_error` says where.
4. **A deploy is mid-flight or failed.** Check the Workers Builds log; roll back
   if the last deploy is the suspect.

While it is down, orders accumulate at `fulfilling`. They recover on their own
once the sweep runs again — the sweep never buys, so nothing double-orders —
but walk the "needs attention" filter afterwards for anything it escalated.

A probe on `GET /api/reconcile` (always 405 while healthy) in your uptime
monitor catches the app half; the Telegram alert catches the cron half.

## Money-specific checks

- **Payments:** Dashboard → Payments reconciliation shows every top-up next to
  the credit it produced. Anything in "paid but not credited" gets credited once,
  by hand, through the recharge review — never by re-firing the webhook.
- **Orders:** Dashboard → Orders → filter "needs attention": money taken, goods
  not delivered. Retry delivery per order after the underlying fault is fixed.
- **Webhooks:** if Sam/Binance/G2Bulk callbacks were rejected during the outage,
  their providers retry on their own schedule; after they give up, use the
  provider's own dashboard (Binance order query, Sam transfers) and settle from
  the evidence.

## After every S1/S2

Write five lines within a day, in `docs/operations/incidents.md`: what broke,
since when, customer impact, what fixed it, what stops a repeat. Then fix the
repeat-stopper — that item is the only part that compounds.
