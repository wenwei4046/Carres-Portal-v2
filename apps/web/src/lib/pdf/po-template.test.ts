import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PoTemplate, poPrintDate, unitRuns } from "./po-template";
import type { PoTemplateData } from "./types";

// PO-PDF-STANDARD guard (2026-08-02). A render test only sees the branches its
// fixture reaches; a SOURCE scan holds every branch of the template to the
// Law. Two directions:
//  1. money words may not exist at all — the payload is money-free (0307) and
//     the template must stay incapable of printing a figure;
//  2. the Law's load-bearing strings must exist — if a refactor renames them,
//     the standard changed without Jess and this fails.

const SRC = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "po-template.tsx"),
  "utf8",
);

// Strip comments before the money scan — the D0.5b lesson: a scan that reads
// comments fails on the very sentence explaining why the rule exists.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Every string the element tree would print. Function components (the
 *  template's section 2, table head and total rows) are expanded; a `render`
 *  prop (the page counter) is not — react-pdf fills it at layout time. */
function renderedText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  if (!isValidElement(node)) return "";
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") {
    return renderedText((el.type as (p: unknown) => ReactNode)(el.props));
  }
  return renderedText(el.props.children);
}

/** The page-level blocks in order, and whether each one starts a new page. */
function pageBlocks(data: PoTemplateData): Array<{ text: string; breaks: boolean }> {
  const doc = PoTemplate(data) as ReactElement<{ children: ReactElement<{ children: ReactNode[] }> }>;
  const page = doc.props.children;
  const kids = (page.props.children as ReactNode[]).flat() as ReactElement<{ break?: boolean }>[];
  return kids
    .filter((k) => isValidElement(k) && !(k.props as { fixed?: boolean }).fixed)
    .map((k) => ({ text: renderedText(k), breaks: Boolean(k.props.break) }));
}

const KLANG = { name: "Carres Klang Warehouse", address: "Lot 6515, Batu 5 1/2, Jalan Kapar, 42100 Klang, Selangor" };
const AL = { name: "AL Sungai Buloh", address: "Lot 88, Jalan Industri 3, 47000 Sungai Buloh, Selangor" };
const U = (a: number, n: number) => Array.from({ length: n }, (_, i) => `U1-000-${String(a + i).padStart(3, "0")}`);

/** The owner's worked example (2026-09-22): PO-0042 V2 = the SAME 6 King as
 *  V1, 4 to Klang + 2 to AL. Same goods, same Unit IDs, one PO. */
function twoLocationV2(): PoTemplateData {
  return {
    po_number: "PO-2609-0042",
    po_id: "PO-2609-0042",
    version: 2,
    issue_date: "2026-09-21",
    supplier: { name: "Nice Future Sdn Bhd", address: "Lot 12, Johor Bahru", contact: "+60 7-236 8800" },
    destination: KLANG,
    delivery_instructions: null,
    eta_date: "2026-10-09",
    delivery_working_days: 14,
    delivery_method: "supplier_delivers",
    issued_by: "Shasha",
    so_refs: [1256, 1318, 1290],
    lines: [
      {
        sku: "B1201F-K", description: "Forte Mattress — King", qty: 4, unit: "pc", destination: KLANG,
        identity_mode: "exact_unit", unit_codes: U(1, 4), sources: [{ so: 1256, qty: 2 }, { so: 1318, qty: 2 }],
      },
      {
        sku: "B1201F-K", description: "Forte Mattress — King", qty: 2, unit: "pc", destination: AL,
        identity_mode: "exact_unit", unit_codes: U(5, 2), sources: [{ so: 1290, qty: 2 }],
      },
    ],
    terms: null,
  };
}

describe("po-template obeys docs/pdf/PO-PDF-STANDARD.md", () => {
  it("never mentions money — no price, no total, no RM, no currency", () => {
    expect(CODE).not.toMatch(/unit_price|line_total|grand_total|currency|formatMoney/);
    expect(CODE).not.toMatch(/\bRM\b/);
    expect(CODE).not.toMatch(/fabric_surcharge/);
  });

  /**
   * ⭐ 0378 + owner 2026-09-22 — THE VERSION TRAVELS WITH THE NUMBER, V1 TOO,
   * on the hero, the PO No row and the footer of EVERY page. It never prints
   * on its own (`Version` row, a second line under PURCHASE ORDER).
   */
  it("prints the number with its version from the payload, and never a Version row of its own", () => {
    expect(SRC).toMatch(/poDocumentNumberOf\(po_number, version\)/);
    expect(SRC).toMatch(/const \{ po_number, version,/);
    /* The spelling is decided in ONE shared place (Law D), so the template
       must not carry a second arithmetic for it. */
    expect(CODE).not.toMatch(/`\$\{po_number\} V/);
    expect(CODE).not.toMatch(/\["Version",/);
    expect(CODE).not.toMatch(/versionLabel/);
    const text = renderedText(PoTemplate(twoLocationV2()));
    expect(text.split("PO-2609-0042 V2").length - 1).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⭐ OWNER RULING 2026-09-23 (MASTER §6.1) — A NEW NUMBER WEARS `(n)`, AND A
   * PRE-CUTOVER ONE KEEPS ` V{n}`.
   *
   * The second half is the permanence carve-out, and it is proved on the SAME
   * template: a kept version reprints from `po_version_documents`, whose
   * payload carries the number the supplier was given, so the old paper comes
   * back spelt exactly as it was sent. No stored flag, no print-date rule.
   */
  it("a NEW-form number prints `PO260924-4827(2)` on every page", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), po_number: "PO260924-4827", po_id: "PO260924-4827" }));
    expect(text.split("PO260924-4827(2)").length - 1).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain("PO260924-4827 V2");
    expect(text).not.toContain("PO260924-4827 (2)");
  });

  it("⭐ a PRE-CUTOVER number reprints exactly as its supplier received it", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), po_number: "PO-20260904-4665", po_id: "PO-20260904-4665" }));
    expect(text).toContain("PO-20260904-4665 V2");
    expect(text).not.toContain("PO-20260904-4665(2)");
  });

  it("never invents a version — a payload without one reads version 1", () => {
    expect(CODE).not.toMatch(/version\s*\+\+|version\s*\+\s*1/);
    const old = renderedText(PoTemplate({ ...twoLocationV2(), version: undefined as unknown as number }));
    expect(old).toContain("PO-2609-0042 V1");
    const now = renderedText(PoTemplate({
      ...twoLocationV2(), po_number: "PO260924-4827", po_id: "PO260924-4827",
      version: undefined as unknown as number,
    }));
    expect(now).toContain("PO260924-4827(1)");
  });

  it("the SAME full header on every page — one fixed header, no one-line continuation", () => {
    expect(CODE).not.toMatch(/pageNumber === 1/);
    expect(CODE).not.toMatch(/subPageNumber === 1/);
    const text = renderedText(PoTemplate(twoLocationV2()));
    expect(text.split("PURCHASE ORDER").length - 1).toBe(1);
  });

  it("carries the dictionary's words, and not the retired ones", () => {
    for (const s of ["PO Doc Date", "Delivery Method", "PO TOTAL", "TOTAL", "Unit ID", "SO No",
      "Computer-generated document · No signature required.", "Top view. Back at the top. TV in front."]) {
      expect(SRC, s).toContain(s);
    }
    // `PO Date` joined this list on 2026-09-23: every document's own date reads
    // `{DOC} Doc Date` (owner ruling; DOCUMENT-KIT.md §4). It swapped places
    // with `PO Doc Date`, which the 2026-09-22 text had wrongly called retired
    // while its own row order printed it.
    for (const retired of ["Deliver by", "Issued\"", "\"PO Date\"", "Supplier Default", "Multiple destinations"]) {
      expect(CODE, retired).not.toContain(retired);
    }
    // `(1 of 2)` on a Deliver To heading is retired; the footer's `Page n of m` stays.
    expect(CODE).not.toMatch(/\(\$\{[^}]+\} of \$\{/);
  });

  it("never prints the retired word `Item ID` — the ERP word is `Unit ID` (owner ruling 2026-09-07)", () => {
    expect(SRC).not.toMatch(/Item ID/);
    expect(SRC).not.toMatch(/ITEM ID/);
    expect(SRC).toMatch(/>Unit ID</);
  });

  it("has no signature block and no End-of-PO line (both rejected by Loo)", () => {
    expect(SRC).not.toMatch(/[Ss]ignature required\. —|End of PO|Authorised Signature|Acknowledgement/);
  });

  it("items never split across pages — every row is wrap={false}", () => {
    expect(SRC).toMatch(/wrap=\{false\}/);
  });
});

describe("PO {n}-Day Delivery Date and Delivery Method (owner 2026-09-22)", () => {
  it("names the working days the payload counted, and prints the date as Fri, 9 Oct 2026", () => {
    const text = renderedText(PoTemplate(twoLocationV2()));
    expect(text).toContain("PO 14-Day\nDelivery Date");
    expect(text).toContain("Fri, 9 Oct 2026");
    expect(text).toContain("Mon, 21 Sep 2026");
    expect(text).toContain("Supplier delivers");
    expect(poPrintDate("2026-10-09")).toBe("Fri, 9 Oct 2026");
  });

  it("without a counted n the label is the plain PO Delivery Date — never a guessed number", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), delivery_working_days: null, delivery_method: null }));
    expect(text).toContain("PO Delivery Date");
    expect(text).not.toMatch(/PO \d+-Day/);
    expect(text).not.toContain("Delivery Method");
  });

  it("an unknown date reads Not recorded; a collection supplier reads We collect", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), eta_date: null, delivery_working_days: null, delivery_method: "we_collect" }));
    expect(text).toContain("Not recorded");
    expect(text).toContain("We collect");
  });
});

describe("one PO, one page group per Deliver To (owner 2026-09-22)", () => {
  it("each Deliver To starts a new page with its own name, address and TOTAL; the last closes with PO TOTAL", () => {
    const blocks = pageBlocks(twoLocationV2());
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.breaks).toBe(false);
    expect(blocks[1]!.breaks).toBe(true);
    expect(blocks[0]!.text).toContain(KLANG.name);
    expect(blocks[0]!.text).toContain(KLANG.address);
    expect(blocks[0]!.text).not.toContain(AL.name);
    expect(blocks[0]!.text).toMatch(/TOTAL\s+4/);
    expect(blocks[0]!.text).not.toContain("PO TOTAL");
    expect(blocks[1]!.text).toContain(AL.name);
    expect(blocks[1]!.text).toContain(AL.address);
    expect(blocks[1]!.text).toMatch(/TOTAL\s+2/);
    expect(blocks[1]!.text).toMatch(/PO TOTAL\s+6/);
  });

  it("# numbers run on across locations, and no page says (1 of 2)", () => {
    const blocks = pageBlocks(twoLocationV2());
    expect(blocks[1]!.text).toMatch(/\b2\b/);
    expect(blocks.map((b) => b.text).join(" ")).not.toMatch(/\(\d+ of \d+\)/);
  });

  it("a one-location PO prints one page group and no PO TOTAL", () => {
    const data = twoLocationV2();
    data.lines = [{ ...data.lines[0]!, qty: 6, destination: KLANG, unit_codes: U(1, 6) }];
    const blocks = pageBlocks(data);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toMatch(/TOTAL\s+6/);
    expect(blocks[0]!.text).not.toContain("PO TOTAL");
  });

  it("five columns on every PO — no per-line DELIVER TO column", () => {
    const heads = [...CODE.matchAll(/styles\.th[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(heads).toEqual(["#", "SO No", "Unit ID", "Description", "Qty"]);
  });
});

describe("Unit IDs — runs computed from the codes, last three digits bold", () => {
  it("consecutive codes collapse to first/last; a gap starts a new run", () => {
    expect(unitRuns(U(1, 4))).toEqual([{ first: "U1-000-001", last: "U1-000-004" }]);
    expect(unitRuns(["U1-000-107", "U1-000-109"])).toEqual([
      { first: "U1-000-107", last: null },
      { first: "U1-000-109", last: null },
    ]);
    expect(unitRuns(["U1-000-003", "U1-000-001", "U1-000-002"])).toEqual([{ first: "U1-000-001", last: "U1-000-003" }]);
  });

  it("U1-999-999 → U2-000-001 is consecutive; a grandfathered id- code stands alone", () => {
    expect(unitRuns(["U1-999-999", "U2-000-001"])).toEqual([{ first: "U1-999-999", last: "U2-000-001" }]);
    expect(unitRuns(["id-abc123456", "U1-000-001"])).toEqual([
      { first: "U1-000-001", last: null },
      { first: "id-abc123456", last: null },
    ]);
  });

  it("prints the run with `to`, and bolds only the last three digits", () => {
    const text = renderedText(PoTemplate(twoLocationV2()));
    expect(text).toMatch(/U1-000-\s*001\s+to\s+U1-000-\s*004/);
    expect(SRC).toMatch(/code\.slice\(-3\)/);
    expect(SRC).toMatch(/fontWeight: 700 \}\}>\{code\.slice\(-3\)\}/);
  });

  it("a quantity line prints —; an exact-unit line with no Unit IDs says so before it is sent", () => {
    const data = twoLocationV2();
    data.lines = [
      { sku: "PIL-STD", description: "Pillow — Standard", qty: 4, unit: "pc", identity_mode: "quantity", unit_codes: [], sources: [{ so: 1311, qty: 4 }] },
      { sku: "B1201F-K", description: "Forte Mattress — King", qty: 1, unit: "pc", identity_mode: "exact_unit", unit_codes: [], sources: [{ so: 1311, qty: 1 }] },
    ];
    const text = renderedText(PoTemplate(data));
    expect(text).toContain("—");
    expect(text).toContain("Unit IDs missing on this line — do not send this PO");
  });

  it("QTY is a count — centred, one weight", () => {
    expect(SRC).toMatch(/cellQty: \{[^}]*textAlign: "center"/);
    expect(CODE).not.toMatch(/qty > 1 \?/);
  });
});

describe("po-template prints the lineage and the issuer it is given", () => {
  it("reads SO NO from the LINE's own sources, not only the document", () => {
    expect(SRC).toContain("const soCell =");
    expect(SRC).toMatch(/line\.sources/);
    expect(SRC).toMatch(/soCell\(line\)/);
    expect(SRC).toMatch(/SO-\$\{s\.so\} × \$\{s\.qty\}/);
    expect(SRC).toMatch(/so_refs && so_refs\.length === 1/);
    expect(renderedText(PoTemplate(twoLocationV2()))).toContain("SO-1256 × 2");
  });

  it("names the issuer, and says so when the document authority has none", () => {
    expect(renderedText(PoTemplate(twoLocationV2()))).toContain("Issued by Shasha");
    expect(renderedText(PoTemplate({ ...twoLocationV2(), issued_by: null }))).toContain("Issued by Not recorded");
  });

  it("prints the supplier's own address and both party names bold", () => {
    expect(SRC).toMatch(/supplier\.address \?/);
    expect(SRC).toMatch(/\{supplier\.name\}/);
    expect(SRC.match(/fontWeight: 600 \}\]\}>\{(supplier|dest)\.name\}/g)).toHaveLength(2);
  });

  it("prints supplied provisional draft dates while reserving no official number", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), draft: true, po_number: "DRAFT", version: 0,
      issue_date: "2026-09-24", eta_date: "2026-10-05", delivery_working_days: 7, delivery_method: "supplier_delivers" }));
    expect(text).toContain("PO Doc Date");
    expect(text).toContain("24 Sep");
    expect(text).toContain("PO 7-Day");
    expect(text).toContain("Supplier delivers");
    expect(text).toContain("Assigned when issued");
    expect(text).not.toContain("V0");
  });

  it("a draft prints DRAFT, invents no number, version, date or issuer", () => {
    const text = renderedText(PoTemplate({ ...twoLocationV2(), draft: true, po_number: "DRAFT", version: 0, issue_date: "", eta_date: null }));
    expect(text).toContain("Assigned when issued");
    expect(text).toContain("DRAFT · Not issued · Do not send to supplier.");
    expect(text).not.toContain("V0");
    expect(text).not.toContain("Issued by");
    expect(text).not.toContain("Not recorded");
  });
});
