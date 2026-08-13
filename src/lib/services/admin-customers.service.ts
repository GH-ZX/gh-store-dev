import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WalletTransaction, WalletTransactionType } from "@/lib/services/wallet.service";

/**
 * Customer administration.
 *
 * Balances are only ever changed through the `admin_adjust_wallet` RPC, never by
 * writing `wallets.balance` or inserting a transaction directly. The RPC holds
 * the invariants that matter: it locks the wallet row, refuses to leave a
 * negative balance, writes the append-only audit row, and checks
 * `is_admin(auth.uid())` in the database rather than trusting this layer.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminCustomer = {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  balance: number;
  currency: string;
};

export class CustomerNotFoundError extends Error {
  constructor() {
    super("Customer not found.");
    this.name = "CustomerNotFoundError";
  }
}

export class NegativeBalanceError extends Error {
  constructor() {
    super("Adjustment would leave a negative balance.");
    this.name = "NegativeBalanceError";
  }
}

export class AdjustmentForbiddenError extends Error {
  constructor() {
    super("Administrator access required.");
    this.name = "AdjustmentForbiddenError";
  }
}

export async function listAdminCustomers(options: { query?: string } = {}): Promise<AdminCustomer[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  // One embedded read rather than a wallet query per customer.
  let request = supabase
    .from("profiles")
    .select("id, email, full_name, username, role, is_active, created_at, wallets (balance, currency)")
    .order("created_at", { ascending: false })
    .limit(200);

  const term = options.query?.trim();

  if (term) {
    const safe = term.replace(/[,()"'\\%_*]/g, " ").trim();

    if (safe) {
      request = request.or(
        [`email.ilike.%${safe}%`, `full_name.ilike.%${safe}%`, `username.ilike.%${safe}%`].join(","),
      );
    }
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Reading customers failed: ${error.message}`);
  }

  return data.map((row) => {
    // A to-one embed can come back as an object or a single-element array.
    const wallet = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      username: row.username,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? "USD",
    };
  });
}

export type AdminCustomerDetail = {
  customer: AdminCustomer;
  transactions: WalletTransaction[];
};

export async function getAdminCustomer(userId: string): Promise<AdminCustomerDetail | null> {
  await requireAdmin();

  // Reject a malformed id here: sending it to Postgres would raise a type error
  // rather than simply finding nothing.
  if (!UUID_PATTERN.test(userId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, username, role, is_active, created_at, wallets (balance, currency)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const wallet = Array.isArray(data.wallets) ? data.wallets[0] : data.wallets;

  const { data: transactions } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, balance_after, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    customer: {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      username: data.username,
      role: data.role,
      isActive: data.is_active,
      createdAt: data.created_at,
      balance: wallet?.balance ?? 0,
      currency: wallet?.currency ?? "USD",
    },
    transactions: (transactions ?? []).map((row) => ({
      id: row.id,
      type: row.type as WalletTransactionType,
      amount: row.amount,
      balanceAfter: row.balance_after,
      description: row.description,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Correct a balance.
 *
 * A positive amount credits, a negative one deducts. The idempotency key makes a
 * resubmitted form return the original result instead of adjusting twice, which
 * is the difference between a corrected balance and a doubled one.
 */
export async function adjustCustomerBalance(input: {
  userId: string;
  amount: number;
  description: string;
  idempotencyKey: string;
}): Promise<{ balance: number; idempotent: boolean }> {
  await requireAdmin();

  if (!UUID_PATTERN.test(input.userId)) {
    throw new CustomerNotFoundError();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("admin_adjust_wallet", {
      p_user_id: input.userId,
      p_amount: input.amount,
      p_description: input.description,
      p_idempotency_key: input.idempotencyKey,
    })
    .maybeSingle();

  if (error) {
    // The RPC raises these by message; map them so the action can answer with
    // the right explanation instead of a generic failure.
    const message = error.message.toLowerCase();

    if (message.includes("negative balance")) {
      throw new NegativeBalanceError();
    }

    if (message.includes("wallet not found")) {
      throw new CustomerNotFoundError();
    }

    if (message.includes("administrator access")) {
      throw new AdjustmentForbiddenError();
    }

    throw new Error(`Adjusting the balance failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("The wallet adjustment returned no result.");
  }

  return { balance: data.balance, idempotent: data.idempotent };
}
