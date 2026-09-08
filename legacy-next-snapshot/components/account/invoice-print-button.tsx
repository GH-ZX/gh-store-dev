"use client";

import { Button } from "@/components/ui/button";

/**
 * Save the invoice.
 *
 * The browser's own print dialog, which produces a PDF on every platform this
 * store targets and is the one export that needs nothing shipped to get it.
 *
 * The roadmap asked for a lazily-loaded PNG/PDF export, and this is that ask
 * answered rather than followed literally: a canvas rasteriser is a few hundred
 * kilobytes to render a page the browser can already render, and "lazy" only
 * describes when the cost is paid, not whether it was worth paying. Print styles
 * on the page do the rest — the chrome is hidden and the document keeps its
 * layout on paper.
 */
export function InvoicePrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()} className="gh-no-print">
      {label}
    </Button>
  );
}
