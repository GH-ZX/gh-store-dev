import { buildPageMeta, type PageMetaInput } from "@/lib/seo";
import { resolvePageSeo } from "@/lib/settings/page-seo";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

type SeoSettings = Pick<PublicStoreSettings, "seo" | "branding">;

/** Use the root's public settings read so each page honors dashboard SEO edits. */
export function buildStorePageMeta(
  input: PageMetaInput,
  matches: readonly unknown[],
) {
  const root = matches.find(
    (match) =>
      !!match &&
      typeof match === "object" &&
      "id" in match &&
      match.id === "root",
  ) as { loaderData?: { seoSettings?: SeoSettings } } | undefined;
  const settings = root?.loaderData?.seoSettings;
  if (!settings) return buildPageMeta(input);
  const locale = input.locale;
  const home = !input.path || input.path === "/";
  const overrides = home
    ? {
        title:
          settings.branding.nameAr.trim() ||
          settings.branding.nameEn.trim() ||
          (locale === "ar" ? settings.seo.titleAr : settings.seo.titleEn) ||
          input.title,
        description:
          (locale === "ar"
            ? settings.seo.descriptionAr
            : settings.seo.descriptionEn) || input.description,
      }
    : resolvePageSeo(settings.seo.pages, input.path ?? "", locale, input);
  const meta = buildPageMeta({
    ...input,
    ...overrides,
    imageUrl: home ? settings.seo.ogImageUrl || input.imageUrl : input.imageUrl || settings.seo.ogImageUrl,
  });
  const brand = settings.branding.useEverywhere
    ? (locale === "ar" ? settings.branding.nameAr : settings.branding.nameEn) ||
      "GH Store"
    : "GH Store";
  return meta.map((descriptor) =>
    "property" in descriptor && descriptor.property === "og:site_name"
      ? { ...descriptor, content: brand }
      : descriptor,
  );
}
