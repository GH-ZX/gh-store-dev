import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * `new URL("./src", import.meta.url).pathname` produces `/C:/…` on Windows,
 * where every alias resolution silently misses. fileURLToPath is the portable
 * spelling of the same thing.
 */
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": `${root}src`,
      /*
       * Services carry `import "server-only"`, whose real entry throws outside a
       * react-server runtime — exactly backwards for a unit test. The stub keeps
       * the guarantee where it belongs (the Next.js build) and lets Vitest reach
       * the money logic behind it.
       */
      "server-only": `${root}tests/stubs/server-only.ts`,
    },
  },
});
