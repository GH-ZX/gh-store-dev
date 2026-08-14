import Link from "next/link";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SocialIcon } from "@/components/ui/brand-icons";
import type { Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages";
import { BRAND } from "@/lib/brand";
import { getSocialLinkLabel, type SocialLink } from "@/lib/settings/public-settings";

/**
 * Storefront footer.
 *
 * Social links come from store settings, so the column is omitted entirely when
 * an admin has not configured any — an empty "Follow us" heading is worse than
 * no heading.
 */
export type SiteFooterProps = {
  locale: Locale;
  messages: CommonMessages;
  socialLinks: SocialLink[];
  year: number;
};

export function SiteFooter({ locale, messages, socialLinks, year }: SiteFooterProps) {
  const columns = [
    {
      heading: messages.footer.storeHeading,
      links: [
        { href: `/${locale}/games`, label: messages.navigation.games },
        { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
        { href: `/${locale}/sale`, label: messages.links.sale },
        { href: `/${locale}/search`, label: messages.links.search },
      ],
    },
    {
      heading: messages.footer.helpHeading,
      links: [
        { href: `/${locale}/how`, label: messages.links.how },
        { href: `/${locale}/faq`, label: messages.links.faq },
        { href: `/${locale}/contact`, label: messages.links.contact },
        /*
         * Beside Contact rather than instead of it. Contact is the public
         * address book — WhatsApp, Telegram, whoever is on the other end. This
         * is a thread against the customer's own account, which is the one that
         * leaves a record, so it needs a sign-in and cannot replace the other.
         */
        { href: `/${locale}/support`, label: messages.links.support },
        { href: `/${locale}/links`, label: messages.links.social },
      ],
    },
    {
      heading: messages.footer.legalHeading,
      links: [
        { href: `/${locale}/privacy`, label: messages.links.privacy },
        { href: `/${locale}/terms`, label: messages.links.terms },
      ],
    },
  ];

  return (
    <footer data-site-footer className="relative mt-8 border-t border-[var(--line)] pt-14 pb-10">
      <div className="gh-mesh opacity-60" aria-hidden="true" />
      <div className="gh-page relative">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div className="max-w-sm">
            <Link href={`/${locale}`} className="flex items-center gap-2.5" aria-label={BRAND.name}>
              <span
                className="grid size-9 place-items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-strong)] text-xs font-bold text-[var(--accent-strong)]"
                aria-hidden="true"
              >
                GH
              </span>
              <span className="text-base font-semibold tracking-tight text-[var(--ink)]">{BRAND.name}</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-muted)]">{messages.footer.tagline}</p>
            <Suspense fallback={null}>
              <div className="mt-6 sm:hidden">
                <LocaleSwitcher locale={locale} labels={messages.locale} />
              </div>
            </Suspense>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
                {column.heading}
              </h2>
              <ul className="mt-4 grid gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {socialLinks.length > 0 ? (
          <div className="mt-12 border-t border-[var(--line)] pt-8">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
              {messages.footer.followHeading}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {socialLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                  >
                    {/*
                     * The mark leads and nothing trails. A pill this size can
                     * carry one glyph before it starts looking like a toolbar,
                     * and the mark is the more useful of the two: it says which
                     * app opens, where an arrow only repeats that a link is a
                     * link.
                     */}
                    <SocialIcon
                      platform={link.platform}
                      className="size-4 shrink-0 text-[var(--ink-faint)] transition-colors duration-[var(--duration)] group-hover:text-[var(--accent)]"
                    />
                    {getSocialLinkLabel(link, locale)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--line)] pt-6 text-xs text-[var(--ink-faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {BRAND.name}. {messages.footer.rights}
          </p>
          <p>{messages.footer.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
