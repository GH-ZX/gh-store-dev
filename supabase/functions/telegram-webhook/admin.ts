import { createClient } from "jsr:@supabase/supabase-js@2";

export type AdminLocale = "ar" | "en";
export type AdminContext = {
  supabase: ReturnType<typeof createClient>;
  token: string;
  chatId: number;
  locale: AdminLocale;
  actorId: string;
  messageId?: number;
};

const T: Record<AdminLocale, Record<string, string>> = {
  ar: {
    menu: "لوحة الإدارة", stats: "الإحصاءات", orders: "الطلبات", recharges: "التعبئة", support: "الدعم", customers: "الزبائن", catalog: "الكتالوج", health: "الحالة", back: "رجوع", empty: "لا نتائج", ok: "تم",
  },
  en: {
    menu: "Admin", stats: "Stats", orders: "Orders", recharges: "Top-ups", support: "Support", customers: "Customers", catalog: "Catalog", health: "Health", back: "Back", empty: "Empty", ok: "Done",
  },
};

function tr(l: AdminLocale, k: string): string {
  return (T[l] as Record<string, string>)[k] ?? k;
}
function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}` : "—";
}

export function adminKeyboard(locale: AdminLocale): unknown {
  return {
    inline_keyboard: [
      [{ text: `📊 ${tr(locale, "stats")}`, callback_data: "adm:stats" }, { text: `📦 ${tr(locale, "orders")}`, callback_data: "adm:orders" }],
      [{ text: `💳 ${tr(locale, "recharges")}`, callback_data: "adm:recharges" }, { text: `💬 ${tr(locale, "support")}`, callback_data: "adm:support" }],
      [{ text: `👥 ${tr(locale, "customers")}`, callback_data: "adm:customers" }, { text: `🛍 ${tr(locale, "catalog")}`, callback_data: "adm:catalog" }],
      [{ text: `🩺 ${tr(locale, "health")}`, callback_data: "adm:health" }],
      [{ text: "🛠 Dashboard", url: "https://gh-store.me/en/dashboard" }],
    ],
  };
}

async function tg(token: string, method: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as { ok?: boolean } | null;
    return r.ok && j?.ok === true;
  } catch {
    return false;
  }
}

async function render(ctx: AdminContext, text: string, kb: unknown = { inline_keyboard: [[{ text: "↩", callback_data: "adm:menu" }]] }): Promise<void> {
  const body = { chat_id: ctx.chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb } as Record<string, unknown>;
  if (ctx.messageId) {
    const ok = await tg(ctx.token, "editMessageText", { ...body, message_id: ctx.messageId });
    if (ok) return;
  }
  await tg(ctx.token, "sendMessage", body);
}

async function setPending(ctx: AdminContext, v: string | null): Promise<void> {
  await ctx.supabase.from("telegram_chat_prefs").upsert({ chat_id: ctx.chatId, pending: v }, { onConflict: "chat_id" });
}

export async function resolveAdminActor(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").eq("role", "admin").eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function showStats(ctx: AdminContext): Promise<void> {
  const [a, b, c, d] = await Promise.all([
    ctx.supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["paid", "processing", "fulfilling"]),
    ctx.supabase.from("recharge_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "payment_sent", "processing"]),
    ctx.supabase.from("support_threads").select("id", { count: "exact", head: true }).in("status", ["open", "pending"]),
    ctx.supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("status", "available"),
  ]);
  await render(ctx, [`📊 <b>${tr(ctx.locale, "stats")}</b>`, `Orders: <b>${(a as { count?: number }).count ?? 0}</b>`, `Recharges: <b>${(b as { count?: number }).count ?? 0}</b>`, `Support: <b>${(c as { count?: number }).count ?? 0}</b>`, `Stock: <b>${(d as { count?: number }).count ?? 0}</b>`].join("\n"), adminKeyboard(ctx.locale));
}

async function showOrders(ctx: AdminContext): Promise<void> {
  const { data } = await ctx.supabase.from("orders").select("id, order_number, status, total, currency").in("status", ["paid", "processing", "fulfilling"]).order("created_at", { ascending: true }).limit(10) as { data: unknown };
  const rows = (data as Array<{ id: string; order_number: string; status: string; total: number; currency: string }> | null) ?? [];
  if (rows.length === 0) { await render(ctx, "No orders", adminKeyboard(ctx.locale)); return; }
  await render(ctx, rows.map((r) => `${esc(r.order_number)} · ${esc(r.status)} · ${money(r.total)} ${esc(r.currency)}`).join("\n"), { inline_keyboard: [...rows.map((r) => [{ text: `${r.order_number}`, callback_data: `adm:o:${r.id}` }]), [{ text: "↩", callback_data: "adm:menu" }]] });
}

async function showRecharges(ctx: AdminContext): Promise<void> {
  const { data } = await ctx.supabase.from("recharge_requests").select("id, reference, requested_amount, status").in("status", ["pending", "payment_sent", "processing"]).order("created_at", { ascending: true }).limit(10) as { data: unknown };
  const rows = (data as Array<{ id: string; reference: string; requested_amount: number; status: string }> | null) ?? [];
  if (rows.length === 0) { await render(ctx, "No recharges", adminKeyboard(ctx.locale)); return; }
  await render(ctx, rows.map((r) => `${esc(r.reference)} · ${money(r.requested_amount)} · ${esc(r.status)}`).join("\n"), { inline_keyboard: [...rows.map((r) => [{ text: `${r.reference}`, callback_data: `adm:r:${r.id}` }]), [{ text: "↩", callback_data: "adm:menu" }]] });
}

async function showSupport(ctx: AdminContext): Promise<void> {
  const { data } = await ctx.supabase.from("support_threads").select("id, subject, status").in("status", ["open", "pending"]).order("updated_at", { ascending: true }).limit(10) as { data: unknown };
  const rows = (data as Array<{ id: string; subject: string; status: string }> | null) ?? [];
  if (rows.length === 0) { await render(ctx, "No support tickets", adminKeyboard(ctx.locale)); return; }
  await render(ctx, rows.map((r) => `${esc(r.subject)} · ${esc(r.status)}`).join("\n"), { inline_keyboard: [...rows.map((r) => [{ text: `${r.subject}`, callback_data: `adm:s:${r.id}` }]), [{ text: "↩", callback_data: "adm:menu" }]] });
}

async function showCatalog(ctx: AdminContext): Promise<void> {
  const [g, o] = await Promise.all([
    ctx.supabase.from("games").select("id", { count: "exact", head: true }).eq("is_active", true) as unknown as Promise<{ count?: number }>,
    ctx.supabase.from("offers").select("id", { count: "exact", head: true }).eq("is_active", true) as unknown as Promise<{ count?: number }>,
  ]);
  await render(ctx, `Catalog: Games ${(g as { count?: number }).count ?? 0}, Offers ${(o as { count?: number }).count ?? 0}`, { inline_keyboard: [[{ text: "Open catalog", url: "https://gh-store.me/en/dashboard/catalog" }], [{ text: "↩", callback_data: "adm:menu" }]] });
}

async function showHealth(ctx: AdminContext): Promise<void> {
  const { data } = await ctx.supabase.from("store_settings").select("providers, payments").eq("id", "global").maybeSingle() as { data: unknown };
  const p = (data as { providers?: Record<string, { enabled?: boolean }>; payments?: Record<string, { enabled?: boolean }> } | null) ?? {};
  const line = (n: string, v?: boolean): string => `${n}: ${v ? "✅" : "⚪"}`;
  await render(ctx, [`Health`, line("G2Bulk", p.providers?.g2bulk?.enabled), line("MaxStore", p.providers?.maxstore?.enabled), line("Sam", p.providers?.sam?.enabled), line("Binance", p.payments?.binance?.enabled)].join("\n"), adminKeyboard(ctx.locale));
}
async function showOrder(ctx: AdminContext, id: string): Promise<void> {
  const { data: o } = await ctx.supabase.from("orders").select("id, order_number, status, total, currency, user_id").eq("id", id).maybeSingle() as { data: unknown };
  const order = o as { id: string; order_number: string; status: string; total: number; currency: string; user_id: string } | null;
  if (!order) { await render(ctx, "Order not found", adminKeyboard(ctx.locale)); return; }
  await render(ctx, `${esc(order.order_number)} · ${esc(order.status)} · ${money(order.total)} ${esc(order.currency)}`, { inline_keyboard: [[{ text: "Refund", callback_data: `adm:refund:${id}` }], [{ text: "Mark delivered", callback_data: `adm:mark:${id}` }], [{ text: "Open", url: `https://gh-store.me/en/dashboard/orders/${id}` }], [{ text: "↩", callback_data: "adm:orders" }]] });
}

async function showRechargeDetail(ctx: AdminContext, id: string): Promise<void> {
  const { data: r } = await ctx.supabase.from("recharge_requests").select("id, reference, requested_amount, status, user_id").eq("id", id).maybeSingle() as { data: unknown };
  const row = r as { id: string; reference: string; requested_amount: number; status: string; user_id: string } | null;
  if (!row) { await render(ctx, "Not found", adminKeyboard(ctx.locale)); return; }
  await render(ctx, `${esc(row.reference)} · ${money(row.requested_amount)} · ${esc(row.status)}`, { inline_keyboard: [[{ text: "Approve", callback_data: `adm:approve:${id}` }], [{ text: "Reject", callback_data: `adm:reject:${id}` }], [{ text: "↩", callback_data: "adm:recharges" }]] });
}

async function showCustomerDetail(ctx: AdminContext, id: string): Promise<void> {
  const { data: p } = await ctx.supabase.from("profiles").select("id, full_name, email, is_active").eq("id", id).maybeSingle() as { data: unknown };
  const profile = p as { id: string; full_name: string | null; email: string | null; is_active: boolean } | null;
  if (!profile) { await render(ctx, "Customer not found", adminKeyboard(ctx.locale)); return; }
  const { data: w } = await ctx.supabase.from("wallets").select("balance, currency").eq("user_id", id).maybeSingle() as { data: unknown };
  const wallet = w as { balance: number; currency: string } | null;
  await render(ctx, `${esc(profile.full_name ?? profile.email ?? profile.id)}\n${wallet ? `${money(wallet.balance)} ${esc(wallet.currency)}` : "No wallet"}\n${profile.is_active ? "active" : "suspended"}`, { inline_keyboard: [[{ text: "Add credit", callback_data: `adm:credit:${id}` }], [{ text: "Deduct", callback_data: `adm:debit:${id}` }], [{ text: "Open", url: `https://gh-store.me/en/dashboard/customers/${id}` }], [{ text: "↩", callback_data: "adm:customers" }]] });
}


export async function handleAdminText(input: AdminContext & { text: string; pending: string | null }): Promise<boolean> {
  const t = input.text.trim();
  if (!t) return false;
  if (t === "/cancel") { await setPending(input, null); await render(input, "Cancelled", adminKeyboard(input.locale)); return true; }
  if (input.pending === "admin_customer_search") {
    const q = t.slice(0, 80).replace(/[,%()]/g, " ");
    const { data } = await input.supabase.from("profiles").select("id, full_name, email").eq("role", "customer").or(`email.ilike.%${q}%,full_name.ilike.%${q}%`).limit(5) as { data: unknown };
    const rows = (data as Array<{ id: string; full_name: string | null; email: string | null }> | null) ?? [];
    await setPending(input, null);
    if (rows.length === 0) { await render(input, "No customers", adminKeyboard(input.locale)); return true; }
    await render(input, rows.map((r) => `${esc(r.full_name ?? r.email ?? r.id)}`).join("\n"), { inline_keyboard: [...rows.map((r) => [{ text: String(r.full_name ?? r.email ?? r.id), callback_data: `adm:c:${r.id}` }]), [{ text: "↩", callback_data: "adm:menu" }]] });
    return true;
  }
  const cmd = t.split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (cmd) {
    case "/start":
    case "/admin":
    case "/menu": await render(input, `👋 <b>${tr(input.locale, "menu")}</b>`, adminKeyboard(input.locale)); return true;
    case "/stats": await showStats(input); return true;
    case "/orders": await showOrders(input); return true;
    case "/recharges":
    case "/pending": await showRecharges(input); return true;
    case "/support": await showSupport(input); return true;
    case "/customers": await setPending(input, "admin_customer_search"); await render(input, "Send name or email", adminKeyboard(input.locale)); return true;
    case "/catalog": await showCatalog(input); return true;
    case "/health": await showHealth(input); return true;
    case "/help": await render(input, `👋 <b>${tr(input.locale, "menu")}</b>`, adminKeyboard(input.locale)); return true;
    default: return false;
  }
}

export async function handleAdminCallback(input: AdminContext & { data: string }): Promise<boolean> {
  const d = input.data;
  if (!d.startsWith("adm:")) return false;
  const parts = d.split(":");
  const act = parts[1];
  const id = parts[2];
  switch (act) {
    case "menu": await render(input, `👋 <b>${tr(input.locale, "menu")}</b>`, adminKeyboard(input.locale)); return true;
    case "stats": await showStats(input); return true;
    case "orders": await showOrders(input); return true;
    case "o": if (id) await showOrder(input, id); return true;
    case "recharges": await showRecharges(input); return true;
    case "r": if (id) await showRechargeDetail(input, id); return true;
    case "support": await showSupport(input); return true;
    case "customers": await setPending(input, "admin_customer_search"); await render(input, "Send name or email", adminKeyboard(input.locale)); return true;
    case "c": if (id) await showCustomerDetail(input, id); return true;
    case "catalog": await showCatalog(input); return true;
    case "health": await showHealth(input); return true;
    default: return false;
  }
}
