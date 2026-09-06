import { useActionState, useState } from "react";
import { AdminCard, CheckboxField, FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { BYBIT_METHOD_TEMPLATE, type RechargeMethod } from "@/lib/recharge-settings";
import { saveRechargeMethodsAction } from "@/lib/admin-actions";
type Messages = AdminMessages["recharges"];
type AdminRechargeState = { error: string | null; notice: string | null };
const INITIAL_ADMIN_RECHARGE_STATE: AdminRechargeState = { error: null, notice: null };
function resolveError(messages: Messages, key: string | null): string | null {
 return key ? messages.errors[key as keyof Messages["errors"]] ?? messages.errors.unknown : null;
}
type MethodDraft = {
  id: string;
  labelAr: string;
  labelEn: string;
  account: string;
  instructionsAr: string;
  instructionsEn: string;
  enabled: boolean;
};

function toDraft(method: RechargeMethod): MethodDraft {
  return {
    id: method.id,
    labelAr: method.labelAr,
    labelEn: method.labelEn,
    account: method.account ?? "",
    instructionsAr: method.instructionsAr,
    instructionsEn: method.instructionsEn,
    enabled: method.enabled,
  };
}

const BYBIT_DRAFT: MethodDraft = {
  id: BYBIT_METHOD_TEMPLATE.id,
  labelAr: BYBIT_METHOD_TEMPLATE.label_ar,
  labelEn: BYBIT_METHOD_TEMPLATE.label_en,
  account: BYBIT_METHOD_TEMPLATE.account,
  instructionsAr: BYBIT_METHOD_TEMPLATE.instructions_ar,
  instructionsEn: BYBIT_METHOD_TEMPLATE.instructions_en,
  enabled: BYBIT_METHOD_TEMPLATE.enabled,
};

function emptyDraft(): MethodDraft {
  return {
    id: "",
    labelAr: "",
    labelEn: "",
    account: "",
    instructionsAr: "",
    instructionsEn: "",
    enabled: false,
  };
}

/**
 * Manual recharge methods — what a customer picks on the add-balance page.
 *
 * The editor is one client-owned list that saves as a single JSON field. Every
 * method arrives disabled unless it is explicitly turned on, so a half-filled
 * row can never leak to a customer.
 */
export function RechargeMethodsForm({
  locale,
  messages,
  methods,
}: {
  locale: Locale;
  messages: Messages;
  methods: RechargeMethod[];
}) {
  const [drafts, setDrafts] = useState<MethodDraft[]>(() => methods.map(toDraft));
  const [state, formAction, pending] = useActionState<AdminRechargeState, FormData>(
    saveRechargeMethodsAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );

  function update(index: number, patch: Partial<MethodDraft>) {
    setDrafts((current) =>
      current.map((draft, currentIndex) =>
        currentIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function remove(index: number) {
    setDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function add(draft: MethodDraft) {
    setDrafts((current) => {
      if (current.some((existing) => existing.id.trim() === draft.id.trim())) {
        return current;
      }

      return [...current, draft];
    });
  }

  const payload = JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id.trim(),
      label_ar: draft.labelAr.trim(),
      label_en: draft.labelEn.trim(),
      account: draft.account.trim(),
      instructions_ar: draft.instructionsAr.trim(),
      instructions_en: draft.instructionsEn.trim(),
      enabled: draft.enabled,
    })),
  );

  const hasBybit = drafts.some((draft) => draft.id.trim() === BYBIT_DRAFT.id);

  return (
    <AdminCard title={messages.methodsTitle} description={messages.methodsDescription}>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="methods" value={payload} />

        {drafts.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-muted)]">
            {messages.methodsDescription}
          </p>
        ) : (
          <ul className="grid gap-3">
            {drafts.map((draft, index) => (
              <li
                key={index}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <CheckboxField
                    label={messages.methodEnabled}
                    checked={draft.enabled}
                    onChange={(event) => update(index, { enabled: event.target.checked })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => remove(index)}
                    className="text-[var(--danger)]"
                  >
                    {messages.removeMethod}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <TextField
                    label={messages.methodId}
                    value={draft.id}
                    onChange={(event) => update(index, { id: event.target.value })}
                    dir="ltr"
                    required
                    maxLength={40}
                    placeholder="bybit"
                    className="font-mono"
                  />
                  <TextField
                    label={messages.methodLabelEn}
                    value={draft.labelEn}
                    onChange={(event) => update(index, { labelEn: event.target.value })}
                    maxLength={80}
                  />
                  <TextField
                    label={messages.methodLabelAr}
                    value={draft.labelAr}
                    onChange={(event) => update(index, { labelAr: event.target.value })}
                    maxLength={80}
                  />
                </div>

                <div className="mt-3">
                  <TextField
                    label={messages.methodAccount}
                    value={draft.account}
                    onChange={(event) => update(index, { account: event.target.value })}
                    dir="ltr"
                    maxLength={160}
                    className="font-mono"
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextAreaField
                    label={messages.methodInstructionsEn}
                    value={draft.instructionsEn}
                    onChange={(event) => update(index, { instructionsEn: event.target.value })}
                    maxLength={600}
                  />
                  <TextAreaField
                    label={messages.methodInstructionsAr}
                    value={draft.instructionsAr}
                    onChange={(event) => update(index, { instructionsAr: event.target.value })}
                    maxLength={600}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <FormResult
          error={resolveError(messages, state.error)}
          notice={state.notice === "methods_saved" ? messages.methodsSaved : null}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {messages.saveMethods}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => add(BYBIT_DRAFT)}
            disabled={hasBybit || pending}
          >
            {messages.addBybit}
          </Button>
          <Button type="button" variant="secondary" onClick={() => add(emptyDraft())} disabled={pending}>
            {messages.addMethod}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
