---
name: g2bulk-api
---

# G2Bulk API Rules

Read `docs/providers/g2bulk-api.md` and `references/official-contract.md` before any G2Bulk code or documentation change. Do not invent endpoints, fields, statuses, poll intervals, or authentication behavior.

## Mandatory Rules

- Keep `X-API-Key` in server/Edge code only.
- Re-read supplier `unit_price` or catalogue `amount` immediately before purchase.
- GH-Store customer price is local; never send it as supplier cost.
- Use a 36-character UUID `X-Idempotency-Key` for supplier purchases/orders.
- Stop voucher polling on HTTP 200 or 410; handle 202 as processing and 404 as not found.
- Validate player data before charging for top-up orders.
- Make webhook processing idempotent.
- Persist delivery data immediately and reconcile against the provider ledger.
- Stop on repeated 401 responses instead of retrying into a provider IP ban.

## GH-Store Boundaries

- Client wrapper: `src/lib/providers/g2bulk-client.ts` through a server action or route handler.
- Provider adapter: `src/providers/g2bulk/`.
- Background work: `supabase/functions/g2bulk-sync/` and reconciliation jobs.
- Contract: `docs/providers/g2bulk-api.md`.
