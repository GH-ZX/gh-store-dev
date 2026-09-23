import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Locale } from "@/i18n/config";

export function AuthLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const ar = locale === "ar";
  return <section className="sf-auth-page">
    <div className="sf-auth-content" dir={ar ? "rtl" : "ltr"}>
      <Link className="sf-auth-back" to={`/${locale}`}>{ar ? "العودة إلى المتجر" : "Back to the store"}<span aria-hidden="true">↗</span></Link>
      {children}
      <p className="sf-auth-legal">{ar ? "باستخدام حسابك، أنت توافق على " : "By using your account, you agree to our "}<Link to={`/${locale}/terms`}>{ar ? "الشروط" : "terms"}</Link>{ar ? " و" : " and "}<Link to={`/${locale}/privacy`}>{ar ? "سياسة الخصوصية" : "privacy policy"}</Link>.</p>
    </div>
    <aside className="sf-auth-visual" aria-label={ar ? "متجر GH" : "GH Store"}>
      <div className="sf-auth-orbit" aria-hidden="true"><span>GH</span><i>✦</i><i>＋</i><i>↗</i></div>
      <div className="sf-auth-visual-copy" dir={ar ? "rtl" : "ltr"}>
        <span className="sf-auth-visual-brand">GH STORE</span>
        <h2>{ar ? "عالمك الرقمي، في مكان واحد." : "Your digital world. All in one place."}</h2>
        <p>{ar ? "اكتشف المنتجات، تابع طلباتك، واحتفظ بكل تفاصيل مشترياتك في حساب واحد." : "Discover products, follow your orders, and keep every purchase together in one account."}</p>
      </div>
    </aside>
  </section>;
}
