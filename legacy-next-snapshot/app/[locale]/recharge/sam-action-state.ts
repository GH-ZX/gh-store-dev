/**
 * Sam top-up form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. `status` mirrors the invoice so the payment screen can tell "still
 * waiting" apart from "credited" and "expired" without a second round trip.
 */
export type SamTopUpState = {
  error: string | null;
  notice: string | null;
  /** Free-text detail from the provider, e.g. why a reference did not match. */
  detail: string | null;
  status: "idle" | "pending" | "credited" | "awaiting_review" | "expired";
};

export const INITIAL_SAM_TOPUP_STATE: SamTopUpState = {
  error: null,
  notice: null,
  detail: null,
  status: "idle",
};
