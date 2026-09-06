import { data, redirect } from "react-router";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@server/lib/auth/guards";
import * as actions from "@server/website-actions";
import { INITIAL_WEBSITE_STATE } from "@/components/admin/website-action-state";

export async function requireWebsiteAdmin(request: Request, locale: string): Promise<void> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const next = new URL(request.url).pathname;
      throw redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
    }
    if (error instanceof ForbiddenError) throw new Response("Forbidden", { status: 403 });
    throw error;
  }
}

const websiteActions = {
  saveHomeLayoutAction: actions.saveHomeLayoutAction,
  resetHomeLayoutAction: actions.resetHomeLayoutAction,
  saveSocialLinksAction: actions.saveSocialLinksAction,
  saveContactChannelsAction: actions.saveContactChannelsAction,
  saveSeoAction: actions.saveSeoAction,
  saveBrandingAction: actions.saveBrandingAction,
  savePageSeoAction: actions.savePageSeoAction,
  saveCarouselAction: actions.saveCarouselAction,
  saveThemeAction: actions.saveThemeAction,
};

export async function runWebsiteAction(request: Request, appearanceOnly = false) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  const locale = new URL(request.url).pathname.split("/")[1] === "en" ? "en" : "ar";
  await requireWebsiteAdmin(request, locale);
  const form = await request.formData();
  const intent = form.get("intent");
  if (typeof intent !== "string" || !Object.hasOwn(websiteActions, intent) || (appearanceOnly && intent !== "saveThemeAction")) {
    return data({ error: "invalid_input", notice: null }, { status: 400 });
  }
  return websiteActions[intent as keyof typeof websiteActions](INITIAL_WEBSITE_STATE, form);
}
