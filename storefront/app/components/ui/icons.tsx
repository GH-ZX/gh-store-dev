import type { SVGProps } from "react";

/**
 * Hand-rolled icon set.
 *
 * Thin, precise strokes (1.5 at 24px) on a shared 24x24 grid. Icons inherit
 * `currentColor` and are `aria-hidden` by default: an icon next to a label is
 * decoration, and an icon-only control must carry its own `aria-label`.
 *
 * Icons must not be mirrored wholesale in RTL. Only directional glyphs flip,
 * which is why `ArrowIcon` takes a `direction` instead of relying on transforms.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="m15.6 15.6 3.65 3.65" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h16M4 12h16M4 16.5h10" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

/** Chevron pointing at a logical direction; callers pass the resolved side. */
export function ChevronIcon({ direction = "end", ...props }: IconProps & { direction?: "start" | "end" | "up" | "down" }) {
  const path = {
    start: "m14 6-6 6 6 6",
    end: "m10 6 6 6-6 6",
    up: "m6 14 6-6 6 6",
    down: "m6 10 6 6 6-6",
  }[direction];

  return (
    <Icon {...props}>
      <path d={path} />
    </Icon>
  );
}

export function ArrowIcon({ direction = "end", ...props }: IconProps & { direction?: "start" | "end" }) {
  return (
    <Icon {...props}>
      {direction === "end" ? <path d="M4.5 12h15m-6-6 6 6-6 6" /> : <path d="M19.5 12h-15m6-6-6 6 6 6" />}
    </Icon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5l1.7 4.9 4.8 1.7-4.8 1.7L12 16.7l-1.7-4.9L5.5 10l4.8-1.7z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </Icon>
  );
}

export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 4.2l2.35 4.9 5.15.66-3.8 3.6.96 5.28L12 16.1l-4.66 2.54.96-5.28-3.8-3.6 5.15-.66z" />
    </Icon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3 6 13.2h4.4L10 21l7.6-10.4H13z" />
    </Icon>
  );
}

/** Two arced arrows chasing each other — refresh, re-check, re-sync. */
export function SyncIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.2 5.5 5.8v5.4c0 4 2.7 7.6 6.5 9.1 3.8-1.5 6.5-5.1 6.5-9.1V5.8z" />
      <path d="m9.4 12.1 1.9 1.9 3.4-3.9" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h11a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 18H6a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M16 12h2.5" />
    </Icon>
  );
}

/**
 * A speech bubble, for support.
 *
 * The tail points straight down from the centre rather than off to one side, so
 * the glyph is symmetric and needs no RTL treatment — the rule at the top of this
 * file, applied rather than worked around.
 */
export function SupportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 5.5H4A1.5 1.5 0 0 0 2.5 7v8A1.5 1.5 0 0 0 4 16.5h5l3 3 3-3h5a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 20 5.5Z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
    </Icon>
  );
}

/**
 * A waste basket, for removing something from the store.
 *
 * Symmetric about its vertical axis, so it needs no RTL treatment — the rule at
 * the top of this file rather than an exception to it.
 */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" />
      <path d="M6.5 7l.8 11.1A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </Icon>
  );
}

/**
 * A pencil, for editing a thing in place.
 *
 * Not directional despite the diagonal: it depicts an object rather than a way
 * to go, so it is the same glyph in Arabic — mirroring it would only make a
 * left-handed pencil.
 */
export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.6 3.9a1.9 1.9 0 0 1 2.7 0l.8.8a1.9 1.9 0 0 1 0 2.7L8.9 18.6 4.5 19.5l.9-4.4z" />
      <path d="M15 5.5 18.5 9" />
    </Icon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.8 7.5 7.1 5a2 2 0 0 0 2.2 0l7.1-5" />
    </Icon>
  );
}

/**
 * A handset, tilted the same way in both languages.
 *
 * A phone is held at an angle rather than pointed somewhere, so mirroring it in
 * Arabic would say nothing and only make the row of channel marks disagree with
 * itself about which way is up.
 */
export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.4 3.5H5.2A1.7 1.7 0 0 0 3.5 5.2c0 8.4 6.9 15.3 15.3 15.3a1.7 1.7 0 0 0 1.7-1.7v-2.2a1.2 1.2 0 0 0-.9-1.16l-3.1-.78a1.2 1.2 0 0 0-1.2.4l-.9 1.1a12.6 12.6 0 0 1-5.4-5.4l1.1-.9a1.2 1.2 0 0 0 .4-1.2l-.78-3.1a1.2 1.2 0 0 0-1.16-.9Z" />
    </Icon>
  );
}

/** Two links of a chain, for an address that is only ever an address. */
export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.4 13.6a3.7 3.7 0 0 0 5.3 0l2.9-2.9a3.75 3.75 0 0 0-5.3-5.3l-1.5 1.5" />
      <path d="M13.6 10.4a3.7 3.7 0 0 0-5.3 0l-2.9 2.9a3.75 3.75 0 0 0 5.3 5.3l1.5-1.5" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.1.7 4.6 1.3 5.4.3.4 0 1-.5 1H5.7c-.5 0-.8-.6-.5-1 .6-.8 1.3-2.3 1.3-5.4Z" />
      <path d="M10 19.2a2.2 2.2 0 0 0 4 0" />
    </Icon>
  );
}

export function GamepadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.4 7.5h7.2a4.4 4.4 0 0 1 4.3 3.5l.7 4a2.6 2.6 0 0 1-4.7 1.9l-1-1.4H9.1l-1 1.4a2.6 2.6 0 0 1-4.7-1.9l.7-4a4.4 4.4 0 0 1 4.3-3.5Z" />
      <path d="M8 11.6v2.2M6.9 12.7h2.2M15.4 12h.1M17.2 13.6h.1" />
    </Icon>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M3.5 10.2h17M7 14.2h3" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.9 3.7H19a1.3 1.3 0 0 1 1.3 1.3v6.1a1.3 1.3 0 0 1-.4.9l-8 8a1.3 1.3 0 0 1-1.8 0l-6.1-6.1a1.3 1.3 0 0 1 0-1.8l8-8a1.3 1.3 0 0 1 .9-.4Z" />
      <circle cx="16.2" cy="7.8" r="1.2" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.2 3.3 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.3-5.2-3.3-8.5S9.8 5.8 12 3.5Z" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.8 4.4 4.4L19 7.6" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 8.1h.01" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.2 20.3 19H3.7z" />
      <path d="M12 9.6v4M12 16.2h.01" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 5.8v12.4L19 12z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6v12M15 6v12" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4Z" />
      <path d="m3.5 7.5 8.5 4 8.5-4" />
      <path d="M12 11.5v9" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5h13v17l-2.17-1.5L14 20.5l-2-1.5-2 1.5-2.33-1.5L5.5 20.5Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </Icon>
  );
}

export function DepositIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v9M8.5 9.5 12 13l3.5-3.5" />
      <path d="M4 15.5v2A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </Icon>
  );
}

export function CableIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5v5a5.5 5.5 0 0 0 11 0v-5" />
      <path d="M12 14v6M9.5 20h5" />
    </Icon>
  );
}

export function ScrollIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5h11v17l-2.75-2-2.75 2-2.75-2L6.5 20.5Z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}
