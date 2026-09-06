import { Link } from "react-router";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import "@/styles/storefront-home.css";

export function StorefrontCampaign({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <div className="sf-campaigns">
      <section className="sf-campaign-primary">
        <img src="/storefront/digital-world-v1.webp" alt="" width={1600} height={800} fetchPriority="high" />
        <div className="sf-campaign-copy">
          <h1>{ar ? <>عالمك الرقمي.<br />في مكان واحد.</> : <>Your digital world.<br />One place.</>}</h1>
          <p>{ar ? "شحن، بطاقات هدايا واشتراكات تناسب عالمك." : "Top-ups, gift cards and subscriptions, ready when you are."}</p>
          <Link to={`/${locale}/products`} className="sf-campaign-cta">
            {ar ? "استكشف المنتجات" : "Explore products"}
            <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>
      <div className="sf-campaign-side">
        <Link to={`/${locale}/ai`} className="sf-campaign-small sf-campaign-ai">
          <img src="/storefront/ai-crystal-v1.webp" alt="" width={800} height={600} />
          <div><h2>{ar ? "إمكانات أكثر مع الذكاء الاصطناعي" : "More possibilities with AI"}</h2>
            <span>{ar ? "استكشف" : "Explore"}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span></div>
        </Link>
        <Link to={`/${locale}/gift-cards`} className="sf-campaign-small sf-campaign-gifts">
          <img src="/storefront/gift-cards-v1.webp" alt="" width={800} height={600} />
          <div><h2>{ar ? "هدية لكل منصة" : "A gift for every platform"}</h2>
            <span>{ar ? "تصفح البطاقات" : "Shop gift cards"}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span></div>
        </Link>
      </div>
    </div>
  );
}
