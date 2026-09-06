import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
export function LogsView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "logs" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <nav className="flex flex-wrap gap-3">
        {["events", "actions", "syncs"].map((tab) => (
          <Link
            className={UI.buttonClass}
            aria-current={view.view === tab ? "page" : undefined}
            key={tab}
            to={`?view=${tab}`}
          >
            {tab === "events"
              ? t("App events", "أحداث التطبيق")
              : tab === "actions"
                ? t("Admin actions", "إجراءات المشرفين")
                : t("Provider syncs", "مزامنة المزودين")}
          </Link>
        ))}
      </nav>
      {"audit" in view && view.audit && (
        <>
          {view.audit.entries.length === 0 && (
            <p className="text-ink-muted">
              {t(
                "No administrator actions recorded.",
                "لا توجد إجراءات مشرفين مسجلة.",
              )}
            </p>
          )}
          {view.audit.entries.map((entry) => (
            <article className={UI.panelClass} key={entry.id}>
              <div className="flex flex-wrap gap-3">
                <strong>
                  <bdi>{entry.action}</bdi>
                </strong>
                <bdi>{entry.actor.name || entry.actor.email}</bdi>
                <UI.DateTime value={entry.createdAt} />
              </div>
              <p>
                <bdi>
                  {entry.entityType} {entry.entityId}
                </bdi>
              </p>
              <UI.JsonDetails
                value={entry.values}
                label={t("Details", "التفاصيل")}
              />
            </article>
          ))}
          <UI.Pager page={view.page} total={view.audit.total} ar={ar} />
        </>
      )}
      {"syncs" in view && view.syncs && (
        <>
          {view.syncs.length === 0 && (
            <p className="text-ink-muted">
              {t("No provider syncs recorded.", "لا توجد عمليات مزامنة مسجلة.")}
            </p>
          )}
          {view.syncs.map((entry, index) => (
            <article key={String(entry.id ?? index)} className={UI.panelClass}>
              <div className="flex flex-wrap gap-3">
                <UI.Badge>{String(entry.provider_name ?? "")}</UI.Badge>
                <UI.Badge>{String(entry.status ?? "")}</UI.Badge>
                <UI.DateTime value={String(entry.created_at ?? "")} />
              </div>
              <p className="text-sm">
                <bdi>{String(entry.kind ?? "")}</bdi> ·{" "}
                {t("Requested", "المطلوبة")}:{" "}
                {String(entry.requested_count ?? 0)} · {t("Created", "المضافة")}
                : {String(entry.created_count ?? 0)} · {t("Updated", "المحدثة")}
                : {String(entry.updated_count ?? 0)} · {t("Failed", "الفاشلة")}:{" "}
                {String(entry.failed_count ?? 0)}
              </p>
              {entry.error_message && (
                <p className="text-danger">{String(entry.error_message)}</p>
              )}
              <UI.JsonDetails
                value={entry.details}
                label={t("Details", "التفاصيل")}
              />
            </article>
          ))}
          <UI.Pager page={view.page} total={view.total ?? 0} ar={ar} />
        </>
      )}
      {"events" in view && view.events && (
        <>
          <Form method="get" className="flex flex-wrap gap-3">
            <UI.Hidden name="view" value="events" />
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
            <UI.Submit>{t("Filter", "تصفية")}</UI.Submit>
          </Form>
          {view.events.ok ? (
            <>
              {view.events.events.length === 0 && (
                <p className="text-ink-muted">
                  {t(
                    "No application events match this view.",
                    "لا توجد أحداث تطابق هذا العرض.",
                  )}
                </p>
              )}
              {view.events.events.map((entry, index) => (
                <article className={UI.panelClass} key={index}>
                  <div className="flex flex-wrap gap-3">
                    <UI.Badge>{entry.level}</UI.Badge>
                    <strong>
                      <bdi>
                        {entry.area}: {entry.event}
                      </bdi>
                    </strong>
                    <UI.DateTime value={entry.time} />
                  </div>
                  <UI.JsonDetails
                    value={entry.fields}
                    label={t("Details", "التفاصيل")}
                  />
                </article>
              ))}
              <UI.Pager
                page={view.page}
                total={
                  view.events.total ??
                  (view.events.hasMore ? view.page * 20 + 1 : view.page * 20)
                }
                ar={ar}
              />
            </>
          ) : (
            <p role="status">
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
          )}
        </>
      )}
    </>
  );
}
