import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Tektur } from "next/font/google";
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

const geistMono = Geist_Mono({
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

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "A modern digital gaming store.",
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050b14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-gh-store-locale") ?? "ar";
  const resolvedLocale = isLocale(locale) ? locale : "ar";
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
      className={`${geistSans.variable} ${geistMono.variable} ${tektur.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
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
