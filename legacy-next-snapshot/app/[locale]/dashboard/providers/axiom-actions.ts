"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText } from "@/lib/forms/form-data";
import { log, logFailure } from "@/lib/logging/logger";
import { getAxiomStatus, saveAxiomSettings } from "@/lib/services/admin-settings.service";
import {
  INITIAL_AXIOM_STATE,
  type AxiomActionState,
} from "@/app/[locale]/dashboard/providers/axiom-action-state";

const schema = z.object({
  apiToken: z.string().max(400).optional(),
  dataset: z.string().trim().max(120).optional(),
  domain: z.string().trim().max(200).optional(),
  minLevel: z.string().trim().max(10).optional(),
  enabled: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function saveAxiomSettingsAction(
  _state: AxiomActionState,
  formData: FormData,
): Promise<AxiomActionState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    apiToken: formText(formData, "apiToken"),
    dataset: formText(formData, "dataset"),
    domain: formText(formData, "domain"),
    minLevel: formText(formData, "minLevel"),
    enabled: formFlag(formData, "enabled"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_AXIOM_STATE, error: "invalid_input" };
  }

  try {
    await saveAxiomSettings({
      apiToken: parsed.data.apiToken,
      dataset: parsed.data.dataset,
      domain: parsed.data.domain,
      minLevel: parsed.data.minLevel,
      enabled: parsed.data.enabled,
    });
  } catch (error) {
    /*
     * Logged even though it is the logging settings that failed to save: the
     * destination that is live right now is the old one, which is still working.
     */
    logFailure("admin.logging", "axiom_settings_save_failed", error);

    return { ...INITIAL_AXIOM_STATE, error: "unknown" };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/dashboard/providers`);

  return { ...INITIAL_AXIOM_STATE, notice: "saved" };
}

/**
 * Send one event, so the owner can see whether the destination works.
 *
 * There is no way to ask Axiom "is this token good" other than by writing to it,
 * and a logger that fails silently — which is the correct behaviour everywhere
 * else — gives an owner nothing to check against. This is the one place the
 * result is surfaced.
 */
export async function testAxiomAction(
  _state: AxiomActionState,
  formData: FormData,
): Promise<AxiomActionState> {
  const admin = await requireAdmin();
  const status = await getAxiomStatus();

  if (!status.configured || !status.enabled) {
    return { ...INITIAL_AXIOM_STATE, error: "not_configured" };
  }

  log.info("admin.logging", "test_event", { actorId: admin.id, dataset: status.dataset });

  revalidatePath(`/${resolveLocale(formText(formData, "locale"))}/dashboard/providers`);

  return { ...INITIAL_AXIOM_STATE, notice: "tested" };
}
