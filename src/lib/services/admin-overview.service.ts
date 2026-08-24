import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { GRACE_MINUTES } from "@/lib/orders/reconciliation-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getBatStoreCredentials,
  getG2BulkCredentials,
  getMaxStoreCredentials,
  getSamCredentials,
} from "@/lib/services/admin-settings.service";
import { getPayments } from "@/lib/services/admin-payments.service";
import { BatStoreClient } from "@/providers/batstore/client";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { SamClient } from "@/providers/sam/client";
import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * The overview's numbers.
 *
 * Every read runs behind {@link requireAdmin} on the caller's own session, so
 * RLS is the gate. A counter that fails comes back as null and renders as a
 * dash — a misleading zero would read as "no sales today" when the truth is
 * "we could not check", and those two demand different reactions from an owner.
 *
 * The external wallet reads are the one place this page reaches past the
 * database. Each is isolated and answers a failure kind instead of throwing,
 * so a supplier outage degrades one card to "unreachable" rather than taking
 * the whole morning's dashboard down with it.
 */

export type AdminOverviewStats = {
  games: number | null;
  activeGames: number | null;
  offers: number | null;
  activeOffers: number | null;
  orders: number | null;
  customers: number | null;
};

type CountResult = { count: number | null; error: unknown };

function toCount({ count, error }: CountResult): number | null {
  return error ? null : (count ?? 0);
}

/** Lifetime catalog counters, kept for the secondary line and the empty state. */
export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact", head: true } as const;

  const [games, activeGames, offers, activeOffers, orders, customers] = await Promise.all([
    supabase.from("games").select("id", head),
    supabase.from("games").select("id", head).eq("is_active", true),
    supabase.from("offers").select("id", head),
    supabase.from("offers").select("id", head).eq("is_active", true),
    supabase.from("orders").select("id", head),
    supabase.from("profiles").select("id", head).eq("role", "customer"),
  ]);

  return {
    games: toCount(games),
    activeGames: toCount(activeGames),
    offers: toCount(offers),
    activeOffers: toCount(activeOffers),
    orders: toCount(orders),
    customers: toCount(customers),
  };
}

// ─── Needs attention ────────────────────────────────────────────────────────

export type AttentionCounts = {
  /** Money taken, goods not out: paid/fulfilling/processing past the grace window. */
  stuckOrders: number | null;
  /** Manual top-ups waiting for the owner's decision. */
  pendingRecharges: number | null;
  /** Support threads not yet closed. */
  openSupportThreads: number | null;
  /** Reviews waiting for approval. */
  pendingReviews: number | null;
  /** Top-ups where money moved but the wallet did not (or the reverse). */
  paymentIssues: number | null;
};

const UNSETTLED_RECHARGE = ["pending", "reviewing"];

export async function getAttentionCounts(): Promise<AttentionCounts> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact", head: true } as const;
  const graceCutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();

  const [stuckOrders, pendingRecharges, openThreads, pendingReviews] = await Promise.all([
    supabase
      .from("orders")
      .select("id", head)
      .in("status", ["paid", "fulfilling", "processing"])
      .lt("created_at", graceCutoff),
    supabase.from("recharge_requests").select("id", head).in("status", UNSETTLED_RECHARGE),
    supabase.from("support_threads").select("id", head).in("status", ["open", "pending"]),
    supabase.from("reviews").select("id", head).eq("status", "pending"),
  ]);

  let paymentIssues: number | null = null;

  try {
    paymentIssues = (await getPayments({ limit: 200 })).totals.attention;
  } catch {
    paymentIssues = null;
  }

  return {
    stuckOrders: toCount(stuckOrders),
    pendingRecharges: toCount(pendingRecharges),
    openSupportThreads: toCount(openThreads),
    pendingReviews: toCount(pendingReviews),
    paymentIssues,
  };
}

// ─── Sales KPIs ─────────────────────────────────────────────────────────────

export type SalesKpis = {
  revenueToday: number | null;
  revenue7: number | null;
  revenuePrev7: number | null;
  orders7: number | null;
  newCustomers7: number | null;
  /** Average order value across the last seven days' paid orders. */
  avgOrder7: number | null;
};

function dayStart(offsetDays = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offsetDays);

  return date.toISOString();
}

async function sumPaidOrders(fromIso: string, toIso?: string): Promise<{ total: number; count: number } | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("orders")
    .select("total, created_at")
    .eq("payment_status", "paid")
    .gte("created_at", fromIso);

  if (toIso) {
    query = query.lt("created_at", toIso);
  }

  const { data, error } = await query;

  if (error) {
    return null;
  }

  return {
    total: (data ?? []).reduce((sum, row) => sum + (typeof row.total === "number" ? row.total : 0), 0),
    count: data?.length ?? 0,
  };
}

export async function getSalesKpis(): Promise<SalesKpis> {
  await requireAdmin();

  const [today, week, prevWeek, customers] = await Promise.all([
    sumPaidOrders(dayStart(0)),
    sumPaidOrders(dayStart(6)),
    (async () => {
      // Two bounds make "previous seven days" disjoint from the current one.
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("orders")
        .select("total, created_at")
        .eq("payment_status", "paid")
        .gte("created_at", dayStart(13))
        .lt("created_at", dayStart(6));

      if (error || !data) {
        return null;
      }

      return {
        total: data.reduce((sum, row) => sum + (typeof row.total === "number" ? row.total : 0), 0),
        count: data.length,
      };
    })(),
    (async () => {
      const supabase = await createSupabaseServerClient();
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer")
        .gte("created_at", dayStart(6));

      return error ? null : (count ?? 0);
    })(),
  ]);

  const revenue7 = week?.total ?? null;

  return {
    revenueToday: today?.total ?? null,
    revenue7,
    revenuePrev7: prevWeek?.total ?? null,
    orders7: week?.count ?? null,
    newCustomers7: customers,
    avgOrder7: revenue7 !== null && (week?.count ?? 0) > 0 ? revenue7 / week!.count! : null,
  };
}

// ─── Earnings (revenue against supplier cost) ───────────────────────────────

export type EarningsWindow = {
  revenue: number;
  cost: number | null;
  profit: number | null;
  /** Items whose offer carries no supplier mapping — manual catalog entries. */
  unmappedItems: number;
};

export type Earnings = { week: EarningsWindow; month: EarningsWindow };

type ItemRow = {
  total_price: number | null;
  offers:
    | { provider_offer_mappings: { supplier_cost_usd: number | null }[] | null }
    | null;
};

async function earningsForWindow(fromIso: string, toIso?: string): Promise<EarningsWindow | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("order_items")
    .select(
      "total_price, orders!inner(payment_status), offers(provider_offer_mappings(supplier_cost_usd))",
    )
    .eq("orders.payment_status", "paid")
    .gte("created_at", fromIso);

  if (toIso) {
    query = query.lt("created_at", toIso);
  }

  const { data, error } = await query;

  if (error || !data) {
    return null;
  }

  let revenue = 0;
  let cost = 0;
  let unmappedItems = 0;

  for (const row of data as ItemRow[]) {
    revenue += typeof row.total_price === "number" ? row.total_price : 0;

    const mapping = Array.isArray(row.offers)
      ? (row.offers[0] as ItemRow["offers"] | undefined)?.provider_offer_mappings
      : undefined;
    const rawCost = Array.isArray(mapping) ? mapping[0]?.supplier_cost_usd : undefined;

    if (typeof rawCost === "number") {
      cost += rawCost;
    } else {
      unmappedItems += 1;
    }
  }

  return {
    revenue,
    /*
     * One unknown cost breaks the guarantee behind a profit figure, so a window
     * containing manual-catalog items reports "not fully known" instead of a
     * number that flatters the store. The count tells the owner how far off a
     * full picture they are.
     */
    cost: unmappedItems === 0 ? cost : null,
    profit: unmappedItems === 0 ? revenue - cost : null,
    unmappedItems,
  };
}

export async function getEarnings(): Promise<Earnings | null> {
  await requireAdmin();

  const [week, month] = await Promise.all([
    earningsForWindow(dayStart(6)),
    earningsForWindow(dayStart(29)),
  ]);

  if (!week || !month) {
    return null;
  }

  return { week, month };
}

// ─── Fourteen-day series ────────────────────────────────────────────────────

export type DayPoint = { date: string; label: string; orders: number; revenue: number };

/**
 * Paid orders per day for the last `days` days, oldest first.
 *
 * Bucketed in UTC to match every timestamp the rest of the store stores; empty
 * days are filled with zeros so the bars read as a timeline rather than a list.
 */
export async function getDailySeries(days = 14): Promise<DayPoint[] | null> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select("total, created_at")
    .eq("payment_status", "paid")
    .gte("created_at", dayStart(days - 1));

  if (error || !data) {
    return null;
  }

  const buckets = new Map<string, { orders: number; revenue: number }>();

  for (let index = days - 1; index >= 0; index -= 1) {
    buckets.set(dayStart(index).slice(0, 10), { orders: 0, revenue: 0 });
  }

  for (const row of data) {
    const key = typeof row.created_at === "string" ? row.created_at.slice(0, 10) : "";
    const bucket = buckets.get(key);

    if (!bucket) {
      continue;
    }

    bucket.orders += 1;
    bucket.revenue += typeof row.total === "number" ? row.total : 0;
  }

  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: date.slice(5),
    orders: value.orders,
    revenue: value.revenue,
  }));
}

// ─── Latest orders ──────────────────────────────────────────────────────────

export type LatestOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  itemName: string | null;
};

/** A handful of the newest orders, light columns only — the list page has the rest. */
export async function getLatestOrders(limit = 5): Promise<LatestOrder[] | null> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, total, currency, created_at, order_items (name_en_snapshot)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return null;
  }

  return data.map((order) => {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const first = items[0] as { name_en_snapshot?: string | null } | undefined;

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      total: typeof order.total === "number" ? order.total : 0,
      currency: order.currency,
      createdAt: order.created_at,
      itemName: first?.name_en_snapshot ?? null,
    };
  });
}

// ─── Supplier wallets ───────────────────────────────────────────────────────

export type WalletBalance = { currency: string; amount: number };

export type WalletCard = {
  /** Stable identity used by the cache table and the sync action. */
  key: string;
  provider: string;
  label: string;
  /** Brand mark available for this wallet, when one exists. */
  logo: "shamcash" | null;
  balances: WalletBalance[];
  status: "ok" | "error" | "never";
  errorKind: string | null;
  syncedAt: string | null;
};

const WALLET_TABLE = "provider_wallet_balances";

/**
 * Every wallet the enabled providers hold, painted from the local cache.
 *
 * This read makes **no supplier calls** — that is what keeps the overview
 * instant no matter how slow any supplier is feeling. Freshness is a press on
 * each card's own sync button, which re-asks exactly one API and updates one
 * row, because suppliers answer at different speeds and a bulk refresh would
 * hold the fastest hostage to the slowest.
 */
export async function getWalletCards(): Promise<WalletCard[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const skeletons = await buildWalletSkeletons();

  const { data: cached } = await supabase.from(WALLET_TABLE).select("*");
  const byKey = new Map<string, WalletRow>((cached ?? []).map((row) => [row.wallet_key, row as WalletRow]));

  return skeletons.map((skeleton) => {
    const row = byKey.get(skeleton.key);

    if (!row) {
      return { ...skeleton, status: "never", errorKind: null, syncedAt: null };
    }

    return {
      ...skeleton,
      balances: Array.isArray(row.balances)
        ? (row.balances as WalletBalance[]).filter(
            (entry) => typeof entry?.currency === "string" && typeof entry?.amount === "number",
          )
        : [],
      status: (row.status as WalletCard["status"]) ?? "ok",
      errorKind: row.error_kind ?? null,
      syncedAt: row.synced_at ?? null,
    };
  });
}

/** One balance source, freshly asked and immediately remembered. */
export async function syncWalletCard(key: string): Promise<
  | { ok: true; card: WalletCard }
  | { ok: false; errorKind: string }
> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  try {
    let card: WalletCard;

    if (key === "g2bulk") {
      const { apiKey, enabled } = await getG2BulkCredentials();
      if (!apiKey || !enabled) return { ok: false, errorKind: "missing_key" };

      const account = await new G2BulkClient({ apiKey }).getAccount();
      card = {
        key,
        provider: "g2bulk",
        label: account.username ?? account.first_name ?? "G2Bulk",
        logo: null,
        balances: [{ currency: "USD", amount: account.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key === "maxstore") {
      const { apiToken, enabled } = await getMaxStoreCredentials();
      if (!apiToken || !enabled) return { ok: false, errorKind: "missing_key" };

      const profile = await new MaxStoreClient({ apiToken }).getProfile();
      card = {
        key,
        provider: "maxstore",
        label: profile.username ?? "MaxStore",
        logo: null,
        balances: [{ currency: "USD", amount: profile.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key === "batstore") {
      const { apiToken, enabled } = await getBatStoreCredentials();
      if (!apiToken || !enabled) return { ok: false, errorKind: "missing_key" };

      const account = await new BatStoreClient(apiToken).getMe();
      card = {
        key,
        provider: "batstore",
        label: account.username,
        logo: null,
        balances: [{ currency: "USD", amount: account.balance }],
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else if (key.startsWith("sam:")) {
      const [, methodRaw, identifier] = key.split(":");
      const method = methodRaw === "syriatel" ? "syriatel" : "shamcash";
      const { apiKey, enabled } = await getSamCredentials();
      if (!apiKey || !enabled || !identifier) return { ok: false, errorKind: "missing_key" };

      const balances = await new SamClient(apiKey).getWalletBalance(method as SamMethod, identifier);
      card = {
        key,
        provider: "sam",
        label: method === "syriatel" ? "SyriatelCash" : "ShamCash",
        logo: method === "shamcash" ? "shamcash" : null,
        balances,
        status: "ok",
        errorKind: null,
        syncedAt: new Date().toISOString(),
      };
    } else {
      return { ok: false, errorKind: "unknown_wallet" };
    }

    await supabase.from(WALLET_TABLE).upsert(
      {
        wallet_key: card.key,
        provider: card.provider,
        label: card.label,
        balances: card.balances,
        status: card.status,
        error_kind: card.errorKind,
        synced_at: card.syncedAt ?? undefined,
      },
      { onConflict: "wallet_key" },
    );

    return { ok: true, card };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";

    // Remember the failure too, so a dead supplier reads as one instead of as
    // a stale number wearing a green badge.
    await supabase
      .from(WALLET_TABLE)
      .upsert(
        {
          wallet_key: key,
          provider: key.split(":")[0] ?? key,
          status: "error",
          error_kind: message.slice(0, 120),
          synced_at: new Date().toISOString(),
        },
        { onConflict: "wallet_key" },
      )
      .then(() => undefined, () => undefined);

    return { ok: false, errorKind: "unreachable" };
  }
}

type WalletRow = {
  wallet_key: string;
  provider: string;
  label: string | null;
  balances: unknown;
  status: string;
  error_kind: string | null;
  synced_at: string | null;
};

/**
 * Card skeletons from configuration alone — no supplier traffic.
 *
 * Sam's cards come from the stored wallet identifiers, so even a never-synced
 * ShamCash shows up with its name rather than vanishing until first press.
 */
async function buildWalletSkeletons(): Promise<WalletCard[]> {
  const [g2bulk, maxstore, batstore, sam] = await Promise.all([
    getG2BulkCredentials(),
    getMaxStoreCredentials(),
    getBatStoreCredentials(),
    getSamCredentials(),
  ]);

  const cards: WalletCard[] = [];

  if (g2bulk.apiKey && g2bulk.enabled) {
    cards.push({
      key: "g2bulk",
      provider: "g2bulk",
      label: "G2Bulk",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (maxstore.apiToken && maxstore.enabled) {
    cards.push({
      key: "maxstore",
      provider: "maxstore",
      label: "MaxStore",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (batstore.apiToken && batstore.enabled) {
    cards.push({
      key: "batstore",
      provider: "batstore",
      label: "BatStore",
      logo: null,
      balances: [],
      status: "never",
      errorKind: null,
      syncedAt: null,
    });
  }

  if (sam.apiKey && sam.enabled) {
    if (sam.shamcashIdentifier) {
      cards.push({
        key: `sam:shamcash:${sam.shamcashIdentifier}`,
        provider: "sam",
        label: "ShamCash",
        logo: "shamcash",
        balances: [],
        status: "never",
        errorKind: null,
        syncedAt: null,
      });
    }

    if (sam.syriatelIdentifier) {
      cards.push({
        key: `sam:syriatel:${sam.syriatelIdentifier}`,
        provider: "sam",
        label: "SyriatelCash",
        logo: null,
        balances: [],
        status: "never",
        errorKind: null,
        syncedAt: null,
      });
    }
  }

  return cards;
}

