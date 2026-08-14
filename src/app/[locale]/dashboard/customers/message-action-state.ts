/**
 * Owner-written message state.
 *
 * Outside `message-actions.ts` because a `"use server"` module may only export
 * async functions. Both fields are message keys, worded by the panel.
 */
export type MessageState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_MESSAGE_STATE: MessageState = { error: null, notice: null };
