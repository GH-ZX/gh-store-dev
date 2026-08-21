import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Owner Telegram bot webhook.
 *
 * Telegram calls this address the moment someone sends the bot a message. It is
 * hosted as an edge function — like the G2Bulk and Sam callbacks — so the bot
 * works however and wherever the store itself is deployed, and it does not
 * depend on the Cloudflare Worker's environment or secrets.
 *
 * The gate is the same as the other callbacks: a per-store secret carried in
 * the URL Telegram was given, compared in constant time before anything is read
 * or written. `verify_jwt` is off — Telegram cannot send a Supabase JWT — so
 * this check runs first and is the only gate.
 *
 * It answers `200` immediately and does the work after, because Telegram
 * retries any webhook that answers slowly. Every failure is written to the
 * Worker-owned `telegram_alerts` queue? No — that queue is for the store → owner
 * direction. This function handles the owner → bot direction: commands. Alerts
 * stay in the Cloudflare Worker's scheduled drain.
 */

type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    from?: { id?: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number }; message_id?: number };
  };
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(status === 405 ? { allow: "POST" } : {}),
    },
  });
}

async function digest(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/** Constant-time comparison that does not leak the secret's length. */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

async function telegram(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;

    return response.ok && payload?.ok === true;
  } catch {
    return false;
  }
}

async function sendText(
  token: string,
  chatId: number,
  textValue: string,
  keyboard?: unknown,
): Promise<void> {
  await telegram(token, "sendMessage", {
    chat_id: chatId,
    text: textValue.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from("store_settings")
    .select("telegram")
    .eq("id", "global")
    .maybeSingle();

  if (settingsError) {
    return json({ ok: false, error: "settings_unavailable" }, 503);
  }

  const telegramSettings = settings?.telegram as {
    bot_token?: unknown;
    chat_id?: unknown;
    webhook_secret?: unknown;
  } | null;
  const expected = text(telegramSettings?.webhook_secret);
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  if (!expected || token.length === 0 || !(await secretMatches(token, expected))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const botToken = text(telegramSettings?.bot_token);

  if (!botToken) {
    return json({ ok: false, error: "bot_not_configured" }, 503);
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  /*
   * Acknowledge immediately; Telegram retries anything slower. The work runs
   * after the response is on its way.
   */
  const handle = async (): Promise<void> => {
    const message = update.message;
    const callback = update.callback_query;
    const chatId = message?.chat?.id ?? callback?.message?.chat?.id;

    if (chatId === undefined) {
      return;
    }

    const currentOwner = text(telegramSettings?.chat_id);
    const registered = currentOwner !== null && currentOwner === String(chatId);

    if (message?.text) {
      const command = message.text.trim().split(/\s+/)[0] ?? "";
      const ownerChatId = registered ? chatId : null;

      if (command === "/start") {
        if (currentOwner === null) {
          await supabase
            .from("store_settings")
            .update({ telegram: { ...telegramSettings, chat_id: String(chatId) } })
            .eq("id", "global");
        } else if (!registered) {
          await sendText(
            botToken,
            chatId,
            "This bot is for the store owner only.",
          );
          return;
        }

        await sendText(
          botToken,
          chatId,
          [
            "👋 <b>GH-Store owner bot</b> — this chat is registered.",
            "",
            "<b>Commands</b>",
            "/stats — store totals and balances",
            "/pending — recharges waiting for review",
            "/alerts — alert type guidance",
            "/help — this message",
            "",
            "Dashboard: https://gh-store.me/dashboard",
          ].join("\n"),
        );
        return;
      }

      // Every other command is owner-only.
      if (ownerChatId === null) {
        return;
      }

      if (command === "/help" || command === "/alerts") {
        await sendText(
          botToken,
          ownerChatId,
          [
            "<b>GH-Store owner bot</b>",
            "/stats — store totals and balances",
            "/pending — recharges waiting for review",
            "/alerts — alert type guidance",
            "/help — this message",
            "",
            "Store events are delivered automatically: new orders, failed orders, recharge requests, support messages, and low supplier balance.",
          ].join("\n"),
        );
        return;
      }

      if (command === "/stats") {
        const [orders, completed, recharges, support] = await Promise.all([
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["paid", "fulfilling"]),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "completed"),
          supabase.from("recharge_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("support_threads").select("id", { count: "exact", head: true }).in("status", ["open", "pending"]),
        ]);

        await sendText(
          botToken,
          ownerChatId,
          [
            "📊 <b>Store stats</b>",
            `Active orders: <b>${orders.count ?? 0}</b>`,
            `Completed: <b>${completed.count ?? 0}</b>`,
            `Pending recharges: <b>${recharges.count ?? 0}</b>`,
            `Open support: <b>${support.count ?? 0}</b>`,
          ].join("\n"),
          {
            inline_keyboard: [
              [
                { text: "⏳ Recharges", callback_data: "pending" },
                { text: "🛠 Dashboard", url: "https://gh-store.me/dashboard" },
              ],
            ],
          },
        );
        return;
      }

      if (command === "/pending") {
        const { data: rows } = await supabase
          .from("recharge_requests")
          .select("reference, requested_amount, payment_method")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(10);

        if (!rows || rows.length === 0) {
          await sendText(botToken, ownerChatId, "✅ No recharge requests waiting.");
          return;
        }

        await sendText(
          botToken,
          ownerChatId,
          [
            `⏳ <b>Pending recharges (${rows.length})</b>`,
            ...rows.map(
              (row, index) =>
                `${index + 1}. <code>${escapeHtml(row.reference)}</code> — <b>${money(row.requested_amount)}</b> · ${escapeHtml(row.payment_method ?? "—")}`,
            ),
            "",
            "Review: https://gh-store.me/dashboard/recharges",
          ].join("\n"),
        );
      }
      return;
    }

    if (callback) {
      if (registered) {
        if (callback.data === "pending") {
          const { data: rows } = await supabase
            .from("recharge_requests")
            .select("reference, requested_amount, payment_method")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(10);

          if (!rows || rows.length === 0) {
            await sendText(botToken, chatId, "✅ No recharge requests waiting.");
          } else {
            await sendText(
              botToken,
              chatId,
              [
                `⏳ <b>Pending recharges (${rows.length})</b>`,
                ...rows.map(
                  (row, index) =>
                    `${index + 1}. <code>${escapeHtml(row.reference)}</code> — <b>${money(row.requested_amount)}</b> · ${escapeHtml(row.payment_method ?? "—")}`,
                ),
              ].join("\n"),
            );
          }
        }
      }

      if (callback.id) {
        await telegram(botToken, "answerCallbackQuery", { callback_query_id: callback.id });
      }
    }
  };

  // Fire and forget, like the Worker's waitUntil.
  void handle();

  return json({ ok: true }, 200);
});
