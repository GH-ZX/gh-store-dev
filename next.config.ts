import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

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
  return Object.values(networkInterfaces())
    .flat()
    .flatMap((details) =>
      details && details.family === "IPv4" && !details.internal ? [details.address] : [],
    );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanOrigins(),

  /**
   * The reference store addressed a game as `/game/:slug`; this one uses the
   * plural, matching `/games`. Both spellings will be typed and both will be
   * pasted, so the singular resolves instead of answering 404 — and it resolves
   * permanently, so a search engine that meets one stops asking.
   *
   * The locale prefix is left to the middleware, which sends an unprefixed path
   * to Arabic: adding it here would mean writing the default locale into a
   * redirect that has no idea what the visitor reads.
   */
  async redirects() {
    return [
      { source: "/game/:slug", destination: "/games/:slug", permanent: true },
      {
        source: "/game/:slug/:offerSlug",
        destination: "/games/:slug/:offerSlug",
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
