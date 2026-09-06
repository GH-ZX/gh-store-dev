import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
  Link,
} from "react-router";

import type { Route } from "./+types/root";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getLocaleDirection } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient } from "@/lib/catalog-queries";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import { themeStyle } from "@server/lib/settings/theme-settings";
import "./app.css";
import "./styles/storefront-shell.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  const segment = new URL(request.url).pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const { env } = getCloudflareContext(context);
  const settings = await getPublicStoreSettings(createPublicClient(env));
  const { theme } = settings;
  return {
    locale,
    seoSettings: { seo: settings.seo, branding: settings.branding },
    themeCss: themeStyle(theme),
    defaultMode: theme.defaultMode,
  };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@400;500&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Tektur:wght@400..900&family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const segment = useLocation().pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : data?.locale ?? DEFAULT_LOCALE;
  return (
    <html
      lang={locale}
      dir={getLocaleDirection(locale)}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <link rel="icon" href="/gh-store-logo-mark.png" />
        {data?.themeCss ? (
          <style dangerouslySetInnerHTML={{ __html: data.themeCss }} />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("gh-store-theme")||localStorage.getItem("gh-theme");if(t!=="light"&&t!=="dark"){t=${JSON.stringify(data?.defaultMode ?? "system")};if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      <Link to="/" className="mt-6 inline-flex rounded-full border px-5 py-3">
        Back to store / العودة للمتجر
      </Link>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
