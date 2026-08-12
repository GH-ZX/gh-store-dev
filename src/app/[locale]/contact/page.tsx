import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, InfoIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getPublicStoreSettings } from "@/lib/services/settings.service";
import { getContactChannelLabel } from "@/lib/settings/public-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildPageMetadata({
    locale,
    path: "/contact",
    title: messages.contact.title,
    description: messages.contact.description,
  });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");
  const settings = await getPublicStoreSettings();

  const channels = settings.contactChannels;
  const note = (locale === "ar" ? settings.contactNoteAr : settings.contactNoteEn) || messages.contact.orderNote;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.contact.eyebrow}
        title={messages.contact.title}
        subtitle={messages.contact.description}
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
            {messages.contact.channelsHeading}
          </h2>

          {channels.length === 0 ? (
            <EmptyState
              className="mt-5"
              title={messages.contact.emptyTitle}
              description={messages.contact.emptyDescription}
              action={{ href: `/${locale}/faq`, label: common.links.faq }}
            />
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => {
                const label = getContactChannelLabel(channel, locale);

                const body = (
                  <>
                    <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
                    <span className="mt-1 block truncate text-sm text-[var(--ink-muted)]" dir="ltr">
                      {channel.value}
                    </span>
                  </>
                );

                return (
                  <li key={channel.id}>
                    {channel.href ? (
                      <a
                        href={channel.href}
                        rel="noreferrer noopener"
                        className="group flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                      >
                        <span className="min-w-0">{body}</span>
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                          aria-hidden="true"
                        >
                          <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
                        </span>
                      </a>
                    ) : (
                      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
          <Badge tone="accent" icon={<InfoIcon />}>
            {common.actions.details}
          </Badge>
          <p className="mt-4 text-sm leading-7 text-[var(--ink-soft)]">{note}</p>
        </aside>
      </div>
    </Section>
  );
}
