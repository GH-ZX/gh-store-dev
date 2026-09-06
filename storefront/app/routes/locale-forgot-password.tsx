import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createSessionClient, sessionCookieHeaders } from "@server/session";
import {
  AccountHeading,
  AccountResult,
  SubmitButton,
  accountField,
} from "@/components/account-ui";
export function loader({ params }: LoaderFunctionArgs) {
  if (!isLocale(params.locale ?? ""))
    throw new Response("Not Found", { status: 404 });
  return { locale: params.locale as "en" | "ar" };
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const parsed = z
    .email()
    .max(320)
    .safeParse(String(form.get("email") ?? "").trim());
  if (!parsed.success)
    return data({ error: "invalid_input", sent: false }, { status: 400 });
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const callback = new URL("/auth/callback", request.url);
  callback.searchParams.set("locale", locale);
  callback.searchParams.set("next", `/${locale}/reset-password`);
  // Every valid address gets the same response to avoid exposing account existence.
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: callback.toString(),
  });
  return data(
    { error: null, sent: true },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function ForgotPassword() {
  const { locale } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const messages = getMessages(locale, "account");
  const auth = getMessages(locale, "admin").auth;
  return (
    <section className="sf-auth-page">
      <AccountHeading
        eyebrow={messages.recovery.eyebrow}
        title={messages.recovery.requestTitle}
        description={messages.recovery.requestDescription}
      />
      <Form method="post" className="sf-auth-body grid gap-5">
        <label className="grid gap-2 text-sm">
          {auth.emailLabel}
          <input
            className={accountField}
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            dir="ltr"
          />
        </label>
        <AccountResult
          messages={messages}
          error={result?.error}
          notice={result?.sent ? messages.recovery.requestSent : null}
        />
        <SubmitButton>{messages.recovery.requestAction}</SubmitButton>
        <Link className="text-center text-sm" to={`/${locale}/login`}>
          {auth.signInAction}
        </Link>
      </Form>
    </section>
  );
}
