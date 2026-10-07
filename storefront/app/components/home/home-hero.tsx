import { Link } from "react-router";
import { SearchField } from "@/components/search/search-field";
import type { Locale } from "@/i18n/config";

export type HomeHeroProps = {
  locale: Locale;
  title: string;
  description: string;
  categories: { slug: string; name: string }[];
  search: {
    fieldLabel: string;
    placeholder: string;
    submit: string;
    clear: string;
  };
};

/** Compact opening: one headline, search, and the way into each category. */
export function HomeHero({ locale, title, description, categories, search }: HomeHeroProps) {
  return (
    <section className="sf-hero" aria-labelledby="home-hero-title">
      <div className="gh-page">
        <div className="sf-hero-inner">
          <h1 id="home-hero-title">{title}</h1>
          <p>{description}</p>
          <SearchField locale={locale} labels={search} className="sf-hero-search sf-search" />
          {categories.length ? (
            <nav className="sf-hero-chips" aria-label={search.fieldLabel}>
              {categories.slice(0, 8).map((category) => (
                <Link key={category.slug} to={`/${locale}/${encodeURIComponent(category.slug)}`} className="sf-chip">
                  {category.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
