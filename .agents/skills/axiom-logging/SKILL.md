---
name: axiom-logging
---

# Logging Rules

Read `references/api-notes.md` before changing anything that talks to Axiom. Every fact in it was verified against the live API, and three of them contradict Axiom's own documentation.

## The one rule

**Logging must never affect the thing it is logging.** No call awaits delivery, no failure propagates, and a missing or misconfigured destination is silent. A refund that fails because a log service was down is the worst trade this store could make.

This is the only place in the codebase where swallowing an error is correct. Everywhere else, a swallowed failure is a bug.

## Where things live

| Piece | Path |
|-------|------|
| Logger, the only entry point | `src/lib/logging/logger.ts` |
| Redaction | `src/lib/logging/redact.ts` |
| Reading events back | `src/lib/logging/axiom-query.ts` |
| Destination settings | `src/lib/settings/axiom-settings.ts` |
| Admin panel | Providers and API page |

Credentials live in `store_settings.providers.axiom`, beside the supplier and payment keys — never in an environment variable, so the owner changes them without a deploy.

## Calling it

```ts
import { log, logFailure } from "@/lib/logging/logger";

log.info("fulfilment", "order_refunded", { orderId, orderNumber, reason });
log.warn("fulfilment", "order_escalated", { orderId, ageMinutes });
logFailure("notifications", "insert_failed", error, { userId, type });
```

`area` and `event` are machine names, not sentences: they are grouped and counted, not only read. Use `snake_case` events and dotted areas (`fulfilment`, `payments`, `provider.sam`, `admin.logging`).

Levels carry meaning:

- `error` — money or goods are wrong now. A failed refund leaves a customer charged for nothing.
- `warn` — something needs a person and nobody is watching it. An escalated order.
- `info` — a money event completed. Refunds, reconciliation runs.
- `debug` — detail; off by default.

## Never log

Secrets are removed by **field name**, because a value cannot be recognised as a secret by looking at it — an API key and an order reference are both just strings. Anything named like a credential is replaced at every depth.

Never pass a raw provider settings object, a request with an `Authorization` header, or a full provider response into a log. Pass the fields you actually want.

Wallet addresses are not credentials but are the store's money destination; long hex runs are shortened automatically. Do not defeat this by splitting an address across fields.

## Reading logs

Axiom's own console is where investigation happens — it has the query language, dashboards and alerts. The dashboard Logs page answers only the narrow question of whether something is broken right now, and links out for the rest. Do not rebuild Axiom's console in the store admin.

The **Axiom MCP server** (`https://mcp.axiom.co/mcp`) lets an agent query these logs directly with APL, which is faster than writing probe scripts. See `references/api-notes.md`.

## When adding a destination

Ingest and query are **separate permissions** on an Axiom token. A token created for ingest alone returns 403 on query. Surface that as its own state: "no errors" and "not allowed to look" must never render the same.
