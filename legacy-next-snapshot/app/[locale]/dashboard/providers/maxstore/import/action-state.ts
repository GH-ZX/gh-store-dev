import type { MaxStoreImportSummary } from "@/lib/services/maxstore-import.service";

/**
 * MaxStore import form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. `error` is a message key so the screen renders it in the admin's
 * language — the supplier's own kinds (`auth`, `rate_limit`, …) are reused, so
 * the G2Bulk error catalogue words these too.
 */
export type MaxStoreImportActionState = {
  error: string | null;
  summary: MaxStoreImportSummary | null;
};

export const INITIAL_MAXSTORE_IMPORT_STATE: MaxStoreImportActionState = {
  error: null,
  summary: null,
};
