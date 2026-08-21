"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Google OAuth sign-in button.
 *
 * Present on both the sign-in and the sign-up mode, because a Google account
 * separates the "is this account new?" question from whatever button started
 * the flow — Supabase creates the account on first OAuth sign-in. The site
 * brand label is the single action in both modes.
 *
 * The Supabase sign-in with OAuth uses the PKCE flow: it stores a verifier in
 * the browser storage, redirects to Google, and returns with a `code`. That
 * code is exchanged for a session in `/auth/callback`, which then lands the
 * user on their redirect target.
 */
export function GoogleSignInButton({
  locale,
  redirectTo,
  label,
  errorLabel,
}: {
  locale: string;
  redirectTo?: string;
  label: string;
  errorLabel: string;
}) {
  const [error, setError] = useState(false);

  async function handleClick() {
    const supabase = createSupabaseBrowserClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);

    const target = redirectTo ?? `/${locale}`;
    if (target.startsWith("/") && !target.startsWith("//")) {
      callbackUrl.searchParams.set("next", target);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setError(true);
    }
  }

  return (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        fullWidth
        onClick={handleClick}
        leadingIcon={<GoogleMark />}
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Google "G" logo. A brand mark, so its flowers keep their own colours
 * rather than inheriting the surrounding text colour — unlike the decorative
 * stroke icons in `@/components/ui/icons`.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.125rem]" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.86 11.86 0 0 0 0 12c0 1.94.47 3.76 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}