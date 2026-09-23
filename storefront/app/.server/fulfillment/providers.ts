import { G2BulkFulfillmentClient } from "@server/providers/g2bulk/client";
import { classifyProviderStatus } from "@server/providers/g2bulk/fulfillment-schemas";
import { G2BULK_PROVIDER_NAME } from "@server/providers/g2bulk/mapping";
import { MaxStoreClient } from "@server/providers/maxstore/client";
import { MAXSTORE_PROVIDER_NAME } from "@server/providers/maxstore/mapping";
import { classifyOrderStatus as classifyMaxStoreOrder } from "@server/providers/maxstore/schemas";
import { BatStoreClient } from "@server/providers/batstore/client";
import { BATSTORE_PROVIDER_NAME } from "@server/providers/batstore/mapping";
import { classifyOrderStatus as classifyBatStoreOrder } from "@server/providers/batstore/schemas";
import type { ProviderState } from "@server/lib/orders/reconciliation-policy";
import {
  providerIdempotencyKey, readBatStoreToken, readCallbackUrl, readCredentials,
  readMaxStoreToken, type FulfillmentContext,
} from "./context";
import { fulfillTopup, fulfillVoucher } from "./g2bulk";
import { fulfillMaxStore } from "./maxstore";
import { deliveredItems, fulfillBatStore } from "./batstore";
import type { FulfillmentOutcome } from "./types";

/** Provider adapters normalize transport results; settlement stays in the orchestrator. */
export type ProviderPoll = {
  state: ProviderState;
  refunded?: boolean;
  delivered?: { items: string[] };
};
export type FulfillmentProvider = {
  readCredentials(): Promise<string | null>;
  fulfill(context: FulfillmentContext, credentials: string): Promise<FulfillmentOutcome>;
  /** Read only: polling must never place a purchase. */
  poll(context: FulfillmentContext, credentials: string, externalOrderId: string): Promise<ProviderPoll>;
};

const providers: ReadonlyMap<string, FulfillmentProvider> = new Map([
  [G2BULK_PROVIDER_NAME, {
    readCredentials,
    async fulfill(context, credentials) {
      const client = new G2BulkFulfillmentClient({ apiKey: credentials });
      return context.offerType === "topup"
        ? fulfillTopup(client, context, await readCallbackUrl())
        : fulfillVoucher(client, context);
    },
    async poll(context, credentials, externalOrderId) {
      const client = new G2BulkFulfillmentClient({ apiKey: credentials });
      if (context.offerType === "topup") {
        const status = await client.findGameOrderStatus(externalOrderId);
        return { state: status ? classifyProviderStatus(status.status) : null, refunded: status?.refunded === true };
      }
      const delivery = await client.pollVoucherDelivery(externalOrderId);
      return {
        state: delivery.state === "delivered" ? "completed" : delivery.state === "failed" ? "failed" : delivery.state === "missing" ? null : "pending",
        refunded: delivery.state === "failed",
        ...(delivery.state === "delivered" ? { delivered: { items: delivery.items } } : {}),
      };
    },
  }],
  [MAXSTORE_PROVIDER_NAME, {
    readCredentials: readMaxStoreToken,
    fulfill: fulfillMaxStore,
    async poll(context, credentials) {
      // MaxStore uses our idempotency key for status lookup, not its response id.
      const [result] = await new MaxStoreClient({ apiToken: credentials }).checkOrders([providerIdempotencyKey(context.orderItemId)]);
      const state = result ? classifyMaxStoreOrder(result.status) : null;
      const delivery = result?.delivery;
      const items = Array.isArray(delivery)
        ? delivery.map((item) => typeof item === "string" ? item : JSON.stringify(item))
        : typeof delivery === "string" ? [delivery] : [];
      return { state, ...(state === "completed" && items.length ? { delivered: { items } } : {}) };
    },
  }],
  [BATSTORE_PROVIDER_NAME, {
    readCredentials: readBatStoreToken,
    fulfill: fulfillBatStore,
    async poll(_context, credentials, externalOrderId) {
      const result = await new BatStoreClient(credentials).getOrder(externalOrderId);
      const state = result ? classifyBatStoreOrder(result) : null;
      return { state, ...(state === "completed" && result ? { delivered: deliveredItems(result).payload } : {}) };
    },
  }],
]);

/** Unknown or unmapped suppliers must never fall through to another API. */
export function getFulfillmentProvider(name: string | null): FulfillmentProvider | null {
  return name ? providers.get(name) ?? null : null;
}
