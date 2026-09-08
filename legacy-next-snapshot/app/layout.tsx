import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Sora, Space_Grotesk, Tektur } from "next/font/google";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { APP_NAME } from "@/lib/config/app";
import { getSiteUrl } from "@/lib/seo";
import { getPublicStoreSettings } from "@/lib/services/settings.service";
import { themeStyle } from "@/lib/settings/theme-settings";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

/*
 * Not preloaded. The mono face is a dashboard typeface — API keys, slugs, order
 * references — and outside the dashboard it appears on exactly one storefront
 * page. Preloading it put a font file on the critical path of every visit that
 * would never render a glyph of it; it still downloads wherever it is actually
 * used.
 */
const geistMono = Geist_Mono({
  preload: false,
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/*
 * Brand display font for the logo lockup. Variable font, so no `weight` is
 * needed; self-hosted at build time like the Geist pair above.
 */
const tektur = Tektur({
  variable: "--font-tektur",
  subsets: ["latin"],
  display: "swap",
});

/*
 * Two more heading voices for the theme's "heading font" setting. Latin-only
 * on purpose — Arabic headings fall back per glyph to the sans stack, which
 * keeps the Arabic guard's rules in charge of that script. Preloaded never:
 * a heading voice the owner may not even select has no business on the
 * critical path.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "A modern digital gaming store.",
  applicationName: APP_NAME,
  icons: {
    icon: "/gh-store-logo.png",
    apple: "/gh-store-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050b14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
};

/**
 * The origin catalog images come from, or null when it is not configured.
 *
 * Read once at module scope: it is an environment value, not a per-request one.
 */
const imageOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    // A malformed URL is a configuration problem, not a reason to fail a render.
    return null;
  }
})();

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-gh-store-locale") ?? "ar";
  const resolvedLocale = isLocale(locale) ? locale : "ar";
  const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  /*
   * Plausible is opt-in through a build-time variable: unset means no script,
   * no request, and no tracking of any kind. It is a plain deferred script —
   * cookieless, so it needs no consent banner and no state.
   */
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  /*
   * The theme belongs to the document, so it is read here rather than in the
   * locale layout: the default mode has to reach the pre-paint script, and the
   * accents have to cover the dashboard as well as the storefront. The read is
   * deduplicated per request, so the footer asking for the same settings costs
   * nothing. A failed read returns defaults rather than throwing — a colour
   * choice must never be able to take the site down.
   */
  const { theme } = await getPublicStoreSettings();
  const accents = themeStyle(theme);

  return (
    <html
      lang={resolvedLocale}
      dir={getLocaleDirection(resolvedLocale)}
      className={`${geistSans.variable} ${geistMono.variable} ${tektur.variable} ${spaceGrotesk.variable} ${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          * Every piece of catalog artwork is served from Supabase, so the first
          * image on the page otherwise waits on a DNS lookup, a TCP handshake
          * and a TLS negotiation to an origin the browser has never seen. On a
          * slow, high-latency connection that is the single longest thing
          * between a visitor and their first image — and it is all avoidable
          * before the HTML has finished parsing.
          */}
        {imageOrigin ? (
          <>
            <link rel="preconnect" href={imageOrigin} crossOrigin="" />
            <link rel="dns-prefetch" href={imageOrigin} />
          </>
        ) : null}
        {googleSiteVerification ? (
          <meta name="google-site-verification" content={googleSiteVerification} />
        ) : null}
        {plausibleDomain ? (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        ) : null}
        {/*
         * Applies the stored theme before first paint, so a light-theme visitor
         * never sees the dark default flash. suppressHydrationWarning above
         * covers the attribute this script adds.
         */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(theme.defaultMode) }} />

        {/*
          * The owner's accents, over the token defaults. Rendered only when
          * something is actually set, and every value is a hex colour that
          * cleared `safeColour` — nothing here can carry a brace.
          */}
        {accents ? <style dangerouslySetInnerHTML={{ __html: accents }} /> : null}
      </head>
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">{children}</body>
    </html>
  );
}
