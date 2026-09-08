import { Link } from "react-router";
import { notFound } from "@server/compat/navigation";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { OfferManageForm } from "@/components/admin/offer-manage-form";
import { OfferRowsForm } from "@/components/admin/offer-rows-form";
import { ProviderLinkForm } from "@/components/admin/provider-link-form";
import { StockManager } from "@/components/admin/stock-manager";
import { StoreImage } from "@/components/store/store-image";
import {
  ArrowIcon,
  ChevronIcon,
  GlobeIcon,
  LinkIcon,
} from "@/components/ui/icons";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getAdminProduct, listAdminCategories } from "@server/legacy/lib/services/admin-catalog.service";
import { getStockSummaries, listStockItems } from "@server/lib/services/stock.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { requireDashboardAdmin } from "@server/dashboard-access";
import { cn } from "@/lib/cn";

function requireLocale(value: string | undefined) {
  if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 });
  return value;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);
  const { productId } = params;
  if (!productId) throw new Response("Not Found", { status: 404 });
  const detail = await getAdminProduct(productId);
  const categories = await listAdminCategories();

  if (!detail) {
    notFound();
  }

  const { game: product, offers, activeOfferCount } = detail;

  const storedOffers = offers.filter((o) => o.deliveryKind === "stored");
  const supabase = storedOffers.length > 0 && hasServiceRoleKey() ? createSupabaseServiceClient() : null;
  const stockSummaries = supabase
    ? await getStockSummaries(
        supabase,
        storedOffers.map((o) => o.id),
      )
    : new Map();

  const stockItemLists = new Map<string, { id: string; content: string; createdAt: string }[]>();
  if (supabase) {
    for (const offer of storedOffers) {
      const items = await listStockItems(supabase, offer.id);
      stockItemLists.set(
        offer.id,
        items.map((i) => ({
          id: i.id,
          content: i.content,
          createdAt: i.createdAt,
        })),
      );
    }
  }

  return { locale, categories, product, offers, activeOfferCount, storedOffers, stockSummaries, stockItemLists };
}

export default function Page() {
  const { locale, categories, product, offers, activeOfferCount, storedOffers, stockSummaries, stockItemLists } =
    useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin").catalog;

  const storeProductPath = `/${locale}/${
    categories.find((category) => category.id === product.categoryId)?.slug ?? "products"
  }/${product.slug}`;

  return (
    <div className="space-y-8">
      {/* Top Back Navigation */}
      <div>
        <Link
          to={`/${locale}/dashboard/catalog`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <ChevronIcon
            direction={locale === "ar" ? "end" : "start"}
            className="size-4"
          />
          <span>{messages.backToCatalog}</span>
        </Link>
      </div>

      {/* Product Hero Header Summary Card */}
      <div className="admin-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 items-start">
            {/* Thumbnail preview */}
            <div className="size-16 sm:size-20 shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-inset)]">
              <StoreImage src={product.imageUrl} alt="" sizes="80px" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
                  {locale === "ar" ? product.nameAr : product.nameEn}
                </h1>
                <span className="text-sm font-medium text-[var(--ink-muted)]" dir={locale === "ar" ? "ltr" : "rtl"}>
                  ({locale === "ar" ? product.nameEn : product.nameAr})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span
                  className={cn(
                    "admin-badge",
                    product.isActive ? "admin-badge-success" : "admin-badge-neutral",
                  )}
                >
                  {product.isActive ? messages.published : messages.unpublished}
                </span>

                {activeOfferCount === 0 ? (
                  <span className="admin-badge admin-badge-warning">
                    {messages.noActiveOffers}
                  </span>
                ) : null}

                {product.isFeatured ? (
                  <span className="admin-badge admin-badge-accent">
                    {messages.featured}
                  </span>
                ) : null}

                {product.showInCarousel ? (
                  <span className="admin-badge admin-badge-warning">
                    {messages.inCarousel}
                  </span>
                ) : null}

                <span className="font-mono text-xs text-[var(--ink-faint)] bg-[var(--surface-strong)] px-2 py-0.5 rounded border border-[var(--line)]" dir="ltr">
                  {product.slug}
                </span>

                <span className="font-semibold text-[var(--ink-soft)] tabular-nums">
                  {formatMessage(messages.offersCount, { count: offers.length }, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick View on Store Link */}
          {product.isActive ? (
            <div className="shrink-0">
              <Link
                to={storeProductPath}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface)] hover:border-[var(--line-strong)] transition-colors"
              >
                <GlobeIcon className="size-3.5 text-[var(--accent)]" />
                <span>{messages.viewOnStore}</span>
                <ArrowIcon
                  direction={locale === "ar" ? "start" : "end"}
                  className="size-3 opacity-60"
                />
              </Link>
            </div>
          ) : null}
        </div>

        {/* Metadata Details strip */}
        {(product.providerCode || product.providerCategoryTitle || product.providerUrl) ? (
          <div className="mt-4 pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-muted)]">
            {product.providerCode ? (
              <span>
                {messages.providerLabel}: <span dir="ltr" className="font-semibold text-[var(--ink)]">{product.providerCode}</span>
              </span>
            ) : null}
            {product.providerCategoryTitle ? (
              <span>
                {messages.providerCategoryLabel}: <span className="text-[var(--ink)] font-medium">{product.providerCategoryTitle}</span>
              </span>
            ) : null}
            {product.providerUrl ? (
              <a
                href={product.providerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                <LinkIcon className="size-3" />
                <span dir="ltr">{messages.supplierLinkTitle}</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Supplier Link Section */}
      <div className="admin-card space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">{messages.supplierLinkTitle}</h2>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">{messages.supplierLinkDescription}</p>
        </div>

        <ProviderLinkForm
          locale={locale}
          gameId={product.id}
          url={product.providerUrl}
          messages={{
            label: messages.supplierLinkLabel,
            hint: messages.supplierLinkHint,
            save: messages.supplierLinkSave,
            saved: messages.supplierLinkSaved,
            errorInvalid: messages.errors.provider_link_invalid,
            errorUnknown: messages.errors.unknown,
          }}
        />
      </div>

      {/* Warning banner if no active offers */}
      {activeOfferCount === 0 ? (
        <div role="status" className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
          <p className="text-sm font-semibold text-[var(--warning)]">{messages.noActiveOffers}</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{messages.noActiveOffersHint}</p>
        </div>
      ) : null}

      {/* Product General Information Form */}
      <ProductEditForm
        locale={locale}
        messages={messages.game}
        errors={messages.errors}
        categories={categories}
        product={product}
      />

      {/* Offers Quick Pricing Table */}
      <OfferRowsForm
        locale={locale}
        messages={messages.offers}
        errors={messages.errors}
        offerTypes={getMessages(locale, "catalog").offerTypes}
        gameId={product.id}
        offers={offers}
      />

      {/* Manage / Add Packages Card */}
      <div className="admin-card space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ink)]">{messages.manageOffers.title}</h2>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">{messages.manageOffers.description}</p>
        </div>

        <OfferManageForm
          locale={locale}
          gameId={product.id}
          offers={offers}
          messages={messages.manageOffers}
          errors={messages.errors}
          offerTypeLabels={getMessages(locale, "catalog").offerTypes}
        />
      </div>

      {/* Digital Stock Manager (for stored-code offers) */}
      {storedOffers.length > 0 && (
        <div className="space-y-4">
          <div className="admin-card">
            <h2 className="text-base font-bold text-[var(--ink)]">{messages.stock.sectionTitle}</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">{messages.stock.sectionDescription}</p>
          </div>

          {storedOffers.map((offer) => (
            <StockManager
              key={offer.id}
              messages={messages.stock}
              gameId={product.id}
              offerId={offer.id}
              offerName={offer.nameEn}
              deliveryKind={offer.deliveryKind}
              stockItems={stockItemLists.get(offer.id) ?? []}
              availableCount={stockSummaries.get(offer.id)?.available ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
