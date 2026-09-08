import { NextResponse } from "next/server";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { safeRedirectTarget } from "@/lib/auth/redirect-target";
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
 * `next` is honoured only when it survives `safeRedirectTarget` — canonicalized
 * with a WHATWG URL parser, backslashes and control characters rejected,
 * protocol-relative and absolute URLs refused — mirroring the guard on the
 * email/password actions so a crafted URL cannot bounce someone around.
 * Without a valid target the user lands on the home page for the default locale.
 */
export const dynamic = "force-dynamic";

function safeNext(value: string | null): string | null {
  return value === null ? null : safeRedirectTarget(value);
}

/* The Google provider stores the profile under these keys in Supabase's
 * `user_metadata` (full_name/avatar_url on some installs, name/picture on
 * others). Picking the first non-empty value keeps us provider-agnostic. */
const GOOGLE_NAME_KEYS = ["full_name", "name"];
const GOOGLE_AVATAR_KEYS = ["avatar_url", "picture"];

function pickFirstNonEmpty(
  meta: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

/*
 * Copy the provider's display name and avatar into the customer's profile row.
 * The `on_auth_user_created` trigger already seeds the row on first sign-up (it
 * keeps `full_name`), so here we only top up data it never touches and never
 * clobber a name the customer edited themselves — `full_name` is written only
 * while the column is still empty. Failures are non-fatal: the session is
 * already established, so a sync error must not bounce the user back to login.
 */
async function syncOauthProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    log.warn("auth", "oauth_profile_sync_fetch_failed", { error: error?.message });
    return;
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = pickFirstNonEmpty(meta, GOOGLE_NAME_KEYS);
  const avatarUrl = pickFirstNonEmpty(meta, GOOGLE_AVATAR_KEYS);

  if (fullName) {
    const { error: nameError } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId)
      .is("full_name", null);

    if (nameError) {
      log.warn("auth", "oauth_profile_sync_name_failed", { error: nameError.message });
    }
  }

  if (avatarUrl) {
    const { error: avatarError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);

    if (avatarError) {
      log.warn("auth", "oauth_profile_sync_avatar_failed", { error: avatarError.message });
    }
  }
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

      const { data: sessionData } = await supabase.auth.getSession();

      if (sessionData.session?.user.id) {
        await syncOauthProfile(supabase, sessionData.session.user.id);
      }

      if (next) {
        return NextResponse.redirect(new URL(next, url.origin));
      }

      return NextResponse.redirect(new URL(`/${DEFAULT_LOCALE}`, url.origin));
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
