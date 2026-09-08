import type { BatStoreImportSummary } from "@/lib/services/batstore-import.service";

/**
 * BatStore import form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. `error` is a message key so the screen renders it in the admin's
 * language — the supplier's own kinds (`auth`, `rate_limit`, …) are reused, so
 * the G2Bulk error catalogue words these too.
 */
export type BatStoreImportActionState = {
  error: string | null;
  summary: BatStoreImportSummary | null;
};

export const INITIAL_BATSTORE_IMPORT_STATE: BatStoreImportActionState = {
  error: null,
  summary: null,
};