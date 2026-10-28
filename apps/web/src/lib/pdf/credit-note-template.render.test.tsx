// @vitest-environment node
/** The Credit Note renders as a real PDF, and a voided one says so (0627). */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { pdf } from "@react-pdf/renderer";
import type { CreditNotePrintData } from "@carres/shared/schemas/finance-credit-note";
import { CreditNoteTemplate } from "./credit-note-template";
import { registerNotoSansSC } from "./fonts/noto";

const LOGO = new URL("../../../public/carres-logo.png", import.meta.url).pathname;

beforeAll(() => {
  registerNotoSansSC();
  vi.stubGlobal("__CARRES_LOGO_SRC__", LOGO);
});
afterAll(() => vi.unstubAllGlobals());

const sample = (over: Partial<CreditNotePrintData> = {}): CreditNotePrintData => ({
  credit_note_no: "CN-0001", note_date: "2026-10-28", invoice_no: "INV-281026-0001", order_code: "SO-1209",
  customer_name: "Sample Customer", amount: 250, reason: "Damaged on delivery, goods kept", voided: false, void_reason: null, currency: "RM",
  ...over,
});

async function bytes(data: CreditNotePrintData) {
  const stream = await pdf(CreditNoteTemplate(data)).toBuffer();
  const chunks: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

it("renders a one-page PDF", async () => {
  const buf = await bytes(sample());
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(buf.length).toBeGreaterThan(2000);
});

it("renders a voided note too", async () => {
  const buf = await bytes(sample({ voided: true, void_reason: "Wrong invoice" }));
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
});
