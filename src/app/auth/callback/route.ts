import { NextResponse } from "next/server";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { log } from "@/lib/logging/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth callback.
 *
 * Google redirects here with the short-lived authorization `code` after the
 * user chooses an account. This route exchanges that code for a session — the
 * PKCE verifier that started the flow is read back from the cookies the browser
 * client wrote — and then hands the user over to the `next` destination. The
 * `/auth/callback` path is outside any locale on purpose: it is a machine
 * endpoint, not a page, and the middleware is told to leave it alone.
 *
 * `next` is honoured only when it is a same-origin path, mirroring the guard on
 * the email/password actions so a crafted URL cannot bounce someone around.
 * Without it the user lands on the default account page for their locale.
 */
export const dynamic = "force-dynamic";

function safeNext(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      log.info("auth", "oauth_signed_in", { provider: "google" });

      if (next) {
        return NextResponse.redirect(new URL(next, url.origin));
      }

      return NextResponse.redirect(new URL(`/${DEFAULT_LOCALE}/profile`, url.origin));
    }

    log.warn("auth", "oauth_callback_failed", { error: error.message });
  }

  /*
   * No code, or the exchange failed. Rather than a bare redirect that could
   * loop on a malformed URL, send the user back to the sign-in form for their
   * locale. The PKCE verifier was already consumed or removed by the failed
   * exchange, so a second attempt starts a fresh flow from the button.
   */
  return NextResponse.redirect(new URL(`/${DEFAULT_LOCALE}/login`, url.origin));
}
