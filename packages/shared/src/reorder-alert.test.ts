import { describe, it, expect } from "vitest";
import {
  computeReorderRows,
  importAccessoryKind,
  reorderAlertCount,
  reorderUnsetCount,
  IMPORT_LEAD_DAYS_DEFAULT,
  type ReorderStockUnit,
} from "./reorder-alert";

/**
 * The three SKU strings below are the REAL ones on prod (measured 2026-07-27),
 * free-text names from Jess's Klg sheet — not catalog codes. Keeping the live
 * spellings in the fixtures is the point: the classifier has to survive them.
 */
const PILLOW = "Essential Memory Pillow(L)";
const MP_Q = "Microfiber Waterproof Mattress Protector-Q";
const MP_K = "Microfiber Waterproof Mattress Protector-K";
const MATTRESS = "Breeze FirmCare-B1201F-K";

/** The live pool on 2026-07-27: pillow 555 · protector-Q 319 · protector-K 15. */
const LIVE: ReorderStockUnit[] = [
  { sku: PILLOW, status: "free", qty: 555 },
  { sku: MP_Q, status: "free", qty: 319 },
  { sku: MP_K, status: "free", qty: 15 },
  { sku: MATTRESS, status: "free", qty: 1 },
];

describe("importAccessoryKind", () => {
  it("names the imported accessories by the word the operator already sees", () => {
    expect(importAccessoryKind(PILLOW)).toBe("Pillow");
    expect(importAccessoryKind(MP_Q)).toBe("Mattress protector");
    expect(importAccessoryKind("Mattress Topper - Queen")).toBe("Topper");
  });

  it("is not fooled by 'Mattress Protector' looking like a mattress", () => {
    expect(importAccessoryKind(MP_K)).toBe("Mattress protector");
    expect(importAccessoryKind(MATTRESS)).toBeNull();
  });

  it("excludes non-imported accessories (disposal / service charges)", () => {
    expect(importAccessoryKind("Disposal - old mattress")).toBeNull();
    expect(importAccessoryKind("Transport fee")).toBeNull();
  });
});

describe("computeReorderRows — the <200 case", () => {
  it("fires on the protector-K at 15 while it still has stock on the floor", () => {
    const rows = computeReorderRows(LIVE, [
      { sku: PILLOW, reorderPoint: 200, leadDays: IMPORT_LEAD_DAYS_DEFAULT },
      { sku: MP_Q, reorderPoint: 200, leadDays: IMPORT_LEAD_DAYS_DEFAULT },
      { sku: MP_K, reorderPoint: 200, leadDays: IMPORT_LEAD_DAYS_DEFAULT },
    ]);
    const k = rows.find((r) => r.sku === MP_K)!;
    expect(k.state).toBe("reorder");
    expect(k.onHand).toBe(15);
    expect(k.shortfall).toBe(185);
    // ...and it is NOT discovered by hitting zero — there are still 15 there.
    expect(k.onHand).toBeGreaterThan(0);

    expect(rows.find((r) => r.sku === PILLOW)!.state).toBe("ok");
    expect(rows.find((r) => r.sku === MP_Q)!.state).toBe("ok");
    expect(reorderAlertCount(rows)).toBe(1);
  });

  it("sorts the SKU needing a PO to the top", () => {
    const rows = computeReorderRows(LIVE, [
      { sku: PILLOW, reorderPoint: 200 },
      { sku: MP_Q, reorderPoint: 200 },
      { sku: MP_K, reorderPoint: 200 },
    ]);
    expect(rows[0].sku).toBe(MP_K);
  });

  it("counts a bulk row by its qty, never as one unit", () => {
    const rows = computeReorderRows([{ sku: PILLOW, status: "free", qty: 555 }], [
      { sku: PILLOW, reorderPoint: 200 },
    ]);
    expect(rows[0].onHand).toBe(555);
    expect(rows[0].state).toBe("ok");
  });

  it("treats a missing qty as one unit", () => {
    const rows = computeReorderRows([{ sku: PILLOW, status: "free" }], [
      { sku: PILLOW, reorderPoint: 200 },
    ]);
    expect(rows[0].onHand).toBe(1);
  });
});

describe("computeReorderRows — cover, not just what is on the shelf", () => {
  it("a placed order silences the alert (incoming counts toward cover)", () => {
    const rows = computeReorderRows(
      [
        { sku: MP_K, status: "free", qty: 15 },
        { sku: MP_K, status: "incoming", qty: 400 },
      ],
      [{ sku: MP_K, reorderPoint: 200 }],
    );
    expect(rows[0].incoming).toBe(400);
    expect(rows[0].cover).toBe(415);
    expect(rows[0].state).toBe("ok");
  });

  it("reserved units are shown but never counted as cover", () => {
    const rows = computeReorderRows(
      [
        { sku: MP_K, status: "free", qty: 15 },
        { sku: MP_K, status: "reserved", qty: 300 },
      ],
      [{ sku: MP_K, reorderPoint: 200 }],
    );
    expect(rows[0].reserved).toBe(300);
    expect(rows[0].cover).toBe(15);
    expect(rows[0].state).toBe("reorder");
  });

  it("sold / voided / transferred units are not stock", () => {
    const rows = computeReorderRows(
      [
        { sku: MP_K, status: "sold", qty: 500 },
        { sku: MP_K, status: "voided", qty: 500 },
        { sku: MP_K, status: "transferred", qty: 500 },
        { sku: MP_K, status: "free", qty: 15 },
      ],
      [{ sku: MP_K, reorderPoint: 200 }],
    );
    expect(rows[0].cover).toBe(15);
    expect(rows[0].state).toBe("reorder");
  });
});

describe("computeReorderRows — the three states", () => {
  it("fires exactly AT the point, not one unit later", () => {
    const rows = computeReorderRows([{ sku: MP_K, status: "free", qty: 200 }], [
      { sku: MP_K, reorderPoint: 200 },
    ]);
    expect(rows[0].state).toBe("reorder");
    expect(rows[0].shortfall).toBe(0);
  });

  it("stays quiet one unit above the point", () => {
    const rows = computeReorderRows([{ sku: MP_K, status: "free", qty: 201 }], [
      { sku: MP_K, reorderPoint: 200 },
    ]);
    expect(rows[0].state).toBe("ok");
  });

  it("point 0 is the OFF switch — an empty shelf raises nothing", () => {
    const rows = computeReorderRows([{ sku: MP_K, status: "free", qty: 0 }], [
      { sku: MP_K, reorderPoint: 0 },
    ]);
    expect(rows[0].state).toBe("ok");
    expect(reorderAlertCount(rows)).toBe(0);
  });

  it("an import accessory with no number set reads `unset`, not `ok`", () => {
    const rows = computeReorderRows(LIVE, []);
    const pillow = rows.find((r) => r.sku === PILLOW)!;
    expect(pillow.state).toBe("unset");
    expect(pillow.reorderPoint).toBeNull();
    expect(reorderUnsetCount(rows)).toBe(3);
    // A silent screen must mean "configured and fine", never "nobody looked".
    expect(reorderAlertCount(rows)).toBe(0);
  });

  it("keeps watching a SKU whose last unit left the building", () => {
    const rows = computeReorderRows([{ sku: MATTRESS, status: "free", qty: 1 }], [
      { sku: MP_K, reorderPoint: 200 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe(MP_K);
    expect(rows[0].onHand).toBe(0);
    expect(rows[0].state).toBe("reorder");
    expect(rows[0].shortfall).toBe(200);
  });
});

describe("computeReorderRows — who gets a row", () => {
  it("ordinary furniture never appears on its own", () => {
    const rows = computeReorderRows(LIVE, []);
    expect(rows.map((r) => r.sku)).not.toContain(MATTRESS);
  });

  it("...but does once someone gives it a reorder point", () => {
    const rows = computeReorderRows(LIVE, [{ sku: MATTRESS, reorderPoint: 5 }]);
    const m = rows.find((r) => r.sku === MATTRESS)!;
    expect(m.kind).toBeNull();
    expect(m.state).toBe("reorder");
  });

  it("ignores blank SKUs on both sides", () => {
    const rows = computeReorderRows([{ sku: "  ", status: "free", qty: 9 }], [
      { sku: "   ", reorderPoint: 200 },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("matches a config to stock across surrounding whitespace", () => {
    const rows = computeReorderRows([{ sku: `  ${MP_K}  `, status: "free", qty: 15 }], [
      { sku: MP_K, reorderPoint: 200 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].onHand).toBe(15);
  });
});
