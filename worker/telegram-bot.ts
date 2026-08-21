/**
 * Owner Telegram bot.
 *
 * Two jobs, both running in the Cloudflare Worker:
 *
 * 1. `handleTelegramWebhook` answers updates Telegram POSTs to
 *    `https://gh-store.me/telegram-webhook`. It is owner-only: the bot's chat
 *    id is registered from `/start`, and every other command is refused unless
 *    the sender's chat matches it. The webhook secret is verified first and the
 *    response is sent before the command is processed, so Telegram never sees a
 *    slow reply and retries the same update.
 *
 * 2. `deliverTelegramAlerts` is called from the Worker's scheduled handler. It
 *    drains `telegram_alerts` — rows written by the store's server code on
 *    orders, failures, recharges, support messages, and low supplier balance —
 *    and posts them to the owner's chat.
 *
 * Secrets live in the Worker environment: `TELEGRAM_BOT_TOKEN` and
 * `TELEGRAM_WEBHOOK_SECRET` must be set as Worker secrets, and
 * `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` already exist for reconciliation.
 */

export type BotEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  RECONCILE_CRON_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type BotContext = { waitUntil(promise: Promise<unknown>): void };

const TG_API = "https://api.telegram.org";
const G2BULK_API = "https://api.g2bulk.com/v1";
const BATCH = 10;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

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

type TelegramSettings = {
  bot_token?: string | null;
  chat_id?: string | null;
  enabled?: boolean;
  linked_at?: string | null;
  alert_prefs?: Record<string, boolean> | null;
};

type AlertRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function botLog(event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ time: new Date().toISOString(), area: "telegram", event, ...fields }));
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

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Constant-time comparison so a timing signal cannot reveal the secret. */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const digest = async (value: string): Promise<Uint8Array> => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return new Uint8Array(bytes);
  };

  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let mismatch = 0;

  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }

  return mismatch === 0;
}

async function telegram(method: string, body: Record<string, unknown>, token: string): Promise<boolean> {
  try {
    const response = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;

    if (!response.ok || payload?.ok !== true) {
      botLog("telegram_api_failed", { method, status: response.status });
      return false;
    }

    return true;
  } catch (error) {
    botLog("telegram_api_threw", { method, error: error instanceof Error ? error.message : "Unknown" });
    return false;
  }
}

async function sendText(chatId: string, text: string, token: string, keyboard?: unknown): Promise<boolean> {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    },
    token,
  );
}

// ─── Supabase REST (service role) ───────────────────────────────────────────

async function supabaseJson(
  env: BotEnv,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const url = `${env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    ...(init.method === "PATCH" || init.method === "POST"
      ? { "content-type": "application/json", prefer: "return=minimal" }
      : {}),
    ...(init.headers ?? {}),
  };

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let json: unknown = null;

  if (response.status !== 204) {
    json = await response.json().catch(() => null);
  }

  return { ok: response.ok, status: response.status, json };
}

async function readSettings(env: BotEnv): Promise<{ telegram: TelegramSettings; providers: Record<string, unknown> }> {
  const { ok, json } = await supabaseJson(env, "store_settings?id=eq.global&select=telegram,providers");

  if (!ok) {
    return { telegram: {}, providers: {} };
  }

  const row = Array.isArray(json) ? (json[0] as { telegram?: unknown; providers?: unknown } | undefined) : undefined;

  return {
    telegram: (row?.telegram && typeof row.telegram === "object" ? row.telegram : {}) as TelegramSettings,
    providers: (row?.providers && typeof row.providers === "object" ? row.providers : {}) as Record<string, unknown>,
  };
}

async function saveSettings(
  env: BotEnv,
  patch: { chat_id?: string; linked_at?: string; enabled?: boolean },
): Promise<void> {
  const current = await readSettings(env);
  const next: TelegramSettings = { ...current.telegram, ...patch };

  await supabaseJson(env, "store_settings?id=eq.global", {
    method: "PATCH",
    body: { telegram: next },
  });
}

async function fetchPendingAlerts(env: BotEnv, limit: number): Promise<AlertRow[]> {
  // `failed` rows are retried on the next drain; only `sent` rows are skipped.
  const { ok, json } = await supabaseJson(
    env,
    `telegram_alerts?status=in.(pending,failed)&order=created_at.asc&limit=${limit}&select=id,type,payload,created_at`,
  );

  if (!ok) {
    return [];
  }

  return (Array.isArray(json) ? json : []).map((row) => {
    const value = row as { id: string; type: string; payload?: unknown; created_at: string };
    return {
      id: value.id,
      type: value.type,
      payload: value.payload && typeof value.payload === "object" ? (value.payload as Record<string, unknown>) : {},
      created_at: value.created_at,
    };
  });
}

async function markAlert(env: BotEnv, id: string, status: "sent" | "failed"): Promise<void> {
  await supabaseJson(env, `telegram_alerts?id=eq.${id}`, {
    method: "PATCH",
    body: {
      status,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
      last_attempted_at: new Date().toISOString(),
    },
  });
}

async function countRows(env: BotEnv, table: string, filter: string): Promise<number> {
  const { ok, json } = await supabaseJson(env, `${table}?${filter}&select=id`, {
    headers: { prefer: "count=exact", range: "0-0" },
  });

  if (!ok || !Array.isArray(json)) {
    return 0;
  }

  return json.length;
}

// ─── Message rendering ──────────────────────────────────────────────────────

function alertText(row: AlertRow): string {
  const p = row.payload;

  switch (row.type) {
    case "order_placed":
      return [
        "🛒 <b>New order</b>",
        `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
        `Amount: <b>${money(p.total)}</b>`,
        `Dashboard: https://gh-store.me/dashboard/orders`,
      ].join("\n");

    case "order_failed":
      return [
        "❌ <b>Order failed</b>",
        `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
        `Refunded: ${p.refunded === true ? "✅ Yes" : "⚠️ No — needs a decision"}`,
        `Reason: ${escapeHtml(p.reason ?? "unknown")}`,
        `Dashboard: https://gh-store.me/dashboard/orders`,
      ].join("\n");

    case "recharge_request":
      return [
        "💳 <b>Recharge request</b>",
        `Reference: <code>${escapeHtml(p.reference ?? "—")}</code>`,
        `Amount: <b>${money(p.amount)}</b>`,
        `Method: ${escapeHtml(p.method ?? "—")}`,
        `Review: https://gh-store.me/dashboard/recharges`,
      ].join("\n");

    case "support_message":
      return [
        "💬 <b>New support message</b>",
        `Subject: <b>${escapeHtml(p.subject ?? "—")}</b>`,
        p.body ? `\n${escapeHtml(p.body)}` : "",
        `Open: https://gh-store.me/dashboard/support`,
      ]
        .filter((line) => line.length > 0)
        .join("\n");

    case "low_wallet":
      return [
        "⚠️ <b>Supplier wallet is low</b>",
        `Balance: <b>${money(p.balance)}</b>`,
        `Required: ${money(p.required)}`,
        `Checkout is refusing purchases until the G2Bulk wallet is topped up.`,
        `Providers: https://gh-store.me/dashboard/providers`,
      ].join("\n");

    default:
      return `📢 ${escapeHtml(row.type)}`;
  }
}

// ─── Owner commands ─────────────────────────────────────────────────────────

async function requireOwner(env: BotEnv, chatId: string): Promise<boolean> {
  const { telegram } = await readSettings(env);
  const owner = textValue(telegram.chat_id);

  return owner !== null && owner === chatId;
}

async function handleStart(env: BotEnv, chatId: string, firstName: string): Promise<boolean> {
  const { telegram, providers } = await readSettings(env);
  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);
  const owner = textValue(telegram.chat_id);

  if (!token) {
    return false;
  }

  if (owner === null) {
    await saveSettings(env, { chat_id: chatId, linked_at: new Date().toISOString(), enabled: true });
    botLog("owner_registered", { chatId });
  } else if (owner !== chatId) {
    await sendText(chatId, "This bot is for the store owner only.", token);
    return true;
  }

  const g2Key = textValue(
    (providers.g2bulk as { api_key?: unknown } | undefined)?.api_key,
  );
  const balance = g2Key ? await fetchG2BulkBalance(g2Key) : null;
  const walletLine = balance === null ? "" : `\n💰 G2Bulk wallet: <b>${money(balance)}</b>`;

  await sendText(
    chatId,
    [
      `👋 <b>GH-Store owner bot</b> — this chat is registered.`,
      `You will receive order, recharge, support, and supplier alerts here.${walletLine}`,
      ``,
      `<b>Commands</b>`,
      `/stats — store totals and balances`,
      `/pending — recharges waiting for review`,
      `/alerts — toggle alert types`,
      `/help — this message`,
      ``,
      `Dashboard: https://gh-store.me/dashboard`,
    ].join("\n"),
    token,
  );

  return true;
}

async function handleStats(env: BotEnv, chatId: string): Promise<boolean> {
  const { telegram } = await readSettings(env);
  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    return false;
  }

  const [pendingAlerts, orders, revenue, recharges, openSupport] = await Promise.all([
    countRows(env, "telegram_alerts", "status=eq.pending"),
    countRows(env, "orders", "status=in.(paid,fulfilling)"),
    countRows(env, "orders", "status=eq.completed"),
    countRows(env, "recharge_requests", "status=eq.pending"),
    countRows(env, "support_threads", "status=in.(open,pending)"),
  ]);

  await sendText(
    chatId,
    [
      `📊 <b>Store stats</b>`,
      `Active orders: <b>${orders}</b>`,
      `Completed: <b>${revenue}</b>`,
      `Pending recharges: <b>${recharges}</b>`,
      `Open support: <b>${openSupport}</b>`,
      `Undelivered alerts: <b>${pendingAlerts}</b>`,
    ].join("\n"),
    token,
    {
      inline_keyboard: [
        [
          { text: "⏳ Recharges", callback_data: "pending" },
          { text: "🛠 Dashboard", url: "https://gh-store.me/dashboard" },
        ],
      ],
    },
  );

  return true;
}

async function handlePending(env: BotEnv, chatId: string): Promise<boolean> {
  const { telegram } = await readSettings(env);
  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    return false;
  }

  const { ok, json } = await supabaseJson(
    env,
    "recharge_requests?status=eq.pending&order=created_at.asc&limit=10&select=id,reference,requested_amount,payment_method,user_id",
  );

  if (!ok || !Array.isArray(json) || json.length === 0) {
    await sendText(chatId, "✅ No recharge requests waiting.", token);
    return true;
  }

  const rows = json as { id: string; reference: string; requested_amount: number; payment_method: string }[];
  const lines = rows.map(
    (row, index) =>
      `${index + 1}. <code>${escapeHtml(row.reference)}</code> — <b>${money(row.requested_amount)}</b> · ${escapeHtml(
        row.payment_method ?? "—",
      )}`,
  );

  await sendText(
    chatId,
    [`⏳ <b>Pending recharges (${rows.length})</b>`, ...lines, ``, `Review: https://gh-store.me/dashboard/recharges`].join(
      "\n",
    ),
    token,
  );

  return true;
}

async function handleAlerts(env: BotEnv, chatId: string): Promise<boolean> {
  const { telegram } = await readSettings(env);
  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    return false;
  }

  await sendText(chatId, "⚠️ Alert types are controlled from the dashboard Providers page.", token, {
    inline_keyboard: [[{ text: "Open dashboard", url: "https://gh-store.me/dashboard/providers" }]],
  });

  return true;
}

const COMMANDS: Record<string, (env: BotEnv, chatId: string) => Promise<boolean>> = {
  "/start": (env, chatId) => handleStart(env, chatId, "owner"),
  "/help": (env, chatId) => handleHelp(env, chatId),
  "/stats": (env, chatId) => handleStats(env, chatId),
  "/pending": (env, chatId) => handlePending(env, chatId),
  "/alerts": (env, chatId) => handleAlerts(env, chatId),
};

async function handleHelp(env: BotEnv, chatId: string): Promise<boolean> {
  const { telegram } = await readSettings(env);
  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    return false;
  }

  await sendText(
    chatId,
    [
      `<b>GH-Store owner bot</b>`,
      `/stats — store totals and balances`,
      `/pending — recharges waiting for review`,
      `/alerts — alert type guidance`,
      `/help — this message`,
      ``,
      `Store events are delivered automatically: new orders, failed orders, recharge requests, support messages, and low supplier balance.`,
    ].join("\n"),
    token,
  );

  return true;
}

async function handleCallback(env: BotEnv, update: TelegramUpdate, token: string): Promise<void> {
  const query = update.callback_query;

  if (!query?.id || !query.message?.chat?.id) {
    return;
  }

  const chatId = String(query.message.chat.id);

  if (!(await requireOwner(env, chatId))) {
    return;
  }

  const action = query.data ?? "";

  if (action === "pending") {
    await handlePending(env, chatId);
  }

  await telegram("answerCallbackQuery", { callback_query_id: query.id }, token);
}

async function fetchG2BulkBalance(apiKey: string): Promise<number | null> {
  try {
    const response = await fetch(`${G2BULK_API}/getMe`, {
      headers: { accept: "application/json", "x-api-key": apiKey },
    });
    const payload = (await response.json().catch(() => null)) as { balance?: unknown } | null;

    if (!response.ok || payload === null) {
      return null;
    }

    const balance = Number(payload.balance);

    return Number.isFinite(balance) ? balance : null;
  } catch {
    return null;
  }
}

// ─── Public entry points used by the Worker ────────────────────────────────

export async function handleTelegramWebhook(
  request: Request,
  env: BotEnv,
  ctx: BotContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const provided = request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? "";

  if (!expected || !provided || !(await secretMatches(provided, expected))) {
    botLog("webhook_unauthorized", { presented: Boolean(provided) });
    return new Response("unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Reply immediately; Telegram retries anything slower. The command runs after.
  ctx.waitUntil(
    (async () => {
      const { telegram } = await readSettings(env);
      const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);

      if (!token) {
        botLog("webhook_no_token");
        return;
      }

      const message = update.message;
      const chatId = message?.chat?.id ?? update.callback_query?.message?.chat?.id;

      if (chatId === undefined) {
        return;
      }

      const chatIdText = String(chatId);

      if (message?.text) {
        const name = message.text.trim().split(/\s+/)[0] ?? "";
        const command = COMMANDS[name];

        if (command) {
          if (name === "/start" || (await requireOwner(env, chatIdText))) {
            await command(env, chatIdText);
          }
        }
      } else if (update.callback_query) {
        await handleCallback(env, update, token);
      }
    })().catch((error: unknown) => {
      botLog("webhook_processing_failed", {
        error: error instanceof Error ? error.message : "Unknown",
      });
    }),
  );

  return new Response("ok", { status: 200 });
}

export async function deliverTelegramAlerts(env: BotEnv): Promise<void> {
  const { telegram } = await readSettings(env);

  if (telegram.enabled === false) {
    return;
  }

  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);
  const owner = textValue(telegram.chat_id);

  if (!token || !owner) {
    botLog("alerts_not_configured", { hasToken: Boolean(token), hasOwner: Boolean(owner) });
    return;
  }

  const alerts = await fetchPendingAlerts(env, BATCH);

  for (const alert of alerts) {
    const sent = await sendText(owner, alertText(alert), token);

    if (sent) {
      await markAlert(env, alert.id, "sent");
    } else {
      await markAlert(env, alert.id, "failed");
      botLog("alert_failed", { id: alert.id, type: alert.type });
    }
  }

  if (alerts.length > 0) {
    botLog("alerts_delivered", { count: alerts.length });
  }
}

/** The scheduled drain, guarded so the Worker cron does not need this feature. */
export async function runTelegramScheduled(env: BotEnv): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    botLog("not_configured", { hasUrl: Boolean(env.SUPABASE_URL) });
    return;
  }

  await deliverTelegramAlerts(env);
}
