import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), update: vi.fn(), UnauthorizedError: class UnauthorizedError extends Error {}, ForbiddenError: class ForbiddenError extends Error {} }));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin, UnauthorizedError: mocks.UnauthorizedError, ForbiddenError: mocks.ForbiddenError }));
vi.mock("@server/legacy/app/[locale]/dashboard/catalog/actions", () => ({
  updateProductAction: mocks.update,
  deleteProductAction: vi.fn(), deleteProductDirectAction: vi.fn(), autoCompleteCatalogAction: vi.fn(), saveProviderLinkAction: vi.fn(), updateOffersAction: vi.fn(),
  createProductAction: vi.fn(), createOfferAction: vi.fn(), deleteOfferAction: vi.fn(),
  searchIgdbArtworkAction: vi.fn(), addStockItemAction: vi.fn(), bulkAddStockItemsAction: vi.fn(),
  deleteStockItemAction: vi.fn(), reorderCarouselProducts: vi.fn(),
}));
import { action } from "../../storefront/app/routes/admin-actions";
function request(name: string, args: unknown[] = [], fields: [string, string][] = [], origin = "https://store.example") {
  const body = new FormData(); body.set("action", name); body.set("args", JSON.stringify(args));
  for (const [key, value] of fields) body.append(key, value);
  return new Request("https://store.example/api/admin-actions", { method: "POST", body, headers: { origin } });
}
const run = (request: Request) => action({ request } as Parameters<typeof action>[0]);
beforeEach(() => { mocks.admin.mockResolvedValue({ id: "admin" }); mocks.update.mockResolvedValue({ ok: true }); });
describe("admin action transport", () => {
  it("requires an admin before dispatching and preserves repeated form fields", async () => {
    const response = await run(request("updateProductAction", [{ error: null }, { $form: 1 }], [["form1:tag", "one"], ["form1:tag", "two"]]));
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0][1].getAll("tag")).toEqual(["one", "two"]);
    expect(await response.json()).toEqual({ result: { ok: true } });
  });
  it("rejects unknown names including prototype properties", async () => {
    expect((await run(request("constructor"))).status).toBe(400);
    expect((await run(request("getG2BulkCredentials"))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before authentication or dispatch", async () => {
    expect((await run(request("updateProductAction", [], [], "https://other.example"))).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not invoke a mutation when authentication fails", async () => {
    mocks.admin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    await expect(run(request("updateProductAction"))).rejects.toMatchObject({ status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([[mocks.UnauthorizedError, 401], [mocks.ForbiddenError, 403]] as const)("returns the expected authorization status", async (ErrorType, status) => {
    mocks.admin.mockRejectedValueOnce(new ErrorType());
    expect((await run(request("updateProductAction"))).status).toBe(status);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("returns redirects as an envelope for browser navigation", async () => {
    mocks.update.mockRejectedValueOnce(new Response(null, { status: 302, headers: { Location: "/en/dashboard/catalog/new" } }));
    expect(await (await run(request("updateProductAction"))).json()).toEqual({ redirect: "/en/dashboard/catalog/new" });
  });
});
