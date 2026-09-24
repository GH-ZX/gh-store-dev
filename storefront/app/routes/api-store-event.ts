import { getCloudflareContext } from "@/lib/cloudflare-context";
import { STORE_EVENTS, type StoreEvent } from "@/lib/analytics/events";
import { capturePosthog } from "@server/lib/services/posthog.service";
import type { ActionFunctionArgs } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";
const EVENTS = new Set<string>(STORE_EVENTS);
export async function action({ request, context }: ActionFunctionArgs) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return new Response(null,{status:204});
  if (Number(request.headers.get("content-length") ?? 0) > 256) return new Response(null,{status:413});
  const reader = request.body?.getReader();
  if (!reader) return new Response(null,{status:400});
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>256) { await reader.cancel(); return new Response(null,{status:413}); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset=0; for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  const raw = new TextDecoder().decode(bytes);
  let event = raw;
  let sessionId: string | null = null;
  if (raw.startsWith("{")) {
    try {
      const payload = JSON.parse(raw);
      event = payload.event;
      if (payload.consent === true && typeof payload.sessionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sessionId)) sessionId = payload.sessionId;
    } catch { return new Response(null,{status:400}); }
  }
  if (!EVENTS.has(event)) return new Response(null,{status:400});
  if (sessionId) {
    const { ctx } = getCloudflareContext(context);
    ctx.waitUntil(capturePosthog(event as StoreEvent, sessionId));
  }
  if (hasServiceRoleKey()) {
    await (createSupabaseServiceClient() as SupabaseClient).rpc("count_store_event",{p_event:event});
  }
  return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
}
