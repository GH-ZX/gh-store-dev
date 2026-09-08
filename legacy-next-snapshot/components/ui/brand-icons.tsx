import type { ReactNode, SVGProps } from "react";
import { GlobeIcon, LinkIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import type { ContactChannelKind, SocialPlatform } from "@/lib/settings/public-settings";

/**
 * Marks for the places a customer can reach the store.
 *
 * These deliberately break the house style in `icons.tsx`: a brand mark is
 * recognised as a silhouette, so it is filled rather than stroked, and its
 * proportions belong to whoever owns it rather than to this grid. Redrawing
 * WhatsApp as a 1.5-weight outline would make a glyph nobody recognises, which
 * defeats the only reason to show it instead of the word.
 *
 * They are single-colour on purpose. A row of links is chrome, and eight brand
 * palettes in it would shout louder than the store; `currentColor` lets each
 * mark take the tone of the control it sits in and light up on hover with it.
 *
 * A logo is not decoration but it is also not the label — every caller here
 * renders the channel's name beside it, so the mark stays `aria-hidden` and a
 * screen reader reads the name once.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Mark({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91A9.85 9.85 0 0 0 19.06 4.9 9.82 9.82 0 0 0 12.04 2Zm0 1.84c2.16 0 4.19.84 5.72 2.37a8.04 8.04 0 0 1 2.37 5.71c0 4.46-3.63 8.08-8.09 8.08a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.11.82.83-3.04-.2-.31a8.02 8.02 0 0 1-1.24-4.3c0-4.45 3.63-8.07 8.09-8.07Z" />
      <path d="M9.32 7.13c-.19-.43-.4-.44-.58-.45h-.5c-.17 0-.45.06-.69.32-.24.26-.9.88-.9 2.15s.93 2.5 1.06 2.67c.13.17 1.79 2.87 4.42 3.91 2.19.86 2.63.69 3.11.65.47-.05 1.53-.63 1.75-1.23.21-.6.21-1.12.15-1.23-.07-.1-.24-.17-.5-.3-.26-.13-1.53-.76-1.77-.84-.24-.09-.41-.13-.58.12-.17.26-.67.85-.82 1.02-.15.17-.3.2-.56.07-.26-.13-1.09-.4-2.08-1.28-.77-.69-1.29-1.53-1.44-1.79-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.16.17-.27.26-.45.09-.17.05-.32-.02-.45-.07-.13-.57-1.4-.81-1.91Z" />
    </Mark>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M21.9 4.15 2.9 11.48c-1.05.42-1.04 1.01-.19 1.27l4.87 1.52 1.88 5.76c.23.63.11.88.77.88.51 0 .74-.23 1.03-.51l2.34-2.28 4.87 3.6c.9.5 1.54.24 1.76-.83l3.18-14.99c.33-1.31-.5-1.9-1.51-1.44Zm-2.7 3.09-8.9 8.05-.35 3.72-1.79-5.45 10.28-6.53c.45-.28.86-.13.76.21Z" />
    </Mark>
  );
}

/**
 * Instagram, drawn rather than traced.
 *
 * The mark is three primitives — a rounded square, a circle and a dot — so it is
 * built from those exactly instead of from a path that only approximates them.
 * That also means it is the one brand mark here with a stroke: the frame and the
 * lens are rings, not filled shapes.
 */
export function InstagramIcon(props: IconProps) {
  return (
    <Mark fill="none" {...props}>
      <rect x="2.7" y="2.7" width="18.6" height="18.6" rx="5.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.35" fill="currentColor" />
    </Mark>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.5c-1.49 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z" />
    </Mark>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M16.6 1h-3.32v13.4a2.73 2.73 0 0 1-2.74 2.72 2.74 2.74 0 0 1 0-5.47c.28 0 .55.05.8.13V8.4a6.1 6.1 0 0 0-.8-.05A6.11 6.11 0 0 0 4.4 14.4a6.1 6.1 0 0 0 6.16 6.08 6.11 6.11 0 0 0 6.15-6.08V7.5a7.6 7.6 0 0 0 4.4 1.4V5.5a4.34 4.34 0 0 1-3-1.28A4.28 4.28 0 0 1 16.6 1Z" />
    </Mark>
  );
}

export function YouTubeIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path
        fillRule="evenodd"
        d="M21.6 5.2a3 3 0 0 0-2.12-2.12C17.6 2.55 12 2.55 12 2.55s-5.6 0-7.48.5A3 3 0 0 0 2.4 5.2C1.9 7.1 1.9 12 1.9 12s0 4.9.5 6.8a3 3 0 0 0 2.12 2.13c1.88.5 7.48.5 7.48.5s5.6 0 7.48-.5a3 3 0 0 0 2.12-2.13c.5-1.9.5-6.8.5-6.8s0-4.9-.5-6.8ZM10.2 15.6V8.4L16.4 12l-6.2 3.6Z"
        clipRule="evenodd"
      />
    </Mark>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26L22.82 21.75h-6.66l-5.22-6.82-5.96 6.82H1.66l7.73-8.84L1.18 2.25h6.83l4.71 6.23 5.52-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
    </Mark>
  );
}

export function DiscordIcon(props: IconProps) {
  return (
    <Mark {...props}>
      <path d="M19.63 5.33a16.2 16.2 0 0 0-4.03-1.25l-.25.5c1.32.32 2.41.86 3.42 1.53a13.6 13.6 0 0 0-12.1-.44c.34-.16.72-.32 1.09-.45a13.7 13.7 0 0 1 1.9-.64l-.25-.5a16.2 16.2 0 0 0-4.04 1.25C2.36 8.98 1.5 12.53 1.72 16.03a16.3 16.3 0 0 0 4.93 2.5c.4-.54.75-1.12 1.05-1.72-.58-.22-1.13-.49-1.65-.8.14-.1.28-.2.4-.31a11.65 11.65 0 0 0 9.98 0c.14.11.27.21.41.31-.52.31-1.08.58-1.66.8.3.6.65 1.18 1.05 1.72a16.25 16.25 0 0 0 4.94-2.5c.26-4.06-.87-7.57-2.54-10.7ZM8.42 13.9c-.98 0-1.79-.9-1.79-2s.79-2.01 1.79-2.01 1.81.91 1.79 2.01c0 1.1-.8 2-1.79 2Zm7.16 0c-.98 0-1.79-.9-1.79-2s.79-2.01 1.79-2.01 1.81.91 1.79 2.01c0 1.1-.79 2-1.79 2Z" />
    </Mark>
  );
}

const SOCIAL_MARKS: Record<SocialPlatform, (props: IconProps) => ReactNode> = {
  website: GlobeIcon,
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  x: XIcon,
  discord: DiscordIcon,
};

const CONTACT_MARKS: Record<ContactChannelKind, (props: IconProps) => ReactNode> = {
  email: MailIcon,
  phone: PhoneIcon,
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
  link: LinkIcon,
};

/** The mark for a social platform, sized by the caller. */
export function SocialIcon({ platform, ...props }: IconProps & { platform: SocialPlatform }) {
  const Glyph = SOCIAL_MARKS[platform] ?? GlobeIcon;

  return <Glyph {...props} />;
}

/** The mark for a contact channel, sized by the caller. */
export function ContactIcon({ kind, ...props }: IconProps & { kind: ContactChannelKind }) {
  const Glyph = CONTACT_MARKS[kind] ?? LinkIcon;

  return <Glyph {...props} />;
}
