import type { Locale } from "@/i18n/config";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export type StoreReview = {
  id: string;
  displayName: string;
  rating: number;
  body: string;
  isFeatured: boolean;
  createdAt: string;
};

/**
 * Approved reviews for the homepage.
 *
 * RLS already restricts anonymous reads to `status = 'approved'`; the filter is
 * repeated here so the intent is visible at the call site. A read failure
 * returns an empty list because a testimonial strip must never break the page.
 */
export async function getPublishedReviews(
  locale: Locale,
  limit: number,
  ids: string[] = [],
): Promise<StoreReview[]> {
  const supabase = createSupabasePublicClient();
  let query = supabase
    .from("reviews")
    .select("id, display_name, rating, body, is_featured, created_at")
    .eq("status", "approved")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  // An admin can pin an explicit set of reviews to a section.
  if (ids.length > 0) {
    query = query.in("id", ids);
  } else {
    // Otherwise prefer reviews written in the language being browsed.
    query = query.eq("locale", locale);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  return data.map((review) => ({
    id: review.id,
    displayName: review.display_name,
    rating: review.rating,
    body: review.body,
    isFeatured: review.is_featured,
    createdAt: review.created_at,
  }));
}
