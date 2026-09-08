import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { SupportMessage } from "@/lib/services/support.service";

/**
 * A support conversation, as both sides see it.
 *
 * The same timeline serves the customer's page and the owner's queue. Only the
 * alignment differs, and it differs by who is reading rather than by who wrote:
 * "my messages on my side" is what makes a conversation legible, so `mine` is
 * passed in rather than hard-coded to a role.
 *
 * A server component — the thread is re-fetched on navigation and there is no
 * state to hold, so there is nothing here to hydrate.
 */

export type SupportStatusLabels = Record<string, string>;

/**
 * Status as a colour.
 *
 * `open` is the one worth arguing about: it means the customer has spoken and
 * nobody has answered, which is the state that should look unfinished. `pending`
 * means the store replied and is waiting on them, so it reads as calm.
 */
export function supportTone(status: string): BadgeTone {
  if (status === "resolved") {
    return "success";
  }

  if (status === "open") {
    return "warning";
  }

  return status === "pending" ? "accent" : "neutral";
}

export function SupportStatusBadge({
  status,
  labels,
}: {
  status: string;
  labels: SupportStatusLabels;
}) {
  return <Badge tone={supportTone(status)}>{labels[status] ?? status}</Badge>;
}

export function SupportTimeline({
  messages,
  mine,
  labels,
}: {
  messages: SupportMessage[];
  /** Which role the reader is, so their own words sit on their own side. */
  mine: "customer" | "admin";
  labels: AdminMessages["support"]["roles"];
}) {
  return (
    <ol className="grid gap-3">
      {messages.map((message) => {
        const isMine = message.senderRole === mine;
        /*
         * `system` is neither side. It is centred and plain, because a message
         * the store generated should not look like a person wrote it.
         */
        const isSystem = message.senderRole === "system";

        return (
          <li
            key={message.id}
            className={cn(
              "flex",
              isSystem ? "justify-center" : isMine ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-[var(--radius-card)] border px-4 py-3",
                isSystem
                  ? "border-[var(--line)] bg-[var(--shell)] text-center"
                  : isMine
                    ? "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    : "border-[var(--line)] bg-[var(--surface)]",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--ink-soft)]">
                  {labels[message.senderRole as keyof typeof labels] ?? message.senderRole}
                </span>
                <time
                  className="text-xs text-[var(--ink-faint)] tabular-nums"
                  dateTime={message.createdAt}
                  dir="ltr"
                >
                  {message.createdAt.slice(0, 16).replace("T", " ")}
                </time>
              </div>

              {/*
                * `whitespace-pre-wrap` so the paragraphs someone typed survive.
                * Never `dangerouslySetInnerHTML`: this is text a stranger wrote.
                */}
              <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap text-[var(--ink)]">
                {message.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
