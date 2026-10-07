import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/lib/format/money";

export interface RecentlyViewedItem {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  imageUrl: string | null;
  priceFrom?: number | null;
  currency?: string;
}

const STORAGE_KEY = "gh-recently-viewed";
const MAX_ITEMS = 12;

export function recordRecentlyViewed(item: RecentlyViewedItem) {
  if (typeof window === "undefined" || !item.slug) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((i) => i.slug !== item.slug);
    const updated = [item, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export function RecentlyViewedRail({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const isAr = locale === "ar";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      }
    } catch {}
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="gh-page py-8" aria-labelledby="recently-viewed-heading">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 id="recently-viewed-heading" className="text-lg font-bold tracking-tight text-[var(--ink)]">
            {isAr ? "شوهدت مؤخراً" : "Recently Viewed"}
          </h2>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            {isAr ? "منتجات قمت بالاطلاع عليها مؤخراً" : "Items you visited recently"}
          </p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scroll-smooth no-scrollbar">
        {items.map((item) => (
          <Link
            key={item.slug}
            to={`/${locale}/${encodeURIComponent(item.categorySlug || "products")}/${encodeURIComponent(item.slug)}`}
            className="group flex flex-col w-36 sm:w-44 shrink-0 snap-start rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-3 transition-all hover:bg-[var(--surface-strong)] hover:shadow-xs active:scale-98"
          >
            <div className="aspect-square w-full overflow-hidden rounded-[var(--radius-inner,12px)] bg-[var(--surface-strong)]">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="size-full bg-[var(--surface-strong)]" />
              )}
            </div>
            <div className="mt-2.5 flex-1 flex flex-col justify-between">
              <h3 className="line-clamp-2 text-xs font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">
                <bdi>{item.name}</bdi>
              </h3>
              {typeof item.priceFrom === "number" && item.priceFrom > 0 ? (
                <p className="mt-1 text-xs font-bold text-[var(--ink)]" dir="ltr">
                  {formatPrice(item.priceFrom, item.currency || "USD", locale)}
                </p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
