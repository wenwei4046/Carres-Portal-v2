/**
 * Browser-side PDF rendering.
 *
 * Loo 2026-05-12 — Cloudflare Workers blocks `WebAssembly.instantiate(bytes)`
 * which @react-pdf/renderer's yoga-layout dep needs to boot. Rendering moved
 * to the browser where WASM is fully supported. The server still owns data
 * assembly (joining order + lines + dealer + outlet for the SO PDF, etc.)
 * because that's where RLS + the dealer table joins live.
 *
 * As more PDFs move to the browser (Invoice, DO, PO), they slot in here as
 * additional `renderXxxPdf` exports.
 */

import type { ReactElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { SalesOrderTemplate } from "./sales-order-template";
import { InvoiceTemplate } from "./invoice-template";
import { DoTemplate } from "./do-template";
import { PoTemplate } from "./po-template";
import { registerNotoSansSC } from "./fonts/noto";
import type {
  DoTemplateData,
  InvoiceTemplateData,
  PoTemplateData,
  SalesOrderTemplateData,
} from "./types";

/** All four PDFs share the render pipeline; only the template differs. */
async function toBlob(element: ReactElement): Promise<Blob> {
  registerNotoSansSC();
  return pdf(element).toBlob();
}

export function renderSalesOrderPdf(data: SalesOrderTemplateData): Promise<Blob> {
  return toBlob(SalesOrderTemplate(data));
}

export function renderInvoicePdf(data: InvoiceTemplateData): Promise<Blob> {
  return toBlob(InvoiceTemplate(data));
}

export function renderDoPdf(data: DoTemplateData): Promise<Blob> {
  return toBlob(DoTemplate(data));
}

export function renderPoPdf(data: PoTemplateData): Promise<Blob> {
  return toBlob(PoTemplate(data));
}
