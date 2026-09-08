import type { Metadata } from "next";
import Link from "next/link";
import { ProseSections } from "@/components/content/content-blocks";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { BRAND } from "@/lib/brand";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";

/**
 * A plain, server-rendered "about" page that states what GH Store is, who it
 * is for, and how it handles data, with a link to the privacy policy.
 *
 * This page doubles as the brand-review target: Google's automated branding
 * check reads the visible H1 and the surrounding copy to match the app name
 * on the OAuth consent screen and to confirm the purpose is explained. The
 * content is static HTML — no client components, no scroll-triggered
 * animations, nothing hidden from a renderer that does not run JavaScript.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildStorePageMetadata({
    locale,
    path: "/about",
    title: messages.about.title,
    description: messages.about.description,
  });
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.about.eyebrow}
        title={messages.about.title}
        subtitle={messages.about.description}
      />

      <div className="mx-auto mt-10 max-w-3xl">
        <ProseSections sections={messages.about.sections} />
      </div>

      <p className="mt-8 text-center text-sm text-[var(--ink-muted)]">
        {BRAND.name} ·{" "}
        <Link
          href={`/${locale}/privacy`}
          className="font-semibold text-[var(--accent)] underline decoration-[var(--line)] underline-offset-4 transition-colors duration-[var(--duration)] hover:text-[var(--accent-strong)]"
        >
          {messages.about.privacyLabel}
        </Link>
      </p>
    </Section>
  );
}