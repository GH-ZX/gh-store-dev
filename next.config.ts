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
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
