import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("@server/lib/auth/guards", () => ({
  requireAdmin: mocks.admin,
  UnauthorizedError: mocks.UnauthorizedError,
  ForbiddenError: mocks.ForbiddenError,
}));
import { requireDashboardAdmin } from "@server/dashboard-access";
import { loader as loadCatalog } from "../../storefront/app/routes/dashboard-catalog";
import { loader as loadProduct } from "../../storefront/app/routes/dashboard-product";

beforeEach(() => { mocks.admin.mockResolvedValue({ id: "admin" }); });

describe("dashboard navigation authentication", () => {
  it("allows an active administrator", async () => {
    await expect(requireDashboardAdmin(new Request("https://store.example/en/dashboard/catalog"), "en")).resolves.toBeUndefined();
  });

  it("returns a login redirect with the complete return path for an expired session", async () => {
    mocks.admin.mockRejectedValueOnce(new mocks.UnauthorizedError());
    const request = new Request("https://store.example/en/dashboard/catalog?published=1&q=subscription");
    try {
      await requireDashboardAdmin(request, "en");
      expect.unreachable("An anonymous dashboard request must redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(302);
      const target = new URL(response.headers.get("Location")!, request.url);
      expect(target.pathname).toBe("/en/login");
      expect(target.searchParams.get("next")).toBe("/en/dashboard/catalog?published=1&q=subscription");
    }
  });

  it("returns a forbidden response for a customer account", async () => {
    mocks.admin.mockRejectedValueOnce(new mocks.ForbiddenError());
    await expect(requireDashboardAdmin(new Request("https://store.example/ar/dashboard/providers"), "ar")).rejects.toMatchObject({ status: 403 });
  });

  it.each([loadCatalog, loadProduct])("protects child loader requests without relying on the parent layout", async (loader) => {
    mocks.admin.mockRejectedValueOnce(new mocks.UnauthorizedError());
    await expect(loader({
      params: { locale: "en", productId: "11111111-1111-4111-8111-111111111111" },
      request: new Request("https://store.example/en/dashboard/catalog"),
      context: {},
    })).rejects.toMatchObject({ status: 302 });
  });

  it("does not hide an unexpected service failure as an authentication error", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(requireDashboardAdmin(new Request("https://store.example/en/dashboard/catalog"), "en")).rejects.toThrow("Database unavailable");
  });
});
