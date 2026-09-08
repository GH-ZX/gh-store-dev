import { redirect } from "react-router";
import type { Locale } from "@/i18n/config";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "./lib/auth/guards";

/** Child loaders also run on their own during dashboard navigation. */
export async function requireDashboardAdmin(request: Request, locale: Locale): Promise<void> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const url = new URL(request.url);
      const next = `${url.pathname}${url.search}`;
      throw redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
    }
    if (error instanceof ForbiddenError) throw new Response("Forbidden", { status: 403 });
    throw error;
  }
}
