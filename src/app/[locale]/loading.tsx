import { PageSkeleton } from "@/components/shared/page-skeleton";

/**
 * Shown the instant a storefront navigation starts, before the server has
 * answered. Without it a click did nothing visible for the whole round trip
 * to the database, which read as the site freezing.
 */
export default function Loading() {
  return <PageSkeleton />;
}
