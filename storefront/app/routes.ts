import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/root-index.tsx"),
  route("sitemap.xml", "routes/sitemap-xml.ts"),
  route("robots.txt", "routes/robots-txt.ts"),
  route("api/search/suggest", "routes/api-search-suggest.ts"),
  route("api/media-proxy", "routes/media-proxy.ts"),
  route("auth/callback", "routes/auth-callback.ts"),
  route(":locale/dashboard", "routes/dashboard-layout.tsx", [
    index("routes/dashboard-index.tsx"),
    route("catalog", "routes/dashboard-catalog.tsx"),
    route("catalog/:productId", "routes/dashboard-product.tsx"),
  ]),
  route(":locale", "routes/locale-layout.tsx", [
    index("routes/locale-home.tsx"),
    route("games", "routes/locale-games.tsx"),
    route("search", "routes/locale-search.tsx"),
    route("login", "routes/locale-login.tsx"),
    route("products", "routes/locale-products.tsx"),
    route("orders", "routes/locale-orders.tsx"),
    route("wallet", "routes/locale-wallet.tsx"),
    route("recharge", "routes/locale-recharge.tsx"),
    route("recharge/:requestId", "routes/locale-recharge-detail.tsx"),
    route("orders/:orderId", "routes/locale-order-detail.tsx"),
    route("orders/:orderId/invoice", "routes/locale-order-invoice.tsx"),
    route("recharge/:requestId/invoice", "routes/locale-recharge-invoice.tsx"),
    route("checkout/:gameSlug/:offerSlug", "routes/locale-checkout.tsx"),
    route(":section", "routes/locale-section.tsx"),
    route(":category/:slug", "routes/locale-product.tsx"),
    route(":category/:slug/:offerSlug", "routes/locale-offer.tsx"),
  ]),
] satisfies RouteConfig;
