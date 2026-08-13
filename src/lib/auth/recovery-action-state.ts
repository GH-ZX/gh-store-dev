/**
 * Password recovery form state.
 *
 * Separate from `recovery-actions.ts` because a `"use server"` module may only
 * export async functions — a type or a constant there is a build error.
 *
 * Both fields carry message *keys*, never prose, so the action stays
 * locale-agnostic and the form resolves the wording from its own bundle.
 */
export type RecoveryActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_RECOVERY_STATE: RecoveryActionState = { error: null, notice: null };
