/**
 * Read-only dry run of the BatStore stock sweep against live production data.
 *
 * Prints exactly what `planStockAction` would decide for every BatStore mapping:
 * which offers would be parked, which unparked, and which are left alone
 * because an administrator overrode them. Writes nothing.
 */
const API = "https://ventetelegrambotrailway-production.up.railway.app/api/reseller/products";
const key = process.argv[2];

const fs = await import("node:fs");
const env = fs.readFileSync(".env.local", "utf8");
const grab = (name) => (env.match(new RegExp(`^${name}=(.*)$`, "m")) ?? [])[1]?.trim();
const url = grab("NEXT_PUBLIC_SUPABASE_URL");
const service = grab("SUPABASE_SERVICE_ROLE_KEY");
const headers = { apikey: service, Authorization: `Bearer ${service}` };

async function rest(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });

  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);

  return response.json();
}

/** Mirrors `toStockLevel` in batstore-stock.service.ts. */
function levelOf(product) {
  const stock = product && typeof product.stock === "number" && Number.isFinite(product.stock) ? product.stock : null;
  const isTest = product?.api_test === true;

  return { stock, available: !isTest && stock !== null && stock > 0, isTest };
}

/** Mirrors `planStockAction` in batstore-stock-sync.service.ts. */
function plan({ level, wasActive, wasParkedByStockSync, adminOverrodeStock }) {
  if (adminOverrodeStock) return "skip:admin-override";
  if (level === null) return "skip:not-listed";
  if (!level.available) return wasActive && !wasParkedByStockSync ? "park" : "skip:already-handled";
  return !wasActive && wasParkedByStockSync ? "unpark" : "skip:ok";
}

const products = await fetch(API, { headers: { "X-Reseller-Key": key, Accept: "application/json" } }).then((r) =>
  r.json(),
);
const byId = new Map((products.products ?? products).map((p) => [String(p.id), p]));

const mappings = await rest(
  "provider_offer_mappings?select=offer_id,external_product_id,metadata&provider_name=eq.batstore&order=external_product_id&limit=200",
);
const offerIds = mappings.map((m) => m.offer_id);
const offers = await rest(`offers?select=id,is_active,price,slug,products(name_en,is_active)&id=in.(${offerIds.join(",")})`);
const offerById = new Map(offers.map((o) => [o.id, o]));

const rows = mappings.map((m) => {
  const product = byId.get(String(m.external_product_id)) ?? null;
  const level = product ? levelOf(product) : null;
  const offer = offerById.get(m.offer_id);
  const metadata = m.metadata ?? {};
  const action = plan({
    level,
    wasActive: offer?.is_active === true,
    wasParkedByStockSync: metadata.parked_by_stock_sync === true,
    adminOverrodeStock: typeof metadata.stock_override_at === "string" && metadata.stock_override_at.length > 0,
  });

  return {
    productId: String(m.external_product_id),
    offerSlug: offer?.slug ?? "(missing)",
    productName: offer?.products?.name_en ?? "",
    offerActive: offer?.is_active ?? null,
    snapshotStock: metadata.stock ?? "(none)",
    liveStock: level ? level.stock : "(not listed)",
    wasParked: metadata.parked_by_stock_sync === true,
    action,
  };
});

console.log("productId | offerActive | snapshot | live     | wasParked | action");
for (const row of rows.filter((r) => !r.action.startsWith("skip:ok"))) {
  console.log(
    `${row.productId.padEnd(9)} | ${String(row.offerActive).padEnd(11)} | ${String(row.snapshotStock).padEnd(8)} | ${String(row.liveStock).padEnd(8)} | ${String(row.wasParked).padEnd(9)} | ${row.action}  ${row.offerSlug}`,
  );
}

console.log("\n--- products behind the two failed orders ---");
for (const id of ["16", "83"]) {
  const row = rows.find((r) => r.productId === id);
  const live = byId.get(id);

  console.log(
    `#${id}: live=${live ? `stock=${live.stock} test=${live.api_test === true}` : "NOT LISTED BY BATSTORE"} | store=${row ? `active=${row.offerActive} snapshotStock=${row.snapshotStock} action=${row.action}` : "no mapping"}`,
  );
}

const counts = rows.reduce((acc, row) => {
  acc[row.action] = (acc[row.action] ?? 0) + 1;

  return acc;
}, {});

console.log("\n--- totals ---");
console.log(JSON.stringify(counts, null, 2));
console.log(`mappings=${rows.length} liveProducts=${byId.size}`);

/*
 * The second half: what the checkout preflight would answer. A delisted product
 * stays visible (the sweep does not retire an operator's offer), so the guard is
 * the only thing standing between it and a refund cycle.
 */
console.log("\n--- what the checkout preflight would answer ---");
function guard({ level }) {
  if (level === null) return "refuse (delisted: BatStore cannot take the order)";
  if (!level.available) return `refuse (out_of_stock: available ${level.stock ?? "unknown"})`;
  return `allow (available ${level.stock})`;
}

for (const row of rows) {
  const product = byId.get(row.productId) ?? null;
  const level = product ? levelOf(product) : null;

  if (row.productId === "16" || row.productId === "83" || row.action === "park") {
    console.log(`#${row.productId} ${row.offerSlug}: ${guard({ level })}`);
  }
}

const refused = rows.filter((row) => {
  const product = byId.get(row.productId) ?? null;

  return guard({ level: product ? levelOf(product) : null }).startsWith("refuse");
}).length;

console.log(`preflight would refuse ${refused} of ${rows.length} BatStore offers right now`);
