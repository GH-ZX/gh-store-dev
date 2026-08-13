import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, SearchIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { listAdminCustomers } from "@/lib/services/admin-customers.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/customers">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").customers;
  const query = await searchParams;
  const term = typeof query.q === "string" ? query.q : "";
  const customers = await listAdminCustomers({ query: term });

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      {/* A real GET form, so a search is a shareable URL and needs no JavaScript. */}
      <form method="get" className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4">
          <SearchIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only">{messages.searchLabel}</span>
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder={messages.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)]"
        >
          {messages.searchLabel}
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState title={messages.emptyTitle} description={messages.emptyDescription} />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.countLabel, { count: customers.length }, locale)}
          </p>

          <ul className="grid gap-2">
            {customers.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/${locale}/dashboard/customers/${customer.id}`}
                  className="group flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--ink)]">
                        {customer.fullName || customer.username || customer.email}
                      </span>
                      {customer.role === "admin" ? (
                        <Badge tone="accent">{messages.roleAdmin}</Badge>
                      ) : null}
                      <Badge tone={customer.isActive ? "success" : "danger"}>
                        {customer.isActive ? messages.statusActive : messages.statusSuspended}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--ink-muted)]" dir="ltr">
                      {customer.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-end">
                      <p className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                        {formatPrice(customer.balance, customer.currency, locale)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                        {customer.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                      aria-hidden="true"
                    >
                      <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
