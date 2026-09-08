import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import routes from "../../storefront/app/routes";

type RegisteredRoute = { path?: string; file: string; index?: boolean; children?: RegisteredRoute[] };
const root = fileURLToPath(new URL("../../", import.meta.url));
const legacyApp = join(root, "legacy-next-snapshot/app");
const storefrontApp = join(root, "storefront/app");

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function flatten(entries: RegisteredRoute[], parent = ""): { path: string; file: string }[] {
  return entries.flatMap((entry) => {
    const path = [parent, entry.path].filter(Boolean).join("/");
    return [{ path: `/${path}`, file: entry.file }, ...flatten(entry.children ?? [], path)];
  });
}

// Parameter spelling may change (rechargeId -> requestId) without changing URLs.
function normalize(path: string): string {
  return path.split("/").map((segment) => segment.startsWith(":") || /^\[[^\]]+\]$/.test(segment) ? ":param" : segment).join("/");
}

const registered = flatten(routes);
const registeredPatterns = new Set(registered.map(({ path }) => normalize(path)));
const legacyEndpoints = filesBelow(legacyApp)
  .filter((file) => /\/(?:page\.tsx|route\.ts)$/.test(file))
  .map((file) => `/${relative(legacyApp, file).split(sep).slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment)).join("/")}`);

// These existing pages intentionally share locale-section. Account and admin
// paths must have dedicated registrations: a generic category route is not parity.
const publicSections = new Set(["about", "faq", "how", "contact", "links", "privacy", "terms", "refunds", "gift-cards", "sale", "best-sellers"]);

function migratedPattern(legacyPath: string): string {
  const segments = legacyPath.split("/");
  if (segments.length === 3 && segments[1] === "[locale]" && publicSections.has(segments[2])) {
    return normalize("/:locale/:section");
  }
  // Previously shared /games URLs are served by the generic product routes.
  if (segments[1] === "[locale]" && segments[2] === "games" && segments.length >= 4) {
    segments[2] = ":category";
  }
  return normalize(segments.join("/"));
}

describe("migration route completeness", () => {
  it("registers an equivalent destination for every legacy page and API endpoint", () => {
    expect(legacyEndpoints.length).toBeGreaterThan(50);
    const missing = legacyEndpoints.filter((path) => !registeredPatterns.has(migratedPattern(path)));
    expect(missing, "Legacy URLs missing from the React Router manifest").toEqual([]);
  });

  it.each([
    "/:locale/login", "/:locale/forgot-password", "/:locale/reset-password", "/:locale/profile",
    "/:locale/notifications", "/:locale/telegram-connect", "/:locale/support",
    "/:locale/orders", "/:locale/orders/:orderId", "/:locale/orders/:orderId/invoice",
    "/:locale/wallet", "/:locale/recharge", "/:locale/recharge/pay/:invoiceId",
    "/:locale/recharge/:requestId", "/:locale/recharge/:requestId/invoice",
    "/:locale/checkout/:productSlug/:offerSlug",
    "/:locale/dashboard", "/:locale/dashboard/catalog", "/:locale/dashboard/catalog/new",
    "/:locale/dashboard/catalog/:productId", "/:locale/dashboard/orders", "/:locale/dashboard/orders/:orderId",
    "/:locale/dashboard/recharges", "/:locale/dashboard/customers", "/:locale/dashboard/customers/:userId",
    "/:locale/dashboard/payments", "/:locale/dashboard/reviews", "/:locale/dashboard/support", "/:locale/dashboard/logs",
    "/:locale/dashboard/providers", "/:locale/dashboard/sync", "/:locale/dashboard/website", "/:locale/dashboard/appearance",
    "/api/search/suggest", "/api/media-proxy", "/api/csp-report", "/api/reconcile", "/api/admin-actions", "/auth/callback",
  ])("explicitly registers critical route %s", (path) => {
    expect(registeredPatterns.has(normalize(path))).toBe(true);
  });

  it("points every registered route to an existing module", () => {
    expect(registered.filter(({ file }) => !existsSync(join(storefrontApp, file)))).toEqual([]);
  });
});
