import { Form, Link } from "react-router";
import { getLocaleDirection, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages";

export type ChromeSession = {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
} | null;

export type ChromeWalletPanel = { kind: "customer"; balance: number; currency: string } | null;

export type ChromeSocialLink = { id: string; url: string; label: string };

export type ChromeData = {
  locale: Locale;
  session: ChromeSession;
  walletPanel: ChromeWalletPanel;
  unreadCount: number;
  brandName: string;
  socialLinks: ChromeSocialLink[];
  year: number;
};

export function SiteHeader({
  locale,
  messages,
  data,
  notificationsLabel,
}: {
  locale: Locale;
  messages: CommonMessages;
  data: ChromeData;
  notificationsLabel: string;
}) {
  const { session, walletPanel, unreadCount, brandName } = data;
  const primaryItems = [
    { href: `/${locale}`, label: messages.navigation.home },
    { href: `/${locale}/games`, label: messages.navigation.games },
    { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
    { href: `/${locale}/products`, label: messages.navigation.products },
    { href: `/${locale}/sale`, label: messages.navigation.offers },
  ];
  const secondaryItems = [
    { href: `/${locale}/faq`, label: messages.links.faq },
    { href: `/${locale}/how`, label: messages.links.how },
    { href: `/${locale}/contact`, label: messages.links.contact },
  ];

  return (
    <header data-site-header className="sticky top-0 z-40 pt-3 sm:pt-5">
      <div className="mx-auto max-w-6xl px-4">
        <div
          dir="ltr"
          className="flex min-h-16 items-center gap-3 rounded-full border px-3 sm:gap-4 sm:px-4"
        >
          <Link to={`/${locale}`} className="flex shrink-0 items-center gap-2.5" aria-label={brandName}>
            <span className="font-bold">{brandName}</span>
          </Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label={messages.navigation.primaryLabel}>
            {primaryItems.map((item) => (
              <Link key={item.href} to={item.href} className="rounded-full px-3 py-2 text-sm">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            {session && walletPanel ? (
              <Link
                to={`/${locale}/wallet`}
                aria-label={messages.account.walletLabel}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold sm:px-3 sm:text-sm"
              >
                <span className="tabular-nums" dir="ltr">
                  {walletPanel.balance} {walletPanel.currency}
                </span>
              </Link>
            ) : null}
            <Link
              to={`/${locale}/search`}
              aria-label={messages.actions.search}
              className="grid size-11 shrink-0 place-items-center rounded-full border xl:hidden"
            >
              ⌕
            </Link>
            <Link
              to={locale === "ar" ? `/en` : `/ar`}
              aria-label={messages.locale.switchLabel}
              className="grid size-11 shrink-0 place-items-center rounded-full border text-sm font-bold"
            >
              {locale === "ar" ? "EN" : "ع"}
            </Link>
            <button
              type="button"
              aria-label={messages.theme.toggleLabel}
              onClick={() => {
                const root = document.documentElement;
                const next = root.dataset.theme === "dark" ? "light" : "dark";
                root.dataset.theme = next;
                try {
                  localStorage.setItem("gh-theme", next);
                } catch {}
              }}
              className="grid size-11 shrink-0 place-items-center rounded-full border"
            >
              ◐
            </button>
            <div className="hidden lg:block">
              {session ? (
                <details className="relative">
                  <summary
                    aria-label={messages.account.accountMenuLabel}
                    className="grid size-11 cursor-pointer list-none place-items-center rounded-full border font-bold"
                  >
                    {session.displayName.slice(0, 1)}
                  </summary>
                  <div className="absolute end-0 top-12 z-50 flex w-56 flex-col gap-1 rounded-lg border bg-white p-2 shadow-lg">
                    <p className="px-2 py-1 text-sm font-bold">{session.displayName}</p>
                    {session.isAdmin ? (
                      <span className="px-2 text-xs opacity-70">{messages.account.adminBadge}</span>
                    ) : null}
                    <Link to={`/${locale}/orders`} className="rounded px-2 py-1.5 text-sm">
                      {messages.account.account}
                    </Link>
                    <Link to={`/${locale}/wallet`} className="rounded px-2 py-1.5 text-sm">
                      {messages.account.openWallet}
                    </Link>
                    {session.isAdmin ? (
                      <Link to={`/${locale}/dashboard`} className="rounded px-2 py-1.5 text-sm">
                        {messages.account.dashboard}
                      </Link>
                    ) : null}
                    <Form method="post" action={`/${locale}`}>
                      <input type="hidden" name="intent" value="sign-out" />
                      <button type="submit" className="w-full rounded px-2 py-1.5 text-start text-sm">
                        {messages.account.signOut}
                      </button>
                    </Form>
                  </div>
                </details>
              ) : (
                <Link to={`/${locale}/login`} className="rounded-full border px-4 py-2 text-sm font-bold">
                  {messages.account.signIn}
                </Link>
              )}
            </div>
            <details className="lg:hidden">
              <summary
                aria-label={messages.navigation.menu}
                className="grid size-11 cursor-pointer list-none place-items-center rounded-full border"
              >
                ☰
              </summary>
              <div
                dir={getLocaleDirection(locale)}
                className="fixed inset-y-0 end-0 z-50 flex w-72 flex-col gap-1 overflow-y-auto border-s bg-white p-4"
              >
                <details>
                  <summary className="cursor-pointer rounded px-2 py-2 font-bold">
                    {messages.navigation.close} ✕
                  </summary>
                </details>
                {session ? (
                  <Link to={`/${locale}/orders`} className="rounded px-2 py-2 font-bold">
                    {session.displayName}
                    {unreadCount > 0 ? ` (${unreadCount} ${notificationsLabel})` : null}
                  </Link>
                ) : (
                  <Link to={`/${locale}/login`} className="rounded border px-2 py-2 text-center font-bold">
                    {messages.account.signIn}
                  </Link>
                )}
                {primaryItems.map((item) => (
                  <Link key={item.href} to={item.href} className="rounded px-2 py-2">
                    {item.label}
                  </Link>
                ))}
                {secondaryItems.map((item) => (
                  <Link key={item.href} to={item.href} className="rounded px-2 py-2 opacity-80">
                    {item.label}
                  </Link>
                ))}
                {session ? (
                  <Form method="post" action={`/${locale}`} className="mt-2">
                    <input type="hidden" name="intent" value="sign-out" />
                    <button type="submit" className="w-full rounded border px-2 py-2">
                      {messages.account.signOut}
                    </button>
                  </Form>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({
  locale,
  messages,
  socialLinks,
  year,
  brandName,
}: {
  locale: Locale;
  messages: CommonMessages;
  socialLinks: ChromeSocialLink[];
  year: number;
  brandName: string;
}) {
  const columns = [
    {
      heading: messages.footer.storeHeading,
      links: [
        { href: `/${locale}/games`, label: messages.navigation.games },
        { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
        { href: `/${locale}/products`, label: messages.navigation.products },
        { href: `/${locale}/sale`, label: messages.links.sale },
        { href: `/${locale}/search`, label: messages.links.search },
      ],
    },
    {
      heading: messages.footer.helpHeading,
      links: [
        { href: `/${locale}/about`, label: messages.links.about },
        { href: `/${locale}/how`, label: messages.links.how },
        { href: `/${locale}/faq`, label: messages.links.faq },
        { href: `/${locale}/contact`, label: messages.links.contact },
        { href: `/${locale}/links`, label: messages.links.social },
      ],
    },
    {
      heading: messages.footer.legalHeading,
      links: [
        { href: `/${locale}/refunds`, label: messages.links.refunds },
        { href: `/${locale}/privacy`, label: messages.links.privacy },
        { href: `/${locale}/terms`, label: messages.links.terms },
      ],
    },
  ];

  return (
    <footer data-site-footer className="relative mt-8 border-t pt-14 pb-10">
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-4">
        <div>
          <p className="font-bold">{brandName}</p>
          <p className="mt-2 text-sm opacity-70">{messages.footer.tagline}</p>
          {socialLinks.length > 0 ? (
            <>
              <p className="mt-4 text-sm font-bold">{messages.footer.followHeading}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {socialLinks.map((link) => (
                  <li key={link.id}>
                    <a href={link.url} target="_blank" rel="noopener" className="text-sm underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        {columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading}>
            <p className="text-sm font-bold">{column.heading}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-sm opacity-80">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-4 text-xs opacity-60">
        © {year} {brandName} — {messages.footer.rights}
      </p>
    </footer>
  );
}
