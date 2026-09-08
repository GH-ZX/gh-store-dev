import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { toast } from "@/components/ui/toaster";
import { sendBrowserNotification } from "@/lib/browser-notifications";
const FALLBACK_SUPABASE_URL = "https://njlzgfddfnnqujaodbta.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_gtOxP1au24qFXwzVppy0vw_oFWaSIH2";
const CHANNEL_NAME = "gh-store-alerts";
const EVENT_NAME = "site-alert";

export type BroadcastAlertPayload = {
  id: string;
  title: string;
  message: string;
  tone?: "info" | "success" | "warning" | "error";
  duration?: number;
  timestamp: number;
};

let browserClient: SupabaseClient | null = null;
let activeChannel: RealtimeChannel | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(FALLBACK_SUPABASE_URL, FALLBACK_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return browserClient;
}

/**
 * Initializes the realtime alert listener on the client.
 * Subscribes to the broadcast channel and displays incoming alerts via Sonner toast.
 */
export function subscribeToSiteAlerts(
  onAlert?: (payload: BroadcastAlertPayload) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const client = getBrowserSupabase();

  if (!activeChannel) {
    const channel = client.channel(CHANNEL_NAME, {
      config: { broadcast: { self: true } },
    });

    channel.on(
      "broadcast",
      { event: EVENT_NAME },
      ({ payload }: { payload: BroadcastAlertPayload }) => {
        if (!payload?.title) return;

        const tone = payload.tone || "info";
        const notify =
          tone === "success"
            ? toast.success
            : tone === "warning"
              ? toast.warning
              : tone === "error"
                ? toast.error
                : toast.info;

        notify(payload.title, {
          description: payload.message,
          duration: payload.duration || 7000,
        });

        sendBrowserNotification(payload.title, {
          body: payload.message,
        });
        if (onAlert) {
          onAlert(payload);
        }
      },
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        activeChannel = channel;
      }
    });
  }

  return () => {
    // Keep channel persistent for root lifetime
  };
}

/**
 * Broadcasts an alert to all active users and admins currently on the site.
 */
export async function broadcastSiteAlert(input: {
  title: string;
  message: string;
  tone?: "info" | "success" | "warning" | "error";
  duration?: number;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const client = getBrowserSupabase();
  let channel = activeChannel;

  if (!channel) {
    channel = client.channel(CHANNEL_NAME, {
      config: { broadcast: { self: true } },
    });

    await new Promise<void>((resolve) => {
      channel!.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          activeChannel = channel;
          resolve();
        }
      });
      // Safety timeout after 2s
      setTimeout(resolve, 2000);
    });
  }

  const payload: BroadcastAlertPayload = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    message: input.message.trim(),
    tone: input.tone || "info",
    duration: input.duration || 7000,
    timestamp: Date.now(),
  };

  try {
    const status = await channel.send({
      type: "broadcast",
      event: EVENT_NAME,
      payload,
    });
    return status === "ok";
  } catch (err) {
    console.error("Failed to broadcast alert:", err);
    return false;
  }
}
