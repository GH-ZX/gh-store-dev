import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getSessionSummary } from "@server/lib/services/session.service";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";
import type { Route } from "./+types/dashboard-mfa";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    const url = new URL(request.url);
    return withSessionCookies(
      redirectToLogin(request, locale, `${url.pathname}${url.search}`.replace(/\.data$/, "")),
      jar,
      isProduction,
    );
  }

  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") || `/${locale}/dashboard`;

  const mfaLevel = typeof supabase.auth?.mfa?.getAuthenticatorAssuranceLevel === "function"
    ? await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null)
    : null;

  if (mfaLevel?.data?.currentLevel === "aal2") {
    return withSessionCookies(redirect(nextParam), jar, isProduction);
  }

  const factorsRes = typeof supabase.auth?.mfa?.listFactors === "function"
    ? await supabase.auth.mfa.listFactors().catch(() => null)
    : null;

  const verifiedTotp = factorsRes?.data?.totp?.find((f) => f.status === "verified");

  if (verifiedTotp) {
    return data(
      {
        mode: "verify" as const,
        factorId: verifiedTotp.id,
        qrCode: null,
        secret: null,
        locale,
        nextUrl: nextParam,
      },
      { headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  // Admin needs to enroll a new TOTP factor
  // Unenroll any pending unverified factors
  if (factorsRes?.data?.all?.length) {
    const unverified = factorsRes.data.all.filter((f) => f.status === "unverified");
    for (const factor of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => null);
    }
  }

  const enrollRes = typeof supabase.auth?.mfa?.enroll === "function"
    ? await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GH Store Admin",
      })
    : null;

  if (enrollRes?.error || !enrollRes?.data) {
    return data(
      {
        mode: "error" as const,
        factorId: null,
        qrCode: null,
        secret: null,
        locale,
        nextUrl: nextParam,
        errorMessage: enrollRes?.error?.message || "Failed to start MFA enrollment",
      },
      { headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  return data(
    {
      mode: "enroll" as const,
      factorId: enrollRes.data.id,
      qrCode: enrollRes.data.totp.qr_code,
      secret: enrollRes.data.totp.secret,
      locale,
      nextUrl: nextParam,
      errorMessage: null,
    },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const factorId = String(formData.get("factorId") || "").trim();
  const code = String(formData.get("code") || "").trim().replace(/\s+/g, "");
  const nextUrl = String(formData.get("nextUrl") || `/${locale}/dashboard`).trim();

  if (!factorId || !code) {
    return data(
      { error: locale === "ar" ? "يرجى إدخال رمز التحقق." : "Please enter the verification code." },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  if (typeof supabase.auth?.mfa?.challengeAndVerify !== "function") {
    return data(
      { error: "MFA is not supported in this environment." },
      { status: 500, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  const verifyRes = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });

  if (verifyRes.error) {
    return data(
      {
        error:
          locale === "ar"
            ? "رمز التحقق غير صحيح أو منتهي الصلاحية. حاول مرة أخرى."
            : "Invalid or expired verification code. Please try again.",
      },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  return withSessionCookies(redirect(nextUrl), jar, isProduction);
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({
    locale,
    path: "/dashboard/mfa",
    title: locale === "ar" ? "التحقق بخطوتين — الإدارة" : "Two-Factor Authentication — Admin",
    description: "",
    noIndex: true,
  });
}

export default function DashboardMfaPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const { mode, factorId, qrCode, secret, locale, nextUrl } = loaderData;
  const isAr = locale === "ar";

  return (
    <div className="mx-auto max-w-md py-12 px-4">
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--accent-primary)]">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.75"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--ink)]">
            {mode === "enroll"
              ? isAr
                ? "إعداد التحقق بخطوتين (2FA)"
                : "Set Up Two-Factor Authentication"
              : isAr
              ? "التحقق بخطوتين"
              : "Two-Factor Authentication"}
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {mode === "enroll"
              ? isAr
                ? "امسح رمز الاستجابة السريعة (QR) باستخدام تطبيق المصادقة (مثل Google Authenticator أو 1Password) ثم أدخل الرمز المكون من 6 أرقام."
                : "Scan the QR code with your authenticator app (such as Google Authenticator or 1Password), then enter the 6-digit code."
              : isAr
              ? "أدخل رمز التحقق المكون من 6 أرقام من تطبيق المصادقة الخاص بك للمتابعة."
              : "Enter the 6-digit code from your authenticator app to proceed."}
          </p>
        </div>

        {actionData?.error && (
          <div className="mb-4 rounded-[var(--radius-inner)] border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
            {actionData.error}
          </div>
        )}

        {mode === "enroll" && (
          <div className="mb-6 flex flex-col items-center">
            {qrCode ? (
              <div className="rounded-[var(--radius-inner)] border border-[var(--line)] bg-white p-3">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="h-44 w-44"
                />
              </div>
            ) : null}

            {secret ? (
              <div className="mt-4 w-full">
                <span className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                  {isAr ? "أو أدخل المفتاح يدوياً:" : "Or enter code manually:"}
                </span>
                <code className="block select-all rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-center font-mono text-xs text-[var(--ink)] tracking-wider">
                  {secret}
                </code>
              </div>
            ) : null}
          </div>
        )}

        <Form method="post" className="space-y-4">
          <input type="hidden" name="factorId" value={factorId ?? ""} />
          <input type="hidden" name="nextUrl" value={nextUrl} />

          <div>
            <label
              htmlFor="mfa-code"
              className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5"
            >
              {isAr ? "رمز التحقق (6 أرقام)" : "Verification Code (6 digits)"}
            </label>
            <input
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="000000"
              className="w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--canvas)] px-3 py-2.5 text-center font-mono text-lg tracking-widest text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-[var(--radius-control)] bg-[var(--accent-primary)] py-2.5 px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting
              ? isAr
                ? "جارِ التحقق..."
                : "Verifying..."
              : mode === "enroll"
              ? isAr
                ? "تفعيل والمتابعة"
                : "Enable & Continue"
              : isAr
              ? "تحقق ومتابعة"
              : "Verify & Continue"}
          </button>
        </Form>
      </div>
    </div>
  );
}
