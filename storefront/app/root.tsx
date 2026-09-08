import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getLocaleDirection } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient } from "@/lib/catalog-queries";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import { themeStyle } from "@server/lib/settings/theme-settings";
import { getSiteUrl } from "@/lib/seo";
import { getMessages } from "@/i18n/messages";
import { Button, ButtonLink } from "@/components/ui/button";
import "./app.css";
import "./styles/storefront-shell.css";
import "./styles/admin-shell.css";
import { AppToaster } from "@/components/ui/toaster";

export async function loader({ request, context }: Route.LoaderArgs) {
  const segment = new URL(request.url).pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const { env } = getCloudflareContext(context);
  const settings = await getPublicStoreSettings(createPublicClient(env));
  const { theme } = settings;
  const cookie = request.headers.get("cookie") ?? "";
  const cookieTheme = cookie.match(/(?:^|;\s*)gh-theme=(light|dark)(?:;|$)/)?.[1];
  return {
    locale,
    siteUrl: getSiteUrl(env),
    seoSettings: { seo: settings.seo, branding: settings.branding },
    themeCss: themeStyle(theme),
    defaultMode: theme.defaultMode,
    cookieTheme,
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

export function meta({ error, location }: Route.MetaArgs) {
  if (!error) return [];
  const segment = location.pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const { states } = getMessages(locale, "common");
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return [
    { title: `${missing ? states.notFoundTitle : states.errorTitle} | GH Store` },
    { name: "robots", content: "noindex, follow" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const segment = useLocation().pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : data?.locale ?? DEFAULT_LOCALE;
  return (
    <html
      lang={locale}
      dir={getLocaleDirection(locale)}
      data-theme={data?.cookieTheme || (data?.defaultMode === "light" ? "light" : "dark")}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <link rel="icon" href="/gh-store-logo-mark.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#101218" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f5f6f8" media="(prefers-color-scheme: light)" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GH Store" />
        {data?.themeCss ? (
          <style dangerouslySetInnerHTML={{ __html: data.themeCss }} />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("gh-store-theme")||localStorage.getItem("gh-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}else{var m=${JSON.stringify(data?.defaultMode ?? "system")};document.documentElement.dataset.theme=m==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m}}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.filter(function(r){return [r.active,r.waiting,r.installing].some(function(w){return w&&w.scriptURL===location.origin+"/sw.js";});}).map(function(r){return r.unregister();}));}).catch(function(){});}`,
          }}
        />
      </head>
      <body>
        {children}
        <AppToaster locale={locale} />
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
  const segment = useLocation().pathname.split("/")[1] ?? "";
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const common = getMessages(locale, "common");
  const missing = isRouteErrorResponse(error) && error.status === 404;
  const title = missing ? common.states.notFoundTitle : common.states.errorTitle;
  const description = missing ? common.states.notFoundDescription : common.states.errorDescription;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        {missing ? <p className="mb-4 font-mono text-4xl font-semibold text-[var(--accent)]">404</p> : null}
        <h1 className="text-2xl font-semibold text-[var(--ink)]">{title}</h1>
        <p className="mt-4 leading-7 text-[var(--ink-soft)]">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/${locale}/products`} variant="secondary">{common.actions.browse}</ButtonLink>
          {missing ? (
            <ButtonLink href={`/${locale}`} variant="secondary">{common.navigation.home}</ButtonLink>
          ) : (
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>{common.actions.retry}</Button>
          )}
        </div>
      </div>
      {stack && (
        <pre dir="ltr" className="mt-6 w-full overflow-x-auto p-4 text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
