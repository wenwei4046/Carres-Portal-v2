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

const PO_A: SoBatchOrderPoFact = {
  poId: "PO-20260904-4665",
  status: "open",
  supplierId: "s-ohana",
  supplierName: "Ohana",
  destinationId: "klang",
  officialDeliveryDate: "2026-09-18",
  sentCurrentVersion: true,
};

const base = (over: Partial<Parameters<typeof poDetailRowsForLine>[0]> = {}) =>
  poDetailRowsForLine({
    lineKey: "l1",
    sku: "JAGER-SS",
    item: "Jager",
    itemDetail: "Super Single",
    lineage: [{ poId: PO_A.poId, qty: 1 }],
    unitIds: [],
    unitCoverage: {},
    unitLines: {},
    orderLineId: "l1",
    unitRead: "ready",
    po: (id) => (id === PO_A.poId ? PO_A : undefined),
    destinationName: (id) => (id === "klang" ? "Carres Klang" : ""),
    ...over,
  });

describe("poDetailRowsForLine — the lineage, resolved", () => {
  it("states the document's own quantity when no Unit is tied to it yet", () => {
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
      lineage: [{ poId: PO_A.poId, qty: 3 }],
      unitIds: ["U1-000-078", "U1-000-079"],
      unitCoverage: { "U1-000-078": PO_A.poId, "U1-000-079": PO_A.poId },
      unitLines: { "U1-000-078": "l1", "U1-000-079": "l1" },
    });
    expect(rows.map((r) => [r.unitId, r.qty])).toEqual([
      ["U1-000-078", 1],
      ["U1-000-079", 1],
      [null, 1],
    ]);
    expect(rows.every((r) => r.associationRecorded)).toBe(true);
  });

  /* ⛔ NOT A GUESS DRESSED AS EVIDENCE. A Unit whose stored binding names
     another item line is NOT this line's Unit, whatever SKU it wears. */
  it("refuses a Unit whose stored binding names a different item line", () => {
    const rows = base({
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": PO_A.poId },
      unitLines: { "U1-000-078": "SOME-OTHER-LINE" },
    });
    const unitRow = rows.find((r) => r.unitId === "U1-000-078")!;
    /* It is still SHOWN — evidence is never dropped to tidy a screen — and it
       says the association is not this line's. */
    expect(unitRow.associationRecorded).toBe(false);
  });

  it("treats a Unit the record carries no binding for as unresolved, not as evidence", () => {
    const rows = base({
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": PO_A.poId },
      unitLines: { "U1-000-078": null },
    });
    expect(rows[0]!.associationRecorded).toBe(false);
  });

  /* A Unit incoming on a purchase-order line sourced EXCLUSIVELY to this item
     line never reaches `unitLines` at all — the document itself evidences it. */
  it("accepts a Unit the document evidences exclusively", () => {
    const rows = base({
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": PO_A.poId },
      unitLines: {},
    });
    expect(rows[0]!.associationRecorded).toBe(true);
  });

  it("says which kind of nothing an empty Unit cell is", () => {
    expect(base({ unitRead: "loading" })[0]!.unitAbsence).toBe("Loading…");
    expect(base({ unitRead: "error" })[0]!.unitAbsence).toBe("Could not be loaded");
    expect(base({ unitRead: "ready" })[0]!.unitAbsence).toBe("Not allocated");
  });

  /* ⭐ A DISAGREEMENT BETWEEN TWO AUTHORITATIVE READS IS PRINTED, NOT HIDDEN. */
  it("keeps a Unit naming a document this line's lineage does not carry", () => {
    const rows = base({
      lineage: [],
      unitIds: ["U1-000-078"],
      unitCoverage: { "U1-000-078": "PO-20260101-0001" },
      unitLines: { "U1-000-078": "l1" },
    });
    expect(rows.map((r) => r.poNo)).toEqual(["PO-20260101-0001"]);
  });

  /* A Unit with no document behind it is READY STOCK's answer, and that
     section names it. It must not appear as purchase-order evidence. */
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
    const rows = base({ lineage: [{ poId: PO_A.poId, qty: 5 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unitId).toBeNull();
    expect(rows[0]!.qty).toBe(5);
  });
});

describe("PoDetailsTable — the read-only presentation", () => {
  const rows = base({
    lineage: [{ poId: PO_A.poId, qty: 2 }],
    unitIds: ["U1-000-078"],
    unitCoverage: { "U1-000-078": PO_A.poId },
    unitLines: { "U1-000-078": "l1" },
  });

  it("leads with PO No and Unit ID, side by side, in full", () => {
    render(<PoDetailsTable label="Purchase order details for SO-1203" rows={rows} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "PO No", "Unit ID", "SKU", "Item", "Qty", "Deliver To", "Supplier", "PO Delivery Date",
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
