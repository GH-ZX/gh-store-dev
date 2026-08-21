/**
 * Owner Telegram alerts — the delivery half.
 *
 * The webhook half lives in a Supabase Edge Function
 * (`supabase/functions/telegram-webhook`), where it is token-gated and
 * independent of this Worker's environment. This file is the other direction:
 * the store → owner queue. `deliverTelegramAlerts` drains `telegram_alerts` —
 * rows written by the store's server code on orders, failures, recharges,
 * support messages, and low supplier balance — and posts them to the owner's
 * chat, on the Worker's five-minute schedule.
 *
 * Secrets: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (or
 * `NEXT_PUBLIC_SUPABASE_URL` for the URL) are required to read the queue and
 * the bot settings. The bot token may be a Worker secret
 * (`TELEGRAM_BOT_TOKEN`) or stored in `store_settings.telegram.bot_token`; the
 * stored value wins.
 */

export type BotEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  RECONCILE_CRON_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const TG_API = "https://api.telegram.org";
const G2BULK_API = "https://api.g2bulk.com/v1";
const BATCH = 10;

type TelegramSettings = {
  bot_token?: string | null;
  chat_id?: string | null;
  enabled?: boolean;
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

async function sendText(chatId: string, text: string, token: string): Promise<boolean> {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
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
  // The URL var ships with the Worker (wrangler `vars`); the service key must
  // be a secret. Missing either must fail the call, never throw.
  const baseUrl = env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!baseUrl || !serviceKey) {
    botLog("supabase_not_configured", { hasUrl: Boolean(baseUrl), hasKey: Boolean(serviceKey) });
    return { ok: false, status: 0, json: null };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    ...(init.method === "PATCH" || init.method === "POST"
      ? { "content-type": "application/json", prefer: "return=minimal" }
      : {}),
    ...(init.headers ?? {}),
  };

  try {
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
  } catch (error) {
    botLog("supabase_fetch_threw", {
      path,
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { ok: false, status: 0, json: null };
  }
}

async function readSettings(env: BotEnv): Promise<{ telegram: TelegramSettings }> {
  const { ok, json } = await supabaseJson(env, "store_settings?id=eq.global&select=telegram");

  if (!ok) {
    return { telegram: {} };
  }

  const row = Array.isArray(json) ? (json[0] as { telegram?: unknown } | undefined) : undefined;

  // The app stores the settings double-wrapped (`telegram: { telegram: {...} }`
  // — its readers unwrap with a schema). Unwrap defensively either way.
  const outer =
    row?.telegram && typeof row.telegram === "object" ? (row.telegram as Record<string, unknown>) : {};
  const inner =
    outer.telegram && typeof outer.telegram === "object" ? (outer.telegram as Record<string, unknown>) : outer;

  return { telegram: inner as TelegramSettings };
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

// ─── Delivery ───────────────────────────────────────────────────────────────

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

  const prefs = telegram.alert_prefs ?? {};
  const alerts = (await fetchPendingAlerts(env, BATCH)).filter(
    // The dashboard lets the owner turn individual alert types off; an unknown
    // type (a newer build than this worker) is delivered rather than dropped.
    (alert) => prefs[alert.type] !== false,
  );

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
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) {
    botLog("not_configured", { hasUrl: false });
    return;
  }

  await deliverTelegramAlerts(env);
}
