import "server-only";

import { toHeaderWalletRows, type HeaderWalletPanel } from "@/lib/wallet-panel";
import { listAdminCustomers } from "@/lib/services/admin-customers.service";
import { getMyWallet } from "@/lib/services/wallet.service";
import type { SessionSummary } from "@/lib/services/session.service";

/**
 * Wallet balances for the header's account menus.
 *
 * A customer gets their own balance; an administrator gets every wallet at
 * once, because the question the header answers for them is "where does the
 * money sit" — the same read the customers page makes, one embedded query.
 * Signed-out visitors cost nothing.
 *
 * The session arrives already resolved by the layout, so this never re-reads
 * the profile; the admin path still goes through `listAdminCustomers`, whose
 * `requireAdmin()` keeps the guard next to the query it protects.
 */
export async function getHeaderWalletPanel(
  session: SessionSummary | null,
): Promise<HeaderWalletPanel | null> {
  if (!session) {
    return null;
  }

  if (session.isAdmin) {
    const customers = await listAdminCustomers();

    return { kind: "admin", rows: toHeaderWalletRows(customers) };
  }

  const wallet = await getMyWallet();

  return {
    kind: "customer",
    balance: wallet?.balance ?? 0,
    currency: wallet?.currency ?? "USD",
  };
}
