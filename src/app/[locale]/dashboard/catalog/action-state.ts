/**
 * Catalog form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Both the game form and the packages form use one shape: a
 * message key for the failure and one for the success, resolved against the
 * caller's own message block so the same `saved` key reads "Game saved." on one
 * form and "Packages saved." on the other.
 */

export type CatalogActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_CATALOG_STATE: CatalogActionState = { error: null, notice: null };
