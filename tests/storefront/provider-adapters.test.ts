import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ g2status: vi.fn(), g2delivery: vi.fn(), maxstatus: vi.fn(), batstatus: vi.fn() }));
vi.mock("@server/providers/g2bulk/client", () => ({ G2BulkFulfillmentClient: class { findGameOrderStatus = mocks.g2status; pollVoucherDelivery = mocks.g2delivery; } }));
vi.mock("@server/providers/maxstore/client", () => ({ MaxStoreClient: class { checkOrders = mocks.maxstatus; } }));
vi.mock("@server/providers/batstore/client", () => ({ BatStoreClient: class { getOrder = mocks.batstatus; } }));
vi.mock("@server/fulfillment/context", () => ({ providerIdempotencyKey: (id: string) => `key-${id}`, readCredentials: vi.fn(), readMaxStoreToken: vi.fn(), readBatStoreToken: vi.fn(), readCallbackUrl: vi.fn() }));
vi.mock("@server/fulfillment/g2bulk", () => ({ fulfillTopup: vi.fn(), fulfillVoucher: vi.fn() }));
vi.mock("@server/fulfillment/maxstore", () => ({ fulfillMaxStore: vi.fn() }));
vi.mock("@server/fulfillment/batstore", () => ({ fulfillBatStore: vi.fn(), deliveredItems: () => ({ payload: { items: ["activation"] } }) }));
import { getFulfillmentProvider } from "@server/fulfillment/providers";
import type { FulfillmentContext } from "@server/fulfillment/context";
import { G2BULK_PROVIDER_NAME } from "@server/providers/g2bulk/mapping";
import { MAXSTORE_PROVIDER_NAME } from "@server/providers/maxstore/mapping";
import { BATSTORE_PROVIDER_NAME } from "@server/providers/batstore/mapping";
const context = { orderItemId: "item", offerType: "topup" } as FulfillmentContext;
beforeEach(() => { mocks.g2status.mockResolvedValue(null); mocks.maxstatus.mockResolvedValue([]); mocks.batstatus.mockResolvedValue(null); });
describe("fulfillment adapter contracts", () => {
  it.each([null, "unknown", "constructor", "toString"])("rejects unregistered provider %s", (name) => {
    expect(getFulfillmentProvider(name)).toBeNull();
  });
  it("uses the supplier reference for G2Bulk top-ups", async () => {
    expect(await getFulfillmentProvider(G2BULK_PROVIDER_NAME)!.poll(context, "test", "external" )).toMatchObject({ state: null });
    expect(mocks.g2status).toHaveBeenCalledWith("external");
    expect(mocks.g2delivery).not.toHaveBeenCalled();
  });
  it("reads voucher delivery separately from top-up status", async () => {
    mocks.g2delivery.mockResolvedValue({ state: "delivered", items: ["code"] });
    expect(await getFulfillmentProvider(G2BULK_PROVIDER_NAME)!.poll({ ...context, offerType: "gift_card" }, "test", "voucher"))
      .toMatchObject({ state: "completed", delivered: { items: ["code"] } });
    expect(mocks.g2status).not.toHaveBeenCalled();
  });
  it("looks up MaxStore by our original idempotency key", async () => {
    await getFulfillmentProvider(MAXSTORE_PROVIDER_NAME)!.poll(context, "test", "response-id");
    expect(mocks.maxstatus).toHaveBeenCalledWith(["key-item"]);
    expect(mocks.g2status).not.toHaveBeenCalled();
  });
  it("looks up BatStore by its external order id", async () => {
    await getFulfillmentProvider(BATSTORE_PROVIDER_NAME)!.poll(context, "test", "bat-id");
    expect(mocks.batstatus).toHaveBeenCalledWith("bat-id");
    expect(mocks.maxstatus).not.toHaveBeenCalled();
  });
});
