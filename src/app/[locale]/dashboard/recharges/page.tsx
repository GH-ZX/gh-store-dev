import type { Metadata } from "next";
import { RechargeReviewCard, RechargeSettingsForm } from "@/components/admin/recharge-review";
import { EmptyState } from "@/components/shared/states";
import { AdminCard } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getRechargeQueues } from "@/lib/services/admin-recharge.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RechargesPage({
  params,
}: PageProps<"/[locale]/dashboard/recharges">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").recharges;
  const rechargeCopy = getMessages(locale, "recharge");
  const { open, settled, autoApprove, config } = await getRechargeQueues();

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <RechargeSettingsForm
        locale={locale}
        messages={messages}
        autoApprove={autoApprove}
        minAmount={config.minAmount}
        maxAmount={config.maxAmount}
      />

      <section>
        <h2 className="text-base font-semibold text-[var(--ink)]">{messages.openTitle}</h2>

        {open.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={messages.emptyTitle}
            description={messages.emptyDescription}
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {open.map((request) => (
              <RechargeReviewCard
                key={request.id}
                locale={locale}
                messages={messages}
                request={request}
              />
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 ? (
        <AdminCard title={messages.settledTitle}>
          <ul className="grid gap-2">
            {settled.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--ink)]">
                    {request.customer.name || request.customer.email}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
                    {request.reference}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--ink)] tabular-nums" dir="ltr">
                    {formatPrice(
                      request.creditedAmount ?? request.requestedAmount,
                      request.currency,
                      locale,
                    )}
                  </span>
                  <Badge tone={request.status === "approved" ? "success" : "danger"}>
                    {rechargeCopy.statuses[request.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </div>
  );
}
