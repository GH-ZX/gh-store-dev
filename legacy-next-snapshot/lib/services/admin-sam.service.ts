import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { checkCallbackUrl, type CallbackReachability } from "@/lib/settings/callback-url";
import { readWebhookSecret } from "@/lib/services/sam-recharge.service";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { samCallbackUrl } from "@/lib/supabase/functions-url";
import { getSamCredentials } from "@/lib/services/admin-settings.service";
import type { SamMethod } from "@/lib/settings/sam-settings";
import {
  resolveSamWallet,
  SamClient,
  type SamWallet,
  type SamWalletTransaction,
} from "@/providers/sam/client";
import { SamError } from "@/providers/sam/errors";

/**
 * What the owner sees on the Sam API panel.
 *
 * Loaded on the page itself rather than behind a button. Pasting a key and being
 * shown nothing gives an owner no way to tell a working key from a broken one,
 * so the linked wallets, their balances, and their recent movements are fetched
 * whenever a key is stored — reaching the wallet list at all is what proves the
 * key works.
 *
 * Every provider failure is caught and returned as a message key. The provider
 * settings page must still render when Sam is down, because that page is where
 * the owner goes to fix it.
 */

export type SamLinkedWallet = {
  provider: SamMethod;
  label: string | null;
  identifier: string | null;
  balances: { currency: string; amount: number }[];
  /**
   * Why the balance is missing, as a message key.
   *
   * Separate from an empty list on purpose. Sam can list a wallet and then fail
   * to read its balance — it proxies that call on to ShamCash — and "no balance
   * shown" then means something the owner needs to know, not zero.
   */
  balanceError: string | null;
  /** True when this is the wallet the store has configured to receive money. */
  selected: boolean;
};

export type SamOverview = {
  /** Null when no key is stored: nothing to report rather than an error. */
  wallets: SamLinkedWallet[] | null;
  transactions: SamWalletTransaction[];
  /** Why the history is missing, as a message key; null when it simply is empty. */
  transactionsError: string | null;
  /** A failure listing the wallets at all, as a message key. */
  error: string | null;
  /** Shown without its secret, which stays on the server. */
  callbackUrl: string;
  callbackReachability: CallbackReachability;
};

const TRANSACTION_LIMIT = 12;

/** The exact address Sam is handed, secret included, for the owner to check. */
async function callbackAddress(): Promise<string> {
  return samCallbackUrl(getSupabaseEnv().url, await readWebhookSecret());
}

/**
 * How long the whole panel may spend waiting on Sam.
 *
 * The client allows 15 seconds per request and this makes three rounds of them,
 * so an unhealthy Sam could hold the page for the best part of a minute — the
 * page the owner opens *because* Sam is unhealthy. Past this budget the settings
 * render with an "unavailable" notice instead, which is the state that lets them
 * act.
 */
const OVERVIEW_BUDGET_MS = 8_000;

async function withinBudget<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), OVERVIEW_BUDGET_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function emptyOverview(callbackUrl: string, error: string | null): SamOverview {
  return {
    wallets: null,
    transactions: [],
    transactionsError: null,
    error,
    callbackUrl,
    callbackReachability: checkCallbackUrl(callbackUrl),
  };
}

/** A failure Sam reported, reduced to a message key the panel can word. */
function reason(error: unknown): string {
  return error instanceof SamError ? error.kind : "unknown";
}

/**
 * Most recent first, with undated entries last.
 *
 * Sam returns `occurredAt` as a naive timestamp, so these are compared as
 * strings — which sorts correctly for a fixed ISO-like format and avoids
 * inventing a timezone the provider did not state.
 */
function byNewest(a: SamWalletTransaction, b: SamWalletTransaction): number {
  return (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "");
}

export async function getSamOverview(): Promise<SamOverview> {
  await requireAdmin();

  const [credentials, callbackUrl] = await Promise.all([getSamCredentials(), callbackAddress()]);
  const base = emptyOverview(callbackUrl, null);

  if (!credentials.apiKey) {
    return base;
  }

  const apiKey = credentials.apiKey;

  return withinBudget(
    () => loadFromSam(apiKey, credentials, base),
    emptyOverview(callbackUrl, "provider"),
  );
}

async function loadFromSam(
  apiKey: string,
  credentials: { shamcashIdentifier: string | null; syriatelIdentifier: string | null },
  base: SamOverview,
): Promise<SamOverview> {
  let linked: SamWallet[];

  const client = new SamClient(apiKey);

  try {
    linked = await client.listWallets();
  } catch (error) {
    return emptyOverview(base.callbackUrl, error instanceof SamError ? error.kind : "unknown");
  }

  const wallets: SamLinkedWallet[] = await Promise.all(
    linked.map(async (wallet) => {
      const stored =
        wallet.provider === "shamcash" ? credentials.shamcashIdentifier : credentials.syriatelIdentifier;

      /*
       * Listing a wallet and reading its balance are separate calls to Sam, and
       * the second one fails on its own — it is passed through to ShamCash,
       * which can be unreachable while Sam itself answers fine. The reason is
       * kept rather than swallowed: a blank balance with no explanation reads as
       * "this store is broken" when the truth is "Sam cannot reach your wallet".
       */
      const balance = wallet.identifier
        ? await client
            .getWalletBalance(wallet.provider, wallet.identifier)
            .then((balances) => ({ balances, error: null as string | null }))
            .catch((error: unknown) => ({ balances: [], error: reason(error) }))
        : { balances: [], error: "wallet" as string | null };

      return {
        provider: wallet.provider,
        label: wallet.label,
        identifier: wallet.identifier,
        balances: balance.balances,
        balanceError: balance.error,
        selected: stored
          ? resolveSamWallet(linked, wallet.provider, stored)?.identifier === wallet.identifier
          : false,
      };
    }),
  );

  /*
   * History follows the wallet the store actually collects money into. Before
   * the owner has picked one, the first linked wallet is used instead — on a
   * fresh setup that is the only way to show that the key reaches real data.
   */
  const chosen = wallets.filter((wallet) => wallet.selected);
  const targets = (chosen.length > 0 ? chosen : wallets.slice(0, 1)).filter(
    (wallet): wallet is SamLinkedWallet & { identifier: string } => Boolean(wallet.identifier),
  );

  const histories = await Promise.all(
    targets.map((wallet) =>
      client
        .listWalletTransactions(wallet.provider, wallet.identifier)
        .then((items) => ({ items, error: null as string | null }))
        .catch((error: unknown) => ({ items: [] as SamWalletTransaction[], error: reason(error) })),
    ),
  );

  return {
    ...base,
    wallets,
    transactions: histories
      .flatMap((history) => history.items)
      .sort(byNewest)
      .slice(0, TRANSACTION_LIMIT),
    // The first reason is enough: the owner needs to know it failed and why, not
    // once per wallet.
    transactionsError: histories.find((history) => history.error)?.error ?? null,
  };
}
