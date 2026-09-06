import { describe, expect, it, vi, beforeEach } from "vitest";
import { getMaintenanceNotice } from "../../storefront/app/lib/maintenance";
import { EMPTY_PUBLIC_SETTINGS } from "../../storefront/app/lib/settings/public-settings";

const maintenanceSettings = {
  ...EMPTY_PUBLIC_SETTINGS,
  maintenanceMode: true,
  maintenanceMessageAr: "نعود قريباً",
  maintenanceMessageEn: "Back soon",
};

describe("maintenance presentation", () => {
  it("keeps ordinary operation available when disabled", () => {
    expect(
      getMaintenanceNotice(
        EMPTY_PUBLIC_SETTINGS,
        null,
        "en",
        "/en/checkout/item/offer",
      ),
    ).toBeNull();
  });
  it("shows the configured locale message to visitors and customers", () => {
    expect(
      getMaintenanceNotice(maintenanceSettings, null, "ar", "/ar"),
    ).toEqual({ message: "نعود قريباً" });
    expect(
      getMaintenanceNotice(
        maintenanceSettings,
        { isAdmin: false },
        "en",
        "/en/orders",
      ),
    ).toEqual({ message: "Back soon" });
  });
  it("allows a verified administrator through on any page", () => {
    expect(
      getMaintenanceNotice(
        maintenanceSettings,
        { isAdmin: true },
        "ar",
        "/ar/dashboard/website",
      ),
    ).toBeNull();
  });
  it.each(["login", "forgot-password", "reset-password"])(
    "keeps %s accessible in both languages and loader requests",
    (page) => {
      for (const locale of ["ar", "en"] as const) {
        for (const suffix of ["", "/", ".data"])
          expect(
            getMaintenanceNotice(
              maintenanceSettings,
              null,
              locale,
              `/${locale}/${page}${suffix}`,
            ),
          ).toBeNull();
      }
    },
  );
  it("does not bypass maintenance for lookalike paths", () => {
    expect(
      getMaintenanceNotice(
        maintenanceSettings,
        null,
        "en",
        "/en/login/anything",
      ),
    ).toEqual({ message: "Back soon" });
  });
  it("falls back to readable localized copy when the owner message is blank", () => {
    const blank = {
      ...maintenanceSettings,
      maintenanceMessageAr: " ",
      maintenanceMessageEn: "",
    };
    expect(getMaintenanceNotice(blank, null, "en", "/en")?.message).toBe(
      "We are updating the store. Please check back soon.",
    );
    expect(getMaintenanceNotice(blank, null, "ar", "/ar")?.message).toBe(
      "نجري بعض التحديثات على المتجر. يرجى العودة قريباً.",
    );
  });
});

const mocks = vi.hoisted(() => ({ settings: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/cloudflare-context", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));
vi.mock("@server/session", () => ({
  createSessionClient: () => ({ supabase: {}, jar: {}, isProduction: false }),
  getSessionUserId: async () => null,
  sessionCookieHeaders: () =>
    new Headers({ "set-cookie": "session=refreshed; HttpOnly" }),
  withSessionCookies: (response: Response) => response,
}));
vi.mock("@server/lib/services/settings.service", () => ({
  getPublicStoreSettings: mocks.settings,
}));
vi.mock("@server/lib/services/session.service", () => ({
  getSessionSummary: mocks.session,
  getHeaderWalletPanel: async () => null,
  getUnreadNotificationCount: async () => 0,
}));
import { loader } from "../../storefront/app/routes/locale-layout";

function load(path: string) {
  return loader({
    request: new Request(`https://store.example${path}`),
    params: { locale: "en" },
    context: {},
  } as Parameters<typeof loader>[0]);
}

describe("maintenance locale response", () => {
  beforeEach(() => {
    mocks.settings.mockResolvedValue(maintenanceSettings);
    mocks.session.mockResolvedValue(null);
  });
  it("returns 503 while preserving the session headers and public notice", async () => {
    const result = await load("/en");
    expect(result.init?.status).toBe(503);
    expect(new Headers(result.init?.headers).get("set-cookie")).toContain(
      "session=refreshed",
    );
    expect(result.data.maintenance).toEqual({ message: "Back soon" });
  });
  it("returns 200 on account recovery even when maintenance is enabled", async () => {
    const result = await load("/en/forgot-password");
    expect(result.init?.status).toBe(200);
    expect(result.data.maintenance).toBeNull();
  });
  it("returns 200 to verified admins", async () => {
    mocks.session.mockResolvedValue({
      isAdmin: true,
      userId: "admin",
      displayName: "Owner",
      email: null,
      avatarUrl: null,
    });
    const result = await load("/en/dashboard");
    expect(result.init?.status).toBe(200);
    expect(result.data.maintenance).toBeNull();
  });
});
