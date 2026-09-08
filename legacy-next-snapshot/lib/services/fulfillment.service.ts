import "server-only";

/**
 * Fulfilment — the public surface.
 *
 * The implementation lives in `./fulfillment/`, split by concern: `context.ts`
 * loads the order and the stored provider keys, `attempts.ts` owns the attempt
 * row and status writes, `settle.ts` turns failures into refunds and messages,
 * one file per supplier flow (`g2bulk.ts`, `maxstore.ts`, `batstore.ts`,
 * `stored.ts`), and `index.ts` holds the two entry points and the module's
 * money-agreement rules.
 *
 * This barrel keeps every import site stable — checkout, the operator's retry,
 * and the reconciliation sweep all speak to `fulfillment.service` — and carries
 * `server-only`, so the whole module stays off a client bundle by construction.
 */

export type { FulfillmentOutcome, ReconcileOutcome } from "./fulfillment/types";
export { fulfillOrder, reconcileOrder } from "./fulfillment";
