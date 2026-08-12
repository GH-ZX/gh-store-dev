import type { AdminMessages } from "@/i18n/messages";
import type { HomeSectionType } from "@/lib/home/layout";
import type { ContactChannelKind, SocialPlatform } from "@/lib/settings/public-settings";

/**
 * Website settings form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions, so every type, constant, and helper the editors and the
 * actions share lives here. Results are message keys, never prose: the editor
 * renders them in the admin's language.
 */

export type WebsiteActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_WEBSITE_STATE: WebsiteActionState = { error: null, notice: null };

export function resolveWebsiteError(
  errors: AdminMessages["website"]["errors"],
  key: string | null,
): string | null {
  if (!key) {
    return null;
  }

  return errors[key as keyof typeof errors] ?? errors.unknown;
}

/*
 * Indexed field names: `sections.0.title_ar`, `links.0.url`, `channels.0.value`.
 * The prefix and the row ceiling are shared so the editor that writes the names
 * and the action that reads them can never drift apart.
 */
export const SECTION_FIELD_PREFIX = "sections";
export const SOCIAL_FIELD_PREFIX = "links";
export const CONTACT_FIELD_PREFIX = "channels";

/** Upper bound on rows scanned out of one submission. */
export const MAX_EDITOR_ROWS = 24;

export function rowField(prefix: string, index: number, field: string): string {
  return `${prefix}.${index}.${field}`;
}

/**
 * Section types whose item count is meaningful.
 *
 * The carousel shows every game flagged for it, and the social section shows
 * every configured link, so neither has a count to set.
 */
const SECTION_TYPES_WITHOUT_LIMIT = new Set<HomeSectionType>(["carousel", "social_links"]);

export function sectionUsesLimit(type: HomeSectionType): boolean {
  return !SECTION_TYPES_WITHOUT_LIMIT.has(type);
}

/*
 * The option lists mirror the unions in `@/lib/settings/public-settings`, which
 * does not export them. `satisfies` rejects a value that is not in the union,
 * and the `AssertNever` aliases below fail typechecking if the union grows a
 * member that is missing here — an option list that silently falls behind would
 * make part of the storefront unreachable from the dashboard.
 */
export const SOCIAL_PLATFORM_OPTIONS = [
  "website",
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "discord",
] as const satisfies readonly SocialPlatform[];

export const CONTACT_KIND_OPTIONS = [
  "email",
  "phone",
  "whatsapp",
  "telegram",
  "link",
] as const satisfies readonly ContactChannelKind[];

type AssertNever<T extends never> = T;

type _UnlistedPlatform = AssertNever<
  Exclude<SocialPlatform, (typeof SOCIAL_PLATFORM_OPTIONS)[number]>
>;

type _UnlistedContactKind = AssertNever<
  Exclude<ContactChannelKind, (typeof CONTACT_KIND_OPTIONS)[number]>
>;
