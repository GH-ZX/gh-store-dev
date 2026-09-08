import { test as base } from "@playwright/test";

export { expect, type Locator, type Page } from "@playwright/test";

// Each local browser context represents a separate visitor. Without a proxy,
// Wrangler gives every parallel test the same fallback IP, pooling the entire
// suite into one visitor's rate limit. Production requests keep their real IP.
export const test = base.extend<{ localVisitor: void }>({
  localVisitor: [async ({ context, baseURL }, use, testInfo) => {
    const origin = baseURL ? new URL(baseURL).origin : "";
    const hostname = baseURL ? new URL(baseURL).hostname : "";
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
      const key = `${testInfo.testId}:${testInfo.retry}`;
      const hash = [...key].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
      await context.route((url) => url.origin === origin, (route) => route.continue({
        headers: {
          ...route.request().headers(),
          "x-real-ip": `198.18.${(hash >>> 8) % 256}.${hash % 254 + 1}`,
        },
      }));
    }
    await use();
  }, { auto: true }],
});
