import { useState, useSyncExternalStore } from "react";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
  type NotificationPermissionState,
} from "@/lib/browser-notifications";
import { toast } from "@/components/ui/toaster";
function subscribeToPermission(callback: () => void): () => void {
  if (typeof navigator !== "undefined" && "permissions" in navigator) {
    let queryPromise: Promise<PermissionStatus> | null = null;
    try {
      queryPromise = navigator.permissions.query({ name: "notifications" as PermissionName });
      queryPromise.then((status) => {
        status.addEventListener("change", callback);
      }).catch(() => {});
    } catch {
      // Permissions query not supported
    }
    return () => {
      if (queryPromise) {
        queryPromise.then((status) => {
          status.removeEventListener("change", callback);
        }).catch(() => {});
      }
    };
  }
  return () => {};
}

function getPermissionSnapshot(): NotificationPermissionState {
  return typeof window !== "undefined" ? getBrowserNotificationPermission() : "unsupported";
}

function getServerPermissionSnapshot(): NotificationPermissionState {
  return "unsupported";
}

export function BrowserNotificationBanner({
  locale = "ar",
  compact = false,
}: {
  locale?: "ar" | "en";
  compact?: boolean;
}) {
  const externalPermission = useSyncExternalStore(
    subscribeToPermission,
    getPermissionSnapshot,
    getServerPermissionSnapshot,
  );
  const [overridePermission, setOverridePermission] = useState<NotificationPermissionState | null>(null);
  const permission = overridePermission ?? externalPermission;
  const [dismissed, setDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const ar = locale === "ar";

  if (permission === "unsupported" || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const result = await requestBrowserNotificationPermission();
      setOverridePermission(result);

      if (result === "granted") {
        toast.success(
          ar ? "تم تفعيل إشعارات المتصفح بنجاح!" : "Browser notifications enabled successfully!",
        );
        sendBrowserNotification(
          ar ? "متجر GH | الإشعارات مفعّلة" : "GH Store | Notifications Active",
          {
            body: ar
              ? "ستصلك التنبيهات والطلبات الجديدة في متصفح Chrome مباشرة."
              : "You will receive new orders and store alerts directly in Chrome.",
          },
        );
      } else if (result === "denied") {
        toast.error(
          ar
            ? "تم رفض الإشعارات. يمكنك تفعيلها من إعدادات الموقع في شريط عنوان المتصفح."
            : "Notifications blocked. You can allow them in Chrome site settings.",
        );
      }
    } finally {
      setIsRequesting(false);
    }
  };

  if (permission === "granted") {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-inset)] border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-muted)]">
          <span className="size-2 rounded-full bg-[var(--accent)]" />
          <span>{ar ? "إشعارات المتصفح مفعّلة" : "Browser notifications active"}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white shadow-xs">
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--ink)]">
              {ar
                ? "تفعيل إشعارات المتصفح (Chrome)"
                : "Enable Chrome Browser Notifications"}
            </h4>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {ar
                ? "تصلك تنبيهات الطلبات الجديدة ونقص رصيد المزوّد فوراً على جهازك حتى لو كانت الصفحة بالخلفية."
                : "Receive instant alerts for new orders and low API balance on your desktop even when in background."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleEnable}
            disabled={isRequesting}
            className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-strong)] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isRequesting
              ? ar
                ? "جاري الطلب..."
                : "Requesting..."
              : ar
                ? "تفعيل الإشعارات"
                : "Enable Notifications"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-[var(--ink-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label={ar ? "إغلاق" : "Dismiss"}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
