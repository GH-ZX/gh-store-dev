import { useState } from "react";
import { broadcastSiteAlert } from "@/lib/realtime-alerts";
import { toast } from "@/components/ui/toaster";
import { BellIcon, SparkIcon } from "@/components/ui/icons";
import { inputClass, primaryButtonClass } from "./operations-shared";

export interface BroadcastAlertPanelProps {
  locale: "ar" | "en";
}

export function BroadcastAlertPanel({ locale }: BroadcastAlertPanelProps) {
  const ar = locale === "ar";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [sending, setSending] = useState(false);

  const applyTemplate = (tpl: "new_offers" | "maintenance" | "speed") => {
    if (tpl === "new_offers") {
      setTitle(ar ? "باقات وعروض جديدة متاحة الآن!" : "New packages & offers are now live!");
      setMessage(
        ar
          ? "تمت إضافة باقات حصرية بأسعار مخفضة وتسليم فوري. تفقد المنتجات الجديدة!"
          : "Exclusive packages with instant delivery have been added. Check out the latest products!",
      );
      setTone("success");
    } else if (tpl === "maintenance") {
      setTitle(ar ? "تنبيه: صيانة دورية مجدولة" : "Notice: Scheduled Maintenance");
      setMessage(
        ar
          ? "سنقوم ببعض التحديثات السريعة على الخوادم قريباً. قد تستغرق بضع دقائق فقط."
          : "We will perform brief maintenance on the servers soon. It will only take a few minutes.",
      );
      setTone("warning");
    } else {
      setTitle(ar ? "التسليم فوري وجميع الخدمات تعمل بنجاح" : "Instant Fulfillment Fully Operational");
      setMessage(
        ar
          ? "جميع قنوات الشحن والتسليم التلقائي تعمل بأقصى سرعة واستقرار."
          : "All automated recharge and delivery channels are operating at peak performance.",
      );
      setTone("info");
    }
    toast.info(ar ? "تم تطبيق النموذج" : "Template applied");
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error(ar ? "يرجى كتابة عنوان ونص التنبيه" : "Please enter both a title and message");
      return;
    }

    setSending(true);
    try {
      const ok = await broadcastSiteAlert({
        title,
        message,
        tone,
      });

      if (ok) {
        toast.success(
          ar
            ? "تم بث التنبيه لجميع المتواجدين في الموقع بنجاح!"
            : "Broadcast alert sent to all active users on the site!",
        );
        setTitle("");
        setMessage("");
      } else {
        toast.error(
          ar
            ? "تعذر إرسال البث. تأكد من اتصال الإنترنت."
            : "Failed to broadcast alert. Check connection.",
        );
      }
    } catch {
      toast.error(ar ? "حدث خطأ أثناء البث" : "Error broadcasting alert");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <BellIcon className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">
              {ar ? "بث تنبيه مباشر للموقع (Sonner Live Broadcast)" : "Live Site Broadcast Alert (Sonner)"}
            </h3>
            <p className="text-xs text-[var(--ink-muted)]">
              {ar
                ? "إرسال إشعار فوري يظهر مباشرة لكل العملاء والمشرفين المتواجدين حالياً في المتجر"
                : "Instantly pops up on every active visitor and admin's screen in real time"}
            </p>
          </div>
        </div>

        {/* Quick Templates */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--ink-muted)] hidden sm:inline">{ar ? "نماذج جاهزة:" : "Templates:"}</span>
          <button
            type="button"
            onClick={() => applyTemplate("new_offers")}
            className="px-2 py-1 rounded bg-[var(--surface-strong)] hover:bg-[var(--surface-inset)] text-[var(--ink)] text-[11px] font-medium border border-[var(--line)] cursor-pointer"
          >
            {ar ? "عروض جديدة" : "New offers"}
          </button>
          <button
            type="button"
            onClick={() => applyTemplate("speed")}
            className="px-2 py-1 rounded bg-[var(--surface-strong)] hover:bg-[var(--surface-inset)] text-[var(--ink)] text-[11px] font-medium border border-[var(--line)] cursor-pointer"
          >
            {ar ? "حالة النظام" : "Status"}
          </button>
          <button
            type="button"
            onClick={() => applyTemplate("maintenance")}
            className="px-2 py-1 rounded bg-[var(--surface-strong)] hover:bg-[var(--surface-inset)] text-[var(--ink)] text-[11px] font-medium border border-[var(--line)] cursor-pointer"
          >
            {ar ? "صيانة" : "Maintenance"}
          </button>
        </div>
      </div>

      <form onSubmit={handleBroadcast} className="space-y-3 pt-1">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="grid gap-1 text-xs font-semibold text-[var(--ink-soft)]">
            <span>{ar ? "عنوان التنبيه" : "Alert Title"}</span>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ar ? "مثال: تحديث مهم / تخفيضات لفترة محدودة..." : "e.g. Flash Sale / Important Announcement..."}
              maxLength={100}
              required
            />
          </label>

          <label className="grid gap-1 text-xs font-semibold text-[var(--ink-soft)]">
            <span>{ar ? "نوع التنبيه" : "Alert Tone"}</span>
            <select
              className={inputClass}
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
            >
              <option value="info">{ar ? "معلومات (أزرق)" : "Info (Blue)"}</option>
              <option value="success">{ar ? "نجاح (أخضر)" : "Success (Green)"}</option>
              <option value="warning">{ar ? "تحذير (أصفر)" : "Warning (Yellow)"}</option>
              <option value="error">{ar ? "تنبيه هام (أحمر)" : "Critical / Error (Red)"}</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-[var(--ink-soft)]">
          <span>{ar ? "نص الرسالة" : "Alert Message"}</span>
          <textarea
            className={inputClass}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={ar ? "اكتب الرسالة التي ستظهر للمستخدمين..." : "Type the broadcast message that appears to all users..."}
            required
          />
        </label>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={sending || !title.trim() || !message.trim()}
            className={primaryButtonClass}
          >
            <SparkIcon className="size-3.5 me-1.5" />
            <span>
              {sending
                ? ar
                  ? "جاري البث..."
                  : "Broadcasting..."
                : ar
                  ? "بث التنبيه لجميع المتواجدين الآن"
                  : "Broadcast to All Active Users"}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
