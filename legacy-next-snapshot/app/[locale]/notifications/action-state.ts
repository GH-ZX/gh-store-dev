/**
 * Notification form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions.
 */
export type NotificationActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_NOTIFICATION_STATE: NotificationActionState = { error: null, notice: null };
