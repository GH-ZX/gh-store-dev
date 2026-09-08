import { Link } from "react-router";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import "@/styles/storefront-home.css";

export function StorefrontCampaign({ locale }: { locale: Locale }) {
  const messages = getMessages(locale, "home").campaign;
  return (
    <div className="sf-campaigns">
      <section className="sf-campaign-primary">
        <img src="/storefront/digital-world-v1.webp" alt="" width={1600} height={800} fetchPriority="high" />
        <div className="sf-campaign-copy">
          <h1>{messages.title}<br />{messages.titleEnd}</h1>
          <p>{messages.description}</p>
          <Link to={`/${locale}/products`} className="sf-campaign-cta">
            {messages.browse}
            <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>
      <div className="sf-campaign-side">
        <Link to={`/${locale}/ai`} className="sf-campaign-small sf-campaign-ai">
          <img src="/storefront/ai-crystal-v1.webp" alt="" width={800} height={600} />
          <div><h2>{messages.aiTitle}</h2>
            <span>{messages.explore}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span></div>
        </Link>
        <Link to={`/${locale}/gift-cards`} className="sf-campaign-small sf-campaign-gifts">
          <img src="/storefront/gift-cards-v1.webp" alt="" width={800} height={600} />
          <div><h2>{messages.giftTitle}</h2>
            <span>{messages.shopGiftCards}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span></div>
        </Link>
      </div>
    </div>
  );
}
