import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    exchangeCodeForSession: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    setSession: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
  getSessionUserId: vi.fn(),
  accountContext: vi.fn(),
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  cookies: [{ name: "session", value: "refreshed", options: {} }],
}));
vi.mock("@/lib/cloudflare-context", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));
vi.mock("@server/session", () => ({
  createSessionClient: () => ({
    supabase: { auth: mocks.auth, from: mocks.from },
    jar: { cookies: mocks.cookies },
    isProduction: false,
  }),
  getSessionUserId: mocks.getSessionUserId,
  sessionCookieHeaders: () => [
    ["Set-Cookie", "session=refreshed; HttpOnly; Path=/"],
  ],
  withSessionCookies: (response: Response) => {
    response.headers.append(
      "Set-Cookie",
      "session=refreshed; HttpOnly; Path=/",
    );
    return response;
  },
}));
vi.mock("@server/account", () => ({ accountContext: mocks.accountContext }));
vi.mock("@server/auth", () => ({ signIn: mocks.signIn, signUp: mocks.signUp }));
vi.mock("@server/lib/services/profile.service", () => ({
  getMyProfile: mocks.getMyProfile,
  updateMyProfile: mocks.updateMyProfile,
  UsernameTakenError: class extends Error {},
}));
vi.mock("@server/lib/services/telegram-link.service", () => ({
  getMyTelegramLink: vi.fn(),
  mintTelegramLinkCode: vi.fn(),
  unlinkMyTelegram: vi.fn(),
}));
vi.mock("@server/lib/services/wallet.service", () => ({
  getMyWallet: vi.fn(),
}));

import {
  action as loginAction,
  loader as loginLoader,
} from "../../storefront/app/routes/locale-login";
import { loader as callbackLoader } from "../../storefront/app/routes/auth-callback";
import { action as forgotAction } from "../../storefront/app/routes/locale-forgot-password";
import { action as resetAction } from "../../storefront/app/routes/locale-reset-password";
import { action as profileAction } from "../../storefront/app/routes/locale-profile";

function args(path: string, values?: Record<string, string>) {
  const request = new Request(
    `https://store.example${path}`,
    values ? { method: "POST", body: new URLSearchParams(values) } : {},
  );
  return {
    request,
    params: { locale: "en" },
    context: {},
    url: new URL(request.url),
    pattern: path,
  } as never;
}
function payload(value: unknown) {
  return (value as { data: Record<string, unknown> }).data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUserId.mockResolvedValue("customer-id");
  mocks.accountContext.mockResolvedValue({
    supabase: { auth: mocks.auth, from: mocks.from },
    userId: "customer-id",
    locale: "en",
    jar: { cookies: [] },
    isProduction: false,
  });
  mocks.getMyProfile.mockResolvedValue({ id: "customer-id", isActive: true });
  mocks.auth.updateUser.mockResolvedValue({ error: null });
  mocks.auth.signOut.mockResolvedValue({ error: null });
});

describe("migrated account flows", () => {
  it("returns an already signed-in customer to a safe requested destination", async () => {
    const response = await loginLoader(args("/en/login?next=%2Fen%2Fprofile"));
    expect((response as Response).headers.get("Location")).toBe("/en/profile");
    const unsafe = await loginLoader(
      args("/en/login?next=https%3A%2F%2Fevil.example"),
    );
    expect((unsafe as Response).headers.get("Location")).toBe("/en");
  });
  it("keeps email confirmation as a successful notice instead of an error response", async () => {
    mocks.signUp.mockResolvedValue({
      ok: false,
      error: "",
      notice: "confirm_email",
    });
    const result = await loginAction(
      args("/en/login", {
        mode: "sign-up",
        email: "sample@example.com",
        password: "valid123",
      }),
    );
    expect(payload(result)).toEqual({ error: "", notice: "confirm_email" });
    expect((result as { init: { status: number } }).init.status).toBe(200);
  });
  it("starts Google OAuth server-side and writes the PKCE cookie on its redirect", async () => {
    mocks.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });
    const result = await loginAction(
      args("/en/login", { mode: "google", redirectTo: "/en/orders" }),
    );
    expect((result as Response).headers.get("Location")).toBe(
      "https://accounts.google.com/oauth",
    );
    expect((result as Response).headers.get("Set-Cookie")).toContain(
      "HttpOnly",
    );
    const redirectTo =
      mocks.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo;
    expect(new URL(redirectTo).searchParams.get("next")).toBe("/en/orders");
  });
  it("failed callback exchange returns to login rather than falsely reporting success", async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("expired"),
      data: {},
    });
    const response = await callbackLoader(
      args("/auth/callback?code=expired&locale=en&next=%2Fen%2Fwallet"),
    );
    expect(response.headers.get("Location")).toBe(
      "/en/login?next=%2Fen%2Fwallet",
    );
  });
  it("callback redirects never leave the store even with a valid authorization code", async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({
      error: null,
      data: { user: null },
    });
    const response = await callbackLoader(
      args(
        "/auth/callback?code=valid&locale=en&next=https%3A%2F%2Fevil.example",
      ),
    );
    expect(response.headers.get("Location")).toBe("/en");
  });
  it("recovery responses do not reveal whether an email exists", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      error: new Error("unknown user"),
    });
    const result = await forgotAction(
      args("/en/forgot-password", { email: "unknown@example.com" }),
    );
    expect(payload(result)).toEqual({ error: null, sent: true });
    const callback = new URL(
      mocks.auth.resetPasswordForEmail.mock.calls[0][1].redirectTo,
    );
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/en/reset-password");
  });
  it("rejects unauthenticated password writes before touching credentials", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    const result = await resetAction(
      args("/en/reset-password", {
        password: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(payload(result).error).toBe("not_signed_in");
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("validates confirmation and revokes other sessions only after a successful password update", async () => {
    const mismatch = await resetAction(
      args("/en/reset-password", {
        password: "newpass123",
        confirmPassword: "other123",
      }),
    );
    expect(payload(mismatch).error).toBe("mismatch");
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
    const result = await resetAction(
      args("/en/reset-password", {
        password: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(payload(result).done).toBe(true);
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });
  it("profile updates forward only presentation fields, never role or account status", async () => {
    const result = await profileAction(
      args("/en/profile", {
        intent: "profile",
        fullName: " Customer ",
        username: "customer",
        role: "admin",
        is_active: "true",
        email: "owner@example.com",
      }),
    );
    expect(payload(result).notice).toBe("profile_saved");
    expect(mocks.updateMyProfile.mock.calls[0][1]).toEqual({
      fullName: "Customer",
      username: "customer",
    });
  });
  it("suspended profiles cannot perform account self-service writes", async () => {
    mocks.getMyProfile.mockResolvedValue({
      id: "customer-id",
      isActive: false,
    });
    const result = await profileAction(
      args("/en/profile", {
        intent: "password",
        password: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    expect(payload(result).error).toBe("not_signed_in");
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
});
