import type { CSSProperties } from "react";
import type { ArtworkFit } from "@/lib/catalog/presentation";

/**
 * Recolour a logo without touching its surroundings: the mark becomes a mask
 * over a flat ink fill, so the card or tile keeps its own surface. Without an
 * ink colour the element is left completely untouched.
 */
export function logoInkStyle({
  src,
  ink,
  fit,
  focus,
}: {
  src: string;
  ink: string | null | undefined;
  fit?: ArtworkFit;
  focus?: { x: number; y: number };
}): CSSProperties | undefined {
  const position = focus && fit === "cover" ? { objectPosition: `${focus.x}% ${focus.y}%` } : null;
  if (!ink) return position ?? undefined;
  const mask = `url("${src.replace(/"/g, "%22")}")`;
  return {
    ...position,
    backgroundColor: ink,
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  } as CSSProperties;
}
