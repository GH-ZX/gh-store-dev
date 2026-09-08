import type { ImportFormSummary } from "@/lib/import/types";

/**
 * Shared action state for all import forms.
 *
 * Every provider's action returns this shape. The summary is normalised from
 * the provider-specific summary types into the universal `ImportFormSummary`.
 */
export type UniversalImportActionState = {
  error: string | null;
  summary: ImportFormSummary | null;
};

export const INITIAL_UNIVERSAL_IMPORT_STATE: UniversalImportActionState = {
  error: null,
  summary: null,
};
