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

import { pdf } from "@react-pdf/renderer";
import { SalesOrderTemplate } from "./sales-order-template";
import { registerNotoSansSC } from "./fonts/noto";
import type { SalesOrderTemplateData } from "./types";

/**
 * Render a Sales Order to a Blob suitable for `URL.createObjectURL` +
 * `window.open` to display in a new tab. Throws on render failure; callers
 * should toast the error message.
 */
export async function renderSalesOrderPdf(
  data: SalesOrderTemplateData,
): Promise<Blob> {
  registerNotoSansSC();
  return pdf(SalesOrderTemplate(data)).toBlob();
}
