/**
 * 0255 — line-EDIT helpers: the pencil gate for persisted rows + the
 * DraftLine reconstruction (incl. the exploded-sofa-group round-trip).
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse, OrderLine } from "@carres/shared";
import type { SofaBuildGroupRow } from "@/lib/sofa-build-display";
import { draftFromOrderLine, draftFromSofaGroup, orderLineEditKind } from "./order-line-edit";

const CATALOG = {
  models: [
    { id: "m-mat", category: "mattress", modelKey: "CLOUD", name: "Cloud" },
    { id: "m-acc", category: "accessory", modelKey: "PILLOW", name: "Pillow" },
    { id: "m-sofa", category: "sofa", modelKey: "LOTTI", name: "Lotti" },
  ],
  skus: [
    { id: "s1", modelId: "m-mat", sku: "MAT-1", variant: "Queen", price: 1500 },
    { id: "s2", modelId: "m-acc", sku: "ACC-1", variant: null, price: 99 },
    { id: "s3", modelId: "m-sofa", sku: "LOTTI-1A", variant: "1A", price: 900 },
  ],
  sofaFabrics: [],
  fabrics: [
    { id: "f1", fabricCode: "CG-011", series: "Peach", description: "Peach" },
  ],
} as unknown as CatalogResponse;

function line(over: Partial<OrderLine> = {}): OrderLine {
  return {
    id: "l-1",
    orderId: "o-1",
    sku: "MAT-1",
    qty: 1,
    attrs: null,
    unitPrice: 1500,
    ...over,
  };
}

describe("orderLineEditKind", () => {
  it("mattress/bedframe rows edit; accessory rows don't", () => {
    expect(orderLineEditKind(line(), CATALOG)).toBe("bed_mattress");
    expect(orderLineEditKind(line({ sku: "ACC-1" }), CATALOG)).toBeNull();
  });

  it("free / promo / bundle / combo markers block the pencil", () => {
    for (const attrs of [
      { free_gift: true },
      { free_item: true },
      { pwp: { ruleId: "r" } },
      { bundle_group: "bg" },
      { combo_key: "ck" },
    ]) {
      expect(orderLineEditKind(line({ attrs }), CATALOG)).toBeNull();
    }
  });

  it("exploded sofa rows and raw builds never edit as single lines", () => {
    expect(orderLineEditKind(line({ sku: "LOTTI-1A", attrs: { sofa_build_key: "k" } }), CATALOG)).toBeNull();
    expect(orderLineEditKind(line({ sku: "LOTTI-1A", attrs: { sofa_build: {} } }), CATALOG)).toBeNull();
  });

  it("unknown sku (not in the catalog) blocks the pencil", () => {
    expect(orderLineEditKind(line({ sku: "GONE" }), CATALOG)).toBeNull();
  });
});

describe("draftFromOrderLine", () => {
  it("carries the persisted row verbatim as the editLine seed", () => {
    const l = line({ attrs: { gap: "Confirm later" }, qty: 2 });
    expect(draftFromOrderLine(l)).toEqual({
      localId: "l-1",
      sku: "MAT-1",
      qty: 2,
      attrs: { gap: "Confirm later" },
      unitPrice: 1500,
      label: "MAT-1",
    });
  });
});

function groupLine(i: number, over: Partial<OrderLine> = {}, attrsOver: Record<string, unknown> = {}): OrderLine {
  return {
    id: `gl-${i}`,
    orderId: "o-1",
    sku: "LOTTI-1A",
    qty: 1,
    unitPrice: 1000,
    attrs: {
      sofa_build_key: "bk-1",
      cell_index: i,
      module_code: i === 0 ? "1A(LHF)" : "CNR",
      sofa_height: "24",
      x: i,
      y: 0,
      rot: 0,
      fabric_id: "sf-9",
      fabric_name: "Series Blue",
      fabric_surcharge: 50,
      ...attrsOver,
    },
    ...over,
  };
}

function group(lines: OrderLine[]): SofaBuildGroupRow {
  return {
    kind: "sofa_build",
    buildKey: "bk-1",
    lines,
    qty: 1,
    totalPrice: lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    spec: "",
  };
}

describe("draftFromSofaGroup", () => {
  it("reconstructs the pre-explode build: cells sorted by cell_index, fabric/height carried", () => {
    const d = draftFromSofaGroup(group([groupLine(1), groupLine(0)]), CATALOG);
    expect(d).not.toBeNull();
    const attrs = d!.attrs as Record<string, unknown>;
    const sb = attrs.sofa_build as { cells: Array<{ moduleCode: string }>; height: string };
    expect(sb.height).toBe("24");
    expect(sb.cells.map((c) => c.moduleCode)).toEqual(["1A(LHF)", "CNR"]);
    expect(attrs.fabric_id).toBe("sf-9");
    expect(attrs.mode).toBe("build");
    expect(d!.qty).toBe(1);
    expect(d!.unitPrice).toBe(2000);
    expect(d!.sku).toBe("LOTTI-1A");
  });

  it("recovers a master-fabric code by NAME when fabric_id was lost at explode", () => {
    const lines = [
      groupLine(0, {}, { fabric_id: undefined, fabric_name: "CG-011 Peach" }),
      groupLine(1, {}, { fabric_id: undefined, fabric_name: "CG-011 Peach" }),
    ];
    const d = draftFromSofaGroup(group(lines), CATALOG);
    expect(d).not.toBeNull();
    expect((d!.attrs as Record<string, unknown>).fabric_code).toBe("CG-011");
  });

  it("returns null when the geometry stamps are missing (pre-P5 rows can't round-trip)", () => {
    const noModule = [groupLine(0, {}, { module_code: undefined })];
    expect(draftFromSofaGroup(group(noModule), CATALOG)).toBeNull();
    const noHeight = [groupLine(0, {}, { sofa_height: undefined })];
    expect(draftFromSofaGroup(group(noHeight), CATALOG)).toBeNull();
  });

  it("returns null when any row carries a promo/free marker (reward builds)", () => {
    const reward = [groupLine(0), groupLine(1, {}, { pwp: { ruleId: "r" } })];
    expect(draftFromSofaGroup(group(reward), CATALOG)).toBeNull();
  });
});
