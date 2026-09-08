import type { ImportSummary } from "@/providers/g2bulk/import-types";

/**
 * Voucher import form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. `error` is a message key, never prose, so the page renders it
 * in the admin's language — and nothing in this shape can carry the API key.
 */

export type VoucherImportActionState = {
  error: string | null;
  summary: ImportSummary | null;
};

export const INITIAL_VOUCHER_IMPORT_STATE: VoucherImportActionState = {
  error: null,
  summary: null,
};
