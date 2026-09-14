/**
 * ⭐ THE READ-ONLY RECORD — the resolution, and what it refuses to invent.
 *
 * `poDetailRowsForLine` turns `po_line_sources` plus the Unit read into the
 * rows the details table prints. Every assertion here is about the one thing
 * an audit register must never do: state as evidence something it inferred, or
 * drop something it could not explain.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { SoBatchOrderPoFact } from "@carres/shared";
import PoDetailsTable, { poDetailRowsForLine } from "./PoDetailsTable";

const KLANG = "klang";
const BULOH = "buloh";

const po = (over: Partial<SoBatchOrderPoFact> = {}): SoBatchOrderPoFact => ({
  poId: "PO-20260904-4665",
  status: "open",
  supplierId: "s-ohana",
  supplierName: "Ohana",
  destinationId: KLANG,
  officialDeliveryDate: "2026-09-18",
  sentCurrentVersion: true,
  ...over,
});

const PO_A = po();
const NAME = (id: string | null) =>
  id === KLANG ? "Carres Klang" : id === BULOH ? "AL Sungai Buloh" : "";

type Input = Parameters<typeof poDetailRowsForLine>[0];

const base = (over: Partial<Input> = {}) =>
  poDetailRowsForLine({
    lineKey: "l1",
    sku: "JAGER-SS",
    item: "Jager",
    itemDetail: "Super Single",
    lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 1, destinationId: KLANG }],
    unitIds: [],
    unitCoverage: {},
    unitLines: {},
    unitScopes: {},
    orderLineId: "l1",
    unitRead: "ready",
    lineRead: "answered",
    po: (id) => (id === PO_A.poId ? PO_A : undefined),
    destinationName: NAME,
    ...over,
  });

describe("poDetailRowsForLine — the lineage, resolved", () => {
  it("states the document line's own quantity when no Unit is tied to it yet", () => {
    const rows = base();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      poNo: "PO-20260904-4665",
      unitId: null,
      unitAbsence: "Not allocated",
      qty: 1,
      deliverTo: "Carres Klang",
      supplier: "Ohana",
      poDeliveryDate: "Fri, 18 Sep",
    });
  });

  it("names each exact Unit, and the remainder the Units do not account for", () => {
    const rows = base({
      lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 3, destinationId: KLANG }],
      unitIds: ["U1-000-078", "U1-000-079"],
      unitCoverage: { "U1-000-078": PO_A.poId, "U1-000-079": PO_A.poId },
      unitLines: { "U1-000-078": "l1", "U1-000-079": "l1" },
    });
    expect(rows.map((r) => [r.unitId, r.qty])).toEqual([
      ["U1-000-078", 1],
      ["U1-000-079", 1],
      [null, 1],
    ]);
    expect(rows.every((r) => r.association === "exact")).toBe(true);
    /* THE NUMBERS ADD UP: the document line carries 3 and the rows state 3. */
    expect(rows.reduce((s, r) => s + (r.qty ?? 0), 0)).toBe(3);
  });
});

/* ─── THE DOCUMENT LINE'S OWN DESTINATION ────────────────────────────────── */

describe("a purchase order that sends one SKU to two places", () => {
  /* ⭐ A PARENT SUMMARY MAY NEVER STAND IN FOR A LINE'S OWN RECORDED FACT.
     One document, two lines, two destinations, both sourced to this item
     line — the register must print each line's own, not the document's. */
  const SPLIT = base({
    lineage: [
      { poId: PO_A.poId, poLineId: "pol-1", qty: 1, destinationId: KLANG },
      { poId: PO_A.poId, poLineId: "pol-2", qty: 2, destinationId: BULOH },
    ],
  });

  it("keeps the two document LINES apart, each with its own Deliver To and qty", () => {
    expect(SPLIT).toHaveLength(2);
    expect(SPLIT.map((r) => [r.poNo, r.deliverTo, r.qty])).toEqual([
      ["PO-20260904-4665", "Carres Klang", 1],
      ["PO-20260904-4665", "AL Sungai Buloh", 2],
    ]);
    /* Two rows of one document need two keys, or React draws one. */
    expect(new Set(SPLIT.map((r) => r.key)).size).toBe(2);
  });

  it("never replaces a line's recorded destination with the document's", () => {
    /* The DOCUMENT says Carres Klang. The LINE says AL Sungai Buloh. The line
       wins — that is the fact the goods actually travel by. */
    const rows = base({
      lineage: [{ poId: PO_A.poId, poLineId: "pol-2", qty: 1, destinationId: BULOH }],
    });
    expect(rows[0]!.deliverTo).toBe("AL Sungai Buloh");
  });

  it("falls back to the document ONLY where the line records none", () => {
    const rows = base({
      lineage: [{ poId: PO_A.poId, poLineId: "pol-3", qty: 1, destinationId: null }],
    });
    /* `null` is a RESOLVED answer meaning "nobody recorded one" — the server
       has already applied the document's own where the line had none, so this
       may not silently become the parent's. */
    expect(rows[0]!.deliverTo).toBeNull();
  });
});

/* ─── ABSENCE PROVES NOTHING ─────────────────────────────────────────────── */

describe("how a Unit reached this item line", () => {
  const withUnit = (over: Partial<Input>) =>
    base({
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": PO_A.poId },
      ...over,
    });

  it("is EXACT when the record binds it to this line", () => {
    expect(withUnit({ unitLines: { "U1-000-078": "l1" } })[0]!.association).toBe("exact");
  });

  /* ⛔ NOT A GUESS DRESSED AS EVIDENCE. */
  it("is INFERRED when the binding names another item line", () => {
    const rows = withUnit({ unitLines: { "U1-000-078": "SOME-OTHER-LINE" } });
    const unitRow = rows.find((r) => r.unitId === "U1-000-078")!;
    expect(unitRow.association).toBe("inferred");
  });

  it("is INFERRED when the record carries no binding at all", () => {
    expect(withUnit({ unitLines: { "U1-000-078": null } })[0]!.association).toBe("inferred");
  });

  /**
   * ⭐ THE HOLE THIS CLOSES (owner correction 2026-09-11). A Unit MISSING from
   * the map used to be read as exact, on the true-but-fragile ground that only
   * incoming goods are absent and those carry exclusive document evidence.
   * That made a gap in the DATA prove a fact about the GOODS. The server now
   * DECLARES the incoming-exclusive binding, so absence means nothing
   * evidenced it — and nothing evidenced is never exact.
   */
  it("is UNRESOLVED when nothing in the read evidences it — absence proves nothing", () => {
    expect(withUnit({ unitLines: {} })[0]!.association).toBe("unresolved");
    expect(withUnit({ unitLines: undefined })[0]!.association).toBe("unresolved");
  });
});

/* ─── AN INFERENCE IS NEVER COVERAGE ─────────────────────────────────────── */

describe("an inferred Unit is evidence, not coverage", () => {
  const rows = base({
    lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 2, destinationId: KLANG }],
    unitIds: ["U1-000-078", "U1-000-079"],
    unitCoverage: { "U1-000-078": PO_A.poId, "U1-000-079": PO_A.poId },
    /* One bound here, one bound nowhere — the SKU match put both on this line,
       and the same physical Unit is on the order's OTHER line of this SKU. */
    unitLines: { "U1-000-078": "l1", "U1-000-079": null },
  });

  it("carries no quantity, so one physical Unit cannot answer two item lines", () => {
    const inferred = rows.find((r) => r.unitId === "U1-000-079")!;
    expect(inferred.association).toBe("inferred");
    expect(inferred.qty).toBeNull();
  });

  it("does not draw the document line's remainder down", () => {
    /* 2 on the document line, ONE exact Unit → the remainder is 1, not 0. An
       inferred Unit reducing it would hide a genuinely unallocated unit behind
       a Unit that may belong to the order's other line. */
    const remainder = rows.find((r) => r.unitId === null)!;
    expect(remainder.qty).toBe(1);
    expect(rows.reduce((s, r) => s + (r.qty ?? 0), 0)).toBe(2);
  });

  it("is still SHOWN, and says what kind of claim it is", () => {
    expect(rows.map((r) => r.unitId)).toContain("U1-000-079");
    render(<PoDetailsTable label="Purchase order details" rows={rows} />);
    expect(screen.getByText("Item line matched by SKU")).toBeInTheDocument();
  });
});

/* ─── FIVE ANSWERS, NEVER ONE ────────────────────────────────────────────── */

describe("what an empty Unit cell means", () => {
  it("says which kind of nothing it is, and never borrows another's word", () => {
    expect(base({ unitRead: "loading" })[0]!.unitAbsence).toBe("Loading…");
    expect(base({ unitRead: "error" })[0]!.unitAbsence).toBe("Could not be loaded");
    /* The read ANSWERED and covered this line: a confirmed absence. */
    expect(base({ unitRead: "ready", lineRead: "answered" })[0]!.unitAbsence).toBe(
      "Not allocated",
    );
    /* The read answered for the ORDER and carried no entry for this line —
       Carres did not look here, which is not the same as looking and finding
       nothing. */
    expect(base({ unitRead: "ready", lineRead: "absent" })[0]!.unitAbsence).toBe("Not checked");
  });

  /**
   * ⭐ A COUNTED ROW IS NOT A UNIT (0453 · `unit-identity.ts`). Its technical
   * `QTY-` key is a database fact that no operator has ever seen on a label.
   */
  it("never lets a counted row's technical key reach a Unit ID heading", () => {
    const rows = base({
      unitIds: ["QTY-000000001"],
      unitCoverage: { "QTY-000000001": PO_A.poId },
      unitLines: { "QTY-000000001": "l1" },
      unitScopes: { "QTY-000000001": "quantity" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unitId).toBeNull();
    expect(rows[0]!.unitAbsence).toBe("Counted stock");
    /* And the quantity is still stated — the goods exist, they simply have no
       identity to print. */
    expect(rows[0]!.qty).toBe(1);
    render(<PoDetailsTable label="Purchase order details" rows={rows} />);
    expect(screen.queryByText(/QTY-/)).toBeNull();
  });

  it("catches a counted row by its SHAPE when the scope was not carried", () => {
    const rows = base({
      unitIds: ["QTY-000000002"],
      unitCoverage: { "QTY-000000002": PO_A.poId },
      unitLines: { "QTY-000000002": "l1" },
      unitScopes: undefined,
    });
    expect(rows[0]!.unitId).toBeNull();
    expect(rows[0]!.unitAbsence).toBe("Counted stock");
  });
});

/* ─── NOTHING SUMS AN INFERENCE ──────────────────────────────────────────── */

describe("an inferred row is excluded from every total", () => {
  const rows = base({
    lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 2, destinationId: KLANG }],
    unitIds: ["U1-000-078", "U1-000-079"],
    unitCoverage: { "U1-000-078": PO_A.poId, "U1-000-079": PO_A.poId },
    unitLines: { "U1-000-078": "l1", "U1-000-079": null },
  });

  it("sums to the document line's own quantity, never more", () => {
    /* One exact Unit (1) + the remainder (1) = the document line's 2. The
       inferred row contributes NOTHING, because its quantity is already inside
       the remainder — counting it would state 3 units on a 2-unit line. */
    expect(rows.reduce((s, r) => s + (r.qty ?? 0), 0)).toBe(2);
    expect(rows.filter((r) => r.qty == null)).toHaveLength(1);
  });

  it("⛔ renders no total row, so no footer can silently include a dash", () => {
    render(<PoDetailsTable label="Purchase order details" rows={rows} />);
    const table = screen.getByTestId("po-details-table").querySelector("table")!;
    expect(table.querySelector("tfoot")).toBeNull();
    /* And the register above exports the ORDER's own columns, none of which is
       a per-Unit quantity — this table feeds no export at all. */
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });
});

/* ─── THE DOCUMENT'S OWN STATE ───────────────────────────────────────────── */

describe("PO Status — the fact that makes On PO legible", () => {
  it("speaks the one Purchasing vocabulary, never the raw database word", () => {
    const received = base({ po: () => po({ status: "received" }) })[0]!;
    expect(received.poStatus).toBe("Completed");

    const issued = base({ po: () => po({ status: "open", sentCurrentVersion: true }) })[0]!;
    expect(issued.poStatus).toBe("Issued");

    const unsent = base({ po: () => po({ status: "open", sentCurrentVersion: false }) })[0]!;
    expect(unsent.poStatus).toBe("Not sent to supplier");

    /* ⛔ `Open` is never a Purchase Order status (COPY-STANDARD). */
    for (const r of [received, issued, unsent]) expect(r.poStatus).not.toBe("open");
  });
});

/* ─── WHAT IT REFUSES TO INVENT OR DROP ──────────────────────────────────── */

describe("what the record refuses to invent or drop", () => {
  it("keeps a Unit naming a document this line's lineage does not carry", () => {
    const rows = base({
      lineage: [],
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": "PO-20260101-0001" },
      unitLines: { "U1-000-078": "l1" },
    });
    expect(rows.map((r) => r.poNo)).toEqual(["PO-20260101-0001"]);
    /* It is outside this line's lineage, so it answers none of its quantity. */
    expect(rows[0]!.qty).toBeNull();
  });

  it("leaves a Unit with no document out of the purchase-order record", () => {
    const rows = base({
      lineage: [],
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": null },
      unitLines: { "U1-000-078": "l1" },
    });
    expect(rows).toEqual([]);
  });

  it("never invents a Unit for a quantity the document carries", () => {
    const rows = base({
      lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 5, destinationId: KLANG }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unitId).toBeNull();
    expect(rows[0]!.qty).toBe(5);
  });
});

describe("PoDetailsTable — the read-only presentation", () => {
  const rows = base({
    lineage: [{ poId: PO_A.poId, poLineId: "pol-1", qty: 2, destinationId: KLANG }],
    unitIds: ["U1-000-078"],
    unitCoverage: { "U1-000-078": PO_A.poId },
    unitLines: { "U1-000-078": "l1" },
  });

  it("leads with PO No and Unit ID, side by side, in full", () => {
    render(<PoDetailsTable label="Purchase order details for SO-1203" rows={rows} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "PO No", "Unit ID", "SKU", "Item", "Qty", "Deliver To", "Supplier",
      "PO Status", "PO Delivery Date",
    ]);
    /* ⛔ COLUMNS THAT WOULD ONLY EVER PRINT A DASH HERE ARE ABSENT. */
    expect(headers).not.toContain("Ready Stock");
    expect(headers).not.toContain("To buy");
    expect(headers).not.toContain("Category");
    /* `PO-20260904-4665`, never `PO-260904-4665`. */
    expect(screen.getAllByText("PO-20260904-4665").length).toBeGreaterThan(0);
    /* The six-digit short form is what a "tidier" column would have printed. */
    expect(screen.getByTestId("po-details-table").textContent).not.toMatch(/PO-\d{6}-/);
  });

  it("carries no control at all — a record cannot be bought again", () => {
    render(<PoDetailsTable label="Purchase order details for SO-1203" rows={rows} />);
    const table = screen.getByTestId("po-details-table");
    expect(within(table).queryByRole("checkbox")).toBeNull();
    expect(within(table).queryByRole("combobox")).toBeNull();
    expect(within(table).queryByRole("textbox")).toBeNull();
  });

  it("opens a document only where the page gives it somewhere to go", () => {
    render(<PoDetailsTable label="Purchase order details" rows={rows} />);
    expect(screen.queryByRole("button", { name: "PO-20260904-4665" })).toBeNull();
  });
});
