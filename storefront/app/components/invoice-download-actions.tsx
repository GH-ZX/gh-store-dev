import { useState } from "react";
import { toPng } from "html-to-image";

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
  return toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: "#ffffff" });
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
        pdf.addImage(dataUrl, "PNG", margin, margin - offsetY, printableWidth, imageHeight, undefined, "FAST");
        offsetY += printableHeight;
        pageIndex += 1;
      }
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error("Invoice download failed:", error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void download("png")}
        className="rounded border px-3 py-1.5 text-sm"
      >
        {busy === "png" ? messages.downloading : messages.downloadPng}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void download("pdf")}
        className="rounded border px-3 py-1.5 text-sm"
      >
        {busy === "pdf" ? messages.downloading : messages.downloadPdf}
      </button>
    </div>
  );
}

export function InvoicePrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border px-3 py-1.5 text-sm">
      {label}
    </button>
  );
}
