import { createRequestHandler, RouterContextProvider } from "react-router";
import { initRuntimeEnv } from "../app/.server/runtime-env";
import { cloudflareContext } from "../app/lib/cloudflare-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Deployment-static bindings for deep service code (secrets, base URLs).
    // First write wins per isolate; values are identical across requests.
    initRuntimeEnv(env as unknown as Record<string, string | undefined>);

    const loadContext = new RouterContextProvider();
    loadContext.set(cloudflareContext, {
      env: env as unknown as Record<string, string | undefined>,
      ctx: ctx as unknown as {
        waitUntil(promise: Promise<unknown>): void;
        passThroughOnException(): void;
      },
    });
    return requestHandler(request, loadContext);
  },
} satisfies ExportedHandler<Env>;
