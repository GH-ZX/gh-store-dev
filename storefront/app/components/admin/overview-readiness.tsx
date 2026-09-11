"use client";

import { useState, useTransition } from "react";
import { Link, useRevalidator } from "react-router";
import { ArrowIcon, CheckIcon, TrashIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { deleteProductDirectAction, autoCompleteCatalogAction } from "@/lib/admin-actions";
import { cn } from "@/lib/cn";
import type { CatalogReadiness } from "@server/lib/services/admin-readiness.service";

const INITIAL_VISIBLE_COUNT = 6;

function useSafeRevalidator() {
  try {
    return useRevalidator();
  } catch {
    return { revalidate: () => {}, state: "idle" as const };
  }
}

export function OverviewReadiness({ locale, readiness }: { locale: Locale; readiness: CatalogReadiness | null }) {
  const copy = getMessages(locale, "admin").overview.readiness;
  const number = new Intl.NumberFormat(locale);
  const revalidator = useSafeRevalidator();
  const [showAll, setShowAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAutoCompleting, setIsAutoCompleting] = useState(false);
  const [, startTransition] = useTransition();

  async function handleAutoComplete() {
    setIsAutoCompleting(true);
    startTransition(async () => {
      try {
        const res = await autoCompleteCatalogAction({ locale });
        if (res.ok) {
          alert(
            formatMessage(
              copy.autoCompleteSuccess,
              {
                categories: res.categoriesUpdated,
                artwork: res.artworkUpdated,
                offers: res.offersCreated,
              },
              locale,
            ),
          );
          void revalidator.revalidate();
        } else {
          alert(res.error ?? "Failed to auto-complete catalog");
        }
      } catch {
        alert("Failed to auto-complete catalog");
      } finally {
        setIsAutoCompleting(false);
      }
    });
  }

  async function handleDelete(productId: string, productName: string) {
    const confirmText = `${copy.deleteConfirm}\n\n${productName}`;
    if (!window.confirm(confirmText)) return;

    setDeletingId(productId);
    startTransition(async () => {
      try {
        const res = await deleteProductDirectAction({ productId, locale });
        if (res.ok) {
          void revalidator.revalidate();
        } else {
          alert(res.error ?? "Failed to delete product");
        }
      } catch {
        alert("Failed to delete product");
      } finally {
        setDeletingId(null);
      }
    });
  }

  const statCards = readiness
    ? [
        { label: copy.checked, value: readiness.publishedProducts, href: `/${locale}/dashboard/catalog?published=1`, tone: "neutral" as const },
        { label: copy.missingOffers, value: readiness.missingOffers, href: `/${locale}/dashboard/catalog?problem=missingOffers`, tone: readiness.missingOffers > 0 ? ("warning" as const) : ("neutral" as const) },
        { label: copy.missingArtwork, value: readiness.missingArtwork, href: `/${locale}/dashboard/catalog?problem=missingArtwork`, tone: readiness.missingArtwork > 0 ? ("warning" as const) : ("neutral" as const) },
        { label: copy.missingCategory, value: readiness.missingCategory, href: `/${locale}/dashboard/catalog?problem=missingCategory`, tone: readiness.missingCategory > 0 ? ("warning" as const) : ("neutral" as const) },
      ]
    : [];

  const allAvailableItems = readiness?.allItems ?? readiness?.items ?? [];
  const visibleItems = readiness
    ? showAll
      ? allAvailableItems
      : readiness.items.slice(0, INITIAL_VISIBLE_COUNT)
    : [];

  return (
    <section aria-labelledby="catalog-readiness-title" className="admin-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="catalog-readiness-title" className="text-base font-bold text-[var(--ink)]">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{copy.description}</p>
        </div>
        <Link to={`/${locale}/dashboard/catalog`} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)]">{copy.viewCatalog}<ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" /></Link>
      </div>

      {readiness === null ? (
        <p role="status" className="mt-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-4 text-sm text-[var(--ink-muted)]">{copy.unavailable}</p>
      ) : readiness.publishedProducts === 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] p-4">
          <div>
            <p className="font-semibold text-[var(--ink)]">{copy.emptyTitle}</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{copy.emptyDescription}</p>
          </div>
          <Link to={`/${locale}/dashboard/catalog/new`} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]">{copy.addProduct}</Link>
        </div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statCards.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "group relative rounded-[var(--radius-control)] border p-4 transition-all duration-150 block",
                  item.tone === "warning"
                    ? "border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-surface)] hover:border-[var(--warning)] hover:shadow-xs"
                    : "border-[var(--line)] bg-[var(--surface-inset)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] hover:shadow-xs",
                )}
              >
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-medium text-[var(--ink-muted)]">{item.label}</dt>
                  <ArrowIcon direction="end" className="size-3.5 text-[var(--ink-muted)] group-hover:text-[var(--ink)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform rtl:rotate-180" />
                </div>
                <dd className={cn("mt-2 text-2xl font-bold tabular-nums", item.tone === "warning" ? "text-[var(--warning)]" : "text-[var(--ink)]")}>
                  <bdi>{number.format(item.value)}</bdi>
                </dd>
              </Link>
            ))}
          </dl>

          {readiness.needsAttention === 0 ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-[var(--success)]"><CheckIcon className="size-4 shrink-0" />{copy.complete}</p>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--ink)]">{copy.nextProducts}</h3>
                  <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                    {formatMessage(copy.showing, { shown: visibleItems.length, total: readiness.needsAttention }, locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {allAvailableItems.length > INITIAL_VISIBLE_COUNT ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((prev) => !prev)}
                      className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
                    >
                      {showAll ? copy.showLess : formatMessage(copy.showAll, { count: allAvailableItems.length }, locale)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={isAutoCompleting}
                    onClick={handleAutoComplete}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{isAutoCompleting ? copy.autoCompleting : copy.autoCompleteAction}</span>
                  </button>
                  <Link
                    to={`/${locale}/dashboard/catalog?problem=all`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-ink)] hover:opacity-90 transition-opacity"
                  >
                    <span>{copy.viewAllInCatalog}</span>
                    <ArrowIcon direction="end" className="size-3 rtl:rotate-180" />
                  </Link>
                </div>
              </div>

              <ul className="mt-3 grid gap-2">
                {visibleItems.map((item) => {
                  const isDeleting = deletingId === item.id;
                  const displayName = locale === "ar" ? item.nameAr : item.nameEn;
                  const secondaryName = locale === "ar" ? item.nameEn : item.nameAr;

                  return (
                    <li key={item.id} className={cn("transition-opacity duration-150", isDeleting && "opacity-50 pointer-events-none")}>
                      <div className="group flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] px-4 py-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]">
                        <div className="min-w-0 flex-1 basis-48 break-words">
                          <Link to={`/${locale}/dashboard/catalog/${item.id}`} className="text-sm font-semibold text-[var(--ink)] hover:text-[var(--accent-strong)] transition-colors">
                            <bdi>{displayName}</bdi>
                          </Link>
                          {secondaryName && secondaryName !== displayName ? (
                            <span className="ms-2 text-xs text-[var(--ink-muted)]" dir="ltr">
                              ({secondaryName})
                            </span>
                          ) : null}
                          {item.slug ? (
                            <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]" dir="ltr">
                              {item.slug}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {item.missingOffers ? <span className="admin-badge admin-badge-warning">{copy.missingOffers}</span> : null}
                          {item.missingCategory ? <span className="admin-badge admin-badge-neutral">{copy.missingCategory}</span> : null}
                          {item.missingArtwork ? <span className="admin-badge admin-badge-neutral">{copy.missingArtwork}</span> : null}

                          <Link
                            to={`/${locale}/dashboard/catalog/${item.id}`}
                            className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)] transition-colors"
                          >
                            <span>{copy.edit}</span>
                            <ArrowIcon direction="end" className="size-3 rtl:rotate-180" />
                          </Link>

                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDelete(item.id, displayName)}
                            title={copy.deleteProduct}
                            aria-label={`${copy.deleteProduct}: ${displayName}`}
                            className="grid size-8 place-items-center rounded-[var(--radius-control)] border border-[var(--line)] text-[var(--ink-muted)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
