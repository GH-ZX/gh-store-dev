import { Link, useFetcher } from "react-router";
import type { DiscoverySettings, PosthogSettings } from "@/lib/settings/experience-settings";

type Settings = { discovery: DiscoverySettings; posthog: Omit<PosthogSettings, "project_key"> & { configured: boolean } };
export function ExperienceSettings({ settings, locale }: { settings: Settings; locale: string }) {
  const ar = locale === "ar";
  const discovery = useFetcher<{error?: string | null; saved?: boolean}>();
  const analytics = useFetcher<{error?: string | null; saved?: boolean}>();
  const input = "min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3";
  const result = (f: typeof discovery) => <p role="status" className="text-sm">{f.data?.error ? (ar ? "تعذر الحفظ. تحقق من القيم وحاول مجدداً." : "Could not save. Check the values and retry.") : f.data?.saved ? (ar ? "تم الحفظ. تظهر التغييرات خلال 30 ثانية." : "Saved. Changes appear within 30 seconds.") : ""}</p>;
  return <div className="grid gap-6">
    <Link className="min-h-11 content-center text-[var(--accent)] underline" to={`/${locale}/dashboard/providers`}>{ar ? "إعدادات USDT والدفع: العنوان، الحدود، التعليمات والتفعيل" : "USDT & payment settings: address, limits, instructions and availability"}</Link>
    <section className="admin-card space-y-4" id="discovery-settings"><h2 className="text-xl font-semibold">{ar ? "عرض المنتجات في الرئيسية" : "Homepage discovery"}</h2>
      <discovery.Form method="post" className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="intent" value="saveDiscovery" />
        {([['quick_buy_count',0,12,ar?'عدد الشراء السريع (0 للإخفاء)':'Quick buy cards (0 to hide)'],['category_count',0,24,ar?'عدد أقسام الفئات (0 للإخفاء)':'Category shelves (0 to hide)'],['products_per_category',2,12,ar?'المنتجات لكل فئة':'Products per category'],['offers_per_product',2,24,ar?'العروض لكل منتج':'Offers per product']] as const).map(([name,min,max,label]) => <label key={name} className="grid gap-2 text-sm">{label}<input className={input} type="number" name={name} min={min} max={max} required defaultValue={settings.discovery[name]} /></label>)}
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input type="checkbox" name="hide_empty_categories" defaultChecked={settings.discovery.hide_empty_categories} />{ar?'إخفاء الفئات دون عروض متاحة من الترويسة':'Hide categories without available offers from navigation'}</label>
        <button className={input} disabled={discovery.state !== 'idle'}>{ar?'حفظ العرض':'Save discovery'}</button>{result(discovery)}
      </discovery.Form>
    </section>
    <section className="admin-card space-y-4" id="posthog-settings"><h2 className="text-xl font-semibold">PostHog</h2>
      <p className="text-sm text-[var(--ink-muted)]">{ar?'أحداث مجهولة بموافقة الزائر فقط، دون تسجيل الجلسات أو بيانات الدفع. أضف مفتاح المشروع من إعدادات PostHog.':'Anonymous events with visitor consent only. No session replay or payment details. Add the project API key from PostHog settings.'}</p>
      <analytics.Form method="post" className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="intent" value="savePosthog" />
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input name="enabled" type="checkbox" defaultChecked={settings.posthog.enabled} />{ar?'تفعيل PostHog':'Enable PostHog'}</label>
        <label className="grid gap-2 text-sm">{ar?'مفتاح المشروع':'Project API key'}<input name="project_key" type="password" autoComplete="new-password" maxLength={200} placeholder={settings.posthog.configured ? (ar?'محفوظ — اتركه فارغاً للاحتفاظ به':'Saved — leave blank to keep') : 'phc_…'} className={input} /><span>{ar?'لا تستخدم المفتاح الشخصي.':'Do not use a personal API key.'}</span></label>
        <label className="grid gap-2 text-sm">{ar?'منطقة المشروع':'Project region'}<select name="region" defaultValue={settings.posthog.region} className={input}><option value="EU">EU</option><option value="US">US</option></select></label>
        <label className="grid gap-2 text-sm">{ar?'رقم المشروع (لرابط لوحة التحليلات)':'Project ID (for analytics dashboard link)'}<input name="project_id" inputMode="numeric" pattern="[0-9]{0,16}" maxLength={16} defaultValue={settings.posthog.project_id} className={input} /></label>
        <button className={input} disabled={analytics.state !== 'idle'}>{ar?'حفظ التحليلات':'Save analytics'}</button>{result(analytics)}
      </analytics.Form>
    </section>
  </div>;
}
