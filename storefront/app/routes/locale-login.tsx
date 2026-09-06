import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { createSessionClient, getSessionUserId, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { signIn, signUp } from "@server/auth";
import type { Route } from "./+types/locale-login";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (userId) {
    const redirect = Response.redirect(`/${locale}`, 302);
    return withSessionCookies(redirect, jar, isProduction);
  }
  const next = new URL(request.url).searchParams.get("next") ?? "";
  return { locale, next };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const formData = await request.formData();
  const mode = formData.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const collected: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const result =
    mode === "sign-up"
      ? await signUp(request, env, formData, (cookies) => collected.push(...cookies))
      : await signIn(request, env, formData, (cookies) => collected.push(...cookies));

  const { isProduction } = createSessionClient(request, env);
  if (result.ok) {
    const redirect = Response.redirect(result.redirect, 302);
    return withSessionCookies(redirect, { cookies: collected }, isProduction);
  }
  return data(
    { error: result.error, notice: result.notice },
    { status: 400, headers: sessionCookieHeaders({ cookies: collected }, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const auth = getMessages(locale, "admin").auth;
  return buildPageMeta({
    locale,
    path: "/login",
    title: auth.signInTitle,
    description: auth.signInDescription,
  });
}

export default function LocaleLogin() {
  const { locale, next } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | { error?: string; notice?: string | null }
    | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const auth = getMessages(locale, "admin").auth;
  const recovery = getMessages(locale, "account").recovery;

  return (
    <>
      <h1 className="text-2xl font-bold">{auth.signInTitle}</h1>
      <p className="opacity-70">{auth.signInDescription}</p>
      {actionData?.error ? (
        <p role="alert" className="mt-4 text-red-600">
          {auth.errors[actionData.error as keyof typeof auth.errors] ?? actionData.error}
        </p>
      ) : null}
      {actionData?.notice ? (
        <p role="status" className="mt-4">
          {auth.notices[actionData.notice as keyof typeof auth.notices] ?? actionData.notice}
        </p>
      ) : null}
      <Form method="post" className="mt-6 flex max-w-md flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="redirectTo" value={next} />
        <label className="flex flex-col gap-1">
          {auth.emailLabel}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border p-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          {auth.passwordLabel}
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded border p-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            name="mode"
            value="sign-in"
            disabled={busy}
            className="rounded border px-4 py-2"
          >
            {auth.signInAction}
          </button>
          <button
            type="submit"
            name="mode"
            value="sign-up"
            disabled={busy}
            className="rounded border px-4 py-2"
          >
            {auth.signUpAction}
          </button>
        </div>
      </Form>
      <p className="mt-4 text-sm opacity-70">
        <Link to={`/${locale}/forgot-password`}>{recovery.forgotLink}</Link>
      </p>
    </>
  );
}
