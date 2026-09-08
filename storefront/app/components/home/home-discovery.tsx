import { Link } from "react-router";
import { StoreImage } from "@/components/store/store-image";
import { ArrowIcon, CardIcon, GamepadIcon, GridIcon, SparkIcon } from "@/components/ui/icons";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import type { DiscoveryCategory } from "@server/lib/services/home-discovery.service";

function CategoryIcon({ slug }: { slug: string }) {
  if (slug === "games") return <GamepadIcon />;
  if (slug === "gift-cards-codes" || slug === "games-vouchers") return <CardIcon />;
  if (slug === "ai") return <SparkIcon />;
  return <GridIcon />;
}

export function HomeDiscovery({ categories, locale }: { categories: DiscoveryCategory[]; locale: Locale }) {
  const copy = getMessages(locale, "home").discovery;
  if (!categories.length) return null;

  return (
    <nav className="sf-discovery" aria-labelledby="home-discovery-title">
      <div className="sf-discovery-heading">
        <div>
          <h2 id="home-discovery-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <Link to={`/${locale}/products`} className="sf-discovery-all">
          {copy.allProducts}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
        </Link>
      </div>
      <ul className="sf-discovery-list">
        {categories.map((category) => (
          <li key={category.id}>
            <Link to={`/${locale}/${category.slug}`} className="sf-discovery-link">
              <span className="sf-discovery-art" aria-hidden="true">
                {category.imageUrl ? (
                  <StoreImage src={category.imageUrl} alt="" fit="contain" sizes="44px" />
                ) : <CategoryIcon slug={category.slug} />}
              </span>
              <span className="sf-discovery-copy">
                <strong><bdi>{category.name}</bdi></strong>
                <span><bdi>{new Intl.NumberFormat(locale).format(category.productCount)}</bdi> {category.productCount === 1 ? copy.product : copy.products}</span>
              </span>
              <ArrowIcon direction="end" className="sf-discovery-arrow size-4 rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
