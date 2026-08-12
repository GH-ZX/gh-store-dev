import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GH Store",
  description: "A modern digital gaming store.",
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
    >
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
