/**
 * Telegram link form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. The code comes back to the form for display — the customer
 * sends it to the bot — and both fields carry message *keys* so the action stays
 * locale-agnostic.
 */
export type TelegramActionState = {
  error: string | null;
  notice: string | null;
  /** The minted code, shown once until it expires or is used. */
  code: string | null;
  expiresAt: string | null;
};

export const INITIAL_TELEGRAM_STATE: TelegramActionState = {
  error: null,
  notice: null,
  code: null,
  expiresAt: null,
};
