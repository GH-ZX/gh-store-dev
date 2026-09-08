import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // Route modules are discovered virtually. Prebundle their client libraries
  // before the first page loads to avoid invalidating React during hydration.
  optimizeDeps: {
    include: ["@supabase/supabase-js", "embla-carousel-react", "sonner", "zod"],
  },
});
