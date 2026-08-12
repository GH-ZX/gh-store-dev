import { CardGridSkeleton, Skeleton } from "@/components/shared/states";
import { Section } from "@/components/ui/section";

/**
 * Route-level loading shell.
 *
 * Mirrors the page rhythm — eyebrow, heading, description, card grid — so the
 * layout does not jump when real content arrives. Entirely decorative: the
 * browser already announces the navigation.
 */
export default function LocaleLoading() {
  return (
    <Section spacing="page" aria-hidden="true">
      <div className="grid gap-4">
        <Skeleton className="h-6 w-28 rounded-[var(--radius-pill)]" />
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <CardGridSkeleton className="mt-10" />
    </Section>
  );
}
