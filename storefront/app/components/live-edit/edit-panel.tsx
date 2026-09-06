"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon, PencilIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

/**
 * The sheet an in-place edit opens into.
 *
 * A native `<dialog>` rather than a hand-built overlay: the top layer, the
 * backdrop, the focus trap, Escape, and returning focus to the button that
 * opened it are all behaviours the element already has and that a div would
 * have to reimplement — the same argument that put the carousel on a library.
 *
 * It is a sheet on a phone and a centred card on a desktop, because an owner
 * fixing a heading on their phone should be able to reach the fields with a
 * thumb.
 */
export type EditPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
};

export function EditPanel({ open, onClose, title, closeLabel, children }: EditPanelProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  /*
   * `showModal` is a method, not an attribute: rendering `<dialog open>` gives
   * a non-modal dialog with no backdrop and no focus trap, so the state has to
   * be pushed into the element rather than described to it.
   */
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Escape and the backdrop both close through the same path as the button,
      // so the parent's state can never disagree with what is on screen.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className={cn(
        "m-0 max-h-[85dvh] w-full max-w-lg overflow-y-auto border border-[var(--line-strong)] bg-[var(--shell)] p-0 text-[var(--ink)] backdrop:bg-[color-mix(in_srgb,var(--canvas)_70%,transparent)] backdrop:backdrop-blur-sm",
        "mt-auto rounded-t-[var(--radius-shell)] sm:m-auto sm:rounded-[var(--radius-shell)]",
      )}
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--shell)] px-5 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <PencilIcon className="size-4 shrink-0 text-[var(--accent)]" />
          <span className="truncate">{title}</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={closeLabel}>
          <CloseIcon className="size-4" />
        </Button>
      </div>

      <div className="p-5">{children}</div>
    </dialog>
  );
}

/** The pencil that opens a panel, sized as a real touch target. */
export function EditTrigger({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] text-[var(--accent)] backdrop-blur-md transition-colors duration-[var(--duration)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]",
        className,
      )}
    >
      <PencilIcon className="size-4" />
    </button>
  );
}

/** Result line shared by the in-place forms. */
export function EditResult({
  error,
  notice,
  messages,
}: {
  error: string | null;
  notice: string | null;
  messages: AdminMessages["liveEdit"];
}) {
  if (!error && !notice) {
    return null;
  }

  return error ? (
    <p role="alert" className="text-sm leading-6 text-[var(--danger)]">
      {error}
    </p>
  ) : (
    <p role="status" className="text-sm leading-6 text-[var(--success)]">
      {notice ? messages.saved : null}
    </p>
  );
}
