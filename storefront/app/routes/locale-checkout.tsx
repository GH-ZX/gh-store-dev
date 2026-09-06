import { StoreImage } from "@/components/store/store-image";
import { formatPrice } from "@/lib/format/money";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { ErrorState, NoticePanel } from "@/components/shared/states";
import { DescriptionText } from "@/components/store/description-text";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/commerce/commerce-page";
import { getMyWallet } from "@server/lib/services/wallet.service";
import { getSessionSummary } from "@server/lib/services/session.service";
import { prefillGiftFieldsAction } from "@server/gift-prefill";
import { data, redirect, Link, useLoaderData } from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import {
  createPublicClient,
  getOfferDetail,
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
  const [wallet, session, profileResult] = await Promise.all([
    getMyWallet(supabase, userId), getSessionSummary(supabase, userId),
    supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle(),
  ]);
  return data({
      locale, balance: wallet?.balance ?? 0, isGift: session?.isAdmin ?? false, suspended: profileResult.data?.is_active === false,
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
  if (formData.get("intent") === "prefillGiftFields") {
    const result = await prefillGiftFieldsAction(supabase, String(formData.get("recipientEmail") ?? ""), params.gameSlug, params.offerSlug);
    return data(result, { headers: sessionCookieHeaders(jar, isProduction) });
  }
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
    redirect(`/${locale}/orders/${result.orderId}`, 302),
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

export default function CheckoutPage() {
  const { locale, product, offer, inputFields, balance, isGift, suspended, idempotencyKey } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "checkout");
  const account = getMessages(locale, "account");
  const common = getMessages(locale, "common");
  const quantity = 1;
  const total = offer.price;
  const insufficient = !isGift && balance < total;
  const gameSlug = product.slug;
  const offerSlug = offer.slug;
  if (suspended) return <Section spacing="page"><ErrorState title={account.banned.title} description={account.banned.description} action={{ href: `/${locale}/contact`, label: common.links.contact }} /></Section>;
  return (
    <Section spacing="page" className="sf-checkout">
      <nav aria-label={offer.name}>
        <Link
          to={`/${locale}/${product.categorySlug}/${product.slug}/${offer.slug}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {offer.name}
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        title={messages.title}
        subtitle={isGift ? messages.giftDescription : messages.description}
        className="mt-5"
      />

      <div className="sf-commerce-columns sf-checkout-columns">
        <section className="sf-commerce-panel sf-checkout-preview">
          <h2>{messages.summary.title}</h2>
          <div className="sf-checkout-product">
            <div className="sf-checkout-art"><StoreImage src={product.imageUrl} alt={product.name} sizes="88px" /></div>
            <div className="sf-checkout-product-copy"><p>{product.name}</p><span>{offer.name}</span></div>
            <bdi className="sf-commerce-price">{formatPrice(total, offer.currency, locale)}</bdi>
          </div>
        </section>
        <div className="sf-checkout-details grid gap-5">
          <section className="sf-commerce-panel">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {inputFields.length > 0 ? messages.fields.title : messages.fields.noFieldsTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
              {inputFields.length > 0
                ? messages.fields.description
                : messages.fields.noFieldsDescription}
            </p>

            <div className="mt-5">
              <CheckoutForm
                idempotencyKey={idempotencyKey}
                locale={locale}
                messages={messages}
                gameSlug={product.slug}
                offerSlug={offer.slug}
                fields={inputFields}
                disabled={insufficient}
                total={total}
                currency={offer.currency}
                balanceAfter={isGift ? null : balance - total}
                gift={isGift}
              />
            </div>

            <NoticePanel
              className="mt-5"
              description={isGift ? messages.fields.giftNotice : messages.fields.lockedNotice}
            />
          </section>

          {offer.description ? (
            <section className="sf-commerce-panel">
              <h2 className="text-base font-semibold text-[var(--ink)]">
                {messages.instructionsHeading}
              </h2>
              <DescriptionText text={offer.description} className="mt-3" />
            </section>
          ) : null}
        </div>

        <OrderSummary
          locale={locale}
          messages={messages}
          offerName={offer.name}
          productName={product.name}
          productImage={product.imageUrl}
          unitPrice={offer.price}
          quantity={quantity}
          total={total}
          currency={offer.currency}
          balance={balance}
          insufficient={insufficient}
          shortfall={total - balance}
          walletHref={`/${locale}/recharge?amount=${encodeURIComponent((total - balance).toFixed(2))}&returnTo=${encodeURIComponent(`/${locale}/checkout/${gameSlug}/${offerSlug}`)}`}
          gift={isGift}
        />
      </div>

      {/*
        * The sticky pay bar overlays the viewport bottom on a phone, so the
        * document ends with room to scroll the footer clear of it.
        */}
      <div aria-hidden="true" className="h-24 lg:hidden" />
    </Section>
  );
}
