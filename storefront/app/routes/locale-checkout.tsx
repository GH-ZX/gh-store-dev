import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import {
  createPublicClient,
  getOfferDetail,
  type CheckoutPageData,
} from "@/lib/catalog-queries";
import { resolveQuantityMax } from "@/lib/catalog/checkout-fields";
import { buildPageMeta } from "@/lib/seo";
import { formText } from "@server/form-data";
import { placeOrder } from "@server/place-order";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  withSessionCookies, sessionCookieHeaders,} from "@server/session";
import type { Route } from "./+types/locale-checkout";

const SLUG_MAX = 160;
const FIELD_VALUE_MAX = 200;
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;
const CHECKOUT_FIELD_PREFIX = "field_";

const checkoutSchema = z.object({
  gameSlug: z.string().trim().min(1).max(SLUG_MAX),
  offerSlug: z.string().trim().min(1).max(SLUG_MAX),
  quantity: z.coerce.number().int().min(1).max(10),
  idempotencyKey: z.uuid(),
});

type FieldSchema = z.ZodType<string | undefined>;

/**
 * One schema per account field, derived from the offer. A `select` is checked
 * against its own options so a hand-edited form cannot submit a server the
 * game does not offer; `number` and `email` are shape-checked because the
 * supplier rejects the order rather than the field, and a rejection there
 * costs a refund cycle.
 */
function fieldSchema(field: {
  options: { value: string }[];
  fieldType: string;
  isRequired: boolean;
}): FieldSchema {
  if (field.options.length > 0) {
    const options = z.enum(field.options.map((option) => option.value) as [string, ...string[]]);
    return field.isRequired ? options : options.optional();
  }
  if (field.fieldType === "email") {
    const email = z.string().max(FIELD_VALUE_MAX).pipe(z.email());
    return field.isRequired ? email : email.optional();
  }
  if (field.fieldType === "number") {
    const numeric = z.string().min(1).max(32).regex(NUMERIC_PATTERN);
    return field.isRequired ? numeric : numeric.optional();
  }
  const text = z.string().min(1).max(FIELD_VALUE_MAX);
  return field.isRequired ? text : text.optional();
}

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const gameSlug = params.gameSlug ?? "";
  const offerSlug = params.offerSlug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/checkout/${gameSlug}/${offerSlug}`),
      jar,
      isProduction,
    );
  }
  const detail = await getOfferDetail(createPublicClient(env), locale, null, gameSlug, offerSlug);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  return data({
      category: detail.product.categorySlug,
      userId,
      idempotencyKey: crypto.randomUUID(),
      ...detail,
    }, { headers: sessionCookieHeaders(jar, isProduction) });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return data({ error: "unauthenticated" }, { status: 401, headers: sessionCookieHeaders(jar, isProduction) });
  }

  const formData = await request.formData();
  const parsed = checkoutSchema.safeParse({
    gameSlug: formText(formData, "gameSlug"),
    offerSlug: formText(formData, "offerSlug"),
    quantity: formText(formData, "quantity") ?? "1",
    idempotencyKey: formText(formData, "idempotencyKey"),
  });
  if (!parsed.success) {
    return data({ error: "invalid_fields" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  }

  const detail = await getOfferDetail(
    createPublicClient(env),
    locale,
    null,
    parsed.data.gameSlug,
    parsed.data.offerSlug,
  );
  if (!detail) {
    return data({ error: "unavailable" }, { status: 404, headers: sessionCookieHeaders(jar, isProduction) });
  }

  /*
   * Quantity follows the delivery kind, not the label. The UI always submits
   * 1; the offer is re-read and clamped regardless, so a hand-edited form
   * cannot overcharge.
   */
  const quantityMax = resolveQuantityMax({
    deliveryKind: detail.deliveryKind,
    providerMax: detail.quantityMax,
  });
  const quantity = Math.min(Math.max(parsed.data.quantity, 1), quantityMax);

  /*
   * The field list comes from the offer, never from the submission. Values
   * are trimmed first: a required field holding only spaces is missing, and
   * an optional one holding only spaces was left blank.
   */
  const shape: Record<string, FieldSchema> = {};
  const submitted: Record<string, string | undefined> = {};
  for (const field of detail.inputFields) {
    const raw = formText(formData, `${CHECKOUT_FIELD_PREFIX}${field.fieldKey}`)?.trim();
    shape[field.fieldKey] = fieldSchema(field);
    submitted[field.fieldKey] = raw && raw.length > 0 ? raw : undefined;
  }
  const parsedFields = z.object(shape).safeParse(submitted);
  if (!parsedFields.success) {
    return data({ error: "invalid_fields" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  }

  const dynamicFields: Record<string, string> = {};
  for (const field of detail.inputFields) {
    const value = parsedFields.data[field.fieldKey];
    if (typeof value === "string" && value.length > 0) {
      dynamicFields[field.fieldKey] = value;
    }
  }

  const result = await placeOrder({
    userId,
    sessionSupabase: supabase,
    offerSlug: parsed.data.offerSlug,
    gameSlug: parsed.data.gameSlug,
    quantity,
    dynamicFields,
    idempotencyKey: parsed.data.idempotencyKey,
    schedule: (promise) => ctx.waitUntil(promise),
  });

  if (!result.ok) {
    return data({ error: result.reason }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
  }
  return withSessionCookies(
    Response.redirect(`/${locale}/orders/${result.orderId}`, 302),
    jar,
    isProduction,
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({
    locale,
    path: "/checkout",
    title: getMessages(locale, "checkout").title,
    description: getMessages(locale, "checkout").description,
    noIndex: true,
  });
}

export default function LocaleCheckout() {
  const { locale, category, idempotencyKey, offer, product, inputFields } =
    useLoaderData<typeof loader>() as unknown as CheckoutPageData;
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const checkout = getMessages(locale, "checkout");
  const total = offer.price;

  return (
    <>
      <h1 className="text-2xl font-bold">{checkout.title}</h1>
      <p className="opacity-70">{checkout.offerPromise}</p>
      {actionData?.error ? (
        <p role="alert" className="mt-4 text-red-600">
          {checkout.errors[actionData.error as keyof typeof checkout.errors] ?? actionData.error}
        </p>
      ) : null}
      <section className="mt-6 rounded-lg border p-4">
        <h2 className="font-bold">{checkout.summary.title}</h2>
        <dl className="mt-2 text-sm">
          <div className="flex justify-between">
            <dt>{checkout.summary.gameLabel}</dt>
            <dd>
              <Link to={`/${locale}/${category}/${product.slug}`}>{product.name}</Link>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>{checkout.summary.offerLabel}</dt>
            <dd>{offer.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{checkout.summary.totalLabel}</dt>
            <dd>
              {total} {offer.currency}
            </dd>
          </div>
        </dl>
      </section>
      <Form method="post" className="mt-6 flex max-w-md flex-col gap-4">
        <input type="hidden" name="gameSlug" value={product.slug} />
        <input type="hidden" name="offerSlug" value={offer.slug} />
        <input type="hidden" name="quantity" value="1" />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {inputFields.map((field) =>
          field.options.length > 0 ? (
            <label key={field.id} className="flex flex-col gap-1">
              {field.label}
              {field.isRequired ? null : ` (${checkout.fields.optionalMark})`}
              <select
                name={`${CHECKOUT_FIELD_PREFIX}${field.fieldKey}`}
                required={field.isRequired}
                defaultValue=""
                className="rounded border p-2"
              >
                <option value="" disabled>
                  {checkout.fields.selectPlaceholder}
                </option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={field.id} className="flex flex-col gap-1">
              {field.label}
              {field.isRequired ? null : ` (${checkout.fields.optionalMark})`}
              <input
                name={`${CHECKOUT_FIELD_PREFIX}${field.fieldKey}`}
                required={field.isRequired}
                placeholder={field.placeholder ?? ""}
                className="rounded border p-2"
              />
            </label>
          ),
        )}
        <button type="submit" disabled={busy} className="rounded border px-4 py-2">
          {busy ? checkout.fields.submitPending : checkout.fields.submitAction}
        </button>
      </Form>
    </>
  );
}
