import { useState } from "react";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import { getSessionSummary } from "@server/lib/services/session.service";
import { listCoupons, createCoupon, setCouponActive, type Coupon, type CouponType } from "@server/lib/services/coupon.service";
import { TagIcon, PlusIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { AdminCard, TextField, SelectField, TextAreaField } from "@/components/admin/admin-form";
import { buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/cn";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
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

  const coupons = await listCoupons(supabase);

  return data(
    { locale, coupons },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
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

  if (intent === "toggleActive") {
    const couponId = String(formData.get("id") ?? "");
    const isActive = formData.get("isActive") === "true";
    const ok = await setCouponActive(supabase, couponId, isActive);
    return data({ ok, message: ok ? "status_updated" : "failed" }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (intent === "create") {
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

    if (!code || code.length < 2) {
      return data({ ok: false, error: "invalid_code" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    if (isNaN(value) || value <= 0 || (type === "percent" && value > 100)) {
      return data({ ok: false, error: "invalid_value" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    const result = await createCoupon(supabase, {
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
      isActive: true,
      productIds: [],
      categoryIds: [],
      offerIds: [],
      adminNote,
    });

    if (!result.ok) {
      return data({ ok: false, error: result.reason }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
    }

    return data({ ok: true, createdId: result.id }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  return data({ ok: false, error: "unknown_intent" }, { status: 400, headers: sessionCookieHeaders(jar, isProduction) });
}

export function meta() {
  return [{ name: "robots", content: "noindex, nofollow" }];
}

export default function DashboardCoupons() {
  const { locale, coupons } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const messages = getMessages(locale, "admin");
  const copy = messages.coupons;

  const [showCreate, setShowCreate] = useState(false);
  const [selectedType, setSelectedType] = useState<CouponType>("percent");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            <TagIcon className="size-4 text-[var(--accent)]" />
            <span>{copy.eyebrow}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {copy.description}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className={buttonClassName({
              variant: showCreate ? "secondary" : "primary",
              size: "md",
              leadingIcon: showCreate ? <CloseIcon className="size-4" /> : <PlusIcon className="size-4" />,
            })}
          >
            {showCreate ? copy.cancel : copy.newCoupon}
          </button>
        </div>
      </div>

      {/* Creation form */}
      {showCreate ? (
        <AdminCard title={copy.createTitle} description={copy.createDescription}>
          <Form
            method="post"
            onSubmit={() => setShowCreate(false)}
            className="space-y-4"
          >
            <input type="hidden" name="intent" value="create" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label={copy.codeLabel}
                name="code"
                placeholder={copy.codePlaceholder}
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
                required
                placeholder={selectedType === "percent" ? "10" : "1.00"}
              />

              <TextField
                label={copy.minSubtotalLabel}
                name="minSubtotal"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
              />

              {selectedType === "percent" ? (
                <TextField
                  label={copy.maxDiscountLabel}
                  name="maxDiscount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  hint={copy.maxDiscountHint}
                  placeholder="5.00"
                />
              ) : null}

              <TextField
                label={copy.usageLimitLabel}
                name="usageLimit"
                type="number"
                min="1"
                hint={copy.usageLimitHint}
                placeholder="100"
              />

              <TextField
                label={copy.perCustomerLimitLabel}
                name="perCustomerLimit"
                type="number"
                min="1"
                defaultValue="1"
              />

              <TextField
                label={copy.validUntilLabel}
                name="validUntil"
                type="datetime-local"
                hint={copy.validUntilHint}
              />
            </div>

            <TextAreaField
              label={copy.noteLabel}
              name="adminNote"
              placeholder={copy.notePlaceholder}
              rows={2}
            />

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className={buttonClassName({ variant: "ghost", size: "md" })}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={buttonClassName({ variant: "primary", size: "md" })}
              >
                {isSubmitting ? copy.creating : copy.save}
              </button>
            </div>
          </Form>
        </AdminCard>
      ) : null}

      {/* Coupons List */}
      {coupons.length === 0 ? (
        <div className="flex flex-col items-center">
          <EmptyState
            icon={<TagIcon className="size-8" />}
            title={copy.noCouponsTitle}
            description={copy.noCouponsDescription}
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className={cn("mt-4", buttonClassName({ variant: "primary", size: "md" }))}
          >
            {copy.newCoupon}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--surface-strong)] text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-start">{copy.codeLabel}</th>
                <th className="px-4 py-3 text-start">{copy.value}</th>
                <th className="px-4 py-3 text-start">{copy.minSpend}</th>
                <th className="px-4 py-3 text-start">{copy.usage}</th>
                <th className="px-4 py-3 text-start">{copy.expires}</th>
                <th className="px-4 py-3 text-start">{copy.status}</th>
                <th className="px-4 py-3 text-end">{copy.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
              {coupons.map((coupon) => {
                const isExpired = coupon.validUntil && new Date(coupon.validUntil) < new Date();
                const isExhausted = coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit;

                return (
                  <tr key={coupon.id} className="transition-colors hover:bg-[var(--surface-strong)]/40">
                    {/* Code & Note */}
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-base tracking-wider text-[var(--accent)]">
                        {coupon.code}
                      </div>
                      {coupon.adminNote ? (
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)] max-w-xs truncate" title={coupon.adminNote}>
                          {coupon.adminNote}
                        </p>
                      ) : null}
                    </td>

                    {/* Value */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {coupon.type === "percent" ? (
                        <div className="font-semibold text-[var(--ink)]">
                          {coupon.value}%
                          {coupon.maxDiscount ? (
                            <span className="ms-1.5 text-xs text-[var(--ink-muted)] font-normal">
                              (max ${coupon.maxDiscount})
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="font-semibold text-[var(--ink)]">
                          ${coupon.value.toFixed(2)} USD
                        </div>
                      )}
                    </td>

                    {/* Min Spend */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-[var(--ink-soft)]">
                      {coupon.minSubtotal > 0 ? `$${coupon.minSubtotal.toFixed(2)}` : "—"}
                    </td>

                    {/* Usage */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-medium text-[var(--ink)]">{coupon.timesUsed}</span>
                      <span className="text-[var(--ink-muted)]">
                        {" "}
                        / {coupon.usageLimit !== null ? coupon.usageLimit : copy.unlimited}
                      </span>
                    </td>

                    {/* Expiry */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-[var(--ink-soft)]">
                      {coupon.validUntil ? (
                        <span className={isExpired ? "text-[var(--danger)] font-semibold" : ""}>
                          {new Date(coupon.validUntil).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      ) : (
                        copy.never
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {isExpired ? (
                        <Badge tone="danger">Expired</Badge>
                      ) : isExhausted ? (
                        <Badge tone="warning">Limit reached</Badge>
                      ) : coupon.isActive ? (
                        <Badge tone="success">{copy.active}</Badge>
                      ) : (
                        <Badge tone="neutral">{copy.inactive}</Badge>
                      )}
                    </td>

                    {/* Toggle Action */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-end">
                      <Form method="post" className="inline-block">
                        <input type="hidden" name="intent" value="toggleActive" />
                        <input type="hidden" name="id" value={coupon.id} />
                        <input type="hidden" name="isActive" value={coupon.isActive ? "false" : "true"} />

                        <button
                          type="submit"
                          className={buttonClassName({
                            variant: coupon.isActive ? "secondary" : "primary",
                            size: "sm",
                          })}
                        >
                          {coupon.isActive ? copy.deactivate : copy.activate}
                        </button>
                      </Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
