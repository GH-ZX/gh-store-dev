/**
 * Telegram alert settings state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Errors and notices are message keys so the page renders them in
 * the admin's language; nothing here can carry the bot token or webhook secret.
 */
export type TelegramActionState = {
  error: string | null;
  notice: string | null;
  /** Populated only by a successful bot verification. */
  bot: { username: string | null } | null;
  /** Reported by Telegram about the registered webhook. */
  webhook: { url: string | null; pendingUpdateCount: number; lastError: string | null } | null;
  /** The secret a successful registration generated, so the form can show it. */
  generatedSecret: string | null;
};

export const INITIAL_TELEGRAM_STATE: TelegramActionState = {
  error: null,
  notice: null,
  bot: null,
  webhook: null,
  generatedSecret: null,
};
