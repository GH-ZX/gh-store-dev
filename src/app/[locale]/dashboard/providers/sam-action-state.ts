import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * Sam API form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Nothing here can carry the API key or the webhook secret:
 * `wallets` is the list of the store's own linked wallets, which is what an owner
 * needs in order to pick the one that should receive customers' money.
 */

export type SamWalletOption = {
  provider: SamMethod;
  label: string | null;
  identifier: string | null;
  /** Balances Sam reports for this wallet, purely informational. */
  balances: { currency: string; amount: number }[];
};

export type SamActionState = {
  error: string | null;
  notice: string | null;
  wallets: SamWalletOption[] | null;
};

export const INITIAL_SAM_STATE: SamActionState = { error: null, notice: null, wallets: null };
