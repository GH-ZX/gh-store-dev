"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TrashIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { removeImportedProductAction } from "@/app/[locale]/dashboard/providers/actions";
import type { RemoveImportedResult } from "@/lib/services/admin-catalog.service";

/**
 * Take one imported product back out of the store, from the picker.
 *
 * The action is called from the click handler rather than submitted: this
 * button sits inside the import form, forms do not nest, and a removal that
 * carried the surrounding selection would be a submit pretending to be
 * something else.
 *
 * `stopPropagation` and `preventDefault` are both needed — the row is a
 * `<label>` wrapping a checkbox, so a click anywhere in it, this button
 * included, would otherwise toggle the selection on the way past.
 *
 * A native confirm, matching the game editor's own delete. This removes the
 * game, its packages, and its provider mapping, and there is no undo; orders
 * that bought it keep their purchase-time snapshots.
 */
export function ImportRemoveButton({
  code,
  provider,
  locale,
  label,
  confirmMessage,
  busy,
  onDone,
}: {
  code: string;
  provider?: string;
  locale: Locale;
  label: string;
  confirmMessage: string;
  busy: string;
  onDone: (result: RemoveImportedResult, code: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (!window.confirm(confirmMessage)) {
      return;
    }

    startTransition(async () => {
      const result = await removeImportedProductAction({ code, provider, locale });

      onDone(result, code);

      if (result.ok) {
        // The picker's "already imported" marks come from the server, so the
        // list has to be re-read rather than patched in place.
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={label}
      aria-label={pending ? busy : label}
      className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-[var(--line)] text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      <TrashIcon className="size-4" />
    </button>
  );
}
