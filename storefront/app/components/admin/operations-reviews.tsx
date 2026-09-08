import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
import { ArrowIcon, StarIcon } from "@/components/ui/icons";

export function ReviewsView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "reviews" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div className="space-y-6">
      {/* Status Filter Toolbar */}
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "pending", "approved", "rejected"]}
        ar={ar}
      />

      {view.reviews.reviews.length === 0 ? (
        <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
          {t("No reviews match this status.", "لا توجد تقييمات تطابق هذه الحالة.")}
        </div>
      ) : (
        <div className="space-y-4">
          {view.reviews.reviews.map((review) => (
            <article className="admin-card space-y-4" key={review.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong className="text-sm font-semibold text-[var(--ink)]">
                    {review.displayName}
                  </strong>
                  <div className="flex items-center gap-1 bg-[var(--warning-surface)] text-[var(--warning)] px-2 py-0.5 rounded-full text-xs font-bold">
                    <StarIcon filled className="size-3 text-[var(--warning)]" />
                    <span>{review.rating} / 5</span>
                  </div>
                  <UI.Badge>{review.status}</UI.Badge>
                  {review.isFeatured ? (
                    <span className="admin-badge admin-badge-accent">
                      {t("Featured", "مميز")}
                    </span>
                  ) : null}
                </div>

                <UI.DateTime value={review.createdAt} />
              </div>

              <div className="rounded-lg bg-[var(--surface-inset)] p-3 text-xs sm:text-sm text-[var(--ink)] whitespace-pre-wrap leading-relaxed border border-[var(--line)]">
                {review.body}
              </div>

              {review.orderId ? (
                <div className="text-xs">
                  <Link
                    className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    to={`/${view.locale}/dashboard/orders/${review.orderId}`}
                  >
                    <span>{t("View related order", "عرض الطلب المرتبط")}</span>
                    <ArrowIcon direction={ar ? "start" : "end"} className="size-3" />
                  </Link>
                </div>
              ) : null}

              {/* Moderation Form */}
              <Form method="post" className="space-y-3 pt-3 border-t border-[var(--line)]">
                <UI.Hidden name="reviewId" value={review.id} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <UI.Field label={t("Status", "الحالة")}>
                    <select
                      className={UI.inputClass}
                      name="status"
                      defaultValue={review.status}
                    >
                      {["pending", "approved", "rejected"].map((status) => (
                        <option key={status} value={status}>
                          {UI.statusLabel(status, view.locale, view.section)}
                        </option>
                      ))}
                    </select>
                  </UI.Field>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink)] cursor-pointer">
                      <input
                        name="featured"
                        type="checkbox"
                        defaultChecked={review.isFeatured}
                        className="size-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                      />
                      <span>{t("Featured on storefront", "مميز في المتجر")}</span>
                    </label>
                  </div>
                </div>

                <UI.Field label={t("Administrator note", "ملاحظة المشرف")}>
                  <textarea
                    className={UI.inputClass}
                    name="note"
                    maxLength={500}
                    rows={2}
                    defaultValue={review.adminNote ?? ""}
                    placeholder={t("Internal moderation note...", "ملاحظة مراجعة داخلية...")}
                  />
                </UI.Field>

                <div>
                  <UI.Submit intent="moderate" variant="primary">
                    {t("Save review", "حفظ التقييم")}
                  </UI.Submit>
                </div>
              </Form>
            </article>
          ))}
        </div>
      )}

      <UI.Pager page={view.page} total={view.reviews.total} ar={ar} />
    </div>
  );
}
