/**
 * Form state shared between the auth actions and the form that renders them.
 *
 * Lives outside the `"use server"` module because such a file may only export
 * async functions — a constant there is a build error.
 *
 * `error` and `notice` are message *keys*, not sentences: the action stays
 * locale-agnostic and the form looks the copy up in its own bundle.
 */
export type AuthActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_AUTH_STATE: AuthActionState = { error: null, notice: null };
