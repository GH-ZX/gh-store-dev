# Adding a fulfillment API

The storefront sells products and offers. Supplier names and external IDs belong
in provider mappings and server code. A new supplier must not require changes to
product cards, category routes, checkout presentation, or SEO.

## Extension points

1. Add a server-only client, response schemas, status classifier, and error type
   under `storefront/app/.server/providers/<provider>/`. Use bounded timeouts;
   distinguish terminal rejection from unknown outcome after submission. Validate
   the supplier's actual contract before enabling purchases.
2. Implement the purchase flow in `.server/fulfillment/<provider>.ts`. Preserve
   attempt claiming, stable idempotency keys, price checks, and pending states.
   Confirm the supplier's idempotency duration and behavior after it expires.
3. Register a `FulfillmentProvider` in `.server/fulfillment/providers.ts` using
   its exact persisted provider name. Supply credential lookup, `fulfill`, and
   read-only `poll` functions. Return normalized status and delivered content;
   the shared orchestrator owns reconciliation settlement and notifications.
   Missing or unknown provider names deliberately have no default adapter.
4. Add private settings, owner configuration, balance/health reporting, and catalog
   import/sync. Preserve edited storefront descriptions and artwork during sync.
   Import new products as drafts until region, entitlement, delivery requirements,
   price and margin are reviewed. Keep supplier data separate from public copy.
5. If callbacks are available, verify signatures, deduplicate events, and route
   them to the existing settlement contract. Polling remains the recovery path;
   the Cloudflare Worker is the only reconciliation scheduler.
6. Test successful, pending, rejected, timed-out, malformed, and duplicate requests;
   missing credentials; completed-without-content; repeated callbacks; and failed
   database reads. Mock purchases in automated tests. Run a controlled provider
   acceptance purchase only with a designated test offer and spending limit.

## Current boundaries

An offer currently resolves one supplier mapping with `maybeSingle()`. The registry
makes another API explicit; it does not implement automatic supplier selection.
Do not attach several suppliers to an offer and assume the runtime chooses one.

Before adding automatic price comparison or failover, introduce an explicit
selection step and snapshot the selected supplier and external identifiers on the
order/attempt. Existing orders must continue with their original supplier even
if the catalog mapping changes. Equivalent mappings must match region, duration,
quantity, entitlement and fulfillment method. A timeout is not proof of rejection;
never buy from a second supplier while the first purchase is uncertain.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. The dispatch
regressions live in `tests/storefront/provider-dispatch.test.ts`. Provider adapter
contract tests must cover the new client's exact lookup identifiers and delivery
payload before deployment.
