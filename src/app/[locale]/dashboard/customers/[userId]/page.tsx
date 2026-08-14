import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerAccessForm } from "@/components/admin/customer-access-form";
import { WalletAdjustForm } from "@/components/admin/wallet-adjust-form";
import { Badge } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAdminCustomer } from "@/lib/services/admin-customers.service";
import { getSessionSummary } from "@/lib/services/session.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerDetailPage({
  params,
}: PageProps<"/[locale]/dashboard/customers/[userId]">) {
  const locale = await resolveLocaleParam(params);
  const { userId } = await params;
  const messages = getMessages(locale, "admin").customers;
  const account = getMessages(locale, "account");
  // Needed to refuse the one change an administrator must not make to their own
  // account: the page that would undo it is the one it takes away.
  const [detail, viewer] = await Promise.all([getAdminCustomer(userId), getSessionSummary()]);

  if (!detail) {
    notFound();
  }

  const { customer, transactions } = detail;

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/customers`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.title}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.eyebrow}
          title={customer.fullName || customer.username || customer.email || customer.id}
          className="mt-5"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={customer.isActive ? "success" : "danger"}>
            {customer.isActive ? messages.statusActive : messages.statusSuspended}
          </Badge>
          {customer.role === "admin" ? <Badge tone="accent">{messages.roleAdmin}</Badge> : null}
          <span className="text-xs text-[var(--ink-muted)]" dir="ltr">
            {customer.email}
          </span>
          <span className="text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
            {messages.columnJoined}: {customer.createdAt.slice(0, 10)}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-6">
          <WalletAdjustForm locale={locale} messages={messages} userId={customer.id} />

          <CustomerAccessForm
            locale={locale}
            messages={messages}
            userId={customer.id}
            isSelf={customer.id === viewer?.userId}
            isAdmin={customer.role === "admin"}
            isActive={customer.isActive}
          />

          <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {messages.recentTransactions}
            </h2>

            {transactions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                {account.wallet.emptyDescription}
              </p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {transactions.map((transaction) => {
                  const isCredit = transaction.amount > 0;

                  return (
                    <li
                      key={transaction.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={isCredit ? "success" : "neutral"}>
                            {account.wallet.types[transaction.type]}
                          </Badge>
                          <time
                            className="text-xs text-[var(--ink-faint)] tabular-nums"
                            dateTime={transaction.createdAt}
                            dir="ltr"
                          >
                            {transaction.createdAt.slice(0, 16).replace("T", " ")}
                          </time>
                        </div>
                        {transaction.description ? (
                          <p className="mt-1.5 truncate text-xs text-[var(--ink-muted)]">
                            {transaction.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-end" dir="ltr">
                        <p
                          className={
                            isCredit
                              ? "text-sm font-semibold text-[var(--success)] tabular-nums"
                              : "text-sm font-semibold text-[var(--ink)] tabular-nums"
                          }
                        >
                          {isCredit ? "+" : "−"}
                          {formatPrice(Math.abs(transaction.amount), customer.currency, locale)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums">
                          {formatPrice(transaction.balanceAfter, customer.currency, locale)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.columnBalance}</p>
          <p
            className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] leading-none font-semibold tracking-tight text-[var(--ink)] tabular-nums"
            dir="ltr"
          >
            {formatPrice(customer.balance, customer.currency, locale)}
          </p>
        </div>
      </div>
    </div>
  );
}
