import type { ImportSummary } from "@/providers/g2bulk/import-types";

/**
 * Provider form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Errors are message keys so the page renders them in the
 * admin's language, and no shape here can carry the API key.
 */

export type ProviderActionState = {
  error: string | null;
  notice: string | null;
  /** Populated only by a successful key verification. */
  account: { username: string; balance: number } | null;
};

export const INITIAL_PROVIDER_STATE: ProviderActionState = {
  error: null,
  notice: null,
  account: null,
};

export type ImportActionState = {
  error: string | null;
  summary: ImportSummary | null;
};

export const INITIAL_IMPORT_STATE: ImportActionState = { error: null, summary: null };
