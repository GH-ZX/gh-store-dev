/**
 * Telegram custom-emoji wrappers sometimes arrive in provider descriptions.
 * Their contents already contain the readable Unicode emoji. Remove only this
 * known wrapper so ordinary angle brackets, URLs and whitespace keep their text.
 */
export function catalogDescriptionText(description: string | null | undefined): string | null {
  return description?.replace(/<\/?tg-emoji(?:\s[^<>]*)?>/gi, "") ?? null;
}
