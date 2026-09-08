import { Link } from "react-router";
import { ArrowIcon, CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import type { CatalogReadiness } from "@server/lib/services/admin-readiness.service";

export function OverviewReadiness({ locale, readiness }: { locale: Locale; readiness: CatalogReadiness | null }) {
  const copy = getMessages(locale, "admin").overview.readiness;
  const number = new Intl.NumberFormat(locale);

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
            {[
              { label: copy.checked, value: readiness.publishedProducts },
              { label: copy.missingOffers, value: readiness.missingOffers },
              { label: copy.missingArtwork, value: readiness.missingArtwork },
              { label: copy.missingCategory, value: readiness.missingCategory },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] px-4 py-3">
                <dt className="text-sm text-[var(--ink-muted)]">{item.label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--ink)] tabular-nums"><bdi>{number.format(item.value)}</bdi></dd>
              </div>
            ))}
          </dl>

          {readiness.needsAttention === 0 ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-[var(--success)]"><CheckIcon className="size-4 shrink-0" />{copy.complete}</p>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--ink)]">{copy.nextProducts}</h3>
                <p className="text-xs text-[var(--ink-muted)]">{formatMessage(copy.showing, { shown: readiness.items.length, total: readiness.needsAttention }, locale)}</p>
              </div>
              <ul className="mt-3 grid gap-2">
                {readiness.items.map((item) => (
                  <li key={item.id}>
                    <Link to={`/${locale}/dashboard/catalog/${item.id}`} className="group flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-inset)] px-4 py-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-strong)]">
                      <span className="min-w-0 flex-1 basis-40 break-words text-sm font-semibold text-[var(--ink)]"><bdi>{locale === "ar" ? item.nameAr : item.nameEn}</bdi></span>
                      <span className="flex flex-wrap items-center gap-2">
                        {item.missingOffers ? <span className="admin-badge admin-badge-warning">{copy.missingOffers}</span> : null}
                        {item.missingCategory ? <span className="admin-badge admin-badge-neutral">{copy.missingCategory}</span> : null}
                        {item.missingArtwork ? <span className="admin-badge admin-badge-neutral">{copy.missingArtwork}</span> : null}
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]">{copy.edit}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
