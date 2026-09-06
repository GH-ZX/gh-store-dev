import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
export function ReviewsView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "reviews" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "pending", "approved", "rejected"]}
        ar={ar}
      />
      {view.reviews.reviews.length === 0 && (
        <p className="text-ink-muted">
          {t(
            "No reviews match this status.",
            "لا توجد تقييمات تطابق هذه الحالة.",
          )}
        </p>
      )}
      {view.reviews.reviews.map((review) => (
        <article className={UI.panelClass} key={review.id}>
          <div className="flex flex-wrap gap-3">
            <strong>{review.displayName}</strong>
            <UI.Badge>{review.rating} / 5</UI.Badge>
            <UI.Badge>{review.status}</UI.Badge>
            <UI.DateTime value={review.createdAt} />
          </div>
          <p className="whitespace-pre-wrap">{review.body}</p>
          {review.orderId && (
            <Link
              className="text-accent underline"
              to={`/${view.locale}/dashboard/orders/${review.orderId}`}
            >
              {t("View order", "عرض الطلب")}
            </Link>
          )}
          <Form method="post" className="grid gap-3">
            <UI.Hidden name="reviewId" value={review.id} />
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
            <label className="flex min-h-11 items-center gap-2">
              <input
                name="featured"
                type="checkbox"
                defaultChecked={review.isFeatured}
              />
              {t("Featured on storefront", "مميز في المتجر")}
            </label>
            <UI.Field label={t("Administrator note", "ملاحظة المشرف")}>
              <textarea
                className={UI.inputClass}
                name="note"
                maxLength={500}
                defaultValue={review.adminNote ?? ""}
              />
            </UI.Field>
            <UI.Submit intent="moderate">
              {t("Save review", "حفظ التقييم")}
            </UI.Submit>
          </Form>
        </article>
      ))}
      <UI.Pager page={view.page} total={view.reviews.total} ar={ar} />
    </>
  );
}
