import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/states";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAdminOverviewStats } from "@/lib/services/admin-overview.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-medium text-[var(--ink-faint)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] tabular-nums">
        {value === null ? "—" : value}
      </p>
    </div>
  );
}

export default async function DashboardOverviewPage({ params }: PageProps<"/[locale]/dashboard">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const stats = await getAdminOverviewStats();
  const catalogIsEmpty = (stats.games ?? 0) === 0;

  const cards = [
    { label: messages.overview.stats.games, value: stats.games },
    { label: messages.overview.stats.activeGames, value: stats.activeGames },
    { label: messages.overview.stats.offers, value: stats.offers },
    { label: messages.overview.stats.activeOffers, value: stats.activeOffers },
    { label: messages.overview.stats.orders, value: stats.orders },
    { label: messages.overview.stats.customers, value: stats.customers },
  ];

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        title={messages.overview.title}
        subtitle={messages.overview.description}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      {catalogIsEmpty ? (
        <EmptyState
          title={messages.overview.emptyCatalogTitle}
          description={messages.overview.emptyCatalogDescription}
          action={{
            href: `/${locale}/dashboard/providers`,
            label: messages.overview.goToProviders,
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`/${locale}/dashboard/catalog`}
            trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
          >
            {messages.shell.nav.games}
          </ButtonLink>
          <ButtonLink href={`/${locale}/dashboard/providers`} variant="secondary">
            {messages.shell.nav.providers}
          </ButtonLink>
          <ButtonLink href={`/${locale}/dashboard/website`} variant="ghost">
            {messages.shell.nav.website}
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
