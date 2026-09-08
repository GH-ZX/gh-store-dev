import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Wallet reads for the signed-in customer.
 *
 * RLS restricts both tables to the caller's own rows, so these queries are
 * scoped twice: by policy in the database and by `user_id` here. The redundancy
 * is deliberate — a policy change should not silently widen what a page shows.
 *
 * `wallet_transactions` is append-only, so history is read but never written
 * outside the wallet RPCs.
 */

export type WalletSummary = {
  id: string;
  balance: number;
  currency: string;
};

export type WalletTransactionType =
  | "deposit"
  | "purchase"
  | "refund"
  | "adjustment"
  | "withdrawal";

export type WalletTransaction = {
  id: string;
  type: WalletTransactionType;
  /** Signed: a purchase is stored negative, a deposit positive. */
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

export async function getMyWallet(): Promise<WalletSummary | null> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallets")
    .select("id, balance, currency")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { id: data.id, balance: data.balance, currency: data.currency };
}

export type TransactionPage = {
  transactions: WalletTransaction[];
  /** True when more rows exist beyond this page. */
  hasMore: boolean;
};

/**
 * One page of history, newest first.
 *
 * Reads `limit + 1` rows to learn whether another page exists without a second
 * count query.
 */
export async function getMyTransactions(limit = 20, offset = 0): Promise<TransactionPage> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, balance_after, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error || !data) {
    return { transactions: [], hasMore: false };
  }

  const rows = data.slice(0, limit);

  return {
    transactions: rows.map((row) => ({
      id: row.id,
      type: row.type as WalletTransactionType,
      amount: row.amount,
      balanceAfter: row.balance_after,
      description: row.description,
      createdAt: row.created_at,
    })),
    hasMore: data.length > limit,
  };
}
