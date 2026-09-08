"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";

/**
 * The floating way into support.
 *
 * Fixed to the bottom inline-end corner, which is the bottom right reading
 * English and the bottom left reading Arabic — `end-*` is a logical property, so
 * that follows the document direction on its own and needs no `rtl:` variant.
 *
 * A client component only because it has to know which page it is on. It hides
 * itself in three cases: for a signed-out visitor, on the support page, where it
 * would point at the page already being read, and anywhere under the dashboard,
 * which is the owner's surface and carries Support in its own sidebar.
 *
 * Signed out it stays away entirely rather than sending someone to a sign-in
 * form. A thread belongs to an account, so there is nothing behind this button
 * for a visitor who has none — and a floating control that only ever produces a
 * login wall is an advert, not a help button. The footer link remains for them.
 */
export function SupportFab({
  locale,
  label,
  signedIn,
}: {
  locale: Locale;
  label: string;
  signedIn: boolean;
}) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}`;

  if (!signedIn) {
    return null;
  }

  if (pathname.startsWith(`${base}/support`) || pathname.startsWith(`${base}/dashboard`)) {
    return null;
  }

  return (
    <Link
      href={`${base}/support`}
      aria-label={label}
      title={label}
      className="fixed bottom-4 end-4 z-40 grid size-12 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--elevation-2)] transition-[background-color,transform] duration-[var(--duration)] ease-[var(--ease-spring)] hover:bg-[var(--accent-strong)] hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:bottom-6 sm:end-6"
    >
      <SupportIcon className="size-5" />
    </Link>
  );
}
