import type { ReactNode } from "react";
import { NavLink, useNavigation, useRouteLoaderData } from "react-router";
import type { Locale } from "@/i18n/config";
import "@/styles/storefront-account.css";
import type { AccountMessages } from "@/i18n/messages";

export const accountField = "sf-account-field";
export const accountButton = "sf-account-button";
export const accountSecondary =
  "sf-account-button sf-account-button--secondary";

export function AccountNavigation({
  locale,
  messages,
}: {
  locale: Locale;
  messages: AccountMessages;
}) {
  const chrome = useRouteLoaderData("routes/locale-layout") as
    | { session?: { isAdmin?: boolean } }
    | undefined;
  const links = [
    { path: "profile", label: messages.profile.title },
    { path: "orders", label: messages.orders.title },
    ...(!chrome?.session?.isAdmin
      ? [{ path: "wallet", label: messages.wallet.title }]
      : []),
    { path: "notifications", label: messages.notifications.title },
    { path: "support", label: messages.support.title },
    { path: "telegram-connect", label: messages.telegram.title },
  ];
  return (
    <nav className="sf-account-nav" aria-label={messages.title}>
      {links.map((link) => (
        <NavLink
          key={link.path}
          to={`/${locale}/${link.path}`}
          className="sf-account-nav-link"
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AccountHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="sf-account-heading">
      {eyebrow && eyebrow !== title ? (
        <p className="sf-account-eyebrow">{eyebrow}</p>
      ) : null}
      <h1 className="sf-account-title">{title}</h1>
      {description ? (
        <p className="sf-account-description">{description}</p>
      ) : null}
    </header>
  );
}
export function AccountCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="sf-account-card">
      <h2 className="sf-account-card-title">{title}</h2>
      {description ? (
        <p className="sf-account-card-description">{description}</p>
      ) : null}
      <div className="sf-account-card-body">{children}</div>
    </section>
  );
}
export function AccountResult({
  messages,
  error,
  notice,
}: {
  messages: AccountMessages;
  error?: string | null;
  notice?: string | null;
}) {
  const text =
    error === "mismatch"
      ? messages.password.mismatch
      : error
        ? (messages.errors[error as keyof typeof messages.errors] ??
          messages.errors.unknown)
        : null;
  return (
    <>
      {text ? (
        <p
          role="alert"
          className="sf-account-feedback sf-account-feedback--error"
        >
          {text}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="sf-account-feedback sf-account-feedback--success"
        >
          {notice}
        </p>
      ) : null}
    </>
  );
}
export function SubmitButton({
  children,
  name,
  value,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
}) {
  const busy = useNavigation().state !== "idle";
  return (
    <button
      type="submit"
      className={accountButton}
      disabled={busy}
      aria-busy={busy}
      name={name}
      value={value}
    >
      {children}
    </button>
  );
}
