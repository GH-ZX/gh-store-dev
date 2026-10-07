import { data, redirect, Link, useLoaderData, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/locale-cart";
import { isLocale, type Locale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { formatPrice } from "@/lib/format/money";
import { CartIcon, TrashIcon, PlusIcon, MinusIcon, WalletIcon } from "@/components/ui/icons";
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  checkoutCart,
} from "@server/lib/services/cart.service";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/cart`),
      jar,
      isProduction,
    );
  }

  const [cart, walletRes] = await Promise.all([
    getCart(supabase, userId, locale),
    supabase.from("wallets").select("balance, currency").eq("user_id", userId).maybeSingle(),
  ]);

  const walletBalance = Number(walletRes.data?.balance ?? 0);
  const walletCurrency = walletRes.data?.currency ?? "USD";

  return data(
    { locale, cart, walletBalance, walletCurrency },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    return data({ ok: false, error: "invalid_locale" }, { status: 400 });
  }

  const { env, ctx } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    return data(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const offerId = (formData.get("offerId") as string)?.trim();
    const qty = parseInt((formData.get("quantity") as string) || "1", 10);
    if (!offerId) return data({ ok: false, error: "missing_offer" }, { status: 400 });

    await addToCart(supabase, userId, { offerId, quantity: qty });
    return data({ ok: true, added: true }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "update-qty") {
    const cartItemId = (formData.get("cartItemId") as string)?.trim();
    const qty = parseInt((formData.get("quantity") as string) || "1", 10);
    if (!cartItemId) return data({ ok: false, error: "missing_id" }, { status: 400 });

    await updateCartItemQuantity(supabase, userId, cartItemId, qty);
    return data({ ok: true }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "remove") {
    const cartItemId = (formData.get("cartItemId") as string)?.trim();
    if (!cartItemId) return data({ ok: false, error: "missing_id" }, { status: 400 });

    await removeFromCart(supabase, userId, cartItemId);
    return data({ ok: true }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "clear") {
    await clearCart(supabase, userId);
    return data({ ok: true }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "checkout") {
    const idempotencyKey = crypto.randomUUID();
    const couponCode = (formData.get("couponCode") as string)?.trim() || null;

    const result = await checkoutCart({
      userId,
      sessionSupabase: supabase,
      idempotencyKey,
      couponCode,
      schedule: (p) => ctx.waitUntil(p),
    });

    if (!result.ok) {
      return data(
        { ok: false, error: result.reason },
        { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
      );
    }

    // Redirect to orders page upon successful checkout
    const targetUrl =
      result.orders.length === 1
        ? `/${locale}/orders/${result.orders[0].orderId}`
        : `/${locale}/orders`;

    return withSessionCookies(redirect(targetUrl), jar, isProduction);
  }

  return data({ ok: false, error: "unknown_intent" }, { status: 400 });
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({
    locale,
    path: "/cart",
    title: locale === "ar" ? "سلة المشتريات" : "Shopping Cart",
    description: locale === "ar" ? "راجع المنتجات في سلتك وأتمم طلبك" : "Review your cart and checkout",
    noIndex: true,
  });
}

export default function CartRoute() {
  const { locale, cart, walletBalance, walletCurrency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const isAr = locale === "ar";

  const isCheckingOut = navigation.formData?.get("intent") === "checkout";
  const hasFunds = walletBalance >= cart.subtotal;

  return (
    <div className="gh-page py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
            {isAr ? "سلة المشتريات" : "Shopping Cart"}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {isAr
              ? `${cart.totalQuantity} منتج في السلة`
              : `${cart.totalQuantity} item${cart.totalQuantity === 1 ? "" : "s"} in your cart`}
          </p>
        </div>
        {cart.items.length > 0 ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="clear" />
            <button
              type="submit"
              className="text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--danger)] transition-colors cursor-pointer"
            >
              {isAr ? "إفراغ السلة" : "Clear cart"}
            </button>
          </fetcher.Form>
        ) : null}
      </header>

      {cart.items.length === 0 ? (
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-12 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--ink-muted)]">
            <CartIcon className="size-6 text-[var(--ink-muted)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {isAr ? "سلتك فارغة" : "Your cart is empty"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-muted)]">
            {isAr
              ? "لم تقم بإضافة أي منتجات إلى سلتك بعد. تصفح المتجر واختر ما يناسبك."
              : "Looks like you have not added anything to your cart yet."}
          </p>
          <div className="mt-6">
            <Link
              to={`/${locale}/products`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-transform active:scale-95"
            >
              {isAr ? "تصفح المنتجات" : "Browse products"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Cart items list */}
          <div className="space-y-3 lg:col-span-8">
            {cart.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="size-16 shrink-0 overflow-hidden rounded-[var(--radius-inner,12px)] bg-[var(--surface-strong)]">
                    {item.product.imageUrl ? (
                      <img
                        src={item.product.imageUrl}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-[var(--ink-muted)]">
                        <CartIcon className="size-6" />
                      </div>
                    )}
                  </div>
                  <div>
                    <Link
                      to={`/${locale}/${encodeURIComponent(item.product.categorySlug)}/${encodeURIComponent(item.product.slug)}`}
                      className="font-semibold text-sm text-[var(--ink)] hover:text-[var(--accent)] line-clamp-1"
                    >
                      <bdi>{item.product.name}</bdi>
                    </Link>
                    <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                      <bdi>{item.offer.name}</bdi>
                    </p>
                    <p className="text-xs font-semibold text-[var(--ink-soft)] mt-1">
                      <bdi dir="ltr">{formatPrice(item.offer.price, item.offer.currency, locale)}</bdi>
                    </p>
                  </div>
                </div>

                <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0 border-[var(--line)]">
                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-[var(--line)] rounded-full bg-[var(--surface-strong)] p-0.5">
                    <fetcher.Form method="post" className="inline-flex">
                      <input type="hidden" name="intent" value="update-qty" />
                      <input type="hidden" name="cartItemId" value={item.id} />
                      <input type="hidden" name="quantity" value={Math.max(1, item.quantity - 1)} />
                      <button
                        type="submit"
                        disabled={item.quantity <= 1}
                        aria-label="Decrease quantity"
                        className="size-7 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface)] text-[var(--ink)] disabled:opacity-30 cursor-pointer"
                      >
                        <MinusIcon className="size-3.5" />
                      </button>
                    </fetcher.Form>

                    <span className="w-8 text-center text-xs font-bold text-[var(--ink)]" dir="ltr">
                      {item.quantity}
                    </span>

                    <fetcher.Form method="post" className="inline-flex">
                      <input type="hidden" name="intent" value="update-qty" />
                      <input type="hidden" name="cartItemId" value={item.id} />
                      <input type="hidden" name="quantity" value={Math.min(10, item.quantity + 1)} />
                      <button
                        type="submit"
                        disabled={item.quantity >= 10}
                        aria-label="Increase quantity"
                        className="size-7 inline-flex items-center justify-center rounded-full hover:bg-[var(--surface)] text-[var(--ink)] disabled:opacity-30 cursor-pointer"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </fetcher.Form>
                  </div>

                  {/* Line item total */}
                  <div className="text-end min-w-20">
                    <span className="text-sm font-bold text-[var(--ink)]">
                      <bdi dir="ltr">
                        {formatPrice(
                          Math.round(item.offer.price * item.quantity * 100) / 100,
                          item.offer.currency,
                          locale,
                        )}
                      </bdi>
                    </span>
                  </div>

                  {/* Remove Button */}
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="cartItemId" value={item.id} />
                    <button
                      type="submit"
                      aria-label="Remove item"
                      className="size-8 inline-flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-surface)] transition-colors cursor-pointer"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            ))}
          </div>

          {/* Cart checkout sidebar */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xs">
              <h2 className="text-base font-bold text-[var(--ink)] mb-4">
                {isAr ? "ملخص الطلب" : "Order Summary"}
              </h2>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-[var(--ink-soft)]">
                  <span>{isAr ? "عدد العناصر" : "Items count"}</span>
                  <span dir="ltr">{cart.totalQuantity}</span>
                </div>
                <div className="flex justify-between text-[var(--ink-soft)]">
                  <span>{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
                  <span dir="ltr">{formatPrice(cart.subtotal, cart.currency, locale)}</span>
                </div>
                <div className="border-t border-[var(--line)] pt-3 flex justify-between font-bold text-base text-[var(--ink)]">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <span dir="ltr">{formatPrice(cart.subtotal, cart.currency, locale)}</span>
                </div>
              </div>

              {/* Wallet balance display */}
              <div className="mt-5 rounded-[var(--radius-inner,12px)] bg-[var(--surface-strong)] p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WalletIcon className="size-4.5 text-[var(--ink-soft)]" />
                  <span className="text-xs text-[var(--ink-soft)]">
                    {isAr ? "رصيد المحفظة:" : "Wallet balance:"}
                  </span>
                </div>
                <span className="text-xs font-bold text-[var(--ink)]" dir="ltr">
                  {formatPrice(walletBalance, walletCurrency, locale)}
                </span>
              </div>

              {!hasFunds ? (
                <div className="mt-3 text-xs text-[var(--danger)]">
                  {isAr
                    ? "رصيدك الحالي غير كافٍ لإتمام الطلب. يرجى شحن محفظتك."
                    : "Insufficient wallet balance to place this order."}
                  <div className="mt-2">
                    <Link
                      to={`/${locale}/recharge`}
                      className="text-xs font-semibold text-[var(--accent)] underline hover:text-[var(--accent-ink)]"
                    >
                      {isAr ? "شحن المحفظة الآن ←" : "Recharge wallet now →"}
                    </Link>
                  </div>
                </div>
              ) : null}

              {/* Checkout Form */}
              <fetcher.Form method="post" className="mt-6">
                <input type="hidden" name="intent" value="checkout" />
                <button
                  type="submit"
                  disabled={!hasFunds || isCheckingOut || cart.items.length === 0}
                  className="w-full min-h-11 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isCheckingOut
                    ? isAr
                      ? "جاري إتمام الطلب..."
                      : "Processing..."
                    : isAr
                      ? "الدفع بواسطة المحفظة"
                      : "Pay with Wallet"}
                </button>
              </fetcher.Form>

              <p className="mt-3 text-center text-[11px] text-[var(--ink-muted)]">
                {isAr
                  ? "يتم خصم المبلغ من محفظتك وتنفيذ الطلبات فوراً."
                  : "Amount debited directly from your wallet with instant fulfillment."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
