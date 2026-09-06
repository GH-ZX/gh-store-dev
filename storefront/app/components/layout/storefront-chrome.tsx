import { createPortal } from "react-dom";
import { Form, Link, NavLink, useLocation, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { getLocaleDirection, type Locale } from "@/i18n/config";
import { getMessages, type CommonMessages } from "@/i18n/messages";
import type { ChromeData } from "@/components/site-chrome";
import { getStorefrontThemeStyle } from "@/lib/storefront-theme";
export { getStorefrontThemeStyle } from "@/lib/storefront-theme";
import { SocialIcon } from "@/components/ui/brand-icons";
import { getSocialLinkLabel } from "@/lib/settings/public-settings";
import { SearchField } from "@/components/search/search-field";
import {
  SearchIcon,
  GridIcon,
  GamepadIcon,
  CardIcon,
  SparkIcon,
  TagIcon,
  UserIcon,
  CloseIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { formatPrice } from "@/lib/format/money";

const control = "sf-control";
function ThemeToggle({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={control}
      aria-label={label}
      onClick={() => {
        const next =
          document.documentElement.dataset.theme === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("gh-store-theme", next);
        } catch {}
      }}
    >
      <SunIcon className="gh-only-dark" />
      <MoonIcon className="gh-only-light" />
    </button>
  );
}

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
  const navigation = useNavigation();
  const drawer = useRef<HTMLDialogElement>(null);
  const account = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const [accountPopover, setAccountPosition] = useState<{
    top: number;
    right: number;
    locationKey: string;
  } | null>(null);
  const accountPosition =
    accountPopover?.locationKey === location.key ? accountPopover : null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const search = getMessages(locale, "search");
  const primaryItems = [
    {
      href: `/${locale}/products`,
      label: locale === "ar" ? "جميع المنتجات" : "All products",
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
      label:
        locale === "ar" ? "الذكاء الاصطناعي والاشتراكات" : "AI & subscriptions",
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
      label: locale === "ar" ? "طلباتي" : "My orders",
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
    { href: `/${locale}/how`, label: messages.links.how },
    { href: `/${locale}/contact`, label: messages.links.contact },
  ];
  const otherLocale = locale === "ar" ? "en" : "ar";
  const switchHref =
    location.pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`) +
    location.search +
    location.hash;
  useEffect(() => {
    drawer.current?.close();
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onClick = (event: PointerEvent) => {
      if (
        account.current &&
        !account.current.contains(event.target as Node) &&
        !accountButton.current?.contains(event.target as Node)
      )
        setAccountPosition(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountPosition(null);
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const signOut = (
    <Form method="post" action={`/${locale}`}>
      <input type="hidden" name="intent" value="sign-out" />
      <button
        className="min-h-11 w-full rounded-xl px-3 text-start text-sm text-[var(--danger)] hover:bg-[var(--surface-strong)]"
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
  return (
    <header data-site-header className="sf-site-header">
      {navigation.state !== "idle" ? (
        <div
          role="progressbar"
          aria-label={locale === "ar" ? "جار التحميل" : "Loading"}
          className="sf-navigation-progress"
        />
      ) : null}
      <div className="gh-page sf-header-main">
        <Link
          to={`/${locale}`}
          className="sf-brand-link"
          aria-label={brandName}
        >
          <StorefrontBrand name={brandName} />
        </Link>
        <SearchField
          locale={locale}
          size="sm"
          className="sf-header-search sf-search"
          labels={searchLabels}
        />
        <div className="sf-header-actions">
          <Link
            to={switchHref}
            aria-label={messages.locale.switchLabel}
            className={`${control} sf-locale-control`}
          >
            {otherLocale === "en" ? "EN" : "ع"}
          </Link>
          <ThemeToggle label={messages.theme.toggleLabel} />
          {session && walletPanel ? (
            <Link
              to={`/${locale}/wallet`}
              aria-label={messages.account.walletLabel}
              className="sf-wallet-control"
            >
              <WalletIcon />
              <bdi dir="ltr">
                {formatPrice(walletPanel.balance, walletPanel.currency, locale)}
              </bdi>
            </Link>
          ) : null}
          <div className="sf-desktop-account">
            {session ? (
              <div className="relative">
                <button
                  type="button"
                  ref={accountButton}
                  aria-expanded={!!accountPosition}
                  aria-controls="site-account-menu"
                  onClick={() => {
                    if (accountPosition) {
                      setAccountPosition(null);
                      return;
                    }
                    const box = accountButton.current?.getBoundingClientRect();
                    if (box)
                      setAccountPosition({
                        top: box.bottom + 8,
                        locationKey: location.key,
                        right: Math.min(
                          Math.max(16, window.innerWidth - 276),
                          Math.max(16, window.innerWidth - box.right),
                        ),
                      });
                  }}
                  aria-label={messages.account.accountMenuLabel}
                  className={`${control} sf-account-trigger`}
                >
                  {session.avatarUrl ? (
                    <img
                      src={session.avatarUrl}
                      alt=""
                      className="size-full rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon />
                  )}
                </button>
                {accountPosition
                  ? createPortal(
                      <div
                        ref={account}
                        id="site-account-menu"
                        data-storefront-shell=""
                        dir={getLocaleDirection(locale)}
                        style={{
                          ...getStorefrontThemeStyle(data.theme),
                          top: accountPosition.top,
                          right: accountPosition.right,
                        }}
                        className="sf-account-popover"
                      >
                        <p className="px-3 py-2 font-semibold">
                          {session.displayName}
                        </p>
                        {accountItems.map((item) => (
                          <Link
                            key={item.href}
                            to={item.href}
                            className="flex min-h-11 items-center rounded-xl px-3 text-sm hover:bg-[var(--surface-strong)]"
                          >
                            {item.label}
                          </Link>
                        ))}
                        {signOut}
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            ) : (
              <Link to={`/${locale}/login`} className="sf-sign-in">
                {messages.account.signIn}
              </Link>
            )}
          </div>
          <Link
            to={`/${locale}/search`}
            aria-label={messages.actions.search}
            className={`${control} sf-mobile-search-shortcut`}
          >
            <SearchIcon />
          </Link>
          <button
            type="button"
            className={`${control} sf-menu-trigger`}
            aria-label={
              drawerOpen ? messages.navigation.close : messages.navigation.menu
            }
            aria-expanded={drawerOpen}
            aria-controls="site-mobile-menu"
            onClick={() => {
              if (drawerOpen) drawer.current?.close();
              else {
                drawer.current?.showModal();
                setDrawerOpen(true);
              }
            }}
          >
            <MenuIcon />
          </button>
        </div>
      </div>
      <div className="gh-page sf-mobile-search">
        <SearchField
          locale={locale}
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
              end
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
      <dialog
        id="site-mobile-menu"
        onClose={() => setDrawerOpen(false)}
        aria-label={messages.navigation.mobileLabel}
        ref={drawer}
        dir={getLocaleDirection(locale)}
        className="sf-mobile-drawer"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right)
              drawer.current?.close();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <StorefrontBrand name={brandName} />
          <button
            type="button"
            className={control}
            onClick={() => drawer.current?.close()}
            aria-label={messages.navigation.close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="my-5 border-y py-4">
          {session ? (
            <>
              <Link
                to={`/${locale}/profile`}
                className="block text-lg font-semibold"
              >
                {session.displayName}
              </Link>
              <p className="mt-1 truncate text-sm text-[var(--ink-muted)]">
                <bdi>{session.email}</bdi>
              </p>
              {walletPanel ? (
                <Link
                  to={`/${locale}/wallet`}
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
              end
              to={item.href}
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
              className="rounded-xl px-3 py-3 text-sm text-[var(--ink-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <ThemeToggle label={messages.theme.toggleLabel} />
          {session ? signOut : null}
        </div>
      </dialog>
    </header>
  );
}

export function StorefrontBrand({ name }: { name: string }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return (
    <span className="sf-brand" dir="auto">
      <span>{first}</span>
      {rest.length ? <span>{rest.join(" ")}</span> : null}
    </span>
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
