import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { logOutcome } from "@/lib/logging/logger";
import { notify } from "@/lib/services/notification.service";
import {
  readSamCredentials,
  type SamCredentials,
  type SamMethod,
} from "@/lib/settings/sam-settings";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { samCallbackUrl } from "@/lib/supabase/functions-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { SamClient, resolveSamWallet, sypForUsd } from "@/providers/sam/client";
import { SamError } from "@/providers/sam/errors";
import type { Json } from "@/types/database";

/**
 * Wallet top-ups paid through Sam API.
 *
 * The shape of the flow, and why each step is where it is:
 *
 *   1. The customer picks an amount and a method. A recharge request is created
 *      first, through the same RPC a manual top-up uses, so there is one history
 *      and one reference regardless of how the money arrives.
 *   2. The server creates an invoice against the store's own wallet and hands
 *      back Sam's payment page. Nothing is credited.
 *   3. The customer transfers. Sam then knows whether the money arrived, and we
 *      find out either from its callback or by asking.
 *   4. Only after Sam says paid — for at least the invoiced amount — is the
 *      wallet credited, and only through a function no customer session can
 *      call. If the owner has asked to review Sam top-ups, the payment is
 *      recorded and the request queued instead.
 *
 * The customer's own session can reach none of the crediting: every write here
 * goes through the service client, and the underlying functions are granted to
 * `service_role` alone.
 */

export type SamPaymentOptions = {
  enabled: boolean;
  methods: SamMethod[];
  invoiceCurrency: string;
  /** True when even a confirmed payment waits for the owner. */
  manualReview: boolean;
};

export type SamInvoiceView = {
  id: string;
  samInvoiceId: string;
  status: string;
  amount: number;
  currency: string;
  chargeAmount: number | null;
  chargeCurrency: string | null;
  paymentMethod: SamMethod;
  paymentUrl: string | null;
  expiresAt: string | null;
  reference: string | null;
};

export type StartTopUpResult =
  | { ok: true; invoice: SamInvoiceView }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "method_unavailable"
        | "invalid_input"
        | "too_many"
        | "suspended"
        | "wallet_problem"
        | "provider_unavailable"
        | "unknown";
    };

export type SettleResult =
  | { ok: true; status: "credited"; credited: number; balance: number }
  | { ok: true; status: "awaiting_review" }
  | { ok: true; status: "pending" }
  | { ok: false; reason: "expired" | "not_found" | "not_paid" | "short_payment" | "provider_unavailable" | "unknown"; message?: string | null };

/** Presentation-safe options, via the RPC that cannot see the API key. */
export async function getSamPaymentOptions(): Promise<SamPaymentOptions> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_sam_payment_options");

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { enabled: false, methods: [], invoiceCurrency: "USD", manualReview: false };
  }

  const raw = data as { enabled?: unknown; methods?: unknown; invoice_currency?: unknown; manual_review?: unknown };
  const methods = Array.isArray(raw.methods)
    ? raw.methods.filter((value): value is SamMethod => value === "shamcash" || value === "syriatel")
    : [];

  return {
    enabled: raw.enabled === true && methods.length > 0,
    methods,
    invoiceCurrency: typeof raw.invoice_currency === "string" ? raw.invoice_currency.toUpperCase() : "USD",
    manualReview: raw.manual_review === true,
  };
}

/**
 * The store's Sam configuration, read with service authority.
 *
 * Needed on the customer path — creating an invoice requires the API key — which
 * is precisely why this module is server-only and returns nothing secret.
 */
async function readCredentials(): Promise<SamCredentials | null> {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const service = createSupabaseServiceClient();
  const { data } = await service.from("store_settings").select("providers").eq("id", "global").maybeSingle();
  const credentials = readSamCredentials(data?.providers);

  return credentials.apiKey === null || !credentials.enabled ? null : credentials;
}

function storeIdentifier(credentials: SamCredentials, method: SamMethod): string | null {
  return method === "shamcash" ? credentials.shamcashIdentifier : credentials.syriatelIdentifier;
}

/**
 * Where Sam reports the outcome.
 *
 * A Supabase Edge Function rather than a route on the store. Supabase is public
 * and HTTPS wherever the store itself is running, so the callback works while
 * developing instead of only after a deploy — pointing Sam at the site's own URL
 * meant a payment taken locally was never reported, silently.
 *
 * The secret travels in the query string because that is the only channel Sam
 * offers. It is generated per store, never shown to a customer, and the function
 * that receives it re-checks everything the callback claims.
 */
function webhookUrl(secret: string): string {
  return samCallbackUrl(getSupabaseEnv().url, secret);
}

/**
 * The callback secret, read with service authority.
 *
 * Exported so the dashboard shows the owner the exact address Sam is given,
 * token and all, rather than a second address assembled from the same parts.
 */
export async function readWebhookSecret(): Promise<string | null> {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const service = createSupabaseServiceClient();
  const { data } = await service.from("store_settings").select("providers").eq("id", "global").maybeSingle();
  const providers = data?.providers;

  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return null;
  }

  const sam = (providers as { sam?: { webhook_secret?: unknown } }).sam;

  return typeof sam?.webhook_secret === "string" && sam.webhook_secret.trim().length > 0
    ? sam.webhook_secret.trim()
    : null;
}

function toView(row: {
  id: string;
  sam_invoice_id: string;
  status: string;
  amount: number;
  currency: string;
  charge_amount: number | null;
  charge_currency: string | null;
  payment_method: string;
  payment_url: string | null;
  expires_at: string | null;
}, reference: string | null = null): SamInvoiceView {
  return {
    id: row.id,
    samInvoiceId: row.sam_invoice_id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    chargeAmount: row.charge_amount,
    chargeCurrency: row.charge_currency,
    paymentMethod: row.payment_method === "syriatel" ? "syriatel" : "shamcash",
    paymentUrl: row.payment_url,
    expiresAt: row.expires_at,
    reference,
  };
}

function reasonForSam(error: unknown): StartTopUpResult {
  if (error instanceof SamError) {
    switch (error.kind) {
      case "auth":
      case "wallet":
      case "not_found":
        // The store's own setup is wrong; a customer cannot act on it.
        return { ok: false, reason: "wallet_problem" };
      case "provider":
      case "network":
        return { ok: false, reason: "provider_unavailable" };
      case "validation":
        return { ok: false, reason: "invalid_input" };
      default:
        return { ok: false, reason: "unknown" };
    }
  }

  return { ok: false, reason: "unknown" };
}

/**
 * Open a Sam invoice for a wallet top-up.
 *
 * The amount is validated against the stored recharge limits by the same RPC the
 * manual path uses, so a crafted form cannot invent a figure.
 */
export async function startSamTopUp(input: { amount: number; method: SamMethod }): Promise<StartTopUpResult> {
  const result = await attemptSamTopUp(input);

  logOutcome("recharge", "topup_started", result, { amount: input.amount, method: input.method });

  return result;
}

async function attemptSamTopUp(input: { amount: number; method: SamMethod }): Promise<StartTopUpResult> {
  const user = await requireAuth();
  const credentials = await readCredentials();

  if (!credentials) {
    return { ok: false, reason: "not_configured" };
  }

  const identifier = storeIdentifier(credentials, input.method);

  if (!identifier) {
    return { ok: false, reason: "method_unavailable" };
  }

  const secret = await readWebhookSecret();

  if (!secret) {
    // Without a callback URL Sam has no way to report a payment, and we would be
    // relying on the customer keeping a tab open. Treat it as unconfigured.
    return { ok: false, reason: "not_configured" };
  }

  // The request is the customer-visible record, created through their own session
  // so the RPC's own limits and rate checks apply to them.
  const supabase = await createSupabaseServerClient();
  const { data: request, error: requestError } = await supabase
    .rpc("submit_recharge_request", {
      p_amount: input.amount,
      p_method: input.method,
      p_currency: "USD",
    })
    .maybeSingle();

  if (requestError) {
    const text = requestError.message.toLowerCase();

    if (text.includes("too many")) {
      return { ok: false, reason: "too_many" };
    }

    if (text.includes("suspended")) {
      return { ok: false, reason: "suspended" };
    }

    return { ok: false, reason: "invalid_input" };
  }

  if (!request) {
    return { ok: false, reason: "unknown" };
  }

  const currency = credentials.invoiceCurrency;
  const chargeAmount = currency === "SYP" ? sypForUsd(input.amount, credentials.sypPerUsd) : input.amount;

  if (chargeAmount <= 0) {
    // A SYP invoice with no exchange rate configured would bill nothing.
    return { ok: false, reason: "not_configured" };
  }

  try {
    const client = new SamClient(credentials.apiKey);

    /*
     * Sam wants the identifier in the shape its own records use, which is not
     * necessarily what the owner typed. Resolving against the linked wallets
     * turns a saved phone number into the wallet address Sam expects, and fails
     * early — before an invoice exists — when the wallet is not linked at all.
     */
    const wallets = await client.listWallets();
    const wallet = resolveSamWallet(wallets, input.method, identifier);

    if (!wallet?.identifier) {
      return { ok: false, reason: "wallet_problem" };
    }

    const invoice = await client.createInvoice({
      method: input.method,
      identifier: wallet.identifier,
      amount: chargeAmount,
      currency,
      webhookUrl: webhookUrl(secret),
    });

    const service = createSupabaseServiceClient();
    const { data: row, error: insertError } = await service
      .from("sam_invoices")
      .insert({
        user_id: user.id,
        recharge_request_id: request.request_id,
        sam_invoice_id: invoice.invoiceId,
        payment_method: input.method,
        // What the wallet gets on success, always in store currency.
        amount: input.amount,
        currency: "USD",
        charge_amount: chargeAmount,
        charge_currency: currency,
        payment_url: invoice.paymentUrl,
        expires_at: invoice.expiresAt,
        status: "pending",
      })
      .select(
        "id, sam_invoice_id, status, amount, currency, charge_amount, charge_currency, payment_method, payment_url, expires_at",
      )
      .single();

    if (insertError || !row) {
      return { ok: false, reason: "unknown" };
    }

    return { ok: true, invoice: toView(row, request.reference) };
  } catch (error) {
    return reasonForSam(error);
  }
}

/** The customer's own view of an invoice, for the payment screen. */
export async function getMySamInvoice(samInvoiceId: string): Promise<SamInvoiceView | null> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("sam_invoices")
    .select(
      "id, sam_invoice_id, status, amount, currency, charge_amount, charge_currency, payment_method, payment_url, expires_at, recharge_requests (reference)",
    )
    .eq("sam_invoice_id", samInvoiceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const reference = Array.isArray(data.recharge_requests)
    ? (data.recharge_requests[0] as { reference?: string } | undefined)?.reference ?? null
    : ((data.recharge_requests as { reference?: string } | null)?.reference ?? null);

  return toView(data, reference);
}

/**
 * Apply a confirmed payment.
 *
 * Shared by every route into "Sam says this is paid" — the callback, a poll, and
 * an explicit verification — so the decision about crediting is made in exactly
 * one place. The paid amount is passed through to the database, which refuses to
 * credit an invoice that was underpaid.
 */
export async function settleSamInvoice(input: {
  samInvoiceId: string;
  paidAmount: number | null;
  chargeCurrency?: string | null;
  transactionRef?: string | null;
  payload?: Json;
}): Promise<SettleResult> {
  const result = await attemptSettle(input);

  /*
   * Money arriving is the single most important thing this store does, and every
   * route into it — the callback, a poll, an explicit verification — lands here.
   * `payload` is not logged: it is Sam's raw body and carries the callback
   * secret's context.
   */
  logOutcome("recharge", "invoice_settled", result, {
    samInvoiceId: input.samInvoiceId,
    paidAmount: input.paidAmount,
    chargeCurrency: input.chargeCurrency ?? null,
    ...(result.ok
      ? { status: result.status, ...(result.status === "credited" ? { credited: result.credited } : {}) }
      : { message: result.message ?? null }),
  });

  return result;
}

async function attemptSettle(input: {
  samInvoiceId: string;
  paidAmount: number | null;
  chargeCurrency?: string | null;
  transactionRef?: string | null;
  payload?: Json;
}): Promise<SettleResult> {
  if (!hasServiceRoleKey()) {
    return { ok: false, reason: "unknown" };
  }

  const service = createSupabaseServiceClient();
  const credentials = await readCredentials();

  /*
   * The owner's review switch. Reading it here rather than at invoice creation
   * means a change applies to payments already in flight, which is what an owner
   * turning it on in a hurry expects.
   */
  if (credentials?.manualReview) {
    const { data, error } = await service
      .rpc("mark_sam_invoice_paid", {
        p_sam_invoice_id: input.samInvoiceId,
        p_paid_amount: input.paidAmount ?? undefined,
        p_charge_currency: input.chargeCurrency ?? undefined,
        p_transaction_ref: input.transactionRef ?? undefined,
        p_payload: input.payload ?? undefined,
      })
      .maybeSingle();

    if (error) {
      return { ok: false, reason: error.message.includes("not found") ? "not_found" : "unknown" };
    }

    return data?.status === "credited"
      ? { ok: true, status: "credited", credited: 0, balance: 0 }
      : { ok: true, status: "awaiting_review" };
  }

  const { data, error } = await service
    .rpc("credit_sam_invoice", {
      p_sam_invoice_id: input.samInvoiceId,
      p_paid_amount: input.paidAmount ?? undefined,
      p_charge_currency: input.chargeCurrency ?? undefined,
      p_transaction_ref: input.transactionRef ?? undefined,
      p_payload: input.payload ?? undefined,
    })
    .maybeSingle();

  if (error) {
    const text = error.message.toLowerCase();

    // Matches the wording of the database check, which compares the paid figure
    // against the billed amount rather than the credited one.
    if (text.includes("short of the billed")) {
      return { ok: false, reason: "short_payment", message: error.message };
    }

    if (text.includes("does not match the invoice currency")) {
      return { ok: false, reason: "short_payment", message: error.message };
    }

    if (text.includes("not found")) {
      return { ok: false, reason: "not_found" };
    }

    if (text.includes("paid amount required")) {
      return { ok: false, reason: "not_paid" };
    }

    return { ok: false, reason: "unknown", message: error.message };
  }

  if (!data) {
    return { ok: false, reason: "unknown" };
  }

  /*
   * A settled invoice comes back with its existing status rather than an error —
   * that is what makes a replayed callback harmless. So the status has to be read:
   * treating any non-error reply as "credited" would tell a customer their money
   * arrived because their invoice had already been closed as failed.
   */
  if (data.status !== "credited") {
    return { ok: false, reason: "expired" };
  }

  /*
   * This path credits without an owner, so the customer is the only person who
   * finds out — and `idempotent` guards against a replayed callback announcing
   * the same top-up twice.
   */
  if (!data.idempotent) {
    await announceCredit(input.samInvoiceId, data.credited);
  }

  return { ok: true, status: "credited", credited: data.credited, balance: data.balance };
}

/**
 * Tell the customer their payment landed.
 *
 * Reads the invoice back for its owner and reference rather than trusting a
 * caller to pass them: this runs from the callback route as well as from a poll,
 * and the row is the only shared source of truth.
 */
async function announceCredit(samInvoiceId: string, credited: number): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("sam_invoices")
    .select("user_id, recharge_requests (reference)")
    .eq("sam_invoice_id", samInvoiceId)
    .maybeSingle();

  if (!data) {
    return;
  }

  const request = Array.isArray(data.recharge_requests)
    ? (data.recharge_requests[0] as { reference?: string } | undefined)
    : (data.recharge_requests as { reference?: string } | null);
  const reference = request?.reference ?? null;
  const amount = credited.toFixed(2);

  await notify({
    userId: data.user_id,
    type: "recharge_approved",
    titleAr: "تمت إضافة الرصيد",
    titleEn: "Your balance was topped up",
    bodyAr: reference
      ? `أضفنا ${amount} دولار إلى محفظتك (${reference}). يمكنك الشراء به الآن.`
      : `أضفنا ${amount} دولار إلى محفظتك. يمكنك الشراء به الآن.`,
    bodyEn: reference
      ? `We added ${amount} USD to your wallet (${reference}). It is ready to spend.`
      : `We added ${amount} USD to your wallet. It is ready to spend.`,
    href: "/wallet",
    entityType: "recharge",
    entityId: null,
  });
}

/** Close an invoice Sam will not settle. */
export async function failSamInvoice(
  samInvoiceId: string,
  status: "failed" | "expired" | "cancelled",
  payload?: Json,
): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  const service = createSupabaseServiceClient();
  await service.rpc("fail_sam_invoice", {
    p_sam_invoice_id: samInvoiceId,
    p_status: status,
    p_payload: payload ?? undefined,
  });
}

/**
 * Ask Sam about an invoice and apply whatever it says.
 *
 * This is the path the payment screen polls. Fetching the invoice is also what
 * makes Sam expire it, so a customer who abandons the transfer ends up with a
 * closed invoice rather than one pending for ever.
 */
export async function syncSamInvoice(samInvoiceId: string): Promise<SettleResult> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  // Ownership first: an invoice id is guessable, and a poll must not report on
  // someone else's payment.
  const { data: row } = await supabase
    .from("sam_invoices")
    .select("sam_invoice_id, status, amount")
    .eq("sam_invoice_id", samInvoiceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (row.status === "credited") {
    return { ok: true, status: "credited", credited: row.amount, balance: 0 };
  }

  if (row.status === "awaiting_review") {
    return { ok: true, status: "awaiting_review" };
  }

  if (row.status === "expired" || row.status === "failed" || row.status === "cancelled") {
    return { ok: false, reason: "expired" };
  }

  const credentials = await readCredentials();

  if (!credentials) {
    return { ok: true, status: "pending" };
  }

  try {
    const client = new SamClient(credentials.apiKey);
    const invoice = await client.getInvoice(samInvoiceId);

    if (invoice.status === "paid") {
      return await settleSamInvoice({
        samInvoiceId,
        paidAmount: invoice.paidAmount ?? invoice.amount,
        chargeCurrency: invoice.currency,
        payload: { source: "poll", status: invoice.status, paidAt: invoice.paidAt } as Json,
      });
    }

    if (invoice.status === "expired") {
      await failSamInvoice(samInvoiceId, "expired", { source: "poll" } as Json);

      return { ok: false, reason: "expired" };
    }

    return { ok: true, status: "pending" };
  } catch (error) {
    if (error instanceof SamError && error.kind === "expired") {
      await failSamInvoice(samInvoiceId, "expired", { source: "poll" } as Json);

      return { ok: false, reason: "expired" };
    }

    return { ok: false, reason: "provider_unavailable" };
  }
}

/**
 * Verify a payment by its wallet transaction reference.
 *
 * For the customer who transferred but whose payment has not landed on its own —
 * Sam searches the receiving wallet's history for the reference they paste in.
 * `verified: false` is a real answer, not an error: the reference was not found.
 */
export async function verifySamPayment(input: {
  samInvoiceId: string;
  transactionRef: string;
}): Promise<SettleResult> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("sam_invoices")
    .select("sam_invoice_id, status, amount")
    .eq("sam_invoice_id", input.samInvoiceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (row.status === "credited") {
    return { ok: true, status: "credited", credited: row.amount, balance: 0 };
  }

  if (row.status === "awaiting_review") {
    return { ok: true, status: "awaiting_review" };
  }

  const credentials = await readCredentials();

  if (!credentials) {
    return { ok: false, reason: "unknown" };
  }

  try {
    const client = new SamClient(credentials.apiKey);
    const result = await client.verifyInvoice(input.samInvoiceId, input.transactionRef);

    if (!result.verified) {
      return { ok: false, reason: "not_paid", message: result.message };
    }

    /*
     * Sam's verify response often carries no amount. Rather than fall back to the
     * invoiced figure — which would mean crediting on the strength of our own
     * expectation — read the invoice back and use what Sam reports. The database
     * refuses to credit without an amount at all.
     */
    let paidAmount = result.paidAmount;

    if (paidAmount === null) {
      const invoice = await client.getInvoice(input.samInvoiceId);
      paidAmount = invoice.paidAmount ?? invoice.amount;
    }

    return await settleSamInvoice({
      samInvoiceId: input.samInvoiceId,
      paidAmount,
      transactionRef: input.transactionRef.trim(),
      payload: { source: "verify", message: result.message } as Json,
    });
  } catch (error) {
    if (error instanceof SamError && error.kind === "expired") {
      await failSamInvoice(input.samInvoiceId, "expired", { source: "verify" } as Json);

      return { ok: false, reason: "expired" };
    }

    return { ok: false, reason: "provider_unavailable" };
  }
}
