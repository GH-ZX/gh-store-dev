import type { ActionFunctionArgs } from "react-router";
import { logFailure } from "../.server/lib/logging/logger";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  try {
    const raw = await request.text();
    if (!raw || raw.length > 16_384) {
      return new Response(null, { status: 400 });
    }

    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") {
      return new Response(null, { status: 400 });
    }

    const { message, source, lineno, colno, stack, type } = body as Record<string, unknown>;

    logFailure(
      "client",
      type === "unhandledrejection" ? "unhandled_rejection" : "window_error",
      new Error(String(message || "Client runtime error")),
      {
        source: typeof source === "string" ? source.slice(0, 300) : undefined,
        lineno: typeof lineno === "number" ? lineno : undefined,
        colno: typeof colno === "number" ? colno : undefined,
        stack: typeof stack === "string" ? stack.slice(0, 1000) : undefined,
        referer: request.headers.get("referer") || undefined,
        userAgent: request.headers.get("user-agent")?.slice(0, 200) || undefined,
      },
    );

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
