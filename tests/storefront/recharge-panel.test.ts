import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { RechargeRequestPanel, type RechargeRequestPanelProps } from "@/components/recharge-request-panel";
import { getMessages } from "@/i18n/messages";
vi.mock("../../storefront/node_modules/react-router/dist/development/index.js", () => ({ useRevalidator: () => ({ state: "idle", revalidate: vi.fn() }) }));
vi.mock("@/components/commerce/use-commerce-action", () => ({ useCommerceAction: () => [{ error: null }, vi.fn(), false, vi.fn()] }));
const app = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = app("react") as typeof import("react");
const { renderToStaticMarkup } = app("react-dom/server") as typeof import("react-dom/server");

describe("saved BEP20 payment instructions", () => {
  it.each(["ar", "en"] as const)("keeps the snapshot usable in %s after a method is disabled", locale => {
    const request = { id: "claim", reference: "RC-TEST", status: "pending", paymentNetwork: "BEP20", paymentDestination: "0x" + "b".repeat(40), requestedAmount: 10, currency: "USD" } as RechargeRequestPanelProps["request"];
    const markup = renderToStaticMarkup(createElement(RechargeRequestPanel, { locale, messages: getMessages(locale, "recharge"), request, open: true, approved: false, balance: 0, currency: "USD", methodLabel: "USDT", method: null }));
    expect(markup).toContain(request.paymentDestination);
    expect(markup).toContain('name="txHash"');
    expect(markup).toContain('name="payerConfirmed"');
    expect(markup).toContain("10.00 USDT");
    expect(markup).toContain("BNB Smart Chain");
  });
});
