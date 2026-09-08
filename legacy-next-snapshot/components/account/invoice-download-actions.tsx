"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";

/**
 * Download the invoice as a PDF or a PNG.
 *
 * The document is the paper node rendered by the page, captured with the
 * browser's own layout — the same layout a visitor just read — rather than a
 * second, hand-built copy of the invoice that could drift from what is on
 * screen. `html-to-image` clones the node's computed styles, so the capture
 * carries the paper palette the document already forces and ignores the theme
 * the reader chose.
 *
 * jsPDF is loaded on demand, only when a download is actually asked for, so a
 * visitor who only reads the invoice never pays for the rasteriser. The PDF is
 * the captured image sliced across A4 pages, which is what keeps the on-screen
 * document and the downloaded one identical.
 */

export type InvoiceDownloadActionsProps = {
  orderNumber: string;
  messages: {
    downloadPdf: string;
    downloadPng: string;
    downloading: string;
  };
};

const INVOICE_NODE_ID = "gh-invoice-paper";

function safeName(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80);
}

function captureInvoice(): Promise<string> {
  const node = document.getElementById(INVOICE_NODE_ID);

  if (!node) {
    throw new Error("Invoice document not found");
  }

  return toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the invoice image"));
    image.src = dataUrl;
  });
}

export function InvoiceDownloadActions({ orderNumber, messages }: InvoiceDownloadActionsProps) {
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);
  const filename = `invoice-${safeName(orderNumber)}`;

  async function download(kind: "pdf" | "png") {
    if (busy) {
      return;
    }

    setBusy(kind);

    try {
      const dataUrl = await captureInvoice();

      if (kind === "png") {
        triggerDownload(dataUrl, `${filename}.png`);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      const image = await loadImage(dataUrl);
      const imageHeight = (image.height * printableWidth) / image.width;

      let offsetY = 0;
      let pageIndex = 0;

      while (offsetY < imageHeight) {
        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(
          dataUrl,
          "PNG",
          margin,
          margin - offsetY,
          printableWidth,
          imageHeight,
          undefined,
          "FAST",
        );

        offsetY += printableHeight;
        pageIndex += 1;
      }

      pdf.save(`${filename}.pdf`);
    } catch (error) {
      // A failed capture is worth seeing in the console, not crashing the page
      // over. The invoice stays readable on screen either way.
      console.error("Invoice download failed:", error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="gh-no-print flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy !== null}
        onClick={() => void download("png")}
      >
        {busy === "png" ? messages.downloading : messages.downloadPng}
      </Button>
      <Button type="button" size="sm" disabled={busy !== null} onClick={() => void download("pdf")}>
        {busy === "pdf" ? messages.downloading : messages.downloadPdf}
      </Button>
    </div>
  );
}