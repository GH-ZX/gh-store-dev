import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { ReviewModerationCard } from "@/components/admin/review-moderation";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { pageCount, parsePage, PAGE_SIZE } from "@/lib/paging";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { isReviewStatus, REVIEW_STATUSES, type ReviewStatus } from "@/lib/reviews/status";
import { getReviewsForModeration } from "@/lib/services/reviews.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const MAX_PAGE = 200;

type Filter = ReviewStatus | "all";

function parseFilter(value: string | string[] | undefined): Filter {
  const first = Array.isArray(value) ? value[0] : value;

  if (first === "all") {
    return "all";
  }

  // Pending is the default because the undecided ones are the reason to open
  // this page at all.
  return first && isReviewStatus(first) ? first : "pending";
}

function reviewsHref(locale: Locale, filter: Filter, page: number): string {
  const params = new URLSearchParams();

  if (filter !== "pending") {
    params.set("status", filter);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return `/${locale}/dashboard/reviews${query ? `?${query}` : ""}`;
}

/**
 * Deciding what customers see.
 *
 * Nothing a customer writes reaches the storefront on its own — the insert
 * policy pins a new review to `pending` — so this page is the only door, and
 * opening it defaults to the reviews still waiting behind it.
 */
export default async function ReviewsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/reviews">) {
  const locale = await resolveLocaleParam(params);
  const admin = getMessages(locale, "admin");
  const messages = admin.reviews;
  const query = await searchParams;

  const filter = parseFilter(query.status);
  const page = parsePage(query.page, MAX_PAGE);
  const result = await getReviewsForModeration({ status: filter, page });

  return (
    <div className="grid gap-6">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <div
        className="flex w-fit items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--line)] p-0.5"
        role="group"
        aria-label={messages.filtersLabel}
      >
        {([...REVIEW_STATUSES, "all"] as Filter[]).map((candidate) => {
          const active = candidate === filter;

          return (
            <Link
              key={candidate}
              href={reviewsHref(locale, candidate, 1)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold transition-colors duration-[var(--duration)]",
                active
                  ? "bg-[var(--surface-strong)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {candidate === "all" ? messages.filterAll : messages.statuses[candidate]}
            </Link>
          );
        })}
      </div>

      {!result.ok ? (
        <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.unavailable}
        </p>
      ) : (
        <>
          {result.reviews.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">{messages.empty}</p>
          ) : (
            <ul className="grid gap-3">
              {result.reviews.map((review) => (
                <ReviewModerationCard
                  key={review.id}
                  locale={locale}
                  review={review}
                  messages={messages}
                />
              ))}
            </ul>
          )}

          <Pager
            locale={locale}
            hrefFor={(target) => reviewsHref(locale, filter, target)}
            page={page}
            pages={pageCount(result.total, PAGE_SIZE)}
            labels={{
              previous: admin.logs.pagerPrevious,
              next: admin.logs.pagerNext,
              position: admin.logs.pagerPosition,
              positionUnknown: admin.logs.pagerPositionUnknown,
              navLabel: admin.logs.pagerLabel,
            }}
          />
        </>
      )}
    </div>
  );
}
