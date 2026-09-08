import { z } from "zod";

/**
 * Password policy for passwords being *set*: registration, profile change,
 * recovery reset. Sign-in deliberately stays lenient — an account created
 * under any older policy must still be able to log in with its legacy
 * password, otherwise rotation would lock people out instead of protecting
 * them.
 *
 * Eight characters mixing letters and numbers. Symbols and mixed case are
 * welcome but never demanded. A breach dictionary is the other half of a
 * serious policy; it needs either a local corpus or an external lookup, so it
 * is not attempted here.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

function hasLetter(value: string): boolean {
  return /[a-z]/i.test(value);
}

function hasDigit(value: string): boolean {
  return /\d/.test(value);
}

export const strongPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .max(MAX_PASSWORD_LENGTH)
  .refine(hasLetter)
  .refine(hasDigit);
