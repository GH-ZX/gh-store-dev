import type { Metadata } from "next";
import { FaqList } from "@/components/content/content-blocks";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/faq">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildPageMetadata({
    locale,
    path: "/faq",
    title: messages.faq.title,
    description: messages.faq.description,
  });
}

export default async function FaqPage({ params }: PageProps<"/[locale]/faq">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.faq.eyebrow}
        title={messages.faq.title}
        subtitle={messages.faq.description}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-start">
        <FaqList items={messages.faq.items} />

        <aside className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 lg:sticky lg:top-28">
          <h2 className="text-base font-semibold text-[var(--ink)]">{messages.contact.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
            {messages.contact.description}
          </p>
          <ButtonLink
            href={`/${locale}/contact`}
            variant="secondary"
            className="mt-5"
            fullWidth
            trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
          >
            {common.links.contact}
          </ButtonLink>
        </aside>
      </div>
    </Section>
  );
}
