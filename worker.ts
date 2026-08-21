// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- `.open-next/worker.js` only exists after an OpenNext build
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

type ReconcileEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  RECONCILE_CRON_SECRET?: string;
};

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

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
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: ReconcileEnv, ctx: ScheduledContext) {
    const secret = env.RECONCILE_CRON_SECRET?.trim();
    const url = env.NEXT_PUBLIC_APP_URL?.trim()
      ? reconciliationUrl(env.NEXT_PUBLIC_APP_URL.trim())
      : null;

    if (!secret || !url) {
      workerLog("reconcile_not_configured", {
        hasSecret: Boolean(secret),
        hasValidAppUrl: Boolean(url),
      });
      return;
    }

    ctx.waitUntil(
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
  },
};

export default worker;