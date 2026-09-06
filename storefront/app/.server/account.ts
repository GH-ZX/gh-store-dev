import { redirect, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import {
  createSessionClient,
  getSessionUserId,
  withSessionCookies,
} from "@server/session";

/** Authenticate every account loader/action, including direct form requests. */
export async function accountContext({
  request,
  params,
  context,
}: LoaderFunctionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  const { env } = getCloudflareContext(context);
  const session = createSessionClient(request, env);
  const userId = await getSessionUserId(session.supabase);
  if (!userId) {
    const url = new URL(request.url);
    throw withSessionCookies(
      redirect(
        `/${locale}/login?next=${encodeURIComponent(url.pathname + url.search)}`,
      ),
      session.jar,
      session.isProduction,
    );
  }
  return { ...session, userId, locale, env };
}
