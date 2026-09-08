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
 * How long a link code lives.
 *
 * Five minutes, not ten: the code is shown to whoever is signed in and typed
 * straight into a chat beside them, so anything past a few minutes only
 * widens the window a leaked screenshot is dangerous in.
 */
const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Mint a fresh link code for the signed-in account.
 *
 * Codes are short-lived ({@link CODE_TTL_MS}) and one-use. Re-running the action
 * retires the previous pending code for this account by marking it used, so an
 * old code someone copied from a shared screen cannot be raced against a new one.
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
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

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

/**
 * Mint a 6-digit code from the Telegram connect page.
 *
 * Same one-use, short-lived contract as {@link mintTelegramLinkCode} but the
 * code is all digits, because the connect flow asks the customer to type it
 * back in the chat rather than copy it. The bot accepts it through the same
 * table and code path.
 */
export async function mintTelegramConnectCode(): Promise<{ code: string; expiresAt: string }> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  // Retire any previously minted, still-pending code for this account.
  await supabase
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("used_at", null);

  const code = generateConnectCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const { error } = await supabase.from("telegram_link_codes").insert({
    user_id: user.id,
    code,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Minting a Telegram connect code failed: ${error.message}`);
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

/**
 * A uniform draw from `[0, bound)` using the platform CSPRNG.
 *
 * The pseudorandom generator this replaced was predictable enough that a
 * six-character code was worth guessing, so the source matters as much as the
 * length. Rejection sampling removes the modulo bias a bare remainder would
 * introduce — with a biased draw the first characters of the alphabet come up
 * measurably more often, exactly the lean an exhaustive guesser feeds on.
 */
function randomIndex(bound: number): number {
  const range = 0x1_0000_0000;
  const limit = range - (range % bound);
  const buffer = new Uint32Array(1);

  let value = 0;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return value % bound;
}

/** A code like `GS-1F4K2X`: unambiguous letters and digits, no 0/O/1/I. */
function generateLinkCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chars: string[] = [];

  for (let index = 0; index < 6; index += 1) {
    chars.push(alphabet[randomIndex(alphabet.length)]);
  }

  return `GS-${chars.join("")}`;
}

/** A 6-digit code like `483920`, zero-padded, for the connect page. */
function generateConnectCode(): string {
  return String(randomIndex(1_000_000)).padStart(6, "0");
}
