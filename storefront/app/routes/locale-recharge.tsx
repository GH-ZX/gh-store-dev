import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  getMyRechargeRequests,
  getRechargeConfig,
  submitRechargeRequest,
  type MyRechargeRequest,
  type SubmitResult,
} from "@server/lib/services/recharge.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-recharge";

const SubmitSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().min(1).max(120),
});

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/recharge`), jar, isProduction);
  }
  const [config, requests] = await Promise.all([
    getRechargeConfig(supabase),
    getMyRechargeRequests(supabase, userId),
  ]);
  return data({ locale, config, requests }, { headers: sessionCookieHeaders(jar, isProduction) });
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
    return withSessionCookies(redirectToLogin(request, locale, `/${locale}/recharge`), jar, isProduction);
  }
  const form = await request.formData();
  const parsed = SubmitSchema.safeParse({ amount: form.get("amount"), method: form.get("method") });
  if (!parsed.success) {
    return data({ ok: false as const, reason: "invalid_input" } satisfies SubmitResult, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  }
  const result = await submitRechargeRequest(supabase, parsed.data);
  if (result.ok) {
    return withSessionCookies(
      redirect(`/${locale}/recharge/${result.requestId}`),
      jar,
      isProduction,
    );
  }
  return data(result, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const messages = getMessages(locale, "recharge");
  return buildPageMeta({
    locale,
    path: "/recharge",
    title: messages.title,
    description: messages.description,
    noIndex: true,
  });
}

export default function LocaleRecharge() {
  const { locale, config, requests } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    config: { currency: string; minAmount: number; maxAmount: number; methods: { id: string; enabled: boolean }[] };
    requests: MyRechargeRequest[];
  };
  const actionResult = useActionData<typeof action>() as SubmitResult | undefined;
  const messages = getMessages(locale, "recharge");
  const methods = config.methods.filter((method) => method.enabled);

  return (
    <>
      <h1 className="text-2xl font-bold">{messages.title}</h1>
      <p className="opacity-70">{messages.description}</p>
      {methods.length === 0 ? (
        <p className="mt-4">{messages.noMethodsDescription}</p>
      ) : (
        <Form method="post" className="mt-4 flex max-w-md flex-col gap-3">
          <label>
            {messages.amountLabel}
            <input
              name="amount"
              type="number"
              min={config.minAmount}
              max={config.maxAmount}
              step="any"
              required
              className="mt-1 w-full rounded border p-2"
            />
          </label>
          <label>
            {messages.methodLabel}
            <select name="method" required className="mt-1 w-full rounded border p-2">
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.id}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded border px-4 py-2 font-bold">
            {messages.submitAction}
          </button>
          {actionResult && !actionResult.ok ? (
            <p role="alert" className="text-red-600">
              {messages.errors[actionResult.reason as keyof typeof messages.errors] ?? actionResult.reason}
            </p>
          ) : null}
        </Form>
      )}
      <h2 className="mt-8 text-lg font-bold">{messages.requestsTitle}</h2>
      {requests.length === 0 ? (
        <p className="opacity-70">{messages.emptyDescription}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {requests.map((entry) => (
            <li key={entry.id} className="rounded border p-2 text-sm">
              <Link to={`/${locale}/recharge/${entry.id}`}>
                {entry.reference} — {entry.requestedAmount} {entry.currency} —{" "}
                {messages.statuses[entry.status as keyof typeof messages.statuses] ?? entry.status}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
