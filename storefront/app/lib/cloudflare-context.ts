import { createContext } from "react-router";

export type CloudflareContextValue = {
  env: Record<string, string | undefined>;
  ctx: {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  };
};

/**
 * Worker bindings + execution context for loaders and actions. Set once per
 * request in workers/app.ts; read here. No process.env in workerd, no globals
 * shared across requests.
 */
export const cloudflareContext = createContext<CloudflareContextValue>();

export function getCloudflareContext(context: {
  get: (key: typeof cloudflareContext) => CloudflareContextValue;
}): CloudflareContextValue {
  return context.get(cloudflareContext);
}
