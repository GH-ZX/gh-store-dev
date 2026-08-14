import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import {
  needsAttention,
  reconcilePayment,
  type PaymentReconciliation,
} from "@/lib/payments/reconciliation-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Every top-up, next to the wallet result it produced.
 *
 * Stage 10's exit criterion is that every payment state maps to one auditable
 * wallet result. Showing that needs both halves in one row, so this reads the
 * request, the Sam invoice that paid it, and the wallet transaction it created,
 * and lets {@link reconcilePayment} say whether they agree.
 *
 * The join is a key, not a guess. Every top-up — manual or Sam — is credited
 * through `credit_recharge_request`, which writes one `wallet_transactions` row
 * with `reference_type = 'recharge'` and `reference_id` set to the request. The
 * reference store had to match on amount and a time window because its manual
 * credits recorded no link at all; that heuristic can attribute the wrong
 * transaction when one customer has two same-sized top-ups close together, and
 * is not worth porting.
 */

export type PaymentRow = {
  id: string;
  reference: string;
  createdAt: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  requestStatus: string;
  invoiceStatus: string | null;
  /** What Sam billed and what actually arrived, when an invoice exists. */
  billedAmount: number | null;
  paidAmount: number | null;
  /** The wallet movement this payment produced, if any. */
  creditedAmount: number | null;
  creditedAt: string | null;
  customer: { id: string; email: string | null; name: string | null };
  state: PaymentReconciliation;
  needsAttention: boolean;
};

export type PaymentTotals = {
  total: number;
  attention: number;
  awaitingReview: number;
  settled: number;
};

export type PaymentsView = { rows: PaymentRow[]; totals: PaymentTotals };

type ProfileEmbed = { id: string; email: string | null; full_name: string | null; username: string | null };

function toCustomer(value: unknown, fallbackId: string) {
  const profile = (Array.isArray(value) ? value[0] : value) as ProfileEmbed | null;

  return {
    id: fallbackId,
    email: profile?.email ?? null,
    name: profile?.full_name ?? profile?.username ?? null,
  };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

/**
 * Read every top-up and reconcile it.
 *
 * Capped rather than paginated for now: the reference store pages on a key that
 * changes whenever a webhook lands, which silently skips and repeats rows for an
 * operator walking pages. A cap that says what it dropped is more honest than
 * paging that quietly lies.
 */
export async function getPayments(options: { attentionOnly?: boolean; limit?: number } = {}): Promise<PaymentsView> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("recharge_requests")
    .select(
      `id, reference, status, requested_amount, wallet_credit_amount, requested_currency,
       payment_method, created_at, reviewed_at, user_id,
       profiles!recharge_requests_user_id_fkey (id, email, full_name, username),
       sam_invoices (status, amount, charge_amount, credited_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  const requests = data ?? [];

  /*
   * Read separately because `wallet_transactions.reference_id` carries no
   * foreign key, so it cannot be embedded. It is still an exact key — every
   * top-up is credited through `credit_recharge_request`, which sets
   * `reference_type = 'recharge'` and `reference_id` to the request — so this is
   * a second query rather than a weaker match.
   */
  const credits = new Map<string, { amount: number; created_at: string }>();

  if (requests.length > 0) {
    const { data: transactions } = await supabase
      .from("wallet_transactions")
      .select("amount, created_at, reference_id")
      .eq("reference_type", "recharge")
      .in(
        "reference_id",
        requests.map((request) => request.id),
      );

    for (const transaction of transactions ?? []) {
      if (transaction.reference_id) {
        credits.set(transaction.reference_id, {
          amount: transaction.amount,
          created_at: transaction.created_at,
        });
      }
    }
  }

  const rows: PaymentRow[] = requests.map((row) => {
    const invoice = first(row.sam_invoices) as
      | { status: string; amount: number; charge_amount: number | null; credited_at: string | null }
      | null;
    const transaction = credits.get(row.id) ?? null;

    const state = reconcilePayment({
      requestStatus: row.status,
      invoiceStatus: invoice?.status ?? null,
      credited: transaction !== null,
      billedAmount: invoice?.amount ?? null,
      paidAmount: invoice?.charge_amount ?? null,
    });

    return {
      id: row.id,
      reference: row.reference,
      createdAt: row.created_at,
      amount: row.requested_amount,
      currency: row.requested_currency,
      paymentMethod: row.payment_method,
      requestStatus: row.status,
      invoiceStatus: invoice?.status ?? null,
      billedAmount: invoice?.amount ?? null,
      paidAmount: invoice?.charge_amount ?? null,
      creditedAmount: transaction?.amount ?? null,
      creditedAt: transaction?.created_at ?? invoice?.credited_at ?? null,
      customer: toCustomer(row.profiles, row.user_id),
      state,
      needsAttention: needsAttention(state),
    };
  });

  const totals: PaymentTotals = {
    total: rows.length,
    attention: rows.filter((row) => row.needsAttention).length,
    awaitingReview: rows.filter((row) => row.state === "awaiting_review").length,
    settled: rows.filter((row) => row.state === "settled").length,
  };

  return {
    rows: options.attentionOnly ? rows.filter((row) => row.needsAttention) : rows,
    totals,
  };
}
