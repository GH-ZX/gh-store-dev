import { redirect } from "react-router";
import { isLocale } from "@/i18n/config";
import type { Route } from "./+types/dashboard-operations";

/** Preserve the documented operations bookmark after its move to logs. */
export function loader({ params, request }: Route.LoaderArgs) {
  if (!params.locale || !isLocale(params.locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  throw redirect(`/${params.locale}/dashboard/logs${new URL(request.url).search}`, 301);
}

export default function DashboardOperations() {
  return null;
}
