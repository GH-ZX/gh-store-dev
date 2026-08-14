import type { Metadata } from "next";
import { ProseSections } from "@/components/content/content-blocks";
import { NoticePanel } from "@/components/shared/states";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildStorePageMetadata({
    locale,
    path: "/privacy",
    title: messages.privacy.title,
    description: messages.privacy.description,
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.privacy.eyebrow}
        title={messages.privacy.title}
        subtitle={messages.privacy.description}
      />

      <ProseSections className="mt-10" sections={messages.privacy.sections} />

      <NoticePanel className="mt-10" description={messages.privacy.reviewNote} />
    </Section>
  );
}
