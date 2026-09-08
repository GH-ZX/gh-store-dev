import { redirect } from "react-router";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

/** Canonicalize document URLs without turning missing resources into pages. */
export function redirectToDefaultLocale(request: Request): never {
  const url = new URL(request.url);
  const first = url.pathname.split("/")[1] ?? "";
  if (
    isLocale(first) ||
    first === "api" ||
    first === "auth" ||
    /\.[a-z0-9]+$/i.test(url.pathname)
  ) {
    throw new Response("Not Found", { status: 404 });
  }
  const path = url.pathname === "/" ? "" : url.pathname;
  throw redirect(`/${DEFAULT_LOCALE}${path}${url.search}`, 308);
}
