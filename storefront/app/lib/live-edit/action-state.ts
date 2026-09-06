import type { AdminMessages } from "@/i18n/messages";

/**
 * Shared shape for the editors that run on the storefront itself.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Results are message keys rather than prose, like every other
 * form in this codebase: the panel renders them in the admin's language.
 */

export type LiveEditState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_LIVE_EDIT_STATE: LiveEditState = { error: null, notice: null };

export function resolveLiveEditError(
  messages: AdminMessages["liveEdit"],
  key: string | null,
): string | null {
  if (!key) {
    return null;
  }

  switch (key) {
    case "not_found":
      return messages.errorNotFound;
    case "invalid_input":
      return messages.errorInvalid;
    default:
      return messages.errorUnknown;
  }
}
