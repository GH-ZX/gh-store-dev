import Link from "next/link";
import type { ReactNode } from "react";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import { cn } from "@/lib/cn";

/**
 * Game tile.
 *
 * The whole tile is one link, so the accessible name is the game name and there
 * is a single tab stop per card. Artwork sits behind a bottom-weighted scrim so
 * the title stays legible over any image.
 */
export type GameCardProps = {
  game: StoreGame;
  locale: Locale;
  labels: { featured: string; from?: string };
  /** Trailing metadata line, e.g. a "from $2.50" price. */
  meta?: string;
  priority?: boolean;
  /**
   * Control layered over the tile, outside the link.
   *
   * The whole tile is one link, so anything clickable has to sit beside it
   * rather than inside it — nesting would be invalid HTML that browsers repair
   * by guessing which of the two was meant.
   */
  overlay?: ReactNode;
  className?: string;
};

export function GameCard({
  game,
  locale,
  labels,
  meta,
  priority = false,
  overlay,
  className,
}: GameCardProps) {
  const card = (
    <Link
      href={`/${locale}/games/${game.slug}`}
      prefetch={false}
      className={cn(
        "group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elevation-2)]",
        "transition-[transform,border-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)]",
        "hover:-translate-y-1.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--elevation-3)]",
        // Touch has no hover: the press answers the finger the way the hover
        // answers the cursor, so a tapped tile visibly acknowledges it.
        "active:translate-y-0 active:scale-[0.98] active:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] active:shadow-[var(--elevation-1)]",
        className,
      )}
    >
      <div className="absolute inset-0">
        <StoreImage
          src={game.imageUrl}
          alt=""
          priority={priority}
          focus={game.carouselFocus}
          sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 80vw"
          className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.06] group-active:scale-[1.02]"
        />
      </div>
      <div
        className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--canvas)_96%,transparent)_8%,color-mix(in_srgb,var(--canvas)_60%,transparent)_42%,transparent_72%)]"
        aria-hidden="true"
      />

      {game.isFeatured ? (
        <div className="absolute top-3 end-3">
          <Badge tone="accent">{labels.featured}</Badge>
        </div>
      ) : null}

      <div className="relative flex items-end gap-3 p-4">
        {game.logoUrl ? (
          <span className="grid size-12 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)]">
            <StoreImage src={game.logoUrl} alt="" sizes="3rem" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          {game.pointsName ? (
            <p className="truncate text-[0.6875rem] font-semibold tracking-[0.1em] text-[var(--accent)] uppercase">
              {game.pointsName}
            </p>
          ) : null}
          {/*
            * Two lines, never one: a name cut to "PUBG Mobile…" reads as a
            * different game on a phone. The tile keeps its height from the
            * aspect ratio, so the second line costs nothing.
            */}
          <h3 className="mt-1 line-clamp-2 text-sm leading-5 font-semibold tracking-tight text-[var(--ink)] sm:text-base sm:leading-6">
            {game.name}
          </h3>
          {meta ? <p className="mt-1 truncate text-xs text-[var(--ink-muted)] tabular-nums">{meta}</p> : null}
        </div>

        <span
          className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] text-[var(--ink-soft)] backdrop-blur-md transition-[background-color,color,transform] duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)] group-active:bg-[var(--accent)] group-active:text-[var(--accent-ink)]"
          aria-hidden="true"
        >
          <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
        </span>
      </div>
    </Link>
  );

  if (!overlay) {
    return card;
  }

  return (
    <div className="relative">
      {card}
      <div className="absolute top-3 start-3 z-10">{overlay}</div>
    </div>
  );
}
