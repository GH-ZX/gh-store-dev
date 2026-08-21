import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The customer half of the Telegram bot link.
 *
 * The bot (a Supabase Edge Function) never sees a password. Instead the profile
 * page mints a short-lived, one-use code — visible only to the signed-in
 * account owner — and the customer sends it to the bot. The bot consumes the
 * code and writes the chat → account link. This module mints those codes and
 * reports link state; it never reads or writes chat rows (the bot owns them).
 */

export type TelegramLinkStatus = {
  linked: boolean;
  /** Telegram username or first name of the linked chat, for display. */
  chatLabel: string | null;
  linkedAt: string | null;
};

export async function getMyTelegramLink(): Promise<TelegramLinkStatus> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("telegram_chat_links")
    .select("chat_id, username, first_name, linked_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return { linked: false, chatLabel: null, linkedAt: null };
  }

  return {
    linked: true,
    chatLabel: data.username ? `@${data.username}` : data.first_name ?? null,
    linkedAt: data.linked_at,
  };
}

/**
 * Mint a fresh link code for the signed-in account.
 *
 * Codes are short-lived (10 minutes) and one-use. Re-running the action retires
 * the previous pending code for this account by marking it used, so an old code
 * someone copied from a shared screen cannot be raced against a new one.
 */
export async function mintTelegramLinkCode(): Promise<{ code: string; expiresAt: string }> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  // Retire any previously minted, still-pending code for this account.
  await supabase
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("used_at", null);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const { error } = await supabase.from("telegram_link_codes").insert({
    user_id: user.id,
    code,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Minting a Telegram link code failed: ${error.message}`);
  }

  return { code, expiresAt: expiresAt.toISOString() };
}

/** Unlink the signed-in account's chat, if any. */
export async function unlinkMyTelegram(): Promise<void> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("telegram_chat_links")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Unlinking Telegram failed: ${error.message}`);
  }
}

/** A code like `GS-1F4K2X`: unambiguous letters and digits, no 0/O/1/I. */
function generateLinkCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chars: string[] = [];

  for (let index = 0; index < 6; index += 1) {
    chars.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }

  return `GS-${chars.join("")}`;
}
