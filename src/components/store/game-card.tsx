import Link from "next/link";
import type { StoreGame } from "@/lib/catalog/game-mapper";

type GameCardProps = {
  game: StoreGame;
  locale: string;
};

export function GameCard({ game, locale }: GameCardProps) {
  return (
    <Link
      href={`/${locale}/games/${game.slug}`}
      className="group relative flex min-h-64 flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] transition-transform duration-200 hover:-translate-y-1"
    >
      {game.imageUrl ? (
        <div className="absolute inset-0 bg-cover bg-center opacity-45 transition-opacity duration-200 group-hover:opacity-60" style={{ backgroundImage: `url(${game.imageUrl})` }} />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(145deg,var(--surface-strong),var(--canvas))]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_srgb,var(--canvas)_94%,transparent),transparent_75%)]" />
      <div className="relative">
        {game.pointsName ? <p className="mb-2 text-xs font-medium text-[var(--accent)]">{game.pointsName}</p> : null}
        <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">{game.name}</h2>
        {game.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--ink-soft)]">{game.description}</p> : null}
      </div>
    </Link>
  );
}
