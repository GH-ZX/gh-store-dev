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
  openConnect: string;
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
  catalog: string;
  categories: string;
  games: string;
  offers: string;
  back: string;
  emptyCatalog: string;
  noOffers: string;
  deals: string;
  dealsEmpty: string;
  search: string;
  searchPrompt: string;
  searchEmpty: string;
  language: string;
  languageChanged: string;
  support: string;
  supportSubjectPrompt: string;
  supportBodyPrompt: string;
  supportSent: string;
  supportCancel: string;
  login: string;
  loginIntro: string;
  openAccount: string;
};

const TEXTS: Record<Locale, Texts> = {
  ar: {
    welcome:
      "👋 أهلاً بك في <b>GH Store</b>!\n\nاختر ما تريد من الأزرار بالأسفل. لربط حسابك بالمحادثة اضغط «دخول». إذا لم يكن لديك حساب، أنشئه من المتجر أولًا.",
    linkedMenu: "مرحبًا بعودتك! استخدم الأزرار للاطلاع على طلباتك ورصيدك.",
    signInHint: "لربط هذه المحادثة بحسابك: افتح المتجر، احصل على رمز من 6 أرقام، ثم أرسله هنا.",
    openConnect: "افتح المتجر",
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
    catalog: "🛍 الكتالوج",
    categories: "اختر تصنيفًا:",
    games: "الألعاب المتاحة:",
    offers: "اختر باقتك:",
    back: "↩ رجوع",
    emptyCatalog: "لا يوجد كتالوج بعد. عد لاحقًا.",
    noOffers: "لا توجد باقات متاحة لهذا اللعبة حاليًا.",
    deals: "🔥 العروض",
    dealsEmpty: "لا توجد عروض حاليًا.",
    search: "🔍 بحث",
    searchPrompt: "أرسل اسم اللعبة أو الباقة للبحث عنها.",
    searchEmpty: "لا نتائج مطابقة.",
    language: "🌐 اللغة",
    languageChanged: "تم تغيير اللغة.",
    support: "💬 الدعم",
    supportSubjectPrompt: "ما موضوع طلبك؟ أرسله الآن (أو اضغط /cancel للإلغاء).",
    supportBodyPrompt: "اشرح لنا المشكلة بالتفصيل (أو اضغط /cancel للإلغاء).",
    supportSent: "✅ وصل طلبك. سنرد عليك هنا وفي صفحة الدعم.",
    supportCancel: "تم إلغاء طلب الدعم.",
    login: "🔐 دخول",
    loginIntro: "اضغط الزر لفتح المتجر ودخول حسابك مباشرة.",
    openAccount: "🔐 فتح حسابي",
  },
  en: {
    welcome:
      "👋 Welcome to <b>GH Store</b>!\n\nPick what you need from the buttons below. To connect your account to this chat, tap Sign in. No account yet? Create one on the store first.",
    linkedMenu: "Welcome back! Use the buttons to see your orders and balance.",
    signInHint: "To connect this chat to your account: open the store, get your 6-digit code, and send it here.",
    openConnect: "Open the store",
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
    catalog: "🛍 Catalog",
    categories: "Pick a category:",
    games: "Available games:",
    offers: "Pick a package:",
    back: "↩ Back",
    emptyCatalog: "The catalog is empty for now. Check back later.",
    noOffers: "No packages available for this game right now.",
    deals: "🔥 Deals",
    dealsEmpty: "No deals right now.",
    search: "🔍 Search",
    searchPrompt: "Send a game or package name to search.",
    searchEmpty: "No matching results.",
    language: "🌐 Language",
    languageChanged: "Language changed.",
    support: "💬 Support",
    supportSubjectPrompt: "What is this about? Send it now (or send /cancel to cancel).",
    supportBodyPrompt: "Tell us what happened in detail (or send /cancel to cancel).",
    supportSent: "✅ Got it. We will reply here and on the support page.",
    supportCancel: "Support request cancelled.",
    login: "🔐 Sign in",
    loginIntro: "Tap the button to open the store signed in.",
    openAccount: "🔐 Open my account",
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
      [{ text: t(locale, "catalog"), callback_data: "catalog" }],
      [
        { text: t(locale, "deals"), callback_data: "deals" },
        { text: t(locale, "search"), callback_data: "search" },
      ],
      linked
        ? [
            { text: t(locale, "orders"), callback_data: "orders" },
            { text: t(locale, "wallet"), callback_data: "wallet" },
          ]
        : [{ text: t(locale, "link"), callback_data: "link" }],
      linked ? [{ text: t(locale, "openAccount"), callback_data: "login" }] : [],
      [
        { text: t(locale, "support"), callback_data: "support" },
        { text: t(locale, "language"), callback_data: "language" },
      ],
      linked ? [{ text: t(locale, "unlink"), callback_data: "unlink" }] : [],
    ].filter((row) => row.length > 0),
  };
}

/** The button that takes an unlinked customer to the connect page. */
function connectKeyboard(locale: Locale): unknown {
  return {
    inline_keyboard: [
      [{ text: t(locale, "openConnect"), url: `https://gh-store.me/${locale}/telegram-connect` }],
    ],
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
): Promise<{ id: string; order_number: string; status: string; total: number; currency: string }[]> {
  const { data } = await supabase
    .from("orders")
    .select("id, order_number, status, total, currency")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    total: row.total,
    currency: row.currency,
  }));
}

/**
 * The customer's last orders, each row a button that opens the order page.
 */
async function showOrdersList(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
  userId: string,
): Promise<void> {
  const orders = await readOrders(supabase, userId);

  if (orders.length === 0) {
    await sendText(botToken, chatId, t(locale, "ordersEmpty"));
    return;
  }

  await sendText(botToken, chatId, t(locale, "orders"), {
    inline_keyboard: orders.map((order) => [
      {
        text: `${order.order_number} — ${money(order.total)} · ${escapeHtml(order.status)}`,
        url: `https://gh-store.me/${locale}/orders/${order.id}`,
      },
    ]),
  });
}

/**
 * Send a real sign-in link for the linked customer's account.
 *
 * `generateLink` creates the same magic link the site's own recovery flow
 * uses, and it is sent straight into the chat as a button — the customer taps
 * it and lands on the site already signed in, no password or code. Works only
 * when the chat is linked, because the email comes from the stored profile.
 */
async function sendLoginLink(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
  userId: string,
): Promise<void> {
  const profile = await readProfile(supabase, userId);
  const email = text(profile?.email);

  if (!email) {
    await sendText(botToken, chatId, t(locale, "notFound"));
    return;
  }

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `https://gh-store.me/${locale}/profile` },
    });

    const actionLink = text(data?.properties?.action_link);

    if (error || !actionLink) {
      await sendText(botToken, chatId, t(locale, "notFound"));
      return;
    }

    await sendText(botToken, chatId, t(locale, "loginIntro"), {
      inline_keyboard: [[{ text: t(locale, "openAccount"), url: actionLink }]],
    });
  } catch {
    await sendText(botToken, chatId, t(locale, "notFound"));
  }
}

/**
 * Open a support thread from the chat, as the linked customer.
 *
 * Mirrors the site's own flow: a thread plus a first message, both written with
 * the service key (the bot is not a logged-in session). The owner's queue is
 * alerted through the same queue the site uses.
 */
async function openBotSupportThread(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean; threadId?: string }> {
  const { data: thread, error: threadError } = await supabase
    .from("support_threads")
    .insert({ user_id: userId, subject: subject.slice(0, 200), status: "open" })
    .select("id")
    .maybeSingle();

  if (threadError || !thread) {
    return { ok: false };
  }

  const { error: messageError } = await supabase.from("support_messages").insert({
    thread_id: thread.id,
    sender_id: userId,
    sender_role: "customer",
    body: body.slice(0, 4000),
  });

  if (messageError) {
    await supabase.from("support_threads").delete().eq("id", thread.id);
    return { ok: false };
  }

  // Alert the owner queue, same as the site does.
  await supabase.from("telegram_alerts").insert({
    type: "support_message",
    payload: { thread_id: thread.id, user_id: userId, subject, body: body.slice(0, 600) },
  });

  return { ok: true, threadId: thread.id };
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

// ─── Chat preferences (locale override + support flow state) ──────────────

async function readPrefs(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
): Promise<{ locale: Locale | null; pending: string | null }> {
  const { data } = await supabase
    .from("telegram_chat_prefs")
    .select("locale, pending")
    .eq("chat_id", chatId)
    .maybeSingle();

  return {
    locale: data?.locale === "ar" ? "ar" : data?.locale === "en" ? "en" : null,
    pending: typeof data?.pending === "string" && data.pending ? data.pending : null,
  };
}

async function writePref(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  patch: { locale?: Locale | null; pending?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = {};

  if (patch.locale !== undefined) {
    body.locale = patch.locale;
  }

  if (patch.pending !== undefined) {
    body.pending = patch.pending;
  }

  await supabase.from("telegram_chat_prefs").upsert(
    { chat_id: chatId, ...body },
    { onConflict: "chat_id" },
  );
}

/** A locale that prefers an explicit /language choice, then the interface. */
async function effectiveLocale(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  interfaceLocale: Locale,
): Promise<Locale> {
  const prefs = await readPrefs(supabase, chatId);

  return prefs.locale ?? interfaceLocale;
}

// ─── Catalog reads ──────────────────────────────────────────────────────────

async function readCategories(
  supabase: ReturnType<typeof createClient>,
  locale: Locale,
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, name_ar, name_en")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true })
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: locale === "ar" ? row.name_ar : row.name_en,
  }));
}

async function readGames(
  supabase: ReturnType<typeof createClient>,
  locale: Locale,
  categoryId: string | null,
): Promise<{ id: string; slug: string; name: string }[]> {
  let query = supabase
    .from("games")
    .select("id, slug, name_ar, name_en")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true })
    .limit(30);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: locale === "ar" ? row.name_ar : row.name_en,
  }));
}

async function readOffers(
  supabase: ReturnType<typeof createClient>,
  locale: Locale,
  gameId: string,
): Promise<{ slug: string; name: string; price: number; currency: string; original_price: number | null }[]> {
  const { data } = await supabase
    .from("offers")
    .select("slug, name_ar, name_en, price, currency, original_price")
    .eq("game_id", gameId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true })
    .limit(15);

  return (data ?? []).map((row) => ({
    slug: row.slug,
    name: locale === "ar" ? row.name_ar : row.name_en,
    price: row.price,
    currency: row.currency,
    original_price: row.original_price,
  }));
}

function backRow(locale: Locale, data: string): unknown[] {
  return [{ text: t(locale, "back"), callback_data: data }];
}

async function showCatalog(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
): Promise<void> {
  const categories = await readCategories(supabase, locale);

  if (categories.length === 0) {
    await sendText(botToken, chatId, t(locale, "emptyCatalog"));
    return;
  }

  await sendText(botToken, chatId, t(locale, "categories"), {
    inline_keyboard: [
      ...categories.map((category) => [
        { text: category.name, callback_data: `cat:${category.id}` },
      ]),
      backRow(locale, "menu"),
    ],
  });
}

async function showGames(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
  categoryId: string,
): Promise<void> {
  const games = await readGames(supabase, locale, categoryId);

  if (games.length === 0) {
    await sendText(botToken, chatId, t(locale, "noOffers"));
    return;
  }

  await sendText(botToken, chatId, t(locale, "games"), {
    inline_keyboard: [
      // The category rides along so "back" can return to this list.
      ...games.map((game) => [{ text: game.name, callback_data: `game:${game.id}:${categoryId}` }]),
      backRow(locale, "catalog"),
    ],
  });
}

async function showOffers(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
  gameId: string,
  categoryId: string,
): Promise<void> {
  const offers = await readOffers(supabase, locale, gameId);

  if (offers.length === 0) {
    await sendText(botToken, chatId, t(locale, "noOffers"));
    return;
  }

  await sendText(
    botToken,
    chatId,
    [
      t(locale, "offers"),
      ...offers.map((offer) => {
        const sale = offer.original_price && offer.original_price > offer.price;
        const unit = offer.currency === "SYP" ? "SYP" : offer.currency === "EUR" ? "€" : "$";
        const fmt = (value: number) => `${unit}${value.toFixed(2)}`;
        const price = sale ? `~~${fmt(offer.original_price)}~~ ${fmt(offer.price)}` : fmt(offer.price);
        return `${offer.name} — <b>${price}</b>`;
      }),
      "",
      "https://gh-store.me",
    ].join("\n"),
    {
      inline_keyboard: [backRow(locale, `cat:${categoryId}`)],
    },
  );
}

/**
 * Deals and featured games — the text-only version of the homepage sections.
 */
async function readDeals(
  supabase: ReturnType<typeof createClient>,
  locale: Locale,
): Promise<{ name: string; price: number; currency: string }[]> {
  const { data } = await supabase
    .from("offers")
    .select("name_ar, name_en, price, currency, games!inner (name_ar, name_en)")
    .eq("is_active", true)
    .eq("is_sale", true)
    .eq("games.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true })
    .limit(10);

  return (data ?? []).map((row) => {
    const game = Array.isArray(row.games) ? row.games[0] : row.games;
    const name = locale === "ar" ? row.name_ar : row.name_en;
    const gameName = game ? (locale === "ar" ? game.name_ar : game.name_en) : null;

    return {
      name: gameName ? `${gameName} — ${name}` : name,
      price: row.price,
      currency: row.currency,
    };
  });
}

async function showDeals(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
): Promise<void> {
  const deals = await readDeals(supabase, locale);

  if (deals.length === 0) {
    await sendText(botToken, chatId, t(locale, "dealsEmpty"));
    return;
  }

  await sendText(
    botToken,
    chatId,
    [
      t(locale, "deals"),
      ...deals.map((deal) => {
        const unit = deal.currency === "SYP" ? "SYP" : deal.currency === "EUR" ? "€" : "$";
        return `${deal.name} — <b>${unit}${deal.price.toFixed(2)}</b>`;
      }),
      "",
      "https://gh-store.me",
    ].join("\n"),
  );
}

/** Search games and offers by name — the bot's /search. */
async function searchCatalogText(
  supabase: ReturnType<typeof createClient>,
  locale: Locale,
  query: string,
): Promise<{ games: { name: string; slug: string }[]; offers: { name: string; price: number; currency: string }[] }> {
  const token = query.trim().slice(0, 60);

  if (!token) {
    return { games: [], offers: [] };
  }

  const [gamesResult, offersResult] = await Promise.all([
    supabase
      .from("games")
      .select("name_ar, name_en, slug")
      .eq("is_active", true)
      .or(`name_ar.ilike.%${token}%,name_en.ilike.%${token}%`)
      .limit(6),
    supabase
      .from("offers")
      .select("name_ar, name_en, price, currency")
      .eq("is_active", true)
      .or(`name_ar.ilike.%${token}%,name_en.ilike.%${token}%`)
      .limit(6),
  ]);

  return {
    games: (gamesResult.data ?? []).map((game) => ({
      name: locale === "ar" ? game.name_ar : game.name_en,
      slug: game.slug,
    })),
    offers: (offersResult.data ?? []).map((offer) => ({
      name: locale === "ar" ? offer.name_ar : offer.name_en,
      price: offer.price,
      currency: offer.currency,
    })),
  };
}

async function showSearchResults(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  chatId: number,
  locale: Locale,
  query: string,
): Promise<void> {
  const { games, offers } = await searchCatalogText(supabase, locale, query);

  if (games.length === 0 && offers.length === 0) {
    await sendText(botToken, chatId, t(locale, "searchEmpty"));
    return;
  }

  const lines: string[] = [];

  if (games.length > 0) {
    lines.push(t(locale, "games"));
    lines.push(...games.map((game) => `🎮 ${game.name} — https://gh-store.me/${locale}/games/${game.slug}`));
  }

  if (offers.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(t(locale, "offers"));
    lines.push(
      ...offers.map((offer) => {
        const unit = offer.currency === "SYP" ? "SYP" : offer.currency === "EUR" ? "€" : "$";
        return `${offer.name} — <b>${unit}${offer.price.toFixed(2)}</b>`;
      }),
    );
  }

  await sendText(botToken, chatId, lines.join("\n"));
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
  languageCode: string | null,
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
      language_code: languageCode,
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

    const interfaceLocale = localeOf(message?.from?.language_code ?? callback?.from?.language_code);
    const ownerChatId = text(telegramSettings?.chat_id);
    const isOwner = ownerChatId !== null && ownerChatId === String(chatId);
    const link = await readChatLink(supabase, chatId);
    const linked = link !== null;
    const locale = await effectiveLocale(supabase, chatId, interfaceLocale);
    const prefs = await readPrefs(supabase, chatId);

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
            "<b>Owner commands</b>",
            "/stats — store totals and balances",
            "/pending — recharges waiting for review",
            "/alerts — alert type guidance",
            "/help — this message",
            "",
            "The buttons below are the customer menu — catalog, deals, search,",
            "language, and support. They work from any chat, including this one.",
            "",
            "Dashboard: https://gh-store.me/dashboard",
          ].join("\n"),
          // The owner gets the customer menu too, so the bot's buttons are
          // visible from the very first /start and testable in place.
          menuKeyboard(locale, linked),
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
          message.from?.language_code ?? null,
        );

        if (result.ok) {
          await sendText(botToken, chatId, t(locale, "codeAccepted"), menuKeyboard(locale, true));
        } else {
          await sendText(botToken, chatId, t(locale, `code_${result.reason}`));
        }
        return;
      }

      if (command === "/link" || command === "/signin") {
        if (linked) {
          await sendText(botToken, chatId, t(locale, "linkedMenu"));
        } else {
          await sendText(botToken, chatId, t(locale, "signInHint"), connectKeyboard(locale));
        }
        return;
      }

      if (command === "/orders") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }
        await showOrdersList(supabase, botToken, chatId, locale, link.user_id);
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

      if (command === "/cancel") {
        if (prefs.pending) {
          await writePref(supabase, chatId, { pending: null });
          await sendText(botToken, chatId, t(locale, "supportCancel"), menuKeyboard(locale, linked));
        }
        return;
      }

      // ── Support flow state machine ───────────────────────────────────────
      // `/support` asks for a subject; the next message is the subject; the one
      // after that is the body. State lives in `telegram_chat_prefs.pending`.
      if (prefs.pending === "support_subject") {
        const subject = message.text.trim().slice(0, 200);

        if (!subject) {
          await sendText(botToken, chatId, t(locale, "supportSubjectPrompt"));
          return;
        }

        await writePref(supabase, chatId, { pending: `support_body:${subject}` });
        await sendText(botToken, chatId, t(locale, "supportBodyPrompt"));
        return;
      }

      if (prefs.pending?.startsWith("support_body:")) {
        const subject = prefs.pending.slice("support_body:".length);
        const body = message.text.trim();

        await writePref(supabase, chatId, { pending: null });

        if (!body) {
          await sendText(botToken, chatId, t(locale, "supportBodyPrompt"));
          return;
        }

        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }

        const result = await openBotSupportThread(supabase, link.user_id, subject, body);

        await sendText(
          botToken,
          chatId,
          result.ok ? t(locale, "supportSent") : t(locale, "notFound"),
          menuKeyboard(locale, true),
        );
        return;
      }

      if (command === "/support") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }

        await writePref(supabase, chatId, { pending: "support_subject" });
        await sendText(botToken, chatId, t(locale, "supportSubjectPrompt"));
        return;
      }

      if (command === "/language") {
        const next: Locale = locale === "ar" ? "en" : "ar";
        await writePref(supabase, chatId, { locale: next });
        await sendText(botToken, chatId, `${t(next, "languageChanged")} (${next})`, menuKeyboard(next, linked));
        return;
      }

      if (command === "/search") {
        const query = rest;

        if (!query) {
          await sendText(botToken, chatId, t(locale, "searchPrompt"));
          return;
        }

        await showSearchResults(supabase, botToken, chatId, locale, query);
        return;
      }

      if (command === "/login") {
        if (!linked) {
          await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          return;
        }

        await sendLoginLink(supabase, botToken, chatId, locale, link.user_id);
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

        case "catalog":
          await showCatalog(supabase, botToken, chatId, locale);
          break;

        case "deals":
          await showDeals(supabase, botToken, chatId, locale);
          break;

        case "search":
          await sendText(botToken, chatId, t(locale, "searchPrompt"));
          break;

        case "language": {
          const next: Locale = locale === "ar" ? "en" : "ar";
          await writePref(supabase, chatId, { locale: next });
          await sendText(botToken, chatId, `${t(next, "languageChanged")} (${next})`, menuKeyboard(next, linked));
          break;
        }

        case "support":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            await writePref(supabase, chatId, { pending: "support_subject" });
            await sendText(botToken, chatId, t(locale, "supportSubjectPrompt"));
          }
          break;

        case "login":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            await sendLoginLink(supabase, botToken, chatId, locale, link.user_id);
          }
          break;

        default:
          if (data.startsWith("cat:")) {
            const categoryId = data.slice(4);
            if (categoryId) {
              await showGames(supabase, botToken, chatId, locale, categoryId);
            }
          } else if (data.startsWith("game:")) {
            const [gameId, categoryId] = data.slice(5).split(":");
            if (gameId) {
              await showOffers(supabase, botToken, chatId, locale, gameId, categoryId ?? "");
            }
          }
          break;

        case "link":
          await sendText(botToken, chatId, t(locale, "signInHint"), connectKeyboard(locale));
          break;

        case "orders":
          if (!linked) {
            await sendText(botToken, chatId, t(locale, "needLink"), menuKeyboard(locale, false));
          } else {
            await showOrdersList(supabase, botToken, chatId, locale, link.user_id);
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
