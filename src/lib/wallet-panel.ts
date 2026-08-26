import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/lib/format/money";

/**
 * Wallet data for the header's account menus, desktop and mobile.
 *
 * Pure data and mapping only — the reads live in
 * `header-wallets.service.ts` — so both the server-rendered dropdown and the
 * client drawer island can share one shape, and the mapping rules (label
 * fallbacks, ordering) stay testable without a database.
 */

/** One wallet line in the admin view: a customer and what they hold. */
export type HeaderWalletRow = {
  id: string;
  /** Best available name: full name, then username, then email. */
  label: string;
  balance: number;
  currency: string;
};

export type HeaderWalletPanel =
  | { kind: "customer"; balance: number; currency: string }
  | { kind: "admin"; rows: HeaderWalletRow[] };

/** Structural slice of an admin customer row; avoids importing server modules. */
export type HeaderWalletCustomer = {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  balance: number;
  currency: string;
};

function rowLabel(customer: HeaderWalletCustomer): string {
  return (
    customer.fullName?.trim() ||
    customer.username?.trim() ||
    customer.email?.trim() ||
    "—"
  );
}

/**
 * Map admin customer rows to header wallet lines.
 *
 * Richest first: this panel answers "where is the money", so the order that
 * helps is by balance, not by signup date like the customers page. A missing
 * wallet reads as zero, matching how the dashboard treats it.
 */
export function toHeaderWalletRows(customers: HeaderWalletCustomer[]): HeaderWalletRow[] {
  return customers
    .map((customer) => ({
      id: customer.id,
      label: rowLabel(customer),
      balance: customer.balance ?? 0,
      currency: customer.currency || "USD",
    }))
    .sort((a, b) => b.balance - a.balance);
}

export function formatHeaderWalletAmount(
  amount: number,
  currency: string,
  locale: Locale,
): string {
  return formatPrice(amount, currency, locale);
}
