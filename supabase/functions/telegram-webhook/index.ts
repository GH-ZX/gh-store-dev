import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * GH Store Telegram bot webhook.
 *
 * Telegram calls this address the moment someone sends the bot a message. It is
 * hosted as an edge function — like the G2Bulk and Sam callbacks — so the bot
 * works however and wherever the store itself is deployed, and it does not
 * depend on the Cloudflare Worker's environment or secrets.
 *
 * Two audiences share one bot:
 *
 * - The owner, whose chat is stored in `store_settings.telegram.chat_id`, gets
 *   the store operations: /stats, /pending, /alerts, /help.
 * - Customers get the storefront: browse, their orders, and their wallet.
 *   Before any of that works they link their Telegram chat to their store
 *   account with a short-lived code minted on the site's profile page — the bot
 *   never asks for a password.
 *
 * The gate is the same as the other callbacks: a per-store secret carried in
 * the URL Telegram was given, compared in constant time before anything is read
 * or written. `verify_jwt` is off — Telegram cannot send a Supabase JWT — so
 * this check runs first and is the only gate.
 *
 * It answers `200` immediately and does the work after, because Telegram
 * retries any webhook that answers slowly.
 */

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; type?: string };
    from?: { id?: number; first_name?: string; username?: string; language_code?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; first_name?: string; username?: string; language_code?: string };
    message?: { chat?: { id?: number; type?: string }; message_id?: number };
  };
};

type Locale = "ar" | "en";

type Texts = {
  welcome: string;
  linkedMenu: string;
  signInHint: string;
  orders: string;
  ordersEmpty: string;
  wallet: string;
  walletEmpty: string;
  account: string;
  link: string;
  unlink: string;
  unlinkConfirm: string;
  browse: string;
  support: string;
  menu: string;
  codePrompt: string;
  codeAccepted: string;
  codeInvalid: string;
  codeUsed: string;
  codeExpired: string;
  needLink: string;
  notFound: string;
  orderStatus: string;
};

const TEXTS: Record<Locale, Texts> = {
  ar: {
    welcome:
      "👋 أهلاً بك في <b>GH Store</b>!\n\nاختر ما تريد من الأزرار بالأسفل. لربط حسابك بالمحادثة اضغط «دخول». إذا لم يكن لديك حساب، أنشئه من المتجر أولًا.",
    linkedMenu: "مرحبًا بعودتك! استخدم الأزرار للاطلاع على طلباتك ورصيدك.",
    signInHint: "لربط حسابك بالمحادثة: افتح المتجر وادخل إلى حسابك، ثم «ربط تيليغرام» وانسخ الرمز وأرسله هنا.",
    orders: "📦 طلباتك الأخيرة",
    ordersEmpty: "لا توجد طلبات بعد.",
    wallet: "👛 رصيد محفظتك",
    walletEmpty: "لا توجد محفظة لهذا الحساب بعد.",
    account: "👤 الحساب",
    link: "🔗 ربط الحساب",
    unlink: "🔓 إلغاء الربط",
    unlinkConfirm: "تم إلغاء ربط هذه المحادثة بحسابك.",
    browse: "🛍 تصفح المتجر",
    support: "💬 الدعم",
    menu: "🏠 القائمة",
    codePrompt: "أرسل الرمز الذي يظهر لك في صفحة حسابك على المتجر.",
    codeAccepted: "✅ تم ربط هذه المحادثة بحسابك! استخدم الأزرار للاطلاع على طلباتك ورصيدك.",
    codeInvalid: "هذا الرمز غير صحيح. تحقق منه ثم أرسله مجددًا.",
    codeUsed: "هذا الرمز مستخدم بالفعل. اطلب رمزًا جديدًا من صفحة حسابك.",
    codeExpired: "انتهت صلاحية هذا الرمز. اطلب رمزًا جديدًا من صفحة حسابك.",
    needLink: "هذه الميزة تحتاج ربط حسابك أولًا. اضغط «ربط الحساب».",
    notFound: "لا شيء هنا بعد.",
    orderStatus: "الحالة",
  },
  en: {
    welcome:
      "👋 Welcome to <b>GH Store</b>!\n\nPick what you need from the buttons below. To connect your account to this chat, tap Sign in. No account yet? Create one on the store first.",
    linkedMenu: "Welcome back! Use the buttons to see your orders and balance.",
    signInHint: "To link this chat to your account: open the store, sign in, then under “Telegram” copy the code and send it here.",
    orders: "📦 Your latest orders",
    ordersEmpty: "No orders yet.",
    wallet: "👛 Your wallet balance",
    walletEmpty: "No wallet for this account yet.",
    account: "👤 Account",
    link: "🔗 Sign in",
    unlink: "🔓 Unlink account",
    unlinkConfirm: "This chat is no longer linked to your account.",
    browse: "🛍 Browse the store",
    support: "💬 Support",
    menu: "🏠 Menu",
    codePrompt: "Send the code shown on your account page in the store.",
    codeAccepted: "✅ This chat is now linked to your account! Use the buttons to see your orders and balance.",
    codeInvalid: "That code does not look right. Check it and send it again.",
    codeUsed: "That code has already been used. Request a fresh one from your account page.",
    codeExpired: "That code has expired. Request a fresh one from your account page.",
    needLink: "This needs a linked account first. Tap Sign in to connect.",
    notFound: "Nothing here yet.",
    orderStatus: "Status",
  },
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

function localeOf(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function t(locale: Locale, key: keyof Texts): string {
  return TEXTS[locale][key];
}

function menuKeyboard(locale: Locale, linked: boolean): unknown {
  return {
    inline_keyboard: [
      linked
        ? [
            { text: t(locale, "orders"), callback_data: "orders" },
            { text: t(locale, "wallet"), callback_data: "wallet" },
          ]
        : [{ text: t(locale, "link"), callback_data: "link" }],
      [
        { text: t(locale, "browse"), url: "https://gh-store.me" },
        { text: t(locale, "support"), url: "https://gh-store.me/support" },
      ],
      linked ? [{ text: t(locale, "unlink"), callback_data: "unlink" }] : [],
    ].filter((row) => row.length > 0),
  };
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

/** A code like `GS1F4K2X` or `1F4K2X` — uppercase letters and digits. */
const CODE_PATTERN = /^(?:GS-?)?[A-Z0-9]{6,8}$/;

async function readChatLink(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
): Promise<{ user_id: string } | null> {
  const { data } = await supabase
    .from("telegram_chat_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .maybeSingle();

  return data ?? null;
}

async function readWallet(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ balance: number; currency: string } | null> {
  const { data } = await supabase
    .from("wallets")
    .select("balance, currency")
    .eq("user_id", userId)
    .maybeSingle();

  return data ?? null;
}

async function readOrders(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ order_number: string; status: string; total: number; currency: string }[]> {
  const { data } = await supabase
    .from("orders")
    .select("order_number, status, total, currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((row) => ({
    order_number: row.order_number,
    status: row.status,
    total: row.total,
    currency: row.currency,
  }));
}

async function readProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ email: string | null; full_name: string | null; username: string | null } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name, username")
    .eq("id", userId)
    .maybeSingle();

  return data ?? null;
}

/**
 * Try to consume a link code and bind the chat to its account.
 *
 * Returns `null` when the code is unknown/used/expired — the caller decides what
 * to tell the user based on {@link ConsumeResult}.
 */
async function consumeLinkCode(
  supabase: ReturnType<typeof createClient>,
  code: string,
  chatId: number,
  username: string | null,
  firstName: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; reason: "invalid" | "used" | "expired" }> {
  const { data: row } = await supabase
    .from("telegram_link_codes")
    .select("id, user_id, used_at, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!row) {
    return { ok: false, reason: "invalid" };
  }

  if (row.used_at) {
    return { ok: false, reason: "used" };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { error: linkError } = await supabase.from("telegram_chat_links").upsert(
    {
      chat_id: chatId,
      user_id: row.user_id,
      username: username ?? null,
      first_name: firstName ?? null,
    },
    { onConflict: "chat_id" },
  );

  if (linkError) {
    return { ok: false, reason: "invalid" };
  }

  await supabase.from("telegram_link_codes").update({ used_at: new Date().toISOString(), chat_id: chatId }).eq("id", row.id);

  return { ok: true, userId: row.user_id };
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

  /*
   * The app stores the settings double-wrapped (the column value is
   * `{ telegram: { ... } }` — its own readers unwrap it with a schema). Unwrap
   * defensively so the secret is found either way.
   */
  const stored = settings?.telegram as Record<string, unknown> | undefined;
  const telegramSettings = (stored?.telegram && typeof stored.telegram === "object"
    ? stored.telegram
    : stored) as {
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

    const locale = localeOf(message?.from?.language_code ?? callback?.from?.language_code);
    const ownerChatId = text(telegramSettings?.chat_id);
    const isOwner = ownerChatId !== null && ownerChatId === String(chatId);
    const link = await readChatLink(supabase, chatId);
    const linked = link !== null;

    if (message?.text) {
      const command = message.text.trim().split(/\s+/)[0] ?? "";
      const rest = message.text.trim().slice(command.length).trim();

      // ── Owner /start ─────────────────────────────────────────────────────
      if (command === "/start" && isOwner) {
        if (ownerChatId === null) {
          // Store the same wrapped shape the app's own writers use
          // (`telegram` column value = `{ telegram: { ... } }`) so the dashboard
          // readers see the settings. A flat write here would confuse them.
          await supabase
            .from("store_settings")
            .update({ telegram: { telegram: { ...telegramSettings, chat_id: String(chatId) } } })
            .eq("id", "global");
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

      // ── Customer /start ──────────────────────────────────────────────────
      if (command === "/start") {
        await sendText(botToken, chatId, linked ? t(locale, "linkedMenu") : t(locale, "welcome"), menuKeyboard(locale, linked));
        return;
      }

      // Owner-only commands.
      if (isOwner) {
        if (command === "/help" || command === "/alerts") {
          await sendText(
            botToken,
            chatId,
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
            chatId,
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
            await sendText(botToken, chatId, "✅ No recharge requests waiting.");
            return;
          }

          await sendText(
            botToken,
            chatId,
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
          return;
        }

        // An unknown command from the owner falls through to the customer path;
        // nothing below applies to an owner without a link, so stop quietly.
        return;
      }

      // ── Customer: link code ──────────────────────────────────────────────
      // A code can arrive as `/link CODE`, `/link` (then the next message), or
      // the code on its own.
      const candidate = command === "/link" ? rest : command === "/start" ? "" : message.text.trim();
      const looksLikeCode = CODE_PATTERN.test(candidate);

      if (looksLikeCode) {
        const result = await consumeLinkCode(
          supabase,
          candidate,
          chatId,
          text(message.from?.username),
          text(message.from?.first_name),
        );

        if (result.ok) {
          await sendText(botToken, chatId, t(locale, "codeAccepted"), menuKeyboard(locale, true));
        } else {
          await sendText(botToken, chatId, t(locale, `code_${result.reason}`));
        }
        return;
      }

      if (command === "/link" || command === "/signin") {
        await sendText(botToken, chatId, t(locale, linked ? "linkedMenu" : "signInHint"));
        return;
      }

      if (command === "/orders") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }
        const orders = await readOrders(supabase, link.user_id);
        if (orders.length === 0) {
          await sendText(botToken, chatId, t(locale, "ordersEmpty"));
          return;
        }
        await sendText(
          botToken,
          chatId,
          [
            t(locale, "orders"),
            ...orders.map(
              (order) =>
                `${order.order_number} — <b>${money(order.total)}</b> · ${escapeHtml(order.status)}`,
            ),
          ].join("\n"),
        );
        return;
      }

      if (command === "/wallet") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }
        const wallet = await readWallet(supabase, link.user_id);
        await sendText(
          botToken,
          chatId,
          wallet ? `${t(locale, "wallet")}\n<b>${money(wallet.balance)}</b> ${escapeHtml(wallet.currency)}` : t(locale, "walletEmpty"),
        );
        return;
      }

      if (command === "/account") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }
        const profile = await readProfile(supabase, link.user_id);
        await sendText(
          botToken,
          chatId,
          [
            t(locale, "account"),
            profile?.email ? `📧 ${escapeHtml(profile.email)}` : "",
            profile?.full_name ? `👤 ${escapeHtml(profile.full_name)}` : "",
            profile?.username ? `@${escapeHtml(profile.username)}` : "",
          ]
            .filter((line) => line.length > 0)
            .join("\n"),
        );
        return;
      }

      if (command === "/unlink") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }
        await supabase.from("telegram_chat_links").delete().eq("chat_id", chatId);
        await sendText(botToken, chatId, t(locale, "unlinkConfirm"), menuKeyboard(locale, false));
        return;
      }

      // Anything else from an unlinked customer: point at the menu.
      if (!linked) {
        await sendText(botToken, chatId, t(locale, "welcome"), menuKeyboard(locale, false));
      }
      return;
    }

    if (callback) {
      const data = callback.data ?? "";

      switch (data) {
        case "menu":
          await sendText(botToken, chatId, linked ? t(locale, "linkedMenu") : t(locale, "welcome"), menuKeyboard(locale, linked));
          break;

        case "link":
          await sendText(botToken, chatId, t(locale, "signInHint"));
          break;

        case "orders":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            const orders = await readOrders(supabase, link.user_id);
            await sendText(
              botToken,
              chatId,
              orders.length === 0
                ? t(locale, "ordersEmpty")
                : [
                    t(locale, "orders"),
                    ...orders.map(
                      (order) =>
                        `${order.order_number} — <b>${money(order.total)}</b> · ${escapeHtml(order.status)}`,
                    ),
                  ].join("\n"),
            );
          }
          break;

        case "wallet":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            const wallet = await readWallet(supabase, link.user_id);
            await sendText(
              botToken,
              chatId,
              wallet ? `${t(locale, "wallet")}\n<b>${money(wallet.balance)}</b> ${escapeHtml(wallet.currency)}` : t(locale, "walletEmpty"),
            );
          }
          break;

        case "account":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            const profile = await readProfile(supabase, link.user_id);
            await sendText(
              botToken,
              chatId,
              [
                t(locale, "account"),
                profile?.email ? `📧 ${escapeHtml(profile.email)}` : "",
                profile?.full_name ? `👤 ${escapeHtml(profile.full_name)}` : "",
                profile?.username ? `@${escapeHtml(profile.username)}` : "",
              ]
                .filter((line) => line.length > 0)
                .join("\n"),
            );
          }
          break;

        case "unlink":
          await supabase.from("telegram_chat_links").delete().eq("chat_id", chatId);
          await sendText(botToken, chatId, t(locale, "unlinkConfirm"), menuKeyboard(locale, false));
          break;

        case "pending":
          if (!isOwner) {
            break;
          }
          const { data: rows } = await supabase
            .from("recharge_requests")
            .select("reference, requested_amount, payment_method")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(10);
          if (rows && rows.length > 0) {
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
          } else {
            await sendText(botToken, chatId, "✅ No recharge requests waiting.");
          }
          break;
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
