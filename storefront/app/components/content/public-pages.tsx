import type { Locale } from "@/i18n/config";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";
import { Link } from "react-router";
import { BRAND } from "@/lib/brand";
import { ArrowIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ContactIcon } from "@/components/ui/brand-icons";
import { EmptyState } from "@/components/shared/states";
import { FaqList } from "@/components/content/content-blocks";
import { ProseSections } from "@/components/content/content-blocks";
import { AccountHeading } from "@/components/account-ui";
import { SocialIcon } from "@/components/ui/brand-icons";
import { StepList } from "@/components/content/content-blocks";
import { getContactChannelLabel } from "@/lib/settings/public-settings";
import { getMessages } from "@/i18n/messages";
import { getSocialLinkLabel } from "@/lib/settings/public-settings";
export function AboutContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.about.eyebrow}
        title={messages.about.title}
        description={messages.about.description}
      />

      <div className="sf-content-prose-panel">
        <ProseSections sections={messages.about.sections} />
      </div>

      <p className="mt-8 text-center text-sm text-[var(--ink-muted)]">
        {BRAND.name} ·{" "}
        <Link
          to={`/${locale}/privacy`}
          className="font-semibold text-[var(--accent)] underline decoration-[var(--line)] underline-offset-4 transition-colors duration-[var(--duration)] hover:text-[var(--accent-strong)]"
        >
          {messages.about.privacyLabel}
        </Link>
      </p>
    </section>
  );
}
export function FaqContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.faq.eyebrow}
        title={messages.faq.title}
        description={messages.faq.description}
      />

      <div className="sf-content-columns">
        <FaqList items={messages.faq.items} />

        <aside className="sf-content-aside">
          <h2 className="text-base font-semibold text-[var(--ink)]">
            {messages.contact.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
            {messages.contact.description}
          </p>
          <ButtonLink
            href={`/${locale}/contact`}
            variant="secondary"
            className="mt-5"
            fullWidth
            trailingIcon={
              <ArrowIcon direction="end" className="rtl:rotate-180" />
            }
          >
            {common.links.contact}
          </ButtonLink>
        </aside>
      </div>
    </section>
  );
}

export function HowContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  return (
    <>
      <section className="sf-content-page">
        <AccountHeading
          eyebrow={messages.how.eyebrow}
          title={messages.how.title}
          description={messages.how.description}
        />
        <div className="mt-6">
          <StepList steps={messages.how.steps} />
        </div>
      </section>

      <section className="sf-content-page sf-content-page--continuation">
        <div className="sf-content-panel">
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {messages.how.assuranceHeading}
          </h2>
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
              trailingIcon={
                <ArrowIcon direction="end" className="rtl:rotate-180" />
              }
            >
              {common.navigation.games}
            </ButtonLink>
            <ButtonLink href={`/${locale}/faq`} variant="secondary">
              {common.links.faq}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

export function ContactContent({
  locale,
  settings,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  const channels = settings.contactChannels;
  const note =
    (locale === "ar" ? settings.contactNoteAr : settings.contactNoteEn) ||
    messages.contact.orderNote;

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.contact.eyebrow}
        title={messages.contact.title}
        description={messages.contact.description}
      />

      <div className="sf-content-columns">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
            {messages.contact.channelsHeading}
          </h2>

          {channels.length === 0 ? (
            <EmptyState
              className="mt-5"
              title={messages.contact.emptyTitle}
              description={messages.contact.emptyDescription}
              action={{
                href: `/${locale}/support`,
                label: common.links.support,
              }}
            />
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => {
                const label = getContactChannelLabel(channel, locale);

                const body = (
                  <>
                    {/*
                     * The mark carries the kind, so a customer scanning the
                     * grid finds WhatsApp by its shape rather than by reading
                     * four labels. It is not the label: the name is right
                     * beside it, which is what a screen reader announces.
                     */}
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--shell)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] group-hover:text-[var(--accent)] [&>svg]:size-4.5"
                      aria-hidden="true"
                    >
                      <ContactIcon kind={channel.kind} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">
                        {label}
                      </span>
                      <span
                        className="mt-1 block truncate text-sm text-[var(--ink-muted)]"
                        dir="ltr"
                      >
                        {channel.value}
                      </span>
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
                        <span className="flex min-w-0 items-center gap-3">
                          {body}
                        </span>
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                          aria-hidden="true"
                        >
                          <ArrowIcon
                            direction="end"
                            className="size-3.5 rtl:rotate-180"
                          />
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="sf-content-aside">
          <Badge tone="accent" icon={<InfoIcon />}>
            {common.actions.details}
          </Badge>
          <p className="mt-4 text-sm leading-7 text-[var(--ink-soft)]">
            {note}
          </p>
        </aside>
      </div>
    </section>
  );
}

export function LinksContent({
  locale,
  settings,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.links.eyebrow}
        title={messages.links.title}
        description={messages.links.description}
      />

      {settings.socialLinks.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.links.emptyTitle}
          description={messages.links.emptyDescription}
          action={{ href: `/${locale}/contact`, label: common.links.contact }}
        />
      ) : (
        <ul className="sf-content-social-list">
          {settings.socialLinks.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="sf-content-social-link group"
              >
                {/*
                 * Two glyphs on one row, saying different things: the mark at
                 * the start is which app this opens, the arrow at the end is
                 * that it leaves the store. Both earn their place on a row this
                 * wide, where a lone label would float in the middle of it.
                 */}
                <SocialIcon
                  platform={link.platform}
                  className="size-5 shrink-0 text-[var(--ink-soft)] transition-colors duration-[var(--duration)] group-hover:text-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate">
                  {getSocialLinkLabel(link, locale)}
                </span>
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
                  aria-hidden="true"
                >
                  <ArrowIcon
                    direction="end"
                    className="size-4 -rotate-45 rtl:rotate-[225deg]"
                  />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrivacyContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.privacy.eyebrow}
        title={messages.privacy.title}
        description={messages.privacy.description}
      />

      <ProseSections
        className="sf-content-prose-panel"
        sections={messages.privacy.sections}
      />
    </section>
  );
}

export function TermsContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.terms.eyebrow}
        title={messages.terms.title}
        description={messages.terms.description}
      />

      <ProseSections
        className="sf-content-prose-panel"
        sections={messages.terms.sections}
      />
    </section>
  );
}

export function RefundsContent({
  locale,
}: {
  locale: Locale;
  settings: PublicStoreSettings;
}) {
  const messages = getMessages(locale, "content");

  return (
    <section className="sf-content-page">
      <AccountHeading
        eyebrow={messages.refunds.eyebrow}
        title={messages.refunds.title}
        description={messages.refunds.description}
      />

      <ProseSections
        className="sf-content-prose-panel"
        sections={messages.refunds.sections}
      />
    </section>
  );
}
