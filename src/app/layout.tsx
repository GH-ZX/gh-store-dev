import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { APP_NAME } from "@/lib/config/app";
import { getSiteUrl } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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

  return (
    <html
      lang={resolvedLocale}
      dir={getLocaleDirection(resolvedLocale)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
         * Applies the stored theme before first paint, so a light-theme visitor
         * never sees the dark default flash. suppressHydrationWarning above
         * covers the attribute this script adds.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">{children}</body>
    </html>
  );
}
