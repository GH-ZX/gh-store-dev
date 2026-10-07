import type { SupabaseClient } from "@supabase/supabase-js";
import { G2BulkClient } from "@server/providers/g2bulk/client";
import { readG2BulkCredentials } from "@server/lib/settings/provider-settings";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { logFailure } from "@server/lib/logging/logger";
import type { Json } from "@server/types/database";

/**
 * Read-path availability freshness.
 *
 * The owner's complaint was concrete: "the APIs' stocks are dynamic tho, I need
 * to make the store products dynamic too, not just static and needs always to
 * resync." Today `offers.is_active` is whatever the last import wrote, so a
 * package the supplier sold out of ten minutes ago still looks buyable until an
 * administrator presses import.
 *
 * Approach, and why:
 *
 * - **Read-through with a short TTL.** The supplier publishes two signals and
 *   both are used, because neither covers the whole catalog:
 *   `GET /games/:code/catalogue` answers every offer of one product at once, and
 *   `GET /products` carries a live `stock` count and `unit_price` per supplier
 *   product. Results are cached in isolate memory for {@link FRESH_TTL_MS};
 *   a page view inside that window costs nothing.
 * - **Serve the cached answer, refresh behind it.** Past the TTL the stale
 *   answer is still returned immediately and one refresh runs in the
 *   background, so a slow supplier never delays a page render. The caller is
 *   told how old the answer is, and the UI says so.
 * - **Never invent stock.** Only a positive supplier signal is `available`:
 *   a catalogue item the supplier still lists, or a supplier product whose live
 *   `stock` is greater than zero. Everything else — unknown provider, missing
 *   id, unreachable API — is `unknown`, never `available`.
 * - **Never swallow a provider failure.** A failed refresh is logged and
 *   surfaced as `unknown`, so the page can say it could not confirm instead of
 *   quietly implying the package is fine.
 * - **Never change prices or activation.** This layer reports; it does not write
 *   to `offers`, park anything, or reinterpret a price. Activation stays the
 *   import's job, and checkout re-reads the live price in the order transaction.
 * - **Price drift is reported, not applied.** `priceChanged` compares the
 *   supplier's live unit price with the cost recorded on the mapping at import
 *   time. The customer-facing price is never silently swapped; the page warns
 *   that the supplier price moved, and checkout still charges the price the
 *   catalog states.
 */

/** How long a fetched supplier snapshot is trusted on the read path. */
export const FRESH_TTL_MS = 45_000;
/** Past the TTL the stale answer is served while a refresh runs behind it. */
export const FRESH_STALE_MS = 5 * 60_000;
/** One supplier call per game code; this is the request timeout. */
const PROVIDER_TIMEOUT_MS = 4_000;

export type OfferAvailabilityStatus = "available" | "unavailable" | "unknown";

export type OfferAvailability = {
  offerId: string;
  status: OfferAvailabilityStatus;
  /** Epoch ms of the supplier answer this status came from, or null for unknown. */
  checkedAt: number | null;
  /** True when the status came from a snapshot older than the TTL. */
  stale: boolean;
  /** How the status was established, for logs and for the UI's wording. */
  source:
    | "supplier-stock"
    | "catalogue-listing"
    | "stored-stock"
    | "provider-unreachable"
    | "not-checked";
  /** True when the supplier's live unit price differs from the imported one. */
  priceChanged: boolean;
};

type SupplierProduct = { id: number; stock: number | null; unitPrice: number };

type Snapshot = { fetchedAt: number };
type CatalogueSnapshot = Snapshot & { catalogueIds: Set<number> };
type ProductsSnapshot = Snapshot & { byId: Map<number, SupplierProduct> };

type CacheEntry<T extends Snapshot> = {
  snapshot: T | null;
  expiresAt: number;
  inFlight: Promise<T | null> | null;
};

const catalogueCache = new Map<string, CacheEntry<CatalogueSnapshot>>();
let productsCache: CacheEntry<ProductsSnapshot> | null = null;

/** Test seam: the cache must not leak between test cases. */
export function clearAvailabilityCache(): void {
  catalogueCache.clear();
  productsCache = null;
}

type OfferingRow = {
  id: string;
  is_active: boolean | null;
  delivery_kind: string | null;
  product_id: string | null;
};

type MappingRow = {
  offer_id: string;
  provider_name: string;
  external_product_id: string | null;
  supplier_cost_usd: number | string | null;
  metadata: unknown;
};

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/**
 * Which supplier record this offer points at.
 *
 * Catalogue items carry `metadata.catalogue_id` (their `/games/:code/catalogue`
 * identity); product listings carry `metadata.product_id`. Reading both is what
 * lets one offer be checked against whichever endpoint actually describes it.
 */
function supplierRefs(mapping: MappingRow): { catalogueId: number | null; productId: number | null } {
  const metadata = mapping.metadata;
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
  return {
    catalogueId: numeric(record.catalogue_id),
    productId: numeric(record.product_id) ?? numeric(mapping.external_product_id),
  };
}

/** Read one supplier catalogue, with a timeout, and cache the answer. */
async function loadCatalogue(apiKey: string, gameCode: string): Promise<CatalogueSnapshot | null> {
  try {
    const client = new G2BulkClient({ apiKey });
    const catalogue = await withTimeout(client.getGameCatalogue(gameCode), PROVIDER_TIMEOUT_MS);
    if (!catalogue || !Array.isArray(catalogue.catalogues)) return null;
    return {
      catalogueIds: new Set(catalogue.catalogues.map((item) => item.id)),
      fetchedAt: Date.now(),
    };
  } catch (error) {
    // Fail visibly: the caller turns null into `unknown`, and the owner gets a
    // log line instead of a silent "looks fine".
    logFailure("catalog.freshness", "supplier_catalogue_unreachable", error, {
      provider: "g2bulk",
      gameCode,
    });
    return null;
  }
}

/** Read the supplier's whole product list, which carries live stock counts. */
async function loadProducts(apiKey: string): Promise<ProductsSnapshot | null> {
  try {
    const client = new G2BulkClient({ apiKey });
    const products = await withTimeout(client.listProducts(), PROVIDER_TIMEOUT_MS);
    const byId = new Map<number, SupplierProduct>();
    for (const product of products ?? []) {
      byId.set(product.id, {
        id: product.id,
        stock: typeof product.stock === "number" ? product.stock : null,
        unitPrice: product.unit_price,
      });
    }
    return { byId, fetchedAt: Date.now() };
  } catch (error) {
    logFailure("catalog.freshness", "supplier_products_unreachable", error, { provider: "g2bulk" });
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Schedule = (promise: Promise<unknown>) => void;

/**
 * Read-through cache with a stale-while-refresh window.
 *
 * Inside the TTL the cached snapshot is returned with no supplier call. Past it
 * the last good snapshot is still returned immediately and one refresh runs in
 * the background (via the route's `ctx.waitUntil`), so a slow supplier never
 * delays a page render. Only a snapshot that has never been obtained blocks.
 */
async function readThrough<T extends Snapshot>(options: {
  get: () => CacheEntry<T> | null;
  set: (entry: CacheEntry<T> | null) => void;
  load: () => Promise<T | null>;
  schedule?: Schedule;
}): Promise<T | null> {
  const now = Date.now();
  const entry = options.get();

  if (entry?.snapshot && entry.expiresAt > now) return entry.snapshot;

  // Stale but usable: hand back what we have and refresh off the hot path.
  if (entry?.snapshot && now - entry.snapshot.fetchedAt < FRESH_STALE_MS) {
    if (!entry.inFlight) {
      startRefresh(options, entry);
    }
    return entry.snapshot;
  }

  if (entry?.inFlight) return entry.inFlight;

  const slot: CacheEntry<T> = {
    snapshot: entry?.snapshot ?? null,
    expiresAt: now + FRESH_TTL_MS,
    inFlight: options.load(),
  };
  options.set(slot);

  const snapshot = await slot.inFlight;
  slot.inFlight = null;
  if (snapshot) {
    slot.snapshot = snapshot;
    slot.expiresAt = Date.now() + FRESH_TTL_MS;
  }
  return slot.snapshot;
}

function startRefresh<T extends Snapshot>(
  options: {
    get: () => CacheEntry<T> | null;
    set: (entry: CacheEntry<T> | null) => void;
    load: () => Promise<T | null>;
    schedule?: Schedule;
  },
  entry: CacheEntry<T>,
): void {
  const promise = options.load();
  entry.inFlight = promise;
  const settle = promise.then(
    (snapshot) => {
      const live = options.get();
      if (!live) return;
      live.inFlight = null;
      if (snapshot) {
        live.snapshot = snapshot;
        live.expiresAt = Date.now() + FRESH_TTL_MS;
      }
    },
    () => {
      const live = options.get();
      if (live) live.inFlight = null;
    },
  );
  options.schedule?.(settle);
}

type FreshnessDependencies = {
  /** Admin/service client used only for reads. */
  serviceClient?: SupabaseClient;
  /** Route's `ctx.waitUntil`, when a loader has one. */
  schedule?: Schedule;
};

/**
 * Availability for the offers of one product.
 *
 * Pure read path. It never writes to `offers`, never parks an offer, and never
 * changes a price or a mapping.
 */
export async function checkOffersFreshness(
  client: SupabaseClient,
  offers: readonly { id: string }[],
  dependencies: FreshnessDependencies = {},
): Promise<Map<string, OfferAvailability>> {
  const result = new Map<string, OfferAvailability>();
  if (offers.length === 0) return result;

  const offerIds = [...new Set(offers.map((offer) => offer.id))];
  const service = dependencies.serviceClient ?? safeServiceClient();
  const schedule = dependencies.schedule;

  try {
    const [offeringResult, mappingResult] = await Promise.all([
      client
        .from("offers")
        .select("id, is_active, delivery_kind, product_id")
        .in("id", offerIds),
      client
        .from("provider_offer_mappings")
        .select("offer_id, provider_name, external_product_id, supplier_cost_usd, metadata")
        .in("offer_id", offerIds),
    ]);

    // A read failure here is not "no mappings": it means availability could not
    // be established, which every offer below must report as unknown.
    const readFailed = Boolean(offeringResult.error || mappingResult.error);
    if (offeringResult.error) {
      logFailure("catalog.freshness", "offers_read_failed", offeringResult.error, {});
    }
    if (mappingResult.error) {
      logFailure("catalog.freshness", "mappings_read_failed", mappingResult.error, {});
    }

    const offering = new Map(
      ((offeringResult.data as OfferingRow[] | null) ?? []).map((row) => [row.id, row]),
    );
    const mappings = (mappingResult.data as MappingRow[] | null) ?? [];

    // Stored stock is the store's own inventory: an offer with an available
    // code needs no supplier call and is genuinely available right now.
    const storedOfferIds = new Set(
      [...offering.values()].filter((row) => row.delivery_kind === "stored").map((row) => row.id),
    );
    const stocked = await readStoredStock(service, storedOfferIds);

    const g2bulkMappings = mappings.filter((mapping) => mapping.provider_name === "g2bulk");
    const credentials = g2bulkMappings.length > 0 ? await readCredentials(service) : { apiKey: null };

    const productIds = [...new Set(
      [...offering.values()].flatMap((row) => (row.product_id ? [row.product_id] : [])),
    )];
    const gameCodeByProduct = g2bulkMappings.length > 0
      ? await readProviderGameCodes(client, productIds)
      : new Map<string, string>();

    const catalogueSnapshots = new Map<string, CatalogueSnapshot | null>();
    let productsSnapshot: ProductsSnapshot | null = null;

    if (credentials.apiKey) {
      const apiKey = credentials.apiKey;
      const gameCodes = [...new Set(g2bulkMappings.flatMap((mapping) => {
        const row = offering.get(mapping.offer_id);
        const code = row?.product_id ? gameCodeByProduct.get(row.product_id) : undefined;
        return code ? [code] : [];
      }))];
      const needsProducts = g2bulkMappings.some((mapping) => {
        const refs = supplierRefs(mapping);
        return refs.catalogueId === null && refs.productId !== null;
      });

      const readProducts = async (): Promise<ProductsSnapshot | null> => {
        if (!needsProducts) return null;
        return readThrough<ProductsSnapshot>({
          get: () => productsCache,
          set: (entry) => { productsCache = entry; },
          load: () => loadProducts(apiKey),
          schedule,
        });
      };

      const [, productSnapshot] = await Promise.all([
        Promise.all(gameCodes.map(async (code) => {
          catalogueSnapshots.set(code, await readThrough<CatalogueSnapshot>({
            get: () => catalogueCache.get(code) ?? null,
            set: (entry) => {
              if (entry) catalogueCache.set(code, entry);
              else catalogueCache.delete(code);
            },
            load: () => loadCatalogue(apiKey, code),
            schedule,
          }));
        })),
        readProducts(),
      ]);
      productsSnapshot = productSnapshot;
    }

    for (const offerId of offerIds) {
      const row = offering.get(offerId);
      const mapping = g2bulkMappings.find((candidate) => candidate.offer_id === offerId);
      const refs = mapping ? supplierRefs(mapping) : null;

      if (stocked.has(offerId)) {
        result.set(offerId, {
          offerId, status: "available", checkedAt: Date.now(), stale: false,
          source: "stored-stock", priceChanged: false,
        });
        continue;
      }

      if (readFailed || !mapping || !refs) {
        result.set(offerId, {
          offerId,
          status: "unknown",
          checkedAt: null,
          stale: false,
          source: readFailed ? "provider-unreachable" : "not-checked",
          priceChanged: false,
        });
        continue;
      }

      // A live stock count is the strongest signal; catalogue presence is the
      // fallback for the top-up catalogue, which publishes no stock at all.
      if (refs.productId !== null && productsSnapshot) {
        const product = productsSnapshot.byId.get(refs.productId);
        result.set(offerId, {
          offerId,
          status: product && product.stock !== null && product.stock > 0
            ? "available"
            : product && product.stock === 0
              ? "unavailable"
              : "unknown",
          checkedAt: productsSnapshot.fetchedAt,
          stale: Date.now() - productsSnapshot.fetchedAt > FRESH_TTL_MS,
          source: product ? "supplier-stock" : "not-checked",
          priceChanged: product ? priceDrifted(mapping, product.unitPrice) : false,
        });
        continue;
      }

      const code = row?.product_id ? gameCodeByProduct.get(row.product_id) : undefined;
      const catalogue = code ? catalogueSnapshots.get(code) ?? null : null;

      if (refs.catalogueId !== null && catalogue) {
        result.set(offerId, {
          offerId,
          status: catalogue.catalogueIds.has(refs.catalogueId) ? "available" : "unavailable",
          checkedAt: catalogue.fetchedAt,
          stale: Date.now() - catalogue.fetchedAt > FRESH_TTL_MS,
          source: "catalogue-listing",
          priceChanged: false,
        });
        continue;
      }

      result.set(offerId, {
        offerId,
        status: "unknown",
        checkedAt: catalogue?.fetchedAt ?? productsSnapshot?.fetchedAt ?? null,
        stale: false,
        source: "provider-unreachable",
        priceChanged: false,
      });
    }
  } catch (error) {
    // A failure to read availability is reported as unknown for every offer, so
    // the page states it could not confirm rather than implying everything is fine.
    logFailure("catalog.freshness", "freshness_read_failed", error, { offers: offerIds.length });
    for (const offerId of offerIds) {
      if (!result.has(offerId)) {
        result.set(offerId, {
          offerId, status: "unknown", checkedAt: null, stale: false,
          source: "provider-unreachable", priceChanged: false,
        });
      }
    }
  }

  return result;
}

/**
 * Whether the supplier's live unit price has moved away from the imported cost.
 *
 * `supplier_cost_usd` is what the import recorded for this mapping, so a live
 * value that differs materially is a real signal that the storefront's price is
 * out of date. It is *reported*, never applied: repricing an offer from a read
 * path would change what a customer is charged without review.
 */
function priceDrifted(mapping: MappingRow, liveUnitPrice: number): boolean {
  const recorded = Number(mapping.supplier_cost_usd);
  if (!Number.isFinite(recorded) || recorded <= 0) return false;
  if (!Number.isFinite(liveUnitPrice) || liveUnitPrice <= 0) return false;
  return Math.abs(liveUnitPrice - recorded) / recorded > 0.02;
}

async function readStoredStock(
  service: SupabaseClient | null,
  offerIds: Set<string>,
): Promise<Set<string>> {
  if (!service || offerIds.size === 0) return new Set();
  const { data, error } = await service
    .from("stock_items")
    .select("offer_id")
    .in("offer_id", [...offerIds])
    .eq("status", "available");
  if (error) {
    logFailure("catalog.freshness", "stored_stock_read_failed", error, {});
    return new Set();
  }
  return new Set(((data ?? []) as { offer_id: string }[]).map((row) => row.offer_id));
}

async function readProviderGameCodes(
  client: SupabaseClient,
  productIds: string[],
): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  if (productIds.length === 0) return codes;
  const { data, error } = await client
    .from("provider_game_mappings")
    .select("game_id, provider_name, external_game_code")
    .in("game_id", productIds)
    .eq("provider_name", "g2bulk");
  if (error) {
    logFailure("catalog.freshness", "provider_game_code_read_failed", error, {});
    return codes;
  }
  for (const row of (data ?? []) as { game_id: string; external_game_code: string | null }[]) {
    if (row.external_game_code) codes.set(row.game_id, row.external_game_code);
  }
  return codes;
}

async function readCredentials(service: SupabaseClient | null): Promise<{ apiKey: string | null }> {
  if (!service) return { apiKey: null };
  const { data, error } = await service
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();
  if (error) {
    logFailure("catalog.freshness", "provider_settings_read_failed", error, {});
    return { apiKey: null };
  }
  const { apiKey } = readG2BulkCredentials((data?.providers ?? {}) as Json);
  return { apiKey };
}

function safeServiceClient(): SupabaseClient | null {
  try {
    return createSupabaseServiceClient();
  } catch (error) {
    logFailure("catalog.freshness", "service_client_unavailable", error, {});
    return null;
  }
}

/**
 * The scheduled-tick hook.
 *
 * `workers/app.ts`'s `async scheduled` handler already runs every five minutes
 * (`wrangler.jsonc` → `triggers.crons`). It, or the BatStore sync it calls,
 * should invoke this so a product page nobody is looking at still has a fresh
 * snapshot before a visitor arrives:
 *
 *   await refreshAvailabilityForActiveOffers(createPublicClient(env), {
 *     schedule: (promise) => ctx.waitUntil(promise),
 *     maxGameCodes: 12,
 *   });
 *
 * This deliberately does not live in the Worker or in the BatStore stock
 * service: it is exposed here so that file's owner can call it without a merge
 * conflict, and it only reads.
 */
export async function refreshAvailabilityForActiveOffers(
  client: SupabaseClient,
  options: { schedule?: Schedule; maxGameCodes?: number; serviceClient?: SupabaseClient } = {},
): Promise<{ gameCodes: string[]; refreshed: number }> {
  const limit = Math.max(1, Math.min(50, options.maxGameCodes ?? 12));
  const service = options.serviceClient ?? safeServiceClient();
  const credentials = await readCredentials(service);
  if (!credentials.apiKey) return { gameCodes: [], refreshed: 0 };
  const apiKey = credentials.apiKey;

  const { data, error } = await client
    .from("provider_game_mappings")
    .select("external_game_code, products!inner(is_active)")
    .eq("provider_name", "g2bulk")
    .eq("products.is_active", true)
    .limit(limit);

  if (error) {
    logFailure("catalog.freshness", "scheduled_refresh_read_failed", error, {});
    return { gameCodes: [], refreshed: 0 };
  }

  const codes = [...new Set(
    ((data ?? []) as { external_game_code: string | null }[])
      .flatMap((row) => (row.external_game_code ? [row.external_game_code] : [])),
  )];

  let refreshed = 0;
  for (const code of codes) {
    // Force this read to refetch rather than serve the snapshot the tick itself
    // is meant to replace.
    const entry = catalogueCache.get(code);
    if (entry) entry.expiresAt = 0;
    const snapshot = await readThrough<CatalogueSnapshot>({
      get: () => catalogueCache.get(code) ?? null,
      set: (next) => {
        if (next) catalogueCache.set(code, next);
        else catalogueCache.delete(code);
      },
      load: () => loadCatalogue(apiKey, code),
      schedule: options.schedule,
    });
    if (snapshot) refreshed += 1;
  }

  return { gameCodes: codes, refreshed };
}
