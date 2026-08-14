import type { Metadata } from "next";
import Link from "next/link";
import { AdminCard } from "@/components/admin/admin-form";
import { GameCreateForm } from "@/components/admin/game-create-form";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A game that no supplier carries.
 *
 * Its own page rather than a panel on the list: creating is not something an
 * operator does while scanning a catalog, and a form permanently occupying the
 * top of the list would be in the way of the thing they came for.
 */
export default async function NewGamePage({
  params,
}: PageProps<"/[locale]/dashboard/catalog/new">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").catalog;

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/catalog`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.backToCatalog}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.eyebrow}
          title={messages.create.title}
          subtitle={messages.create.description}
          className="mt-5"
        />
      </div>

      <AdminCard title={messages.create.formTitle} description={messages.create.formDescription}>
        <GameCreateForm locale={locale} messages={messages.create} errors={messages.errors} />
      </AdminCard>
    </div>
  );
}
