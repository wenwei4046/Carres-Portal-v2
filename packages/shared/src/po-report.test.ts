import { describe, expect, it } from "vitest";
import {
  PO_REPORT_WORDS,
  buildPoReport,
  poReportCategoryLabel,
  poReportEmpty,
  poReportRowDetail,
  type PoReportLine,
} from "./po-report";

/**
 * Q3 — the Report tab's arithmetic.
 *
 * The fixture is the LIVE production shape, measured 2026-08-04, so the
 * expectations below are the same numbers the deployed page has to print:
 *
 *   month     category    POs   ordered   received   outstanding
 *   2026-07   sofa          5        12          0            12
 *   2026-07   bedframe      1         6          0             6
 *   2026-07   mattress      1         5          0             5
 *   2026-08   sofa          8        11          0            11
 *   2026-08   bedframe      3         4          0             4
 *   2026-08   mattress      3         4          0             4
 */

const OHANA = "sup-ohana";
const NICE = "sup-nice";

function line(p: Partial<PoReportLine> & { poId: string }): PoReportLine {
  return {
    supplierId: OHANA,
    supplierName: "Ohana",
    month: "2026-08",
    category: "sofa",
    cancelled: false,
    ordered: 1,
    received: 0,
    ...p,
  };
}

/** The August half of the live shape, one line per purchase order. */
function august(): PoReportLine[] {
  const rows: PoReportLine[] = [];
  // sofa — 8 POs, 11 units
  const sofaQty = [2, 2, 1, 1, 1, 1, 2, 1];
  sofaQty.forEach((q, i) => rows.push(line({ poId: `PO-30${i}`, ordered: q })));
  // bedframe — 3 POs, 4 units
  [2, 1, 1].forEach((q, i) =>
    rows.push(line({ poId: `PO-31${i}`, category: "bedframe", ordered: q })),
  );
  // mattress — 3 POs, 4 units, Nice Future
  [2, 1, 1].forEach((q, i) =>
    rows.push(
      line({
        poId: `PO-32${i}`,
        category: "mattress",
        ordered: q,
        supplierId: NICE,
        supplierName: "Nice Future",
      }),
    ),
  );
  return rows;
}

describe("buildPoReport — the figures", () => {
  it("prints the live August shape, most first", () => {
    const r = buildPoReport(august(), { month: "2026-08" });
    expect(r.rows.map((x) => [x.label, x.pos, x.ordered, x.received, x.outstanding])).toEqual([
      ["Sofa", 8, 11, 0, 11],
      ["Bedframe", 3, 4, 0, 4],
      ["Mattress", 3, 4, 0, 4],
    ]);
  });

  it("Outstanding is PRINTED, never left as a subtraction", () => {
    const r = buildPoReport(
      [line({ poId: "PO-1", ordered: 5, received: 2 })],
      {},
    );
    expect(r.rows[0]!.outstanding).toBe(3);
    expect(r.total.outstanding).toBe(3);
  });

  it("the Total row is the DISTINCT purchase orders, not the sum of the groups", () => {
    // ONE purchase order carrying two categories. Summing the group counts
    // would report it twice.
    const rows = [
      line({ poId: "PO-9", category: "sofa", ordered: 1 }),
      line({ poId: "PO-9", category: "mattress", ordered: 2 }),
    ];
    const r = buildPoReport(rows, {});
    expect(r.rows.map((x) => x.pos)).toEqual([1, 1]);
    expect(r.total.pos).toBe(1);
    expect(r.total.ordered).toBe(3);
  });

  it("the whole live year totals 21 purchase orders and 42 units", () => {
    const july: PoReportLine[] = [];
    [3, 3, 2, 2, 2].forEach((q, i) =>
      july.push(line({ poId: `PO-20${i}`, month: "2026-07", ordered: q })),
    );
    july.push(line({ poId: "PO-210", month: "2026-07", category: "bedframe", ordered: 6 }));
    july.push(
      line({
        poId: "PO-220",
        month: "2026-07",
        category: "mattress",
        ordered: 5,
        supplierId: NICE,
        supplierName: "Nice Future",
      }),
    );
    const r = buildPoReport([...july, ...august()], {});
    expect(r.total.pos).toBe(21);
    expect(r.total.ordered).toBe(42);
  });
});

describe("buildPoReport — cancelled purchase orders", () => {
  it("does not count a cancelled purchase order anywhere", () => {
    const rows = [
      line({ poId: "PO-1", ordered: 4 }),
      line({ poId: "PO-2", ordered: 6, cancelled: true }),
    ];
    const r = buildPoReport(rows, {});
    expect(r.total.pos).toBe(1);
    expect(r.total.ordered).toBe(4);
    expect(r.rows[0]!.poIds).toEqual(["PO-1"]);
  });

  it("a cancelled purchase order is not offered as a rail option either", () => {
    const rows = [
      line({ poId: "PO-1", ordered: 1 }),
      line({
        poId: "PO-2",
        ordered: 1,
        cancelled: true,
        month: "2026-05",
        supplierId: NICE,
        supplierName: "Nice Future",
      }),
    ];
    const r = buildPoReport(rows, {});
    expect(r.months.map((m) => m.value)).toEqual(["2026-08"]);
    expect(r.suppliers.map((s) => s.name)).toEqual(["Ohana"]);
  });
});

describe("buildPoReport — every number is a door", () => {
  it("a row carries exactly the purchase orders its own count was made of", () => {
    const r = buildPoReport(august(), { month: "2026-08" });
    const sofa = r.rows.find((x) => x.key === "sofa")!;
    expect(sofa.poIds).toHaveLength(sofa.pos);
    expect(new Set(sofa.poIds).size).toBe(sofa.pos);
    expect(sofa.poIds.every((id) => id.startsWith("PO-30"))).toBe(true);
  });

  it("a purchase order is listed once however many lines it has in the group", () => {
    const rows = [
      line({ poId: "PO-7", ordered: 2 }),
      line({ poId: "PO-7", ordered: 3 }),
    ];
    const r = buildPoReport(rows, {});
    expect(r.rows[0]!.pos).toBe(1);
    expect(r.rows[0]!.poIds).toEqual(["PO-7"]);
    expect(r.rows[0]!.ordered).toBe(5);
  });
});

describe("poReportRowDetail — the door opens on exactly what was counted", () => {
  it("lists the same purchase orders the row's own count names", () => {
    const lines = august();
    const filters = { month: "2026-08" };
    const r = buildPoReport(lines, filters);
    for (const row of r.rows) {
      const detail = poReportRowDetail(lines, filters, row.key);
      expect(detail.map((p) => p.poId)).toEqual(row.poIds);
      expect(detail.reduce((n, p) => n + p.ordered, 0)).toBe(row.ordered);
      expect(detail.reduce((n, p) => n + p.received, 0)).toBe(row.received);
      expect(detail.reduce((n, p) => n + p.outstanding, 0)).toBe(row.outstanding);
    }
  });

  it("obeys the SAME filters as the row above it", () => {
    const lines = [
      line({ poId: "PO-1", month: "2026-07" }),
      line({ poId: "PO-2", month: "2026-08" }),
    ];
    expect(poReportRowDetail(lines, { month: "2026-08" }, "sofa").map((p) => p.poId)).toEqual([
      "PO-2",
    ]);
  });

  it("never opens on a cancelled purchase order", () => {
    const lines = [
      line({ poId: "PO-1" }),
      line({ poId: "PO-2", cancelled: true }),
    ];
    expect(poReportRowDetail(lines, {}, "sofa").map((p) => p.poId)).toEqual(["PO-1"]);
  });
});

describe("buildPoReport — the filters", () => {
  it("the month filter changes the figures", () => {
    const all = [
      line({ poId: "PO-1", month: "2026-07", ordered: 12 }),
      line({ poId: "PO-2", month: "2026-08", ordered: 11 }),
    ];
    expect(buildPoReport(all, {}).total.ordered).toBe(23);
    expect(buildPoReport(all, { month: "2026-07" }).total.ordered).toBe(12);
    expect(buildPoReport(all, { month: "2026-08" }).total.ordered).toBe(11);
  });

  it("a facet is counted with every OTHER filter and never with its own", () => {
    const rows = [
      line({ poId: "PO-1", supplierId: OHANA, supplierName: "Ohana", category: "sofa" }),
      line({
        poId: "PO-2",
        supplierId: NICE,
        supplierName: "Nice Future",
        category: "mattress",
      }),
    ];
    // Ohana is picked. Nice Future must still show its own real count, or
    // there would be no way back to it.
    const r = buildPoReport(rows, { supplierId: OHANA });
    expect(r.suppliers).toEqual([
      { value: NICE, name: "Nice Future", pos: 1 },
      { value: OHANA, name: "Ohana", pos: 1 },
    ]);
    // The CATEGORY facet, however, is counted inside the Ohana pick.
    expect(r.categories).toEqual([
      { value: "mattress", pos: 0 },
      { value: "sofa", pos: 1 },
    ]);
  });

  it("months come back newest first", () => {
    const rows = [
      line({ poId: "PO-1", month: "2026-07" }),
      line({ poId: "PO-2", month: "2026-08" }),
      line({ poId: "PO-3", month: "2026-06" }),
    ];
    expect(buildPoReport(rows, {}).months.map((m) => m.value)).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
  });
});

describe("buildPoReport — a line the catalog cannot place", () => {
  it("counts it rather than dropping it, under the portal's own null glyph", () => {
    const rows = [
      line({ poId: "PO-1", category: "sofa", ordered: 2 }),
      line({ poId: "PO-2", category: null, ordered: 3 }),
    ];
    const r = buildPoReport(rows, {});
    expect(r.total.ordered).toBe(5);
    expect(r.total.pos).toBe(2);
    expect(r.rows.find((x) => x.key === "")!.label).toBe("—");
  });
});

describe("the words", () => {
  it("carries the six Loo ruled and spells the tab singular", () => {
    expect(PO_REPORT_WORDS.tab).toBe("Report");
    expect(PO_REPORT_WORDS.colPos).toBe("POs");
    expect(PO_REPORT_WORDS.colOrdered).toBe("Ordered");
    expect(PO_REPORT_WORDS.colReceived).toBe("Received");
    expect(PO_REPORT_WORDS.colOutstanding).toBe("Outstanding");
    expect(PO_REPORT_WORDS.total).toBe("Total");
  });

  it("no money word can reach the page", () => {
    const words = JSON.stringify(PO_REPORT_WORDS);
    expect(words).not.toMatch(/\bRM\b|cost|price|amount|value|MYR|\$/i);
  });

  it("an empty month says which month, never a bare zero", () => {
    expect(poReportEmpty("Aug 2026")).toBe("No purchase orders in Aug 2026.");
    expect(poReportEmpty(null)).toBe("No purchase orders.");
  });

  it("the rail and the grid read ONE category spelling", () => {
    expect(poReportCategoryLabel("sofa")).toBe("Sofa");
    expect(poReportCategoryLabel("")).toBe("—");
    const r = buildPoReport([{ ...line({ poId: "PO-1" }) }], {});
    expect(r.rows[0]!.label).toBe(poReportCategoryLabel("sofa"));
  });
});
