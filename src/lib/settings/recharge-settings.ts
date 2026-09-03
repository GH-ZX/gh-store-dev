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

/**
 * What the admin methods editor submits.
 *
 * The same field bounds as {@link methodSchema} stores, but strict about the
 * one thing a customer page depends on — the id — and guarantees no two rows
 * can share one, so a customer never faces two methods behind one label.
 */
export const rechargeMethodsInputSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(40),
      label_ar: z.string().trim().max(80).default(""),
      label_en: z.string().trim().max(80).default(""),
      account: z.string().trim().max(160).default(""),
      instructions_ar: z.string().trim().max(600).default(""),
      instructions_en: z.string().trim().max(600).default(""),
      enabled: z.boolean(),
    }),
  )
  .max(20)
  .refine(
    (methods) => methods.length === new Set(methods.map((method) => method.id)).size,
    { message: "Method ids must be unique." },
  );

export type RechargeMethodInput = z.infer<typeof rechargeMethodsInputSchema>[number];

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

/**
 * Parse the JSON body of the admin methods editor form.
 *
 * The editor submits its whole list as one field, so a single parse call guards
 * every row before anything touches the database.
 */
export function parseRechargeMethodsInput(
  json: string,
): { ok: true; methods: RechargeMethodInput[] } | { ok: false } {
  try {
    const parsed = rechargeMethodsInputSchema.safeParse(JSON.parse(json));

    if (!parsed.success) {
      return { ok: false };
    }

    return { ok: true, methods: parsed.data };
  } catch {
    return { ok: false };
  }
}

/**
 * Starter row for the Bybit USDT top-up.
 *
 * Arrives disabled and without an account, so nothing can be shown to a
 * customer until the owner sets their actual Bybit UID and BEP20 address. The
 * UID is a placeholder inside the instructions (Bybit Pay is how customers can
 * send by UID) and the BEP20 address becomes the `account` field every transfer
 * references.
 */
export const BYBIT_METHOD_TEMPLATE: RechargeMethodInput = {
  id: "bybit",
  label_ar: "بايبيت (USDT)",
  label_en: "Bybit (USDT)",
  account: "",
  instructions_ar:
    "١- افتح تطبيق بايبيت واختر إرسال/سحب USDT عبر شبكة BEP20 (BSC).\n" +
    "٢- أرسل المبلغ إلى عنوان المحفظة أعلاه، أو استخدم Bybit Pay إلى UID المتجر: (ضع UID المتجر هنا).\n" +
    "٣- اكتب رقم المرجع (مثل RC-XXXXXXXXXX) في خانة الملاحظة.\n" +
    "٤- 1 USDT ≈ 1 دولار. بعد الإرسال راسلنا حتى نؤكد وصول المبلغ خلال دقائق.",
  instructions_en:
    "1. Open Bybit and choose to send/withdraw USDT on the BEP20 (BSC) network.\n" +
    "2. Send the amount to the wallet address above, or use a Bybit Pay transfer to the store UID: (put the store UID here).\n" +
    "3. Put your reference (e.g. RC-XXXXXXXXXX) in the note.\n" +
    "4. 1 USDT ≈ 1 USD. After sending, message us so we confirm the payment within minutes.",
  enabled: false,
};

/**
 * A customer-facing name for any recharge method id.
 *
 * Instant wallets and Binance write fixed ids (`shamcash`, `syriatel`,
 * `binance`) that are not in the owner's manual list, so a receipt used to
 * print the raw slug. Manual methods keep the owner's own labels.
 */
export function getPaymentMethodLabel(
  id: string,
  locale: "ar" | "en",
  manualMethods: RechargeMethod[] = [],
): string {
  switch (id) {
    case "shamcash":
      return locale === "ar" ? "شام كاش" : "ShamCash";
    case "syriatel":
      return locale === "ar" ? "سيريتل كاش" : "Syriatel Cash";
    case "binance":
      return locale === "ar" ? "USDT · بينانس باي" : "USDT · Binance Pay";
    default: {
      const method = manualMethods.find((candidate) => candidate.id === id);

      return method ? getMethodLabel(method, locale) : id;
    }
  }
}
