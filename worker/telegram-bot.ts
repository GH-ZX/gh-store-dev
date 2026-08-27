/**
 * Telegram alerts — the delivery half.
 *
 * The webhook half lives in a Supabase Edge Function
 * (`supabase/functions/telegram-webhook`), where it is token-gated and
 * independent of this Worker's environment. This file is the other direction:
 * the store → chat queue. `deliverTelegramAlerts` drains `telegram_alerts` —
 * rows written by the store's server code — and posts them on the Worker's
 * five-minute schedule:
 *
 * - alerts without a `user_id` go to the owner's chat (orders, failures,
 *   recharges, support, low wallet);
 * - alerts with a `user_id` go to that customer's linked chat (order delivered,
 *   order failed), rendered in the language they linked with.
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
const BATCH = 5;

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
  user_id: string | null;
};

/** A customer chat link, keyed by user id — one chat per account. */
type ChatLink = {
  chat_id: number | string;
  language_code: string | null;
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
    `telegram_alerts?status=in.(pending,failed)&order=created_at.asc&limit=${limit}&select=id,type,payload,created_at,user_id`,
  );

  if (!ok) {
    return [];
  }

  return (Array.isArray(json) ? json : []).map((row) => {
    const value = row as {
      id: string;
      type: string;
      payload?: unknown;
      created_at: string;
      user_id?: string | null;
    };
    return {
      id: value.id,
      type: value.type,
      payload: value.payload && typeof value.payload === "object" ? (value.payload as Record<string, unknown>) : {},
      created_at: value.created_at,
      user_id: typeof value.user_id === "string" ? value.user_id : null,
    };
  });
}

/** The linked chat for a customer, when they have linked one. */
async function chatLinkForUser(env: BotEnv, userId: string): Promise<ChatLink | null> {
  const { ok, json } = await supabaseJson(env, `telegram_chat_links?user_id=eq.${userId}&select=chat_id,language_code`);

  if (!ok || !Array.isArray(json) || json.length === 0) {
    return null;
  }

  const row = json[0] as { chat_id?: unknown; language_code?: unknown };
  const chatId = typeof row.chat_id === "number" ? row.chat_id : typeof row.chat_id === "string" ? Number(row.chat_id) : NaN;

  if (!Number.isFinite(chatId)) {
    return null;
  }

  return {
    chat_id: chatId,
    language_code: typeof row.language_code === "string" && row.language_code ? row.language_code : null,
  };
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

/** Owner-facing rendering; the same event is a different message for a customer. */
function ownerAlertText(row: AlertRow): string {
  const p = row.payload;

  switch (row.type) {
    case "order_placed":
      return [
        "🛒 <b>New order</b>",
        `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
        `Amount: <b>${money(p.total)}</b>`,
      ].join("\n");

    case "order_failed":
      return [
        "❌ <b>Order failed</b>",
        `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
        `Refunded: ${p.refunded === true ? "✅ Yes" : "⚠️ No — needs a decision"}`,
        `Reason: ${escapeHtml(p.reason ?? "unknown")}`,
      ].join("\n");

    case "order_delivered":
      return [
        "✅ <b>Order delivered</b>",
        `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
        `Amount: <b>${money(p.total ?? p.amount)}</b>`,
      ].join("\n");

    case "recharge_request":
      return [
        "💳 <b>Recharge request</b>",
        `Reference: <code>${escapeHtml(p.reference ?? "—")}</code>`,
        `Amount: <b>${money(p.amount)}</b>`,
        `Method: ${escapeHtml(p.method ?? "—")}`,
      ].join("\n");

    case "support_message":
      return [
        "💬 <b>New support message</b>",
        `Subject: <b>${escapeHtml(p.subject ?? "—")}</b>`,
        p.body ? `\n${escapeHtml(p.body)}` : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n");

    case "low_wallet":
      return [
        "⚠️ <b>Supplier wallet is low</b>",
        `Balance: <b>${money(p.balance)}</b>`,
        `Required: ${money(p.required)}`,
        `Checkout is refusing purchases until the G2Bulk wallet is topped up.`,
      ].join("\n");

    case "low_stock":
      return [
        "📦 <b>Low stock</b>",
        `Offer: <code>${escapeHtml(p.offer_id ?? p.offer_slug ?? "—")}</code>`,
        `Remaining: <b>${escapeHtml(String(p.remaining ?? p.available ?? "—"))}</b>`,
      ].join("\n");

    case "wallet_adjusted":
      return [
        "💰 <b>Wallet adjusted</b>",
        `User: <code>${escapeHtml(p.user_id ?? "—")}</code>`,
        `Amount: <b>${money(p.amount)}</b>`,
        `Balance: <b>${money(p.balance)}</b>`,
      ].join("\n");

    case "new_customer":
      return [
        "👤 <b>New customer</b>",
        `${escapeHtml(p.full_name ?? p.email ?? p.username ?? p.user_id ?? "—")}`,
        p.email ? `Email: <code>${escapeHtml(p.email)}</code>` : "",
        `ID: <code>${escapeHtml(p.user_id ?? "—")}</code>`,
      ]
        .filter((line) => line.length > 0)
        .join("\n");

    case "sweep_stalled":
      return [
        "🛑 <b>Fulfilment sweep has stalled</b>",
        `Last success: <b>${escapeHtml(
          textValue(p.last_success_at) ?? "never recorded",
        )}</b>`,
        typeof p.minutes_since === "number"
          ? `Quiet for: <b>${escapeHtml(String(p.minutes_since))} minutes</b>`
          : "",
        textValue(p.last_error) ? `Last error: ${escapeHtml(String(p.last_error))}` : "",
        "Orders may be stuck at fulfilling. Check the Worker cron, RECONCILE_CRON_SECRET, and the latest deploy.",
      ]
        .filter((line) => line.length > 0)
        .join("\n");

    default:
      return `📢 ${escapeHtml(row.type)}`;
  }
}

function ownerAlertKeyboard(row: AlertRow): unknown | undefined {
  const p = row.payload as Record<string, unknown>;
  const id = String(p.user_id ?? p.order_id ?? p.request_id ?? p.thread_id ?? "");
  switch (row.type) {
    case "order_placed":
    case "order_failed":
    case "order_delivered":
      return p.order_id
        ? { inline_keyboard: [[{ text: "Open order", url: `https://gh-store.me/en/dashboard/orders/${encodeURIComponent(String(p.order_id))}` }]] }
        : { inline_keyboard: [[{ text: "Open orders", url: "https://gh-store.me/en/dashboard/orders" }]] };
    case "recharge_request":
    case "recharge_approved":
    case "recharge_rejected":
      return { inline_keyboard: [[{ text: "Open recharges", url: "https://gh-store.me/en/dashboard/recharges" }]] };
    case "support_message":
    case "support_reply":
      return { inline_keyboard: [[{ text: "Open support", url: "https://gh-store.me/en/dashboard/support" }]] };
    case "low_wallet":
      return { inline_keyboard: [[{ text: "Providers", url: "https://gh-store.me/en/dashboard/providers" }]] };
    case "low_stock":
      return { inline_keyboard: [[{ text: "Catalog", url: "https://gh-store.me/en/dashboard/catalog" }]] };
    case "sweep_stalled":
      // The sweep's failure mode is orders parked at `fulfilling`, so the one
      // place an owner must look is the list that shows them.
      return { inline_keyboard: [[{ text: "Open orders", url: "https://gh-store.me/en/dashboard/orders" }]] };
    case "wallet_adjusted":
    case "new_customer":
      return id
        ? { inline_keyboard: [[{ text: "Open customer", url: `https://gh-store.me/en/dashboard/customers/${encodeURIComponent(id)}` }]] }
        : undefined;
    default:
      return undefined;
  }
}

/** Customer-facing rendering, in the language the customer linked with. */
function customerAlertText(row: AlertRow, locale: "ar" | "en"): string {
  const p = row.payload;
  const orderLink = `https://gh-store.me/${locale}/orders/${encodeURIComponent(String(p.order_id ?? ""))}`;

  switch (row.type) {
    case "order_delivered":
      return locale === "ar"
        ? [
            "✅ <b>تم تنفيذ طلبك</b>",
            `الطلب: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
            "طلبك جاهز. افتح الطلب لعرض التفاصيل.",
            `الطلب: ${orderLink}`,
          ].join("\n")
        : [
            "✅ <b>Your order is delivered</b>",
            `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
            "Your order is ready. Open it to see the details.",
            `Order: ${orderLink}`,
          ].join("\n");

    case "order_failed":
      return locale === "ar"
        ? [
            "❌ <b>تعذّر تنفيذ طلبك</b>",
            `الطلب: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
            p.refunded === true
              ? "أعدنا المبلغ إلى محفظتك."
              : "تواصل معنا وسنعالج الأمر.",
            p.reason ? `السبب: ${escapeHtml(p.reason)}` : "",
            `الطلب: ${orderLink}`,
          ]
            .filter((line) => line.length > 0)
            .join("\n")
        : [
            "❌ <b>Your order failed</b>",
            `Order: <b>${escapeHtml(p.order_number ?? row.id)}</b>`,
            p.refunded === true ? "The amount is back in your wallet." : "Contact us and we will sort it out.",
            p.reason ? `Reason: ${escapeHtml(p.reason)}` : "",
            `Order: ${orderLink}`,
          ]
            .filter((line) => line.length > 0)
            .join("\n");

    case "recharge_approved":
      return locale === "ar"
        ? [
            "💳 <b>تمت إضافة الرصيد</b>",
            `المرجع: <code>${escapeHtml(p.reference ?? "—")}</code>`,
            `المبلغ: <b>${money(p.amount)}</b>`,
            "أصبح رصيدك جاهزًا للشراء الآن.",
            "المحفظة: https://gh-store.me/ar/wallet",
          ].join("\n")
        : [
            "💳 <b>Your balance was topped up</b>",
            `Reference: <code>${escapeHtml(p.reference ?? "—")}</code>`,
            `Amount: <b>${money(p.amount)}</b>`,
            "It is ready to spend now.",
            "Wallet: https://gh-store.me/en/wallet",
          ].join("\n");

    case "recharge_rejected":
      return locale === "ar"
        ? [
            "❌ <b>لم نتمكّن من تأكيد طلب التعبئة</b>",
            `المرجع: <code>${escapeHtml(p.reference ?? "—")}</code>`,
            p.reason ? `السبب: ${escapeHtml(p.reason)}` : "تواصل معنا مع إثبات التحويل.",
            "الشحن: https://gh-store.me/ar/recharge",
          ]
            .filter((line) => line.length > 0)
            .join("\n")
        : [
            "❌ <b>We could not confirm your top-up</b>",
            `Reference: <code>${escapeHtml(p.reference ?? "—")}</code>`,
            p.reason ? `Reason: ${escapeHtml(p.reason)}` : "Contact us with proof of payment.",
            "Recharge: https://gh-store.me/en/recharge",
          ]
            .filter((line) => line.length > 0)
            .join("\n");

    case "support_reply":
      return locale === "ar"
        ? [
            "💬 <b>وصلك رد على طلب الدعم</b>",
            p.reply ? `\n${escapeHtml(p.reply)}` : "",
            "الدعم: https://gh-store.me/ar/support",
          ]
            .filter((line) => line.length > 0)
            .join("\n")
        : [
            "💬 <b>We replied to your request</b>",
            p.reply ? `\n${escapeHtml(p.reply)}` : "",
            "Support: https://gh-store.me/en/support",
          ]
            .filter((line) => line.length > 0)
            .join("\n");

    case "wallet_adjusted":
      return locale === "ar"
        ? [
            "💰 <b>تم تعديل رصيدك</b>",
            `المبلغ: <b>${money(p.amount)}</b>`,
            `الرصيد: <b>${money(p.balance)}</b>`,
            "المحفظة: https://gh-store.me/ar/wallet",
          ].join("\n")
        : [
            "💰 <b>Your balance was adjusted</b>",
            `Amount: <b>${money(p.amount)}</b>`,
            `Balance: <b>${money(p.balance)}</b>`,
            "Wallet: https://gh-store.me/en/wallet",
          ].join("\n");

    default:
      return locale === "ar" ? `📢 ${escapeHtml(row.type)}` : `📢 ${escapeHtml(row.type)}`;
  }
}

function customerLocale(languageCode: string | null): "ar" | "en" {
  return languageCode?.toLowerCase().startsWith("ar") ? "ar" : "en";
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
  const alerts = await fetchPendingAlerts(env, BATCH);

  for (const alert of alerts) {
    // Owner alerts respect the dashboard toggles; customer alerts always go to
    // the customer who owns the event, whatever the owner chose for their own
    // chat. An unknown type (a newer build than this worker) is delivered to
    // the owner rather than dropped.
    if (!alert.user_id && prefs[alert.type] === false) {
      continue;
    }

    if (alert.user_id) {
      const link = await chatLinkForUser(env, alert.user_id);

      if (!link) {
        // No linked chat yet — nothing to deliver to, and re-trying would only
        // repeat the lookup. Mark it sent so it does not loop on every drain.
        await markAlert(env, alert.id, "sent");
        continue;
      }

      const sent = await sendText(
        String(link.chat_id),
        customerAlertText(alert, customerLocale(link.language_code)),
        token,
      );

      if (sent) {
        await markAlert(env, alert.id, "sent");
      } else {
        await markAlert(env, alert.id, "failed");
        botLog("alert_failed", { id: alert.id, type: alert.type, userId: alert.user_id });
      }
      continue;
    }

    const sent = await sendText(owner, ownerAlertText(alert), token, ownerAlertKeyboard(alert));

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

// ─── Sweep heartbeat ────────────────────────────────────────────────────────

/**
 * Alert the owner when the reconciliation sweep has gone quiet.
 *
 * The sweep itself runs inside the store (POST /api/reconcile) and stamps
 * `sweep_heartbeats` after every attempt; this check runs here, on the same
 * cron that triggers the sweep, and compares the stamp against the clock. A
 * sweep that has stopped — a rotated secret, a broken deploy — otherwise fails
 * nobody loudly: orders simply stay `fulfilling` until a customer complains.
 *
 * The threshold is four missed ticks (the cron fires every five minutes and a
 * sweep takes well under one), so a stall is noticed within minutes without
 * alerting on a single slow run. Enqueued alerts are deduped per day, so a
 * stall that outlasts the first message still surfaces on the next day
 * instead of becoming wallpaper.
 */
const SWEEP_STALL_THRESHOLD_MS = 20 * 60_000;

type SweepHeartbeatRow = {
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
};

export type SweepStallState = {
  stalled: boolean;
  /** False when no sweep has ever stamped a success — also a stall. */
  everRan: boolean;
  minutesSince: number | null;
};

/** The pure decision, exported so the threshold's behaviour is testable. */
export function sweepStallState(
  now: number,
  heartbeat: SweepHeartbeatRow | null,
  thresholdMs: number = SWEEP_STALL_THRESHOLD_MS,
): SweepStallState {
  if (!heartbeat || !heartbeat.last_success_at) {
    return { stalled: true, everRan: false, minutesSince: null };
  }

  const since = now - Date.parse(heartbeat.last_success_at);

  if (!Number.isFinite(since)) {
    // An unparseable stamp means the sweep's writes are broken — treat it as
    // the stall it functionally is, with no interval to report.
    return { stalled: true, everRan: true, minutesSince: null };
  }

  return {
    stalled: since > thresholdMs,
    everRan: true,
    minutesSince: Math.round(since / 60_000),
  };
}

export async function checkSweepHeartbeat(env: BotEnv): Promise<void> {
  const { telegram } = await readSettings(env);

  if (telegram.enabled === false) {
    return;
  }

  const token = textValue(telegram.bot_token) ?? textValue(env.TELEGRAM_BOT_TOKEN);
  const owner = textValue(telegram.chat_id);

  if (!token || !owner) {
    return;
  }

  const { ok, json } = await supabaseJson(
    env,
    "sweep_heartbeats?id=eq.global&select=last_success_at,last_failure_at,last_error",
  );

  /*
   * A table the store has not migrated to yet is a pending migration, not a
   * stall the owner can fix from an alert — skip until the row exists.
   */
  if (!ok) {
    return;
  }

  const raw = Array.isArray(json) ? json[0] : json;
  const row =
    raw && typeof raw === "object" ? (raw as SweepHeartbeatRow) : null;
  const state = sweepStallState(Date.now(), row);

  if (!state.stalled) {
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  const { ok: enqueued } = await supabaseJson(env, "telegram_alerts", {
    method: "POST",
    body: {
      type: "sweep_stalled",
      status: "pending",
      // One alert per day per stall: a unique index on (type, dedup_key)
      // turns a repeat insert into a 409, which the delivery loop absorbs.
      dedup_key: `sweep_stalled:${day}`,
      payload: {
        last_success_at: row?.last_success_at ?? null,
        last_failure_at: row?.last_failure_at ?? null,
        last_error: row?.last_error ?? null,
        minutes_since: state.minutesSince,
      },
    },
  });

  botLog("sweep_stalled_alert", { enqueued, minutesSince: state.minutesSince });
}
