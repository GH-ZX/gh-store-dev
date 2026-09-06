import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Run migrated code with its own aliases, without the Worker dev server. */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["tests/storefront/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@server": `${root}storefront/app/.server`,
      "@": `${root}storefront/app`,
      "~": `${root}storefront/app`,
      "server-only": `${root}tests/stubs/server-only.ts`,
      // Tests live at the repository root; use the same SDK copy as the app.
      "@supabase/ssr": `${root}storefront/node_modules/@supabase/ssr/dist/module/index.js`,
    },
  },
});
