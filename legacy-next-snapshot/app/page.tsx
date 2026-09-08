import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/config/app";

/**
 * Unlocalized root.
 *
 * The middleware already redirects `/` to the default locale; this exists so a
 * direct render of the route (a prefetch, or a request that skipped middleware)
 * still lands on a real page instead of a 404.
 */
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
