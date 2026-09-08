import type { Metadata } from "next";
import { ProseSections } from "@/components/content/content-blocks";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/refunds">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildStorePageMetadata({
    locale,
    path: "/refunds",
    title: messages.refunds.title,
    description: messages.refunds.description,
  });
}

export default async function RefundsPage({ params }: PageProps<"/[locale]/refunds">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.refunds.eyebrow}
        title={messages.refunds.title}
        subtitle={messages.refunds.description}
      />

      <ProseSections className="mt-10" sections={messages.refunds.sections} />

    </Section>
  );
}
