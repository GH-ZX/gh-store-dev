import type { Metadata } from "next";
import { StepList } from "@/components/content/content-blocks";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon, CheckIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/how">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildPageMetadata({
    locale,
    path: "/how",
    title: messages.how.title,
    description: messages.how.description,
  });
}

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/how">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  return (
    <>
      <Section spacing="page" mesh>
        <SectionHeader
          as="h1"
          eyebrow={messages.how.eyebrow}
          title={messages.how.title}
          subtitle={messages.how.description}
        />
        <StepList steps={messages.how.steps} />
      </Section>

      <Section spacing="tight">
        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold text-[var(--ink)]">{messages.how.assuranceHeading}</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {messages.how.assurances.map((assurance) => (
              <li
                key={assurance}
                className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--ink-soft)]"
              >
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                {assurance}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href={`/${locale}/games`}
              trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
            >
              {common.navigation.games}
            </ButtonLink>
            <ButtonLink href={`/${locale}/faq`} variant="secondary">
              {common.links.faq}
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
