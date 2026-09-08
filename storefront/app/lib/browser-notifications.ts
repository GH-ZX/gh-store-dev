/**
 * Chrome & Web Browser Desktop Notifications API helper.
 * Provides permission requesting, audio chimes, and native system alerts.
 */

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return "denied";
  }
}

export function playNotificationChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // AudioContext blocked by browser policy until gesture
  }
}

export function sendBrowserNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    badge?: string;
    url?: string;
    tag?: string;
    silent?: boolean;
  },
): Notification | null {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }
  if (Notification.permission !== "granted") {
    return null;
  }

  try {
    if (!options?.silent) {
      playNotificationChime();
    }

    const n = new Notification(title, {
      body: options?.body,
      icon: options?.icon || "/gh-store-logo-mark.png",
      badge: options?.badge || "/favicon.ico",
      tag: options?.tag || "gh-store-notification",
    });

    if (options?.url) {
      n.onclick = (e) => {
        e.preventDefault();
        window.focus();
        window.location.href = options.url!;
        n.close();
      };
    }

    return n;
  } catch {
    return null;
  }
}
