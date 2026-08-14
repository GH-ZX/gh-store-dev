import type { Metadata } from "next";
import { ProseSections } from "@/components/content/content-blocks";
import { NoticePanel } from "@/components/shared/states";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildStorePageMetadata({
    locale,
    path: "/terms",
    title: messages.terms.title,
    description: messages.terms.description,
  });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.terms.eyebrow}
        title={messages.terms.title}
        subtitle={messages.terms.description}
      />

      <ProseSections className="mt-10" sections={messages.terms.sections} />

      <NoticePanel className="mt-10" description={messages.terms.reviewNote} />
    </Section>
  );
}
