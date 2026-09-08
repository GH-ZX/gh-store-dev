import { Form, Link, NavLink, useLocation } from "react-router";
import { useRef } from "react";
import { type Locale } from "@/i18n/config";
import { getMessages, type CommonMessages } from "@/i18n/messages";
import type { ChromeData } from "@/components/site-chrome";
export { getStorefrontThemeStyle } from "@/lib/storefront-theme";
import { SocialIcon } from "@/components/ui/brand-icons";
import { getSocialLinkLabel } from "@/lib/settings/public-settings";
import { SearchField } from "@/components/search/search-field";
import {
  GridIcon,
  GamepadIcon,
  CardIcon,
  SparkIcon,
  TagIcon,
} from "@/components/ui/icons";
import { formatPrice } from "@/lib/format/money";
import { parseSearchParams } from "@/lib/catalog/search";
import {
  HeaderShell,
  HeaderActions,
  HeaderMobileDrawer,
  StorefrontBrand,
  ThemeToggle,
} from "./header-base";
export { StorefrontBrand, ThemeToggle };

export function StorefrontHeader({
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
  const location = useLocation();
  const drawer = useRef<HTMLDialogElement>(null);
  const search = getMessages(locale, "search");
  const currentSearch = location.pathname === `/${locale}/search`
    ? parseSearchParams(Object.fromEntries(new URLSearchParams(location.search)))
    : { query: "", filter: "all" as const };
  const primaryItems = [
    {
      href: `/${locale}/products`,
      label: messages.navigation.allProducts,
      icon: GridIcon,
    },
    {
      href: `/${locale}/games`,
      label: messages.navigation.games,
      icon: GamepadIcon,
    },
    {
      href: `/${locale}/gift-cards`,
      label: messages.navigation.giftCards,
      icon: CardIcon,
    },
    {
      href: `/${locale}/ai`,
      label: messages.navigation.aiSubscriptions,
      icon: SparkIcon,
    },
    {
      href: `/${locale}/sale`,
      label: messages.navigation.offers,
      icon: TagIcon,
    },
  ];
  const accountItems = [
    { href: `/${locale}/profile`, label: messages.account.account },
    {
      href: `/${locale}/orders`,
      label: messages.account.orders,
    },
    { href: `/${locale}/wallet`, label: messages.account.openWallet },
    {
      href: `/${locale}/notifications`,
      label: notificationsLabel + (unreadCount ? ` (${unreadCount})` : ""),
    },
    { href: `/${locale}/support`, label: messages.links.support },
    ...(session?.isAdmin
      ? [{ href: `/${locale}/dashboard`, label: messages.account.dashboard }]
      : []),
  ];
  const secondaryItems = [
    { href: `/${locale}/faq`, label: messages.links.faq },
    { href: `/${locale}/about`, label: messages.links.about },
    { href: `/${locale}/contact`, label: messages.links.contact },
    { href: `/${locale}/privacy`, label: messages.links.privacy },
    { href: `/${locale}/terms`, label: messages.links.terms },
  ];

  const signOut = (
    <Form method="post" action={`/${locale}`}>
      <input type="hidden" name="intent" value="sign-out" />
      <button
        className="min-h-11 w-full rounded-xl px-3 text-start text-sm text-[var(--danger)] hover:bg-[var(--surface-strong)] cursor-pointer"
        type="submit"
      >
        {messages.account.signOut}
      </button>
    </Form>
  );

  const searchLabels = {
    fieldLabel: search.fieldLabel,
    placeholder: messages.actions.searchPlaceholder,
    submit: search.submit,
    clear: search.clear,
    suggestionsLabel: search.suggestionsLabel,
  };

  const centerSearch = (
    <SearchField
      key={`desktop:${locale}:${currentSearch.query}:${currentSearch.filter}`}
      locale={locale}
      defaultQuery={currentSearch.query}
      filter={currentSearch.filter}
      size="sm"
      className="sf-header-search sf-search"
      labels={searchLabels}
    />
  );

  const storefrontSubnav = (
    <>
      <div className="gh-page sf-mobile-search">
        <SearchField
          key={`mobile:${locale}:${currentSearch.query}:${currentSearch.filter}`}
          locale={locale}
          defaultQuery={currentSearch.query}
          filter={currentSearch.filter}
          size="sm"
          className="sf-search"
          labels={searchLabels}
        />
      </div>
      <div className="sf-category-bar">
        <nav
          className="gh-page sf-category-nav"
          aria-label={messages.navigation.primaryLabel}
        >
          {primaryItems.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) =>
                `sf-category-link${isActive ? " is-active" : ""}`
              }
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );

  const drawerContent = (
    <>
      <div className="my-5 border-y py-4">
        {session ? (
          <>
            <Link
              to={`/${locale}/profile`}
              className="block text-lg font-semibold"
              onClick={() => drawer.current?.close()}
            >
              <bdi>{session.displayName}</bdi>
            </Link>
            <p className="mt-1 truncate text-sm text-[var(--ink-muted)]">
              <bdi>{session.email}</bdi>
            </p>
            {walletPanel ? (
              <Link
                to={`/${locale}/wallet`}
                onClick={() => drawer.current?.close()}
                className="mt-3 flex justify-between rounded-xl bg-[var(--surface)] p-3"
              >
                <span>{messages.account.walletLabel}</span>
                <bdi dir="ltr">
                  {formatPrice(
                    walletPanel.balance,
                    walletPanel.currency,
                    locale,
                  )}
                </bdi>
              </Link>
            ) : null}
          </>
        ) : (
          <Link
            to={`/${locale}/login`}
            onClick={() => drawer.current?.close()}
            className="flex min-h-11 justify-center rounded-full bg-[var(--accent)] p-3 font-semibold text-[var(--accent-ink)]"
          >
            {messages.account.signIn}
          </Link>
        )}
      </div>
      <nav
        aria-label={messages.navigation.mobileLabel}
        className="grid gap-1"
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={() => drawer.current?.close()}
            className={({ isActive }) =>
              `rounded-xl px-3 py-3 font-medium ${isActive ? "bg-[var(--surface-strong)] text-[var(--accent)]" : "hover:bg-[var(--surface)]"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {session ? (
        <nav className="mt-4 grid gap-1 border-t pt-4">
          {accountItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => drawer.current?.close()}
              className="rounded-xl px-3 py-3 text-sm hover:bg-[var(--surface)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <nav className="mt-4 grid gap-1 border-t pt-4">
        {secondaryItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => drawer.current?.close()}
            className="rounded-xl px-3 py-3 text-sm text-[var(--ink-muted)]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );

  const drawerFooter = (
    <div className="mt-4 flex items-center justify-between border-t pt-4">
      <ThemeToggle label={messages.theme.toggleLabel} />
      {session ? signOut : null}
    </div>
  );

  return (
    <HeaderShell
      locale={locale}
      brandName={brandName}
      loadingLabel={messages.states.loading}
      center={centerSearch}
      actions={
        <HeaderActions
          locale={locale}
          unreadCount={unreadCount}
          notificationsLabel={notificationsLabel}
          switchLocaleLabel={messages.locale.switchLabel}
          themeToggleLabel={messages.theme.toggleLabel}
          walletPanel={walletPanel}
          session={session}
          accountItems={accountItems}
          signedInAsLabel={locale === "ar" ? "مسجل الدخول كـ" : "Signed in as"}
          accountMenuLabel={messages.account.accountMenuLabel}
          onOpenDrawer={() => drawer.current?.showModal()}
          openDrawerLabel={messages.navigation.menu}
        />
      }
      subnav={storefrontSubnav}
      drawer={
        <HeaderMobileDrawer
          dialogRef={drawer}
          locale={locale}
          brandName={brandName}
          footer={drawerFooter}
        >
          {drawerContent}
        </HeaderMobileDrawer>
      }
    />
  );
}


export function StorefrontFooter({
  locale,
  messages,
  data,
}: {
  locale: Locale;
  messages: CommonMessages;
  data: ChromeData;
}) {
  const columns = [
    {
      title: messages.footer.storeHeading,
      links: [
        { href: `/${locale}/products`, label: messages.navigation.products },
        { href: `/${locale}/games`, label: messages.navigation.games },
        { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
        { href: `/${locale}/sale`, label: messages.navigation.offers },
        { href: `/${locale}/search`, label: messages.links.search },
      ],
    },
    {
      title: messages.footer.helpHeading,
      links: [
        { href: `/${locale}/about`, label: messages.links.about },
        { href: `/${locale}/how`, label: messages.links.how },
        { href: `/${locale}/faq`, label: messages.links.faq },
        { href: `/${locale}/contact`, label: messages.links.contact },
        { href: `/${locale}/support`, label: messages.links.support },
      ],
    },
    {
      title: messages.footer.legalHeading,
      links: [
        { href: `/${locale}/refunds`, label: messages.links.refunds },
        { href: `/${locale}/privacy`, label: messages.links.privacy },
        { href: `/${locale}/terms`, label: messages.links.terms },
      ],
    },
  ];
  return (
    <footer data-site-footer className="sf-site-footer">
      <div className="gh-page">
        <div className="sf-footer-columns">
          <div className="sf-footer-brand">
            <Link to={`/${locale}`} aria-label={data.brandName}>
              <StorefrontBrand name={data.brandName} />
            </Link>
            <p>{messages.footer.tagline}</p>
            {data.socialLinks.length ? (
              <nav
                className="sf-footer-social"
                aria-label={messages.footer.followHeading}
              >
                {data.socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={getSocialLinkLabel(link, locale)}
                    title={getSocialLinkLabel(link, locale)}
                  >
                    <SocialIcon platform={link.platform} />
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="sf-footer-bottom">
          <p>
            © {data.year} {data.brandName}. {messages.footer.rights}
          </p>
          <Link to={`/${locale}/links`}>{messages.links.social}</Link>
        </div>
      </div>
    </footer>
  );
}
