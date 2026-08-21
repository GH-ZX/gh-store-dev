// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- `.open-next/worker.js` only exists after an OpenNext build
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";
import {
  handleTelegramWebhook,
  runTelegramScheduled,
  type BotEnv,
} from "./worker/telegram-bot";

type ReconcileEnv = BotEnv;

/** `waitUntil` is all the Worker runtime and this module need from the context. */
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

type ScheduledContext = WorkerContext;

function workerLog(event: string, fields: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      area: "fulfilment",
      event,
      ...fields,
    }),
  );
}

function reconciliationUrl(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    url.pathname = "/api/reconcile";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

const worker = {
  async fetch(request: Request, env: ReconcileEnv, ctx: WorkerContext) {
    // The Telegram webhook is the Worker's own route, handled before anything
    // reaches the Next.js application.
    const url = new URL(request.url);

    if (url.pathname === "/telegram-webhook") {
      return handleTelegramWebhook(request, env, ctx);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(_event: unknown, env: ReconcileEnv, ctx: ScheduledContext) {
    const secret = env.RECONCILE_CRON_SECRET?.trim();
    const url = env.NEXT_PUBLIC_APP_URL?.trim()
      ? reconciliationUrl(env.NEXT_PUBLIC_APP_URL.trim())
      : null;

    // Independent jobs: reconciliation for orders, Telegram for owner alerts.
    const jobs: Promise<void>[] = [];

    if (secret && url) {
      jobs.push(
        fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            accept: "application/json",
          },
        })
          .then(async (response) => {
            if (!response.ok) {
              workerLog("reconcile_http_failure", {
                status: response.status,
                statusText: response.statusText,
              });
              return;
            }

            workerLog("reconcile_triggered", { status: response.status });
          })
          .catch((error: unknown) => {
            workerLog("reconcile_request_failed", {
              error: error instanceof Error ? error.message : "Unknown failure.",
            });
          }),
      );
    } else {
      workerLog("reconcile_not_configured", {
        hasSecret: Boolean(secret),
        hasValidAppUrl: Boolean(url),
      });
    }

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      jobs.push(runTelegramScheduled(env));
    }

    if (jobs.length > 0) {
      ctx.waitUntil(Promise.all(jobs));
    }
  },
};

export default worker;
