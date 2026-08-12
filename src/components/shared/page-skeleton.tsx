import { CardGridSkeleton, Skeleton } from "@/components/shared/states";
import { Section } from "@/components/ui/section";

/**
 * Shared route-level loading shell.
 *
 * Mirrors the page rhythm — eyebrow, heading, description, card grid — so the
 * layout does not jump when real content arrives. Decorative only: the browser
 * already announces the navigation.
 *
 * Only place a `loading.tsx` on a route that cannot call `notFound()`, and that
 * has no children which can. The Suspense boundary a loading file creates lets
 * React flush the shell before the page finishes, and once the response has
 * started streaming the status can no longer change — a missing product would
 * answer 200 with not-found markup, which reads as a soft 404 to crawlers.
 */
export function PageSkeleton() {
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
