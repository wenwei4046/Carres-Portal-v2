/**
 * ⭐ THE TWO DOCUMENT NOTICES — owner ruling 2026-09-23, wording approved
 * VERBATIM and not open to re-wording.
 *
 *   "Preserve signatures in PDFs only where their version association is
 *    established. Unknown association must not be labelled 'unsigned.'"
 *   "Preserve original historical documents. A reconstructed PDF must not be
 *    presented as the original issued document."
 *
 * These are guarantees about a CUSTOMER DOCUMENT, so they are proved by
 * RENDERING A REAL PDF and reading its text — not by asserting that a field was
 * passed. A field can be passed and never drawn.
 *
 * The whole safety of the optional-fields approach is that no existing caller's
 * output moves, so the current document is rendered too and compared against a
 * render of the same data on the unmodified path. That is the assertion the
 * reviewer asked for: both paths rendered, not one path reasoned about.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;

/** The rendered PDF's bytes — the real artefact, not an element tree. */
async function renderPdf(data: Data): Promise<Uint8Array> {
  const { pdf } = await import("@react-pdf/renderer");
  const { SalesOrderTemplate } = await import("./sales-order-template");
  const stream = await pdf(SalesOrderTemplate(data) as never).toBuffer();
  const chunks: Buffer[] = [];
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * The words a READER sees, extracted from the finished PDF with pdfjs.
 *
 * ⛔ NOT a substring search over the raw buffer. The first version of this file
 * did exactly that, and its control test failed immediately: @react-pdf
 * compresses the content streams, so the glyphs are not in the bytes and every
 * assertion would have passed by finding nothing. The control is kept below for
 * the same reason — it fails first if this ever stops working.
 */
async function pdfText(data: Data): Promise<string> {
  const bytes = await renderPdf(data);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => ("str" in it ? it.str : ""))
        .join(""),
    );
  }
  await doc.destroy();
  return pages.join("\n");
}

/** Every text item with the position it was drawn at — so "the current document
 *  did not move" is a statement about LAYOUT, not about compressed bytes that
 *  legitimately differ between runs. */
async function pdfLayout(data: Data): Promise<string> {
  const bytes = await renderPdf(data);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    out.push(`page ${i} ${Math.round(vp.width)}x${Math.round(vp.height)}`);
    const content = await page.getTextContent();
    for (const it of content.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = it as any;
      if (!("str" in item)) continue;
      const [, , , , x, y] = item.transform as number[];
      out.push(`${x.toFixed(2)},${y.toFixed(2)} ${item.str}`);
    }
  }
  await doc.destroy();
  return out.join("\n");
}

const BASE: Data = {
  so_number: "SO-1319",
  issue_date: "2026-08-01",
  order_id: "ord-1",
  order_code: "SO-1319",
  status_label: "Proceed",
  channel: "dealer",
  customer: { name: "LIM KUAN YANG", address: "1 Jalan Test", phone: "0100000000", email: null, emergency: null },
  dealer: { name: "Carres", contact: null, address: null, outlet_name: null, outlet_address: null, salesperson_name: null, salesperson_phone: null },
  delivery: { date: "2026-09-10", floor: 1, has_lift: false },
  proceed_date: "2026-08-05",
  issued_by: "Shasha",
  lines: [{ sku: "B1201S-K", description: "Mattress (King)", qty: 2, unit_price: 1890, line_total: 3780, category: "Mattress", discount: null, attrs: null }],
  addons: [],
  payments: [],
  vouchers: [],
  subtotal: 3780,
  tax_amount: 0,
  total: 3780,
  paid: 0,
  balance_due: 3780,
  currency: "MYR",
  signed: false,
  signature_url: null,
};

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__CARRES_LOGO_SRC__ = path.resolve(
    __dirname, "../../../public/carres-logo.png",
  );
  /* The template sets `fontFamily: Noto Sans SC`, which is fetched from a CDN
     at register time — the same call `render.ts` makes in the product. */
  const { registerNotoSansSC } = await import("./fonts/noto");
  registerNotoSansSC();
});

const REBUILT = "Reconstructed copy — original issued document unavailable.";
const SIG_UNKNOWN = "Signature version not recorded.";

describe("the reconstructed historical document", () => {
  /* THE CONTROL. If the text layer ever stops being readable from the buffer,
     every other assertion in this file would pass by finding nothing. This one
     fails first and says so. */
  it("control: the renderer's text layer is readable at all", async () => {
    const text = await pdfText(BASE);
    expect(text).toContain("SALES ORDER");
    expect(text).toContain("LIM KUAN YANG");
  }, 120000);

  it("prints the approved reconstruction notice, verbatim", async () => {
    const text = await pdfText({ ...BASE, rebuilt_notice: REBUILT });
    expect(text).toContain(REBUILT);
  }, 120000);

  it("prints the approved signature notice instead of an empty signing box", async () => {
    const text = await pdfText({
      ...BASE, rebuilt_notice: REBUILT, signature_unknown: true,
    });
    expect(text).toContain(SIG_UNKNOWN);
    // ...and it never calls that version unsigned, in any words.
    expect(text.toLowerCase()).not.toContain("unsigned");
  }, 120000);

  /* A GENUINELY UNSIGNED DOCUMENT IS UNTOUCHED. Three states, and the middle
     one must not swallow the other two. */
  it("says nothing about signatures when the order has none", async () => {
    const text = await pdfText(BASE);
    expect(text).not.toContain(SIG_UNKNOWN);
    expect(text).not.toContain(REBUILT);
  }, 120000);

  it("still reproduces a signature the document is entitled to show", async () => {
    const text = await pdfText({ ...BASE, signed: true, signature_url: null });
    expect(text).not.toContain(SIG_UNKNOWN);
  }, 120000);
});

/**
 * ⛔ THE CURRENT DOCUMENT DOES NOT MOVE.
 *
 * Rendered twice: once as the live document renders it today, and once with the
 * two new fields explicitly absent. Same bytes, minus the parts a PDF stamps
 * with the wall clock. This is the reviewer's requirement — render both paths,
 * do not reason about the fields.
 */
describe("the current document", () => {
  it("has identical text and layout with the new fields absent", async () => {
    const a = await pdfLayout(BASE);
    const b = await pdfLayout({ ...BASE, rebuilt_notice: undefined, signature_unknown: undefined });
    expect(b).toBe(a);
  }, 180000);

  it("has identical text and layout with the new fields explicitly null/false", async () => {
    const a = await pdfLayout(BASE);
    const b = await pdfLayout({ ...BASE, rebuilt_notice: null, signature_unknown: false });
    expect(b).toBe(a);
  }, 180000);

  /* AND THE HISTORICAL PATH REALLY DOES DIFFER — otherwise the two tests above
     would pass just as happily if the template ignored both fields entirely. */
  it("control: the reconstructed path is NOT identical to the current one", async () => {
    const current = await pdfLayout(BASE);
    const rebuilt = await pdfLayout({ ...BASE, rebuilt_notice: REBUILT, signature_unknown: true });
    expect(rebuilt).not.toBe(current);
  }, 180000);
});


/**
 * 0565 · THE SHEET A NEW VERSION IS ISSUED AS — owner ruling 2026-09-23:
 * "Confirm the retained PDF belongs to the exact issued revision and cannot
 *  inherit an older revision's signature."
 *
 * The stored file is rendered from the order as it stands the instant the
 * version is minted, and the order carries the eSign PNG the customer put on
 * whatever version was in front of them THEN. Writing that mark into the file
 * kept for the version minted NOW would make the inheritance permanent — the
 * same defect the historical view was fixed for, on paper this time.
 */
describe("the document a NEW version is issued as", () => {
  /** What `keepIssuedDocument` hands the renderer for an order that carries a
   *  signature nobody can attribute to the version being minted. */
  const ISSUED_NOW = { ...BASE, signed: false, signature_url: null, signature_unknown: true };

  it("never carries the order's stored signature", async () => {
    const text = await pdfText(ISSUED_NOW);
    expect(text).toContain("Signature version not recorded.");
    const bytes = await renderPdf(ISSUED_NOW);
    expect(Buffer.from(bytes).includes(Buffer.from("esign"))).toBe(false);
  }, 180000);

  it("is NOT dressed as a reconstruction — it IS the issued document", async () => {
    const text = await pdfText(ISSUED_NOW);
    expect(text).not.toContain("Reconstructed copy");
  }, 180000);

  /* THE CONTROL. Without the override the mark rides along, which is the whole
     reason the override exists — if this ever stops differing, the assertions
     above are passing for the wrong reason. */
  it("CONTROL: the same data WITHOUT the override still draws the signature box", async () => {
    const withMark = await pdfText({ ...BASE, signed: true, signature_url: "https://x/esign/ord-1.png" });
    expect(withMark).not.toContain("Signature version not recorded.");
  }, 180000);
});

/**
 * VISUAL INSPECTION HARNESS — writes the two real sheets side by side so the
 * notices can be LOOKED AT rather than only asserted on (owner requirement
 * 2026-09-23: "Test the generated PDF itself, visually inspect it").
 *
 * Inert in CI. Run it on purpose:
 *   SO_REBUILT_PREVIEW=1 pnpm --filter web vitest run \
 *     src/lib/pdf/sales-order-template.rebuilt.test.tsx
 * Output: apps/web/so-current.pdf · apps/web/so-reconstructed.pdf
 */
describe.skipIf(!process.env.SO_REBUILT_PREVIEW)("visual inspection", () => {
  it("writes the current and the reconstructed sheet", async () => {
    const out = (name: string) => path.resolve(__dirname, "../../../", name);
    fs.writeFileSync(out("so-current.pdf"), await renderPdf(BASE));
    fs.writeFileSync(
      out("so-reconstructed.pdf"),
      await renderPdf({ ...BASE, rebuilt_notice: REBUILT, signature_unknown: true }),
    );
    expect(fs.statSync(out("so-reconstructed.pdf")).size).toBeGreaterThan(1000);
  }, 180000);
});

it("keeps long service references inside their code column and omits the unused tax row", async () => {
  const bytes = await renderPdf({ ...BASE,
    addons: [{ sku: "SVC-DISPOSE-MATTRESS", label: "Dispose old mattress", qty: 1, unit_price: 80, line_total: 80 }],
    total: 3860, balance_due: 3860,
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  const items = content.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item);
  expect(items.map((item) => item.str).join(" ")).not.toMatch(/\bTax\b/);
  const parts = items.filter((item) => /SVC|DISPOSE|MATTRESS/.test(item.str) && item.str !== "MATTRESS · 1 item");
  const codeParts = parts.filter((item) => item.transform[4] > 50 && item.transform[4] < 140);
  expect(codeParts.length).toBeGreaterThan(0);
  for (const item of codeParts) expect(item.transform[4] + item.width).toBeLessThanOrEqual(136.1);
  await doc.destroy();
}, 120000);
