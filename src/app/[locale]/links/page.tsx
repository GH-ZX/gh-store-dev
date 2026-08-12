import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/states";
import { ArrowIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getPublicStoreSettings } from "@/lib/services/settings.service";
import { getSocialLinkLabel } from "@/lib/settings/public-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/links">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "content");

  return buildPageMetadata({
    locale,
    path: "/links",
    title: messages.links.title,
    description: messages.links.description,
  });
}

export default async function LinksPage({ params }: PageProps<"/[locale]/links">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");
  const settings = await getPublicStoreSettings();

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        align="center"
        eyebrow={messages.links.eyebrow}
        title={messages.links.title}
        subtitle={messages.links.description}
      />

      {settings.socialLinks.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.links.emptyTitle}
          description={messages.links.emptyDescription}
          action={{ href: `/${locale}/contact`, label: common.links.contact }}
        />
      ) : (
        <ul className="mx-auto mt-10 grid w-full max-w-xl gap-3">
          {settings.socialLinks.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex min-h-14 items-center justify-between gap-4 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-5 text-[0.9375rem] font-semibold text-[var(--ink)] shadow-[var(--elevation-1)] transition-[border-color,transform,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--elevation-2)]"
              >
                {getSocialLinkLabel(link, locale)}
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                  aria-hidden="true"
                >
                  <ArrowIcon direction="end" className="size-4 -rotate-45 rtl:rotate-[225deg]" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
