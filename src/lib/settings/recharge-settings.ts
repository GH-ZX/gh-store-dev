import { z } from "zod";
import type { Locale } from "@/i18n/config";

/**
 * Recharge configuration, normalized.
 *
 * Stored inside `store_settings.payments`, which also holds provider secrets —
 * so a page never reads that column directly. The presentation-safe subset comes
 * from `get_recharge_methods()`, and this parses it.
 */

const methodSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label_ar: z.string().trim().max(80).optional(),
  label_en: z.string().trim().max(80).optional(),
  account: z.string().trim().max(160).optional(),
  instructions_ar: z.string().trim().max(600).optional(),
  instructions_en: z.string().trim().max(600).optional(),
  enabled: z.boolean().optional(),
});

const configSchema = z.object({
  methods: z.array(z.unknown()).optional(),
  min_amount: z.coerce.number().optional().catch(undefined),
  max_amount: z.coerce.number().optional().catch(undefined),
  currency: z.string().trim().optional().catch(undefined),
  note_ar: z.string().nullish(),
  note_en: z.string().nullish(),
});

export type RechargeMethod = {
  id: string;
  labelAr: string;
  labelEn: string;
  account: string | null;
  instructionsAr: string;
  instructionsEn: string;
  enabled: boolean;
};

export type RechargeConfig = {
  methods: RechargeMethod[];
  minAmount: number;
  maxAmount: number;
  currency: string;
  noteAr: string;
  noteEn: string;
};

export const RECHARGE_DEFAULTS = {
  minAmount: 1,
  maxAmount: 1000,
  currency: "USD",
} as const;

function clampAmount(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return Math.min(100_000, value);
}

export function normalizeRechargeConfig(value: unknown): RechargeConfig {
  const parsed = configSchema.safeParse(value ?? {});
  const config = parsed.success ? parsed.data : {};

  const methods = (config.methods ?? []).flatMap((raw) => {
    const method = methodSchema.safeParse(raw);

    if (!method.success) {
      return [];
    }

    const data = method.data;
    const fallbackLabel = data.label_en || data.label_ar || data.id;

    return [
      {
        id: data.id,
        labelAr: data.label_ar || fallbackLabel,
        labelEn: data.label_en || fallbackLabel,
        account: data.account || null,
        instructionsAr: data.instructions_ar ?? "",
        instructionsEn: data.instructions_en ?? "",
        // A method is only offered when explicitly enabled, so a half-configured
        // one never reaches a customer.
        enabled: data.enabled === true,
      },
    ];
  });

  const minAmount = clampAmount(config.min_amount, RECHARGE_DEFAULTS.minAmount);
  const maxAmount = clampAmount(config.max_amount, RECHARGE_DEFAULTS.maxAmount);

  return {
    methods,
    minAmount,
    // A max below the min would make every amount invalid.
    maxAmount: Math.max(minAmount, maxAmount),
    currency: config.currency?.toUpperCase() || RECHARGE_DEFAULTS.currency,
    noteAr: config.note_ar ?? "",
    noteEn: config.note_en ?? "",
  };
}

export function getMethodLabel(method: RechargeMethod, locale: Locale): string {
  return locale === "ar" ? method.labelAr : method.labelEn;
}

export function getMethodInstructions(method: RechargeMethod, locale: Locale): string {
  return locale === "ar" ? method.instructionsAr : method.instructionsEn;
}
