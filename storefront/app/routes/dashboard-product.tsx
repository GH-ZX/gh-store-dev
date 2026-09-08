import { Link } from "react-router";
import { notFound } from "@server/compat/navigation";
import { AdminCard } from "@/components/admin/admin-form";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { OfferManageForm } from "@/components/admin/offer-manage-form";
import { OfferRowsForm } from "@/components/admin/offer-rows-form";
import { ProviderLinkForm } from "@/components/admin/provider-link-form";
import { StockManager } from "@/components/admin/stock-manager";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon, LinkIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getAdminProduct, listAdminCategories } from "@server/legacy/lib/services/admin-catalog.service";
import { getStockSummaries, listStockItems } from "@server/lib/services/stock.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";


/** Load one product and the data needed by its editing forms. */

import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
function requireLocale(value: string | undefined) { if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 }); return value; }
import { requireDashboardAdmin } from "@server/dashboard-access";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);
  const { productId } = params;
  if (!productId) throw new Response("Not Found", { status: 404 });
  const [detail, categories] = await Promise.all([
    getAdminProduct(productId),
    listAdminCategories(),
  ]);

  if (!detail) {
    notFound();
  }

  const { game: product, offers, activeOfferCount } = detail;

  // Stock reads need service authority, but ordinary catalog editing must still
  // work when fulfillment is intentionally not configured.
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
 const { locale, categories, product, offers, activeOfferCount, storedOffers, stockSummaries, stockItemLists } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin").catalog;
  return (
    <div className="grid gap-8">
      <div>
        <Link
          to={`/${locale}/dashboard/catalog`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToCatalog}
        </Link>

        <SectionHeader as="h1" eyebrow={messages.eyebrow} title={locale === "ar" ? product.nameAr : product.nameEn} subtitle={locale === "ar" ? product.nameEn : product.nameAr} className="mt-5" />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Badge tone={product.isActive ? "success" : "neutral"}>
            {product.isActive ? messages.published : messages.unpublished}
          </Badge>
          {product.isFeatured ? <Badge tone="accent">{messages.featured}</Badge> : null}
          {product.showInCarousel ? <Badge tone="sale">{messages.inCarousel}</Badge> : null}
          <span className="font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
            {product.slug}
          </span>
          <span className="text-xs text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.offersCount, { count: offers.length }, locale)}
          </span>
          {product.providerCode ? (
            <span className="text-xs text-[var(--ink-faint)]">
              {messages.providerLabel}: <span dir="ltr">{product.providerCode}</span>
            </span>
          ) : null}
          {product.providerCategoryTitle ? (
            <span className="text-xs text-[var(--ink-faint)]">
              {messages.providerCategoryLabel}: {product.providerCategoryTitle}
            </span>
          ) : null}
          {product.providerUrl ? (
            <a
              href={product.providerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent-strong)] underline-offset-4 transition-colors duration-[var(--duration)] hover:underline"
            >
              <LinkIcon className="size-3.5" />
              <span dir="ltr">{messages.supplierLinkTitle}</span>
            </a>
          ) : null}
          {product.isActive ? <Link
            to={`/${locale}/${categories.find((category) => category.id === product.categoryId)?.slug ?? "products"}/${product.slug}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-[var(--accent-strong)] underline-offset-4 transition-colors duration-[var(--duration)] hover:underline"
          >
            <LinkIcon className="size-3.5" />
            {messages.viewOnStore}
          </Link> : null}
        </div>
      </div>

      <AdminCard
        title={messages.supplierLinkTitle}
        description={messages.supplierLinkDescription}
      >
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
      </AdminCard>

        <ProductEditForm
        locale={locale}
        messages={messages.game}
        errors={messages.errors}
        categories={categories}
        product={product}
      />

      {activeOfferCount === 0 ? (
        <div role="status" className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
          <p className="text-sm font-semibold text-[var(--warning)]">{messages.noActiveOffers}</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{messages.noActiveOffersHint}</p>
        </div>
      ) : null}

      <OfferRowsForm
        locale={locale}
        messages={messages.offers}
        errors={messages.errors}
        offerTypes={getMessages(locale, "catalog").offerTypes}
        gameId={product.id}
        offers={offers}
      />

      <AdminCard
        title={messages.manageOffers.title}
        description={messages.manageOffers.description}
      >
        <OfferManageForm
          locale={locale}
          gameId={product.id}
          offers={offers}
          messages={messages.manageOffers}
          errors={messages.errors}
          offerTypeLabels={getMessages(locale, "catalog").offerTypes}
        />
      </AdminCard>

      {storedOffers.length > 0 && (
        <div className="grid gap-6">
          <SectionHeader as="h2" title={messages.stock.sectionTitle} subtitle={messages.stock.sectionDescription} />
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
