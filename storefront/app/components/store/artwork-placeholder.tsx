import { useId } from "react";
import { cn } from "@/lib/cn";

export interface ArtworkPlaceholderProps {
  title?: string;
  category?: string;
  className?: string;
}

type Palette = {
  start: string;
  end: string;
  accent: string;
};

const CATEGORY_PALETTES: Record<string, Palette> = {
  ai: { start: "#8b5cf6", end: "#4f46e5", accent: "#c4b5fd" },
  chatbots: { start: "#8b5cf6", end: "#4f46e5", accent: "#c4b5fd" },
  games: { start: "#2563eb", end: "#1d4ed8", accent: "#93c5fd" },
  design: { start: "#d946ef", end: "#8b5cf6", accent: "#f5d0fe" },
  creative: { start: "#d946ef", end: "#8b5cf6", accent: "#f5d0fe" },
  streaming: { start: "#f43f5e", end: "#ea580c", accent: "#fecdd3" },
  media: { start: "#f43f5e", end: "#ea580c", accent: "#fecdd3" },
  vpn: { start: "#10b981", end: "#0d9488", accent: "#a7f3d0" },
  security: { start: "#10b981", end: "#0d9488", accent: "#a7f3d0" },
  productivity: { start: "#0284c7", end: "#0369a1", accent: "#7dd3fc" },
  software: { start: "#334155", end: "#059669", accent: "#6ee7b7" },
  keys: { start: "#334155", end: "#059669", accent: "#6ee7b7" },
  social: { start: "#f43f5e", end: "#db2777", accent: "#fbcfe8" },
  "gift-cards": { start: "#0891b2", end: "#0e7490", accent: "#a5f3fc" },
};

const DEFAULT_PALETTES: Palette[] = [
  { start: "#6366f1", end: "#4338ca", accent: "#c7d2fe" },
  { start: "#8b5cf6", end: "#6d28d9", accent: "#ddd6fe" },
  { start: "#0ea5e9", end: "#0369a1", accent: "#bae6fd" },
  { start: "#10b981", end: "#047857", accent: "#a7f3d0" },
  { start: "#f43f5e", end: "#be123c", accent: "#fecdd3" },
  { start: "#0284c7", end: "#1e3a8a", accent: "#93c5fd" },
];

function resolvePalette(category?: string, title?: string): Palette {
  if (category) {
    const key = category.toLowerCase().trim();
    if (CATEGORY_PALETTES[key]) return CATEGORY_PALETTES[key];
    for (const [catKey, palette] of Object.entries(CATEGORY_PALETTES)) {
      if (key.includes(catKey)) return palette;
    }
  }

  if (!title || !title.trim()) return DEFAULT_PALETTES[0];

  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % DEFAULT_PALETTES.length;
  return DEFAULT_PALETTES[index];
}

export function ArtworkPlaceholder({
  title = "GH Store",
  category,
  className,
}: ArtworkPlaceholderProps) {
  // Repeated cards for one product still need separate SVG paint definitions.
  const seedId = useId().replace(/:/g, "");
  const gradId = `g-${seedId}`;
  const radialId = `r-${seedId}`;
  const dotsId = `dots-${seedId}`;
  const palette = resolvePalette(category, title);

  const cleanTitle = title.trim() || "GH Store";
  const titleCharacters = Array.from(cleanTitle);
  const truncatedTitle =
    titleCharacters.length > 26 ? `${titleCharacters.slice(0, 24).join("")}…` : cleanTitle;
  const firstLetter = cleanTitle.match(/\p{L}/u)?.[0] ?? "";
  const titleDirection = /[\u0590-\u08ff]/.test(firstLetter) ? "rtl" : "ltr";

  const fontSize = Math.min(
    titleCharacters.length <= 14 ? 46 : titleCharacters.length <= 20 ? 38 : 32,
    660 / Array.from(truncatedTitle).length,
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid meet"
      className={cn("block size-full select-none", className)}
      style={{ background: `linear-gradient(135deg, ${palette.start}, ${palette.end})` }}
      direction="ltr"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* 1. Diagonal Linear Gradient Base */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.start} />
          <stop offset="100%" stopColor={palette.end} />
        </linearGradient>

        {/* 2. Soft Top-Right Ambient Glow */}
        <radialGradient id={radialId} cx="0.8" cy="0.2" r="0.8">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        {/* 3. Halftone Dot Texture */}
        <pattern
          id={dotsId}
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="2" fill="#ffffff" opacity="0.18" />
        </pattern>
      </defs>

      {/* Base Background & Shading Layers */}
      <rect width="800" height="450" fill={`url(#${gradId})`} />
      <rect width="800" height="450" fill={`url(#${radialId})`} />
      <rect
        x="420"
        y="0"
        width="380"
        height="450"
        fill={`url(#${dotsId})`}
        opacity="0.6"
      />

      {/* 4. Abstract Vector Geometry (Rings, Angled Beam, Spheres) */}
      <circle
        cx="650"
        cy="225"
        r="140"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="3"
      />
      <circle cx="650" cy="225" r="95" fill="#ffffff" opacity="0.15" />
      <rect
        x="650"
        y="50"
        width="12"
        height="350"
        fill="#ffffff"
        opacity="0.12"
        transform="rotate(22 656 225)"
      />
      <circle cx="80" cy="380" r="140" fill="#000000" opacity="0.15" />

      {/* 5. Accent Line & Embedded Vector Typography */}
      <rect
        x="60"
        y="240"
        width="55"
        height="6"
        rx="3"
        fill={palette.accent}
        opacity="0.95"
      />
      <text
        x="60"
        y="320"
        direction={titleDirection}
        textAnchor={titleDirection === "rtl" ? "end" : "start"}
        unicodeBidi="isolate"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize={fontSize}
        fontWeight="900"
        fill="#ffffff"
        letterSpacing="-0.02em"
      >
        {truncatedTitle}
      </text>
      <text
        x="62"
        y="360"
        direction="ltr"
        textAnchor="start"
        unicodeBidi="isolate"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="18"
        letterSpacing="6"
        fontWeight="800"
        fill="#ffffff"
        opacity="0.85"
      >
        GH STORE
      </text>
    </svg>
  );
}
