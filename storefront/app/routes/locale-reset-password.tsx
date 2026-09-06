import { useEffect, useRef } from "react";
import {
  data,
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { strongPasswordSchema } from "@server/lib/auth/password-policy";
import {
  createSessionClient,
  getSessionUserId,
  sessionCookieHeaders,
} from "@server/session";
import {
  AccountHeading,
  AccountResult,
  SubmitButton,
  accountField,
} from "@/components/account-ui";
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const session = createSessionClient(request, env);
  const ready = Boolean(await getSessionUserId(session.supabase));
  return data(
    { locale, ready },
    { headers: sessionCookieHeaders(session.jar, session.isProduction) },
  );
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  if (!isLocale(params.locale ?? ""))
    throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const form = await request.formData();
  const finish = (error: string | null, done = false, ready = false) =>
    data(
      { error, done, ready },
      {
        status: error ? 400 : 200,
        headers: sessionCookieHeaders(jar, isProduction),
      },
    );
  // Compatibility with existing recovery emails whose tokens arrive in a URL fragment.
  if (form.get("intent") === "recovery-session") {
    const access_token = String(form.get("access_token") ?? "");
    const refresh_token = String(form.get("refresh_token") ?? "");
    if (
      !access_token ||
      !refresh_token ||
      access_token.length > 20000 ||
      refresh_token.length > 20000
    )
      return finish("not_signed_in");
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    return finish(error ? "not_signed_in" : null, false, !error);
  }
  if (!(await getSessionUserId(supabase))) return finish("not_signed_in");
  const password = String(form.get("password") ?? "");
  if (!strongPasswordSchema.safeParse(password).success)
    return finish("weak_password", false, true);
  if (password !== form.get("confirmPassword"))
    return finish("mismatch", false, true);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return finish("unknown", false, true);
  await supabase.auth.signOut({ scope: "others" });
  return finish(null, true, true);
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function ResetPassword() {
  const { locale, ready } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const recovery = useFetcher<typeof action>();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access = hash.get("access_token"),
      refresh = hash.get("refresh_token");
    if (access && refresh) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      void recovery.submit(
        {
          intent: "recovery-session",
          access_token: access,
          refresh_token: refresh,
        },
        { method: "post" },
      );
    }
  }, [recovery]);
  const messages = getMessages(locale, "account");
  const auth = getMessages(locale, "admin").auth;
  const canReset = ready || recovery.data?.ready;
  return (
    <section className="sf-auth-page">
      <AccountHeading
        eyebrow={messages.recovery.eyebrow}
        title={messages.recovery.resetTitle}
        description={messages.recovery.resetDescription}
      />
      <div className="sf-auth-body">
        {result?.done ? (
          <div className="grid gap-5">
            <AccountResult
              messages={messages}
              notice={messages.recovery.resetDone}
            />
            <Link to={`/${locale}/login`}>{auth.signInAction}</Link>
          </div>
        ) : recovery.state !== "idle" ? (
          <p role="status">{getMessages(locale, "common").states.loading}</p>
        ) : canReset ? (
          <Form method="post" className="grid gap-5">
            <label className="grid gap-2 text-sm">
              {messages.password.newPassword}
              <input
                className={accountField}
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                dir="ltr"
              />
              <span className="text-xs text-[var(--ink-muted)]">
                {messages.password.hint}
              </span>
            </label>
            <label className="grid gap-2 text-sm">
              {messages.password.confirmPassword}
              <input
                className={accountField}
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                dir="ltr"
              />
            </label>
            <AccountResult messages={messages} error={result?.error} />
            <SubmitButton>{messages.recovery.resetAction}</SubmitButton>
          </Form>
        ) : (
          <div className="grid gap-4">
            <p role="alert" className="text-sm text-[var(--danger)]">
              {messages.recovery.linkExpired}
            </p>
            <Link to={`/${locale}/forgot-password`}>
              {messages.recovery.requestTitle}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
