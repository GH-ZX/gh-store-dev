import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { DEFAULT_LOCALE } from "./src/lib/config/app";
import { SECURITY_HEADERS } from "./src/lib/security/response-headers";

/**
 * Every IPv4 address this machine answers on, loopback excluded.
 *
 * Testing on a real phone means loading the site over the LAN address rather
 * than `localhost`, and the dev server treats that as cross-origin: it blocks
 * its own chunks and the HMR socket. The page still server-renders, so it looks
 * right and is completely dead — nothing hydrates, so no button works, no
 * drawer opens, and the carousel never initialises. That reads as a broken
 * component rather than as a blocked script, which is what makes it worth a
 * config entry instead of a note in a README.
 *
 * Computed rather than written down, because the address changes with the
 * network. Development only; it has no effect on a build.
 */
function lanOrigins(): string[] {
  return [
    /*
     * The loopback address by name, because `localhost` is allowed by default
     * and `127.0.0.1` is not — the dev server treats them as different hosts.
     * That caught a browser driven by a test runner, which reaches for the
     * numeric form: every chunk came back 403, nothing hydrated, and the page
     * looked complete and did nothing.
     */
    "127.0.0.1",
    ...Object.values(networkInterfaces())
      .flat()
      .flatMap((details) =>
        details && details.family === "IPv4" && !details.internal ? [details.address] : [],
      ),
  ];
}

/**
 * Public configuration lives in wrangler.jsonc, which is a runtime Worker
 * binding: it reaches server code through OpenNext, but never the browser
 * bundle. Next.js inlines only what exists at build time, so a Workers Builds
 * run without matching build variables used to ship a client that threw on
 * every browser-side Supabase call — Google sign-in died with "oauth_failed"
 * while email/password (server actions) kept working. Reading the values here
 * puts them into the bundle no matter how CI is configured; real environment
 * variables still win when a deployment chooses to set them.
 */
function publicConfigFromWrangler(): Record<string, string> {
  const source = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_APP_URL",
  ];

  return Object.fromEntries(
    names.map((name) => {
      const match = source.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`));
      const value = match?.[1]?.trim();

      if (!value) {
        throw new Error(`${name} is missing from wrangler.jsonc.`);
      }

      return [name, value];
    }),
  );
}

function inlinePublicEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(publicConfigFromWrangler()).filter(([name]) => {
      const existing = process.env[name];

      return !(existing && existing.trim());
    }),
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanOrigins(),

  env: inlinePublicEnv(),

  /**
   * Security headers on every response the origin produces, including the
   * routes middleware never sees (`api`, `auth/callback`, static assets).
   * Middleware applies the same set to its own responses; both write
   * identical values with set semantics. See response-headers.ts for what
   * each header closes.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS.map(([key, value]) => ({ key, value })),
      },
    ];
  },

  /**
   * The reference store addressed a game as `/game/:slug`; this one uses the
   * plural, matching `/games`. Both spellings will be typed and both will be
   * pasted, so the singular resolves instead of answering 404 — and it resolves
   * permanently, so a search engine that meets one stops asking.
   *
   * The unprefixed forms name the default locale here rather than handing the
   * job to the middleware. Deferring it read better and cost a whole extra
   * round trip: `/game/x` answered 301 to `/games/x`, which answered 307 to
   * `/ar/games/x`, which finally rendered — three requests, and the two
   * redirects were ~1.3s of latency between them for zero bytes of content.
   * Nothing was gained for it, because the middleware's locale choice is not a
   * negotiation: an unprefixed path goes to `DEFAULT_LOCALE` unconditionally
   * (src/middleware.ts), so writing `ar` here reaches the identical
   * destination in one hop. It is the same constant, read at the same time —
   * if the default ever moves, both places move together.
   */
  async redirects() {
    return [
      { source: "/game/:slug", destination: `/${DEFAULT_LOCALE}/games/:slug`, permanent: true },
      {
        source: "/game/:slug/:offerSlug",
        destination: `/${DEFAULT_LOCALE}/games/:slug/:offerSlug`,
        permanent: true,
      },
      {
        source: "/:locale(ar|en)/game/:slug",
        destination: "/:locale/games/:slug",
        permanent: true,
      },
      {
        source: "/:locale(ar|en)/game/:slug/:offerSlug",
        destination: "/:locale/games/:slug/:offerSlug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
