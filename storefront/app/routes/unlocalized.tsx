import { redirect } from "react-router";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const first = url.pathname.split("/")[1] ?? "";
  if (isLocale(first) || first === "api" || first === "auth" || /\.[a-z0-9]+$/i.test(url.pathname)) {
    throw new Response("Not Found", { status: 404 });
  }
  throw redirect(`/${DEFAULT_LOCALE}${url.pathname}${url.search}`);
}

export default function Unlocalized() { return null; }
