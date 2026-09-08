import { Button } from "@/components/ui/button";
import { useState } from "react";

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

async function captureInvoice(): Promise<string> {
  const node = document.getElementById(INVOICE_NODE_ID);
  if (!node) {
    throw new Error("Invoice document not found");
  }
  // Client-only DOM canvas export: avoid bloating Cloudflare Worker server bundle.
  const { toPng } = await import("html-to-image");
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
      // Client-only PDF generator: avoid bloating Cloudflare Worker server bundle.
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
      <Button
        type="button"
        disabled={busy !== null}
        onClick={() => void download("png")}
        variant="secondary" size="sm"
      >
        {busy === "png" ? messages.downloading : messages.downloadPng}
      </Button>
      <Button
        type="button"
        disabled={busy !== null}
        onClick={() => void download("pdf")}
        variant="secondary" size="sm"
      >
        {busy === "pdf" ? messages.downloading : messages.downloadPdf}
      </Button>
    </div>
  );
}

export function InvoicePrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()} variant="secondary" size="sm">
      {label}
    </Button>
  );
}
