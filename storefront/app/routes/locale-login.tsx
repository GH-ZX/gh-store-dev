import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  createSessionClient,
  getSessionUserId,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";
import { signIn, signUp } from "@server/auth";
import {
  AccountHeading,
  accountButton,
  accountField,
  accountSecondary,
} from "@/components/account-ui";
import type { Route } from "./+types/locale-login";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const url = new URL(request.url);
  const next = safeRedirectTarget(url.searchParams.get("next")) ?? `/${locale}`;
  if (await getSessionUserId(supabase))
    return withSessionCookies(redirect(next), jar, isProduction);
  return data(
    {
      locale,
      next,
      mode: url.searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in",
    },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const formData = await request.formData();
  formData.set("locale", locale);
  const session = createSessionClient(request, env);
  if (formData.get("mode") === "google") {
    const callback = new URL("/auth/callback", request.url);
    callback.searchParams.set("locale", locale);
    callback.searchParams.set(
      "next",
      safeRedirectTarget(formData.get("redirectTo")) ?? `/${locale}`,
    );
    const result = await session.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (!result.error && result.data.url)
      return withSessionCookies(
        redirect(result.data.url),
        session.jar,
        session.isProduction,
      );
    return data(
      { error: "oauth_failed", notice: null },
      {
        status: 400,
        headers: sessionCookieHeaders(session.jar, session.isProduction),
      },
    );
  }
  const result = await (formData.get("mode") === "sign-up" ? signUp : signIn)(
    request,
    env,
    formData,
    (cookies) => session.jar.cookies.push(...cookies),
  );
  if (result.ok)
    return withSessionCookies(
      redirect(result.redirect),
      session.jar,
      session.isProduction,
    );
  return data(
    { error: result.error, notice: result.notice },
    {
      status: result.error ? 400 : 200,
      headers: sessionCookieHeaders(session.jar, session.isProduction),
    },
  );
}
export function meta({ params }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : "ar";
  const auth = getMessages(locale, "admin").auth;
  return buildPageMeta({
    locale,
    path: "/login",
    title: auth.signInTitle,
    description: auth.signInDescription,
    noIndex: true,
  });
}
export default function LocaleLogin() {
  const { locale, next, mode } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const auth = getMessages(locale, "admin").auth;
  const signup = mode === "sign-up";
  return (
    <section className="sf-auth-page">
      <AccountHeading
        title={signup ? auth.signUpTitle : auth.signInTitle}
        description={signup ? auth.signUpDescription : auth.signInDescription}
      />
      <div className="sf-auth-body">
        <Form method="post" className="grid gap-5">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="redirectTo" value={next} />
          <label className="grid gap-2 text-sm font-medium">
            {auth.emailLabel}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              className={accountField}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            {auth.passwordLabel}
            <input
              name="password"
              type="password"
              required
              minLength={signup ? 8 : 1}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              dir="ltr"
              className={accountField}
            />
            <span className="text-xs text-[var(--ink-muted)]">
              {signup ? auth.signUpPasswordHint : auth.passwordHint}
            </span>
          </label>
          {result?.error ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {auth.errors[result.error as keyof typeof auth.errors] ??
                auth.errors.invalid_input}
            </p>
          ) : null}
          {result?.notice ? (
            <p role="status" className="text-sm text-[var(--success)]">
              {auth.notices[result.notice as keyof typeof auth.notices]}
            </p>
          ) : null}
          <button
            className={accountButton}
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {signup ? auth.signUpAction : auth.signInAction}
          </button>
        </Form>
        <Form method="post" className="mt-4 grid">
          <input type="hidden" name="mode" value="google" />
          <input type="hidden" name="redirectTo" value={next} />
          <button type="submit" disabled={busy} className={accountSecondary}>
            {auth.googleSignInAction}
          </button>
        </Form>
        <div className="sf-auth-links">
          <Link
            to={`/${locale}/login?mode=${signup ? "sign-in" : "sign-up"}&next=${encodeURIComponent(next)}`}
          >
            {signup ? auth.signInAction : auth.signUpAction}
          </Link>
          <Link to={`/${locale}/forgot-password`}>
            {getMessages(locale, "account").recovery.forgotLink}
          </Link>
        </div>
      </div>
    </section>
  );
}
