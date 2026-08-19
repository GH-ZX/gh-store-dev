// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

type ReconcileEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  RECONCILE_CRON_SECRET?: string;
};

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: ReconcileEnv, ctx: ScheduledContext) {
    const url = `${env.NEXT_PUBLIC_APP_URL ?? ""}/api/reconcile`;
    const secret = env.RECONCILE_CRON_SECRET?.trim();

    if (!secret) {
      return;
    }

    ctx.waitUntil(
      fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }).catch(() => undefined),
    );
  },
};