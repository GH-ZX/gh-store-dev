import "server-only";

import { z } from "zod";
import { classifySam, SamError } from "@/providers/sam/errors";
import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * Sam API client.
 *
 * Sam is a Syrian payment gateway: it issues a short-lived invoice against one of
 * the store's own linked wallets, the customer transfers to it, and Sam can then
 * be asked whether the money arrived. `import "server-only"` makes it a build
 * error for this module — and so the API key — to reach a browser bundle.
 *
 * Contract notes that are easy to get wrong:
 * - The base URL already ends in `/api`, so the JSON status endpoint is
 *   `https://sam-api.pro/api/pay/{id}` while the page the customer opens is
 *   `https://sam-api.pro/pay/{id}`. They are different URLs.
 * - `amount` is sent as a **string**, two decimals for USD and a whole number for
 *   SYP. Sending a number is rejected.
 * - An invoice lives 15 minutes. Fetching its status is also what makes Sam
 *   expire it, so polling is part of the lifecycle rather than a read-only peek.
 */

const BASE_URL = "https://sam-api.pro/api";
const REQUEST_TIMEOUT_MS = 15_000;

/** Sam's own hosted payment page, which is not under the `/api` prefix. */
export function samPaymentPageUrl(invoiceId: string): string {
  return `https://sam-api.pro/pay/${encodeURIComponent(invoiceId)}`;
}

const invoiceSchema = z.object({
  invoiceId: z.string().min(1),
  paymentUrl: z.string().min(1),
  expiresAt: z.string().nullish(),
});

const invoiceStatusSchema = z.object({
  id: z.string().nullish(),
  method: z.string().nullish(),
  identifier: z.string().nullish(),
  // Sam returns amounts as strings.
  amount: z.union([z.string(), z.number()]).nullish(),
  currency: z.string().nullish(),
  status: z.string().nullish(),
  expiresAt: z.string().nullish(),
  paidAt: z.string().nullish(),
  paidAmount: z.union([z.string(), z.number()]).nullish(),
});

const verifySchema = z.object({
  verified: z.boolean().nullish(),
  message: z.string().nullish(),
  paidAmount: z.union([z.string(), z.number()]).nullish(),
  amount: z.union([z.string(), z.number()]).nullish(),
});

const walletSchema = z.object({
  id: z.string().nullish(),
  provider: z.string().nullish(),
  providerDisplayName: z.string().nullish(),
  label: z.string().nullish(),
  phone: z.string().nullish(),
  walletAddress: z.string().nullish(),
  accountNumber: z.string().nullish(),
  cashCode: z.string().nullish(),
  region: z.string().nullish(),
  status: z.string().nullish(),
});

const walletsSchema = z.array(walletSchema);
const balancesSchema = z.array(
  z.object({
    currency: z.string().nullish(),
    amount: z.union([z.string(), z.number()]).nullish(),
    label: z.string().nullish(),
  }),
);

export type SamInvoice = {
  invoiceId: string;
  /** Sam's hosted page, to be opened by the customer. */
  paymentUrl: string;
  expiresAt: string | null;
};

export type SamInvoiceStatus = {
  status: string;
  amount: number | null;
  currency: string | null;
  paidAmount: number | null;
  paidAt: string | null;
  expiresAt: string | null;
};

export type SamVerifyResult = {
  verified: boolean;
  message: string | null;
  paidAmount: number | null;
};

export type SamWallet = {
  id: string | null;
  provider: SamMethod;
  label: string | null;
  /** The value to send to Sam as `identifier` for this provider. */
  identifier: string | null;
  /** Every value this wallet can be recognised by, for matching stored settings. */
  candidates: string[];
  status: string | null;
};

export type SamWalletBalance = { currency: string; amount: number };

/** Sam bills whole pounds; anything else is billed to two decimals. */
export function formatSamAmount(amount: number, currency: string): string {
  return currency.toUpperCase() === "SYP" ? String(Math.round(amount)) : amount.toFixed(2);
}

export function sypForUsd(usd: number, rate: number): number {
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }

  return Math.round(usd * rate);
}

function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function normalizeProvider(value: string | null | undefined): SamMethod {
  // Sam treats shamcash as the default bucket; only syriatel is distinguished.
  return value?.trim().toLowerCase() === "syriatel" ? "syriatel" : "shamcash";
}

/**
 * Which of a wallet's fields Sam expects as `identifier`.
 *
 * Syriatel is addressed by phone or cash code; ShamCash by its 32-character
 * wallet address. Getting this wrong produces `INVALID_IDENTIFIER` at invoice
 * time rather than anything useful.
 */
function identifierForWallet(wallet: z.infer<typeof walletSchema>, provider: SamMethod): string | null {
  const ordered =
    provider === "syriatel"
      ? [wallet.phone, wallet.cashCode, wallet.walletAddress, wallet.id]
      : [wallet.walletAddress, wallet.accountNumber, wallet.phone, wallet.id];

  for (const value of ordered) {
    const identifier = value?.trim();

    if (identifier) {
      return identifier;
    }
  }

  return null;
}

export class SamClient {
  private readonly apiKey: string;

  constructor(apiKey: string | null) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SamError("auth", "Sam API key is not configured.");
    }

    this.apiKey = apiKey.trim();
  }

  private async request(
    path: string,
    options: { method?: "GET" | "POST"; body?: unknown; tolerate?: number[] } = {},
  ): Promise<{ status: number; json: unknown }> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request failed";

      throw new SamError("network", `Could not reach Sam API: ${reason}`);
    }

    const text = await response.text();
    let json: unknown = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Sam sits behind a proxy that can answer with HTML on a bad day.
      json = { raw: text.slice(0, 300) };
    }

    if (response.ok || options.tolerate?.includes(response.status)) {
      return { status: response.status, json };
    }

    const body = (json ?? {}) as { code?: unknown; message?: unknown; error?: unknown; raw?: unknown };
    const code = typeof body.code === "string" ? body.code : null;
    const message =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error === "string" && body.error) ||
      (typeof body.raw === "string" && body.raw) ||
      `Sam API responded with HTTP ${response.status}`;

    throw classifySam(response.status, code, message);
  }

  /**
   * Create an invoice.
   *
   * `webhookUrl` is where Sam reports the outcome; it carries its own secret, so
   * it must never be logged alongside anything customer-visible.
   */
  async createInvoice(input: {
    method: SamMethod;
    identifier: string;
    amount: number;
    currency: string;
    webhookUrl: string;
  }): Promise<SamInvoice> {
    const { json } = await this.request("/v1/invoices", {
      method: "POST",
      body: {
        method: input.method,
        identifier: input.identifier,
        amount: formatSamAmount(input.amount, input.currency),
        currency: input.currency.toUpperCase(),
        webhookUrl: input.webhookUrl,
      },
    });

    const parsed = invoiceSchema.safeParse(json);

    if (!parsed.success) {
      throw new SamError("contract", "Sam API returned an invoice without an id or payment link.");
    }

    return {
      invoiceId: parsed.data.invoiceId,
      paymentUrl: parsed.data.paymentUrl,
      expiresAt: parsed.data.expiresAt ?? null,
    };
  }

  /**
   * Read an invoice.
   *
   * A 410 is not an error to bubble up as a failure: it is Sam telling us the
   * invoice expired, which the caller handles as a normal outcome.
   */
  async getInvoice(invoiceId: string): Promise<SamInvoiceStatus> {
    const { status, json } = await this.request(`/pay/${encodeURIComponent(invoiceId)}`, {
      tolerate: [410],
    });

    if (status === 410) {
      return { status: "expired", amount: null, currency: null, paidAmount: null, paidAt: null, expiresAt: null };
    }

    const parsed = invoiceStatusSchema.safeParse(json);

    if (!parsed.success) {
      throw new SamError("contract", "Sam API returned an unreadable invoice status.");
    }

    return {
      status: parsed.data.status?.trim().toLowerCase() ?? "pending",
      amount: toAmount(parsed.data.amount),
      currency: parsed.data.currency?.trim().toUpperCase() ?? null,
      paidAmount: toAmount(parsed.data.paidAmount),
      paidAt: parsed.data.paidAt ?? null,
      expiresAt: parsed.data.expiresAt ?? null,
    };
  }

  /**
   * Ask Sam to match a transaction reference against the receiving wallet.
   *
   * `verified: false` is a legitimate answer with a 200 status — the reference
   * simply was not found — so it is returned rather than thrown.
   */
  async verifyInvoice(invoiceId: string, transactionRef: string): Promise<SamVerifyResult> {
    const { status, json } = await this.request(`/pay/${encodeURIComponent(invoiceId)}/verify`, {
      method: "POST",
      body: { transactionRef: transactionRef.trim() },
      tolerate: [410],
    });

    if (status === 410) {
      throw new SamError("expired", "The invoice expired before the payment could be verified.", 410, "EXPIRED");
    }

    const parsed = verifySchema.safeParse(json ?? {});
    const data = parsed.success ? parsed.data : {};

    return {
      verified: data.verified === true,
      message: data.message ?? null,
      paidAmount: toAmount(data.paidAmount ?? data.amount),
    };
  }

  /** The wallets linked to this API key, i.e. where a customer's money can land. */
  async listWallets(): Promise<SamWallet[]> {
    const { json } = await this.request("/v1/wallets");
    const parsed = walletsSchema.safeParse(json);

    if (!parsed.success) {
      throw new SamError("contract", "Sam API returned an unreadable wallet list.");
    }

    return parsed.data.map((wallet) => {
      const provider = normalizeProvider(wallet.provider);

      return {
        id: wallet.id ?? null,
        provider,
        label: wallet.label ?? wallet.providerDisplayName ?? null,
        identifier: identifierForWallet(wallet, provider),
        candidates: [wallet.walletAddress, wallet.phone, wallet.cashCode, wallet.accountNumber, wallet.id]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
        status: wallet.status ?? null,
      };
    });
  }

  async getWalletBalance(provider: SamMethod, identifier: string): Promise<SamWalletBalance[]> {
    const { json } = await this.request(
      `/v1/wallets/${provider}/${encodeURIComponent(identifier)}/balance`,
    );
    const parsed = balancesSchema.safeParse(json);

    if (!parsed.success) {
      return [];
    }

    return parsed.data.flatMap((entry) => {
      const amount = typeof entry.amount === "number" ? entry.amount : Number.parseFloat(String(entry.amount ?? ""));

      if (!entry.currency || !Number.isFinite(amount)) {
        return [];
      }

      return [{ currency: entry.currency.toUpperCase(), amount }];
    });
  }
}

/**
 * Find the linked wallet a stored identifier refers to.
 *
 * The owner may have saved a phone number while Sam wants the wallet address, so
 * matching is done across every field the wallet answers to and the provider's
 * preferred identifier is returned.
 */
export function resolveSamWallet(
  wallets: SamWallet[],
  provider: SamMethod,
  storedIdentifier: string,
): SamWallet | null {
  const needle = storedIdentifier.trim().toLowerCase();

  if (needle.length === 0) {
    return null;
  }

  return (
    wallets.find(
      (wallet) =>
        wallet.provider === provider &&
        wallet.candidates.some((candidate) => candidate.toLowerCase() === needle),
    ) ?? null
  );
}
