import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
import { cn } from "@/lib/cn";
import { BellIcon, ScrollIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toaster";
import { BroadcastAlertPanel } from "./broadcast-alert-panel";

export function LogsView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "logs" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const tabs = ["events", "actions", "syncs"] as const;

  return (
    <div className="space-y-6">
      {/* Tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = view.view === tab;

            return (
              <Link
                key={tab}
                to={`?view=${tab}`}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-xs font-semibold transition-all duration-150",
                  active
                    ? "bg-[var(--accent)] text-white shadow-xs"
                    : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
                )}
              >
                {tab === "events"
                  ? t("App events", "أحداث التطبيق")
                  : tab === "actions"
                    ? t("Admin actions", "إجراءات المشرفين")
                    : t("Provider syncs", "مزامنة المزودين")}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            toast.info(
              ar
                ? "إشعار تجريبي: محرك التنبيهات يعمل بشكل سليم!"
                : "Test alert: Notification engine is operational!",
              {
                description:
                  ar
                    ? "تم استقبال التنبيه الفوري بنجاح في لوحة التحكم."
                    : "Instant alert received successfully in the admin dashboard.",
              },
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--accent)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
        >
          <BellIcon className="size-3.5 text-[var(--accent)]" />
          <span>{ar ? "فحص التنبيهات" : "Test alert"}</span>
        </button>
      </div>
      {/* Live Site Broadcast Alert Box */}
      <BroadcastAlertPanel locale={view.locale} />


      {/* 1. Admin Actions Audit Log */}
      {"audit" in view && view.audit && (
        <div className="space-y-4">
          {view.audit.entries.length === 0 ? (
            <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
              {t(
                "No administrator actions recorded.",
                "لا توجد إجراءات مشرفين مسجلة.",
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {view.audit.entries.map((entry) => (
                <article className="admin-card space-y-3" key={entry.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-mono text-xs text-[var(--ink)] font-bold">
                        <bdi>{entry.action}</bdi>
                      </strong>
                      <span className="text-xs text-[var(--ink-muted)]">
                        <bdi>{entry.actor.name || entry.actor.email}</bdi>
                      </span>
                    </div>

                    <UI.DateTime value={entry.createdAt} />
                  </div>

                  <p className="text-xs text-[var(--ink-soft)] font-mono">
                    <bdi>
                      {entry.entityType} #{entry.entityId}
                    </bdi>
                  </p>

                  <UI.JsonDetails
                    value={entry.values}
                    label={t("Details", "التفاصيل")}
                  />
                </article>
              ))}
            </div>
          )}

          <UI.Pager page={view.page} total={view.audit.total} ar={ar} />
        </div>
      )}

      {/* 2. Provider Syncs Log */}
      {"syncs" in view && view.syncs && (
        <div className="space-y-4">
          {view.syncs.length === 0 ? (
            <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
              {t("No provider syncs recorded.", "لا توجد عمليات مزامنة مسجلة.")}
            </div>
          ) : (
            <div className="space-y-3">
              {view.syncs.map((entry, index) => (
                <article key={String(entry.id ?? index)} className="admin-card space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-semibold text-[var(--ink)]">
                        {String(entry.provider_name ?? "")}
                      </strong>
                      <UI.Badge>{String(entry.status ?? "")}</UI.Badge>
                      <span className="text-xs text-[var(--ink-muted)] font-mono">
                        <bdi>{String(entry.kind ?? "")}</bdi>
                      </span>
                    </div>

                    <UI.DateTime value={String(entry.created_at ?? "")} />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)] bg-[var(--surface-inset)] p-2.5 rounded-lg border border-[var(--line)]">
                    <span>
                      {t("Requested", "المطلوبة")}:{" "}
                      <strong className="text-[var(--ink)]">{String(entry.requested_count ?? 0)}</strong>
                    </span>
                    <span className="text-[var(--line-strong)] select-none">·</span>
                    <span>
                      {t("Created", "المضافة")}:{" "}
                      <strong className="text-[var(--success)]">{String(entry.created_count ?? 0)}</strong>
                    </span>
                    <span className="text-[var(--line-strong)] select-none">·</span>
                    <span>
                      {t("Updated", "المحدثة")}:{" "}
                      <strong className="text-[var(--accent)]">{String(entry.updated_count ?? 0)}</strong>
                    </span>
                    <span className="text-[var(--line-strong)] select-none">·</span>
                    <span>
                      {t("Failed", "الفاشلة")}:{" "}
                      <strong className="text-[var(--danger)]">{String(entry.failed_count ?? 0)}</strong>
                    </span>
                  </div>

                  {entry.error_message ? (
                    <div className="rounded-md bg-[var(--danger-surface)] border border-[var(--danger)]/20 p-2 text-xs text-[var(--danger)]">
                      {String(entry.error_message)}
                    </div>
                  ) : null}

                  <UI.JsonDetails
                    value={entry.details}
                    label={t("Details", "التفاصيل")}
                  />
                </article>
              ))}
            </div>
          )}

          <UI.Pager page={view.page} total={view.total ?? 0} ar={ar} />
        </div>
      )}

      {/* 3. Axiom Application Events Log */}
      {"events" in view && view.events && (
        <div className="space-y-4">
          <div className="admin-card">
            <Form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="view" value="events" />

              <div className="min-w-44 flex-1 sm:flex-none">
                <UI.Field label={t("Level", "المستوى")}>
                  <select
                    className={UI.inputClass}
                    name="level"
                    defaultValue={view.level}
                  >
                    {["problems", "error", "all"].map((level) => (
                      <option key={level} value={level}>
                        {level === "problems"
                          ? t("Warnings and errors", "التحذيرات والأخطاء")
                          : level === "error"
                            ? t("Errors", "الأخطاء")
                            : t("All levels", "كل المستويات")}
                      </option>
                    ))}
                  </select>
                </UI.Field>
              </div>

              <UI.Submit>{t("Filter", "تصفية")}</UI.Submit>
            </Form>
          </div>

          {view.events.ok ? (
            <div className="space-y-4">
              {view.events.events.length === 0 ? (
                <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
                  {t(
                    "No application events match this view.",
                    "لا توجد أحداث تطابق هذا العرض.",
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {view.events.events.map((entry, index) => (
                    <article className="admin-card space-y-3" key={index}>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                        <div className="flex items-center gap-2">
                          <UI.Badge>{entry.level}</UI.Badge>
                          <strong className="text-xs font-semibold text-[var(--ink)]">
                            <bdi>
                              {entry.area}: {entry.event}
                            </bdi>
                          </strong>
                        </div>

                        <UI.DateTime value={entry.time} />
                      </div>

                      <UI.JsonDetails
                        value={entry.fields}
                        label={t("Details", "التفاصيل")}
                      />
                    </article>
                  ))}
                </div>
              )}

              <UI.Pager
                page={view.page}
                total={
                  view.events.total ??
                  (view.events.hasMore ? view.page * 20 + 1 : view.page * 20)
                }
                ar={ar}
              />
            </div>
          ) : (
            <div className="admin-card py-12 text-center text-sm text-[var(--ink-muted)] space-y-2">
              <ScrollIcon className="size-8 mx-auto text-[var(--ink-muted)] opacity-60" />
              <p>
                {view.events.reason === "not_configured"
                  ? t(
                      "Configure Axiom in provider settings to view application events.",
                      "اضبط Axiom في إعدادات المزودين لعرض أحداث التطبيق.",
                    )
                  : t(
                      "Application events are currently unavailable.",
                      "أحداث التطبيق غير متاحة حالياً.",
                    )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
