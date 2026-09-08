import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { fixture: "public-client" },
  rail: vi.fn(), category: vi.fn(), settings: vi.fn(),
  sessionRead: vi.fn(() => { throw new Error("Anonymous section loaders must not query session tables"); }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ from: mocks.sessionRead }) }));
vi.mock("@/lib/catalog-queries", () => ({ createPublicClient: () => mocks.client, getCategoryPage: mocks.category }));
vi.mock("@server/lib/services/home-catalog.service", () => ({ getOfferRailPage: mocks.rail }));
vi.mock("@server/lib/services/settings.service", () => ({ getPublicStoreSettings: mocks.settings }));

import { loader, meta } from "../../storefront/app/routes/locale-section";
import { withRequestContext } from "@server/request-context";

function requestArgs(locale: string, section: string, search = "") {
  return {
    params: { locale, section },
    request: new Request(`https://store.example/${locale}/${section}${search}`),
    context: { get: () => ({ env: {} }) },
  } as unknown as Parameters<typeof loader>[0];
}

/** Match the Worker's anonymous HTTP boundary while keeping all data reads mocked. */
async function loadSection(args: Parameters<typeof loader>[0]) {
  let result: Awaited<ReturnType<typeof loader>>;
  await withRequestContext(args.request, {}, async () => {
    result = await loader(args);
    return new Response();
  });
  return result!;
}

beforeEach(() => {
  mocks.rail.mockResolvedValue({ offers: [{ id: "best-selling-offer" }], page: 1, pageSize: 12, total: 30 });
  mocks.category.mockResolvedValue(null);
});

describe("public section route dispatch", () => {
  it.each(["ar", "en"])("loads the bestseller offer rail for %s instead of a category named best-sellers", async (locale) => {
    const result = await loadSection(requestArgs(locale, "best-sellers"));
    expect(mocks.rail).toHaveBeenCalledExactlyOnceWith(mocks.client, locale, "best-sellers", 1);
    expect(mocks.category).not.toHaveBeenCalled();
    expect(mocks.sessionRead).not.toHaveBeenCalled();
    expect(result).toMatchObject({ locale, kind: "rail", rail: "best-sellers", offers: [{ id: "best-selling-offer" }], total: 30 });
  });

  it("passes the requested page to the bestseller service", async () => {
    mocks.rail.mockResolvedValueOnce({ offers: [], page: 2, pageSize: 12, total: 30 });
    await loadSection(requestArgs("en", "best-sellers", "?page=2"));
    expect(mocks.rail).toHaveBeenCalledExactlyOnceWith(mocks.client, "en", "best-sellers", 2);
  });

  it("redirects an out-of-range bestseller page to the rail's first page", async () => {
    mocks.rail.mockResolvedValueOnce({ offers: [], page: 8, pageSize: 12, total: 30 });
    const result = await loadSection(requestArgs("ar", "best-sellers", "?page=8")).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("location")).toBe("/ar/best-sellers");
  });

  it("keeps category paths on the category loader", async () => {
    mocks.category.mockResolvedValueOnce({ categoryName: "Vouchers", products: [], page: 1, pageSize: 12, total: 0 });
    const result = await loadSection(requestArgs("en", "vouchers"));
    expect(mocks.category).toHaveBeenCalledExactlyOnceWith(mocks.client, "en", "vouchers", 1);
    expect(mocks.rail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "category", section: "vouchers" });
  });

  it("gives a paginated category its own canonical URL and a useful description", () => {
    const result = meta({ params: { locale: "en", section: "ai" }, matches: [
      { id: "routes/locale-section", loaderData: { kind: "category", category: { categoryName: "AI", page: 2 } } },
    ] } as unknown as Parameters<typeof meta>[0]);
    expect(result).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/en/ai?page=2" });
    expect(result).toContainEqual({ name: "description", content: expect.stringContaining("AI") });
  });

  it("keeps offer rail pagination in canonical and language alternate URLs", () => {
    const result = meta({ params: { locale: "ar", section: "gift-cards" }, matches: [
      { id: "routes/locale-section", loaderData: { kind: "rail", page: 3 } },
    ] } as unknown as Parameters<typeof meta>[0]);
    expect(result).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/ar/gift-cards?page=3" });
    expect(result).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "en", href: "https://gh-store.me/en/gift-cards?page=3" });
  });
});
