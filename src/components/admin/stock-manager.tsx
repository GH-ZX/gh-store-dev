"use client";

import { useCallback, useState, useTransition } from "react";
import { AdminCard, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  addStockItemAction,
  bulkAddStockItemsAction,
  deleteStockItemAction,
} from "@/app/[locale]/dashboard/catalog/actions";

type StockItem = { id: string; content: string; createdAt: string };
type Messages = AdminMessages["catalog"]["stock"];

type StockManagerProps = {
  locale: Locale;
  messages: Messages;
  gameId: string;
  offerId: string;
  offerName: string;
  deliveryKind: string | null;
  stockItems: StockItem[];
  availableCount: number;
};

export function StockManager({
  messages,
  gameId,
  offerId,
  offerName,
  deliveryKind,
  stockItems,
  availableCount,
}: StockManagerProps) {
  const [items, setItems] = useState(stockItems);
  const [bulkText, setBulkText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const isStored = deliveryKind === "stored";

  const handleAdd = useCallback(
    async (formData: FormData) => {
      const content = formData.get("content") as string;
      if (!content?.trim()) return;

      setResult(null);
      startTransition(async () => {
        try {
          const res = await addStockItemAction(gameId, offerId, content.trim());
          if ("error" in res) {
            setResult({ type: "error", message: res.error });
            return;
          }
          if ("item" in res && res.item) {
            setItems((prev) => [res.item!, ...prev]);
            setResult({ type: "success", message: messages.added });
          }
        } catch {
          setResult({ type: "error", message: messages.error });
        }
      });
    },
    [gameId, offerId, messages, startTransition],
  );

  const handleBulkAdd = useCallback(
    async (formData: FormData) => {
      const text = formData.get("bulkText") as string;
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) return;

      setResult(null);
      startTransition(async () => {
        try {
          const res = await bulkAddStockItemsAction(gameId, offerId, lines);
          if ("error" in res) {
            setResult({ type: "error", message: res.error });
            return;
          }
          if ("count" in res && res.count !== undefined) {
            setBulkText("");
            window.location.reload();
            setResult({ type: "success", message: messages.bulkAdded.replace("{count}", String(res.count)) });
          }
        } catch {
          setResult({ type: "error", message: messages.error });
        }
      });
    },
    [gameId, offerId, messages, startTransition],
  );

  const handleDelete = useCallback(
    async (stockItemId: string) => {
      setResult(null);
      startTransition(async () => {
        try {
          const res = await deleteStockItemAction(gameId, offerId, stockItemId);
          if ("error" in res) {
            setResult({ type: "error", message: res.error });
            return;
          }
          if ("success" in res && res.success) {
            setItems((prev) => prev.filter((i) => i.id !== stockItemId));
            setResult({ type: "success", message: messages.deleted });
          }
        } catch {
          setResult({ type: "error", message: messages.error });
        }
      });
    },
    [gameId, offerId, messages, startTransition],
  );

  if (!isStored) {
    return null;
  }

  return (
    <AdminCard
      title={messages.title.replace("{name}", offerName)}
      description={messages.description}
    >
      <div className="grid gap-4">
        <p className="text-sm font-semibold text-[var(--ink)] tabular-nums">
          {messages.availableCount.replace("{count}", String(availableCount))}
        </p>

        {result ? (
          <p
            role={result.type === "error" ? "alert" : "status"}
            className={`text-sm leading-6 ${result.type === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
          >
            {result.message}
          </p>
        ) : null}

        <form action={handleAdd} className="flex gap-2">
          <div className="flex-1">
            <TextField
              label={messages.singleLabel}
              name="content"
              required
              placeholder={messages.singlePlaceholder}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {messages.addSingle}
            </Button>
          </div>
        </form>

        <form action={handleBulkAdd} className="grid gap-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-[var(--ink-soft)]">{messages.bulkLabel}</span>
            <textarea
              name="bulkText"
              placeholder={messages.bulkPlaceholder}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={4}
              className="min-h-[6rem] rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:border-[var(--accent-strong)]"
            />
          </label>
          <div>
            <Button type="submit" variant="secondary" disabled={pending}>
              {messages.addBulk}
            </Button>
          </div>
        </form>

        {items.length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold text-[var(--ink-soft)]">
              {messages.stockList}
            </h4>
            <ul className="max-h-60 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--line)]">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-[var(--ink)] select-all" dir="ltr">
                    {item.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={pending}
                    className="shrink-0 text-xs text-[var(--danger)] hover:underline"
                  >
                    {messages.deleteItem}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminCard>
  );
}
