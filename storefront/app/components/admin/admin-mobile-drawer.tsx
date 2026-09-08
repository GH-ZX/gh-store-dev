import { useEffect } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";

export interface AdminMobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  messages: AdminMessages["shell"];
  displayName?: string;
}

export function AdminMobileDrawer({
  isOpen,
  onClose,
  locale,
  messages,
  displayName,
}: AdminMobileDrawerProps) {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scrolling while drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.navLabel}
      className="fixed inset-0 z-50 lg:hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer */}
      <div className="fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] bg-[var(--surface)] shadow-2xl flex flex-col border-inline-end border-[var(--line)] animate-in slide-in-from-start duration-200">
        <div className="absolute top-4 end-3 z-10">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-[var(--radius-control)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <AdminSidebar
          locale={locale}
          messages={messages}
          displayName={displayName}
          onNavigate={onClose}
          className="h-full"
        />
      </div>
    </div>
  );
}
