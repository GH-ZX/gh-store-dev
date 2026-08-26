import "server-only";

import { toHeaderWalletRows, type HeaderWalletPanel } from "@/lib/wallet-panel";
import { listTopWallets } from "@/lib/services/admin-customers.service";
import { getMyWallet } from "@/lib/services/wallet.service";
import type { SessionSummary } from "@/lib/services/session.service";

/**
 * Wallet balances for the header's account menus.
 *
 * A customer gets their own balance; an administrator gets the wallets holding
 * the most money, because the question the header answers for them is "where
 * does the money sit". Signed-out visitors cost nothing.
 *
 * This runs in the locale layout, so it runs on every page of the site — the
 * storefront included. It used to reuse the customers page's read: two hundred
 * profiles with their roles and signup dates, embedded wallets and all, to
 * paint a short dropdown of names and amounts. {@link listTopWallets} asks for
 * the dropdown instead.
 *
 * The session arrives already resolved by the layout, so this never re-reads
 * the profile; the admin path still goes through a service function whose
 * `requireAdmin()` keeps the guard next to the query it protects.
 */
export async function getHeaderWalletPanel(
  session: SessionSummary | null,
): Promise<HeaderWalletPanel | null> {
  if (!session) {
    return null;
  }

  if (session.isAdmin) {
    return { kind: "admin", rows: toHeaderWalletRows(await listTopWallets()) };
  }

  const wallet = await getMyWallet();

  return {
    kind: "customer",
    balance: wallet?.balance ?? 0,
    currency: wallet?.currency ?? "USD",
  };
}
