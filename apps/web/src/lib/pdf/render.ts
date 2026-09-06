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

import { createElement, type ReactElement } from "react";
import { Document, pdf } from "@react-pdf/renderer";
import { SalesOrderTemplate } from "./sales-order-template";
import { InvoiceTemplate } from "./invoice-template";
import { DoTemplate } from "./do-template";
import { GrnTemplate } from "./grn-template";
import { PoTemplate } from "./po-template";
import { PickupEventTemplate } from "./pickup-event-template";
import { ReceiptTemplate } from "./receipt-template";
import { ExtensionAgreementTemplate } from "./extension-agreement-template";
import { LoanNoteTemplate } from "./loan-note-template";
import { RegisterListTemplate, type RegisterListTemplateData } from "./register-list-template";
import { registerNotoSansSC } from "./fonts/noto";
import type {
  DoTemplateData,
  ExtensionAgreementTemplateData,
  GrnTemplateData,
  InvoiceTemplateData,
  LoanNoteTemplateData,
  PoTemplateData,
  ReceiptTemplateData,
  SalesOrderTemplateData,
} from "./types";
import type { PickupEventPrintPayload } from "@/lib/queries";

/** All four PDFs share the render pipeline; only the template differs. */
async function toBlob(element: ReactElement): Promise<Blob> {
  registerNotoSansSC();
  return pdf(element).toBlob();
}

export function renderSalesOrderPdf(data: SalesOrderTemplateData): Promise<Blob> {
  return toBlob(SalesOrderTemplate(data));
}

/**
 * MANY Sales Orders, one file — the batch the operator prints after ticking
 * rows. Each order keeps the GOVERNED single-order page, unmodified: this
 * lifts each template's one `<Page>` out of its own `<Document>` and puts them
 * all in one. Nothing about the page is re-authored here, so
 * `docs/pdf/SO-PDF-STANDARD.md` still describes exactly what prints.
 *
 * The template's header and footer read `subPageNumber` / `subPageTotalPages`
 * rather than the document-wide counters, so order 7 of 69 still shows its own
 * letterhead and its own `Page 1 of 2`. For a single order the two are equal,
 * so the one-order PDF is byte-identical to before.
 */
export function renderCombinedSalesOrderPdf(list: SalesOrderTemplateData[]): Promise<Blob> {
  const pages = list.map((data, i) => {
    const doc = SalesOrderTemplate(data) as ReactElement<{ children: ReactElement }>;
    return createElement(
      doc.props.children.type,
      { ...doc.props.children.props, key: `so-${i}` },
    );
  });
  return toBlob(createElement(Document, null, ...pages) as ReactElement);
}

export function renderInvoicePdf(data: InvoiceTemplateData): Promise<Blob> {
  return toBlob(InvoiceTemplate(data));
}

/** Balance job (0184) — payment receipt, one per ledger entry. Rendered
 *  on-demand from the order_payments row + order (no bucket persistence yet). */
export function renderReceiptPdf(data: ReceiptTemplateData): Promise<Blob> {
  return toBlob(ReceiptTemplate(data));
}

/** Migration 0196 — storage delivery-extension agreement (the two Google Forms).
 *  Rendered on-demand from the ops_order_control extension_* fields + order. */
export function renderExtensionAgreementPdf(
  data: ExtensionAgreementTemplateData,
): Promise<Blob> {
  return toBlob(ExtensionAgreementTemplate(data));
}

export function renderDoPdf(data: DoTemplateData): Promise<Blob> {
  return toBlob(DoTemplate(data));
}

/** The formal Goods Received Note (owner correction 2026-09-06) — the GRN
 *  object's preview, its Print and its Download PDF share this one call. */
export function renderGrnPdf(data: GrnTemplateData): Promise<Blob> {
  return toBlob(GrnTemplate(data));
}

/** Migration 0242 — ON LOAN delivery-note (the customer signs on hand-over of a
 *  loaner). Rendered on-demand from the ops_sofa_loans row + order. */
export function renderLoanNotePdf(data: LoanNoteTemplateData): Promise<Blob> {
  return toBlob(LoanNoteTemplate(data));
}

/** A Register's CURRENT VIEW as a document — not a business document, so it
 *  carries no letterhead, terms or signature block. Its cells are the same
 *  derived text the Excel export writes. */
export function renderRegisterListPdf(data: RegisterListTemplateData): Promise<Blob> {
  return toBlob(RegisterListTemplate(data));
}

export function renderPoPdf(data: PoTemplateData): Promise<Blob> {
  return toBlob(PoTemplate(data));
}

/** Task 13 (2026-05-15) — pickup-event DO render (supplier / partner /
 *  operation reprint). Data assembled server-side by
 *  `/api/pickup-events/:id/print` (RLS-scoped per role via 0107 RPC);
 *  browser renders via @react-pdf/renderer. */
export function renderPickupEventPdf(
  data: PickupEventPrintPayload,
): Promise<Blob> {
  return toBlob(PickupEventTemplate(data));
}
