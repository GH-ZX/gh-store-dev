import { useState } from "react";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { getSessionSummary } from "@server/lib/services/session.service";
import {
  getCoupon,
  listRedemptions,
  updateCoupon,
  deleteCoupon,
  setCouponActive,
  type CouponType,
} from "@server/lib/services/coupon.service";
import { TagIcon, ArrowIcon, TrashIcon, CheckIcon, AlertIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { AdminCard, TextField, SelectField, TextAreaField, CheckboxField } from "@/components/admin/admin-form";
import { buttonClassName } from "@/components/ui/button";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const locale = params.locale ?? "";
  const couponId = params.couponId ?? "";

  if (!isLocale(locale) || !couponId) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    const url = new URL(request.url);
    return withSessionCookies(
      redirectToLogin(request, locale, `${url.pathname}${url.search}`.replace(/\.data$/, "")),
      jar,
      isProduction,
    );
  }

  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }

  const [coupon, redemptions] = await Promise.all([
    getCoupon(supabase, couponId),
    listRedemptions(supabase, couponId),
  ]);

  if (!coupon) {
    throw new Response("Not Found", { status: 404 });
  }

  return data(
    { locale, coupon, redemptions },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const locale = params.locale ?? "";
  const couponId = params.couponId ?? "";

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers: sessionCookieHeaders(jar, isProduction) });
  }

  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    return data({ ok: false, error: "forbidden" }, { status: 403, headers: sessionCookieHeaders(jar, isProduction) });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const res = await deleteCoupon(supabase, couponId);
    if (!res.ok) {
      return data({ ok: false, error: res.reason ?? "delete_failed" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }
    return redirect(`/${locale}/dashboard/coupons`, {
      headers: sessionCookieHeaders(jar, isProduction),
    });
  }

  if (intent === "toggleActive") {
    const isActive = formData.get("isActive") === "true";
    const ok = await setCouponActive(supabase, couponId, isActive);
    return data({ ok, message: ok ? "status_updated" : "failed" }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "update") {
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const type = (formData.get("type") === "fixed" ? "fixed" : "percent") as CouponType;
    const value = parseFloat(String(formData.get("value") ?? "0"));
    const minSubtotal = parseFloat(String(formData.get("minSubtotal") ?? "0")) || 0;
    const maxDiscountRaw = formData.get("maxDiscount");
    const maxDiscount = maxDiscountRaw ? parseFloat(String(maxDiscountRaw)) : null;
    const usageLimitRaw = formData.get("usageLimit");
    const usageLimit = usageLimitRaw ? parseInt(String(usageLimitRaw), 10) : null;
    const perCustomerLimit = parseInt(String(formData.get("perCustomerLimit") ?? "1"), 10) || 1;
    const validUntilRaw = formData.get("validUntil");
    const validUntil = validUntilRaw ? new Date(String(validUntilRaw)).toISOString() : null;
    const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
    const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";

    if (!code || code.length < 2) {
      return data({ ok: false, error: "invalid_code" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    if (isNaN(value) || value <= 0 || (type === "percent" && value > 100)) {
      return data({ ok: false, error: "invalid_value" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    const result = await updateCoupon(supabase, couponId, {
      code,
      type,
      value,
      minSubtotal,
      maxDiscount,
      currency: "USD",
      usageLimit,
      perCustomerLimit,
      validFrom: null,
      validUntil,
      isActive,
      productIds: [],
      categoryIds: [],
      offerIds: [],
      adminNote,
    });

    if (!result.ok) {
      return data({ ok: false, error: result.reason }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    return data({ ok: true, message: "saved" }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  return data({ ok: false, error: "unknown_intent" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta() {
  return [{ name: "robots", content: "noindex, nofollow" }];
}

export default function DashboardCouponDetail() {
  const { locale, coupon, redemptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const messages = getMessages(locale, "admin");
  const copy = messages.coupons;

  const [selectedType, setSelectedType] = useState<CouponType>(coupon.type);
  const [isActive, setIsActive] = useState<boolean>(coupon.isActive);

  // Format validUntil for input datetime-local
  const validUntilFormatted = coupon.validUntil
    ? new Date(coupon.validUntil).toISOString().slice(0, 16)
    : "";

  return (
    <div className="space-y-6">
      {/* Back link & breadcrumb */}
      <div>
        <Link
          to={`/${locale}/dashboard/coupons`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <ArrowIcon direction={locale === "ar" ? "end" : "start"} className="size-3.5" />
          <span>{copy.backToCoupons}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-3xl font-extrabold tracking-wider text-[var(--accent)]">
              {coupon.code}
            </span>
            <Badge tone={coupon.isActive ? "success" : "neutral"}>
              {coupon.isActive ? copy.active : copy.inactive}
            </Badge>
            <Badge tone="accent">
              {coupon.type === "percent" ? `${coupon.value}% OFF` : `$${coupon.value.toFixed(2)} OFF`}
            </Badge>
          </div>
          {coupon.adminNote ? (
            <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{coupon.adminNote}</p>
          ) : null}
        </div>

        {/* Delete Form */}
        <div>
          <Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(copy.deleteConfirm)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              disabled={isSubmitting}
              className={buttonClassName({
                variant: "dangerGhost",
                size: "sm",
                leadingIcon: <TrashIcon className="size-4" />,
              })}
            >
              {copy.delete}
            </button>
          </Form>
        </div>
      </div>

      {/* Action feedback */}
      {actionData?.ok && (
        <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-3 text-sm text-[var(--success)]">
          <CheckIcon className="size-4" />
          <span>{locale === "ar" ? "تم حفظ التعديلات بنجاح." : "Changes saved successfully."}</span>
        </div>
      )}

      {actionData && !actionData.ok && "error" in actionData ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger)]">
          <AlertIcon className="size-4" />
          <span>{actionData.error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Edit Coupon Form (2 cols) */}
        <div className="lg:col-span-2">
          <AdminCard title={copy.editTitle} description={copy.createDescription}>
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="update" />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  label={copy.codeLabel}
                  name="code"
                  defaultValue={coupon.code}
                  required
                  className="font-mono uppercase font-bold tracking-wider"
                />

                <SelectField
                  label={copy.typeLabel}
                  name="type"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as CouponType)}
                  options={[
                    { value: "percent", label: copy.typePercent },
                    { value: "fixed", label: copy.typeFixed },
                  ]}
                />

                <TextField
                  label={copy.valueLabel}
                  name="value"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedType === "percent" ? "100" : undefined}
                  defaultValue={coupon.value}
                  required
                />

                <TextField
                  label={copy.minSubtotalLabel}
                  name="minSubtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={coupon.minSubtotal}
                />

                {selectedType === "percent" ? (
                  <TextField
                    label={copy.maxDiscountLabel}
                    name="maxDiscount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    hint={copy.maxDiscountHint}
                    defaultValue={coupon.maxDiscount ?? ""}
                  />
                ) : null}

                <TextField
                  label={copy.usageLimitLabel}
                  name="usageLimit"
                  type="number"
                  min="1"
                  hint={copy.usageLimitHint}
                  defaultValue={coupon.usageLimit ?? ""}
                />

                <TextField
                  label={copy.perCustomerLimitLabel}
                  name="perCustomerLimit"
                  type="number"
                  min="1"
                  defaultValue={coupon.perCustomerLimit}
                />

                <TextField
                  label={copy.validUntilLabel}
                  name="validUntil"
                  type="datetime-local"
                  hint={copy.validUntilHint}
                  defaultValue={validUntilFormatted}
                />
              </div>

              <TextAreaField
                label={copy.noteLabel}
                name="adminNote"
                defaultValue={coupon.adminNote ?? ""}
                rows={3}
              />

              <CheckboxField
                label={copy.active}
                name="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--line)]">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={buttonClassName({ variant: "primary", size: "md" })}
                >
                  {isSubmitting ? copy.saving : copy.saveChanges}
                </button>
              </div>
            </Form>
          </AdminCard>
        </div>

        {/* Overview Stats & Redemptions (1 col) */}
        <div className="space-y-6">
          <AdminCard title={copy.usage}>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[var(--line)]">
                <span className="text-xs text-[var(--ink-muted)]">{copy.usage}</span>
                <span className="font-bold text-base text-[var(--ink)]">
                  {coupon.timesUsed} / {coupon.usageLimit !== null ? coupon.usageLimit : copy.unlimited}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[var(--line)]">
                <span className="text-xs text-[var(--ink-muted)]">{copy.perCustomerLimitLabel}</span>
                <span className="font-semibold text-sm text-[var(--ink)]">
                  {coupon.perCustomerLimit}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-[var(--ink-muted)]">{copy.expires}</span>
                <span className="font-semibold text-sm text-[var(--ink)]">
                  {coupon.validUntil
                    ? new Date(coupon.validUntil).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : copy.never}
                </span>
              </div>
            </div>
          </AdminCard>

          {/* Redemptions log */}
          <AdminCard title={copy.redemptionsTitle}>
            {redemptions.length === 0 ? (
              <p className="text-xs text-[var(--ink-muted)] py-4 text-center">
                {copy.noRedemptions}
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)] max-h-96 overflow-y-auto">
                {redemptions.map((redemption) => (
                  <div key={redemption.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--ink)]">
                        {redemption.customerName || redemption.customerEmail || redemption.userId.slice(0, 8)}
                      </span>
                      <span className="font-bold text-[var(--success)]">
                        -${redemption.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[var(--ink-muted)]">
                      <Link
                        to={`/${locale}/dashboard/orders/${redemption.orderId}`}
                        className="underline hover:text-[var(--ink)]"
                      >
                        Order #{redemption.orderId.slice(0, 8)}
                      </Link>
                      <span>
                        {new Date(redemption.createdAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
