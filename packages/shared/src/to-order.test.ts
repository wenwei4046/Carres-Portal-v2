import { describe, expect, it } from "vitest";
import {
  buildToOrder,
  categoryUnitsLine,
  composeSummary,
  countItems,
  countOrders,
  isToOrderCategory,
  nameBuild,
  pickSpecToken,
  planPurchaseOrders,
  ordersHeadline,
  poIndexLabel,
  poShortLabel,
  productionDaysLabel,
  purchaseOrderCount,
  railItemLabel,
  sizeShort,
  soCountLabel,
  sortToOrderRows,
  toOrderBuilds,
  unitsHeadline,
  poScheduleDays,
  snapToPoDay,
  poScheduleBucket,
  weekdayName,
  freeStockLine,
  onPoLine,
  reserveFromStockLabel,
  reservedFromStockLabel,
  stockExpandLabel,
  readyStockDrawNote,
  READY_STOCK_DRAW_REASON,
  proceedWaitedDays,
  TO_ORDER_WORDS,
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  DEMAND_PURPOSE_VALUES,
  isDemandPurpose,
  type ToOrderLine,
  type ToOrderRow,
} from "./to-order";
import { POOL_USE_REASONS, poolDrawProblem } from "./pool-usage";
import { OPS_STOCK_STATUS_LABEL } from "./stock-hold";
import { subtractWorkingDays } from "./working-days";

/**
 * The fixture is the live Ohana · Sofa demand, shape for shape: PETER's one
 * customer order holds TWO sofa builds, kee tong's order has no delivery date
 * and no build key, and one line is a guarantee that must never reach this
 * page. Nothing here is invented — the whole point of the projection is that
 * the awkward real cases behave.
 */

const OHANA = "11111111-1111-1111-1111-111111111111";
const NICE_FUTURE = "22222222-2222-2222-2222-222222222222";

const TODAY = "2026-07-30";
const BUFFER = 7;
const OFFICE_OFF_DAYS = [0, 6]; // arranging a delivery is office work
const OHANA_OFF_DAYS = [0]; // Ohana works Saturday

function line(over: Partial<ToOrderLine> & Pick<ToOrderLine, "lineId" | "sku">): ToOrderLine {
  return {
    orderId: "o1",
    category: "sofa",
    supplierId: OHANA,
    qty: 1,
    deadline: "2026-08-22",
    leadDays: 14,
    placedAt: "2026-07-01",
    committed: true,
    offDays: OHANA_OFF_DAYS,
    so: 1207,
    customerName: "PETER",
    modelName: "Booqit",
    variant: null,
    variantKind: null,
    buildKey: null,
    fabricName: null,
    legHeight: null,
    itemHeight: "24",
    cost: null,
    ...over,
  };
}

const SUPPLIERS = [
  { id: OHANA, name: "Ohana" },
  { id: NICE_FUTURE, name: "Nice Future" },
];

const OPTIONS = {
  today: TODAY,
  offDays: OFFICE_OFF_DAYS,
  arrivalBufferDays: BUFFER,
  reviewDaysBySupplier: {},
};

/** PETER — one order, two sofa builds, five module lines. */
const PETER = [
  line({ lineId: "p1", sku: "5539-1B(LHF)", buildKey: "bk-a", legHeight: '6"' }),
  line({ lineId: "p2", sku: "5539-CNR", buildKey: "bk-a", legHeight: '6"' }),
  line({ lineId: "p3", sku: "5539-2A(RHF)", buildKey: "bk-a", legHeight: '6"' }),
  line({ lineId: "p4", sku: "5539-1A(LHF)", buildKey: "bk-b", legHeight: '4"' }),
  line({ lineId: "p5", sku: "5539-2A(RHF)", buildKey: "bk-b", legHeight: '4"' }),
];

/** ella — one build, two modules, a real fabric, the earliest deadline. */
const ELLA = [
  line({
    lineId: "e1", sku: "5539-1A(LHF)", orderId: "o2", so: 1204, customerName: "ella",
    buildKey: "bk-e", deadline: "2026-08-11", fabricName: "CG-004 Wood", legHeight: '4"',
  }),
  line({
    lineId: "e2", sku: "5539-2A(RHF)", orderId: "o2", so: 1204, customerName: "ella",
    buildKey: "bk-e", deadline: "2026-08-11", fabricName: "CG-004 Wood", legHeight: '4"',
  }),
];

/** kee tong — no delivery date at all, and no build key on either line. */
const KEE_TONG = [
  line({
    lineId: "k1", sku: "5539-2B(LHF)", orderId: "o3", so: 1257, customerName: "kee tong",
    deadline: null, buildKey: null, fabricName: "CG-010 Gold", itemHeight: null,
  }),
  line({
    lineId: "k2", sku: "5539-L(RHF)", orderId: "o3", so: 1257, customerName: "kee tong",
    deadline: null, buildKey: null, fabricName: "CG-010 Gold", itemHeight: null,
  }),
];

function run(lines: ToOrderLine[], extra: Partial<Parameters<typeof buildToOrder>[0]> = {}) {
  return buildToOrder({
    lines,
    suppliers: SUPPLIERS,
    options: OPTIONS,
    ...extra,
  });
}

// ── 1 · supplier × category is the unit ─────────────────────────────────────

describe("supplier × category grouping", () => {
  it("splits one supplier's two categories into two proposals", () => {
    const ps = run([
      ...PETER,
      line({
        lineId: "b1", sku: "CODY-Q", orderId: "o9", so: 1300, customerName: "wong",
        category: "bedframe", leadDays: 7, modelName: "Cody",
      }),
    ]);
    expect(ps.map((p) => p.label).sort()).toEqual(["Ohana · Bedframe", "Ohana · Sofa"]);
  });

  it("keeps two suppliers apart even in the same category", () => {
    const ps = run([
      line({ lineId: "m1", sku: "M1401S-Q", orderId: "o7", so: 1290, customerName: "ng",
        category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "M1401S" }),
      line({ lineId: "m2", sku: "OH-MAT", orderId: "o8", so: 1291, customerName: "lim",
        category: "mattress", supplierId: OHANA, leadDays: 7, modelName: "OhanaMat" }),
    ]);
    expect(ps).toHaveLength(2);
    expect(new Set(ps.map((p) => p.supplierId))).toEqual(new Set([OHANA, NICE_FUTURE]));
  });
});

// ── 2 · 10 · the PO boundary ────────────────────────────────────────────────

describe("the purchase-order boundary", () => {
  it("sofa is one purchase order per customer order", () => {
    const [sofa] = run([...PETER, ...ELLA]);
    expect(sofa.rows).toHaveLength(2);
    expect(sofa.poCount).toBe(2);
    expect(planPurchaseOrders(sofa)).toHaveLength(2);
  });

  it("the grid's row count and the button's PO count are the same number", () => {
    const [sofa] = run([...PETER, ...ELLA, ...KEE_TONG]);
    expect(sofa.poCount).toBe(sofa.rows.length);
    expect(purchaseOrderCount(sofa.poCount)).toBe("3 Purchase Orders");
  });

  it("the workspace names which document it shows — `PO 1 of 3`", () => {
    // Lived as a literal in the page's markup, twice; one word list now.
    expect(poIndexLabel(1, 3)).toBe("PO 1 of 3");
    expect(poIndexLabel(1, 1)).toBe("PO 1 of 1");
  });

  it("the queue rail keeps its words small — `PO 2`, counts, working days", () => {
    // The rail is scanned for numbers (Loo, 2026-07-31); a row is the door,
    // not the content, so its label drops the `of N`.
    expect(poShortLabel(2)).toBe("PO 2");
    expect(countOrders(1)).toBe("1 order");
    expect(countOrders(2)).toBe("2 orders");
    expect(countItems(1)).toBe("1 item");
    expect(countItems(5)).toBe("5 items");
    expect(productionDaysLabel(1)).toBe("1 working day");
    expect(productionDaysLabel(7)).toBe("7 working days");
  });

  it("the Planning Navigator's composers — natural word on top, system word below", () => {
    // `Orders` on the header because it is what a purchaser SAYS ("今天有
    // 12 单要下"); `SO` from the category rows down (Loo, 2026-07-31).
    expect(ordersHeadline(1)).toBe("1 Order");
    expect(ordersHeadline(12)).toBe("12 Orders");
    expect(soCountLabel(1)).toBe("1 SO");
    expect(soCountLabel(38)).toBe("38 SO");
  });

  it("P9 — the CATEGORY rail's tooltip says UNITS where the calendar's says Orders", () => {
    // The two blocks sit one above the other in a 200px rail and count
    // DIFFERENT THINGS. The numbers on screen are bare, so these two
    // sentences are the ONLY thing telling a `3` from a `3`.
    expect(unitsHeadline(1)).toBe("1 unit");
    expect(unitsHeadline(19)).toBe("19 units");
    expect(unitsHeadline(0)).toBe("0 units");
    // COPY-STANDARD's Numbers section rules the pair `3 units` / `12 orders`;
    // neither word is invented here, and they must never converge.
    expect(unitsHeadline(3)).not.toBe(ordersHeadline(3));
  });

  it("P9 — the ticked line names each category once, bare, and drops the empty ones", () => {
    expect(
      categoryUnitsLine([
        { word: "Mattress", units: 7 },
        { word: "Bedframe", units: 1 },
        { word: "Sofa", units: 1 },
      ]),
    ).toBe("Mattress 7 · Bedframe 1 · Sofa 1");
    // A category contributing nothing is DROPPED — the opposite of the rail,
    // where `Sofa 0` must hold its place. This is a sentence about one
    // selection, and `Sofa 0` in it is a clause saying nothing.
    expect(
      categoryUnitsLine([
        { word: "Mattress", units: 5 },
        { word: "Bedframe", units: 0 },
        { word: "Sofa", units: 0 },
        { word: "Pillow", units: 0 },
        { word: "Mattress Protector", units: 0 },
      ]),
    ).toBe("Mattress 5");
    // Nothing ticked at all says nothing — the footer renders no line.
    expect(categoryUnitsLine([{ word: "Sofa", units: 0 }])).toBe("");
    expect(categoryUnitsLine([])).toBe("");
    // Loo, 2026-08-04: BARE. No unit word may reach this string.
    const line = categoryUnitsLine([{ word: "Mattress", units: 7 }]);
    expect(line).toBe("Mattress 7");
    expect(line).not.toMatch(/unit|pcs|piece|件/i);
  });

  it("a rail row's item label — the model plus the size LETTER, never the full word", () => {
    // The rail is navigation: the letter disambiguates (`Sonic Q` vs
    // `Sonic K`) without the width the full word costs. The Items table
    // keeps `Queen` — a factory cuts to the word, an operator scans the letter.
    expect(sizeShort("Queen")).toBe("Q");
    expect(sizeShort("King")).toBe("K");
    expect(sizeShort("Single")).toBe("S");
    expect(sizeShort("Super Single")).toBe("SS");
    expect(sizeShort(null)).toBeNull();
    // An unmapped size passes through whole — a wrong letter is worse than a
    // long word.
    expect(sizeShort("Cot")).toBe("Cot");
    expect(railItemLabel("Sonic", "Queen")).toBe("Sonic Q");
    expect(railItemLabel("Booqit", null)).toBe("Booqit");
  });

  it("a non-sofa category merges every customer order into ONE document", () => {
    const [bed] = run([
      line({ lineId: "b1", sku: "CODY-Q", orderId: "o9", so: 1300, customerName: "wong",
        category: "bedframe", leadDays: 7, modelName: "Cody" }),
      line({ lineId: "b2", sku: "CODY-K", orderId: "oA", so: 1301, customerName: "tan",
        category: "bedframe", leadDays: 7, modelName: "Cody" }),
    ]);
    expect(bed.rows).toHaveLength(2);
    expect(bed.poCount).toBe(1);
    const plan = planPurchaseOrders(bed);
    expect(plan).toHaveLength(1);
    expect(plan[0].soRefs.sort()).toEqual([1300, 1301]);
  });

  it("merges a repeated SKU into one line on the document a factory reads", () => {
    const [sofa] = run(PETER);
    const [po] = planPurchaseOrders(sofa);
    // 5539-2A(RHF) appears in BOTH of PETER's builds.
    expect(po.lines.filter((l) => l.sku === "5539-2A(RHF)")).toHaveLength(1);
    expect(po.lines.find((l) => l.sku === "5539-2A(RHF)")!.qty).toBe(2);
  });
});

// ── 3 · 4 · builds and the business unit ────────────────────────────────────

describe("sofa builds", () => {
  it("groups module lines by sofa_build_key", () => {
    const [sofa] = run(PETER);
    const peter = sofa.rows[0];
    expect(peter.builds).toHaveLength(2);
    expect(peter.builds[0].codes).toBe("5539-1B(LHF) · 5539-CNR · 5539-2A(RHF)");
    expect(peter.builds[1].codes).toBe("5539-1A(LHF) · 5539-2A(RHF)");
  });

  it("Qty counts sofas, never the module lines the database holds", () => {
    const [sofa] = run(PETER);
    const peter = sofa.rows[0];
    expect(peter.qty).toBe(2); // two sofas
    expect(peter.builds.flatMap((b) => b.lines)).toHaveLength(5); // five module lines
  });

  it("a line with no build key stands alone", () => {
    const [sofa] = run(KEE_TONG);
    expect(sofa.rows[0].builds).toHaveLength(2);
    expect(sofa.rows[0].qty).toBe(2);
  });

  it("counts pieces, not builds, for a category that is not sofa", () => {
    const [bed] = run([
      line({ lineId: "b1", sku: "CODY-Q", orderId: "o9", so: 1300, customerName: "wong",
        category: "bedframe", leadDays: 7, qty: 3, modelName: "Cody" }),
    ]);
    expect(bed.rows[0].qty).toBe(3);
  });
});

// ── P11 · a sofa with no modules carries its own quantity ───────────────────

/**
 * The collapse to `1` exists to turn `1B(LHF)` + `CNR` + `2A(RHF)` into ONE
 * physical sofa. It was applied to the CATEGORY, so a sofa line with no build
 * key — a typed ready stock demand, or a customer line for a non-modular sofa —
 * was collapsed too, and its quantity was thrown away with nothing on screen
 * saying a number had changed.
 *
 * Both halves are asserted here: the lone line now carries its own quantity,
 * and a genuine multi-module build still proposes exactly 1. The second is the
 * rule being PRESERVED, so it is the one that must not be allowed to rot.
 */
describe("a sofa build's quantity", () => {
  /** A typed ready stock demand — one sku, one number, no modules at all. */
  const demand = (qty: number) =>
    line({
      lineId: "demand:d1", sku: "5539-1A(LHF)", orderId: "demand:d1",
      so: null, customerName: null, buildKey: null, deadline: "2026-08-22",
      readyStock: true, destinationName: "Carres Klang", qty,
    });

  it("a ready stock demand of 5 sofas proposes 5, not 1", () => {
    const [sofa] = run([demand(5)]);
    expect(sofa.rows[0].builds).toHaveLength(1);
    expect(sofa.rows[0].builds[0].qty).toBe(5);
    expect(sofa.rows[0].qty).toBe(5);
  });

  it("issues a purchase order for 5, and credits the demand the same 5", () => {
    const [sofa] = run([demand(5)]);
    const [po] = planPurchaseOrders(sofa);
    expect(po.lines).toEqual([{ sku: "5539-1A(LHF)", qty: 5, cost: null }]);
    // The api credits `purchasing_demand_record_issue` with the BUILD's qty
    // while the purchase order is written from the LINE's. They have to be the
    // same number or a demand of 5 is ordered in full and recorded as 1 —
    // leaving 4 to be bought a second time.
    const [ref] = toOrderBuilds(sofa);
    expect(ref.qty).toBe(po.lines[0].qty);
  });

  it("a customer line of 2 non-modular sofas proposes 2", () => {
    const [sofa] = run([
      line({
        lineId: "n1", sku: "5539-1A(LHF)", orderId: "on", so: 1310,
        customerName: "tan", buildKey: null, qty: 2,
      }),
    ]);
    expect(sofa.rows[0].builds[0].qty).toBe(2);
    expect(sofa.rows[0].qty).toBe(2);
  });

  it("a genuine three-module customer sofa still proposes exactly 1", () => {
    const [sofa] = run([
      line({ lineId: "p1", sku: "5539-1B(LHF)", buildKey: "bk-a" }),
      line({ lineId: "p2", sku: "5539-CNR", buildKey: "bk-a" }),
      line({ lineId: "p3", sku: "5539-2A(RHF)", buildKey: "bk-a" }),
    ]);
    expect(sofa.rows[0].builds).toHaveLength(1);
    expect(sofa.rows[0].builds[0].lines).toHaveLength(3);
    expect(sofa.rows[0].builds[0].qty).toBe(1);
    expect(sofa.rows[0].qty).toBe(1);
  });

  it("a two-module build beside a lone line counts 1 + its own quantity", () => {
    const [sofa] = run([
      line({ lineId: "p4", sku: "5539-1A(LHF)", buildKey: "bk-b" }),
      line({ lineId: "p5", sku: "5539-2A(RHF)", buildKey: "bk-b" }),
      line({ lineId: "p6", sku: "5539-L(RHF)", buildKey: null, qty: 3 }),
    ]);
    expect(sofa.rows[0].builds.map((b) => b.qty)).toEqual([1, 3]);
    expect(sofa.rows[0].qty).toBe(4);
  });

  it("the row total is the sum of its builds, in every category", () => {
    const ps = run([
      ...PETER,
      // A lone line of 2 inside PETER's own order, so the row (4) and the
      // build COUNT (3) are different numbers. Without it the fixture agrees
      // with the retired `builds.length` too and guards nothing.
      line({ lineId: "p6", sku: "5539-L(RHF)", buildKey: null, qty: 2 }),
      ...KEE_TONG,
      line({ lineId: "b1", sku: "CODY-Q", orderId: "o9", so: 1300, customerName: "wong",
        category: "bedframe", leadDays: 7, qty: 3, modelName: "Cody" }),
    ]);
    const peter = ps.flatMap((p) => p.rows).find((r) => r.orderId === "o1");
    expect(peter?.builds).toHaveLength(3);
    expect(peter?.qty).toBe(4);
    const rows = ps.flatMap((p) => p.rows);
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) {
      expect(r.qty).toBe(r.builds.reduce((s, b) => s + b.qty, 0));
    }
  });
});

// ── 5 · 6 · Summary ─────────────────────────────────────────────────────────

describe("Summary", () => {
  it("is never longer than three tokens", () => {
    const s = composeSummary({ model: "Booqit", qty: 2, category: "sofa", spec: "CG-004 Wood" });
    expect(s.split(" · ")).toHaveLength(3);
    expect(s).toBe("Booqit · 2 Sofas · CG-004 Wood");
  });

  it("drops to two tokens when nothing is out of the ordinary", () => {
    const [sofa] = run(PETER);
    expect(sofa.rows[0].summary).toBe("Booqit · 2 Sofas");
  });

  it("never prints the default height", () => {
    const [sofa] = run(PETER);
    expect(sofa.rows[0].summary).not.toContain("24");
    expect(pickSpecToken([{ fabricName: null, legHeight: null, itemHeight: "24" }])).toBeNull();
  });

  it("prints a non-default height when there is one", () => {
    expect(pickSpecToken([{ fabricName: null, legHeight: null, itemHeight: "30" }]))
      .toBe('Height 30"');
  });

  it("prefers the fabric over a missing leg — a wrong fabric cannot be undone", () => {
    expect(
      pickSpecToken([{ fabricName: "EZ-002 Sand", legHeight: "No Leg", itemHeight: "24" }]),
    ).toBe("EZ-002 Sand");
  });

  it("shows No Leg when there is no fabric", () => {
    expect(pickSpecToken([{ fabricName: null, legHeight: "No Leg", itemHeight: "24" }]))
      .toBe("No Leg");
  });

  it("never prints a leg HEIGHT — nobody has said which is the default", () => {
    expect(pickSpecToken([{ fabricName: null, legHeight: '6"', itemHeight: "24" }])).toBeNull();
  });

  it("uses the singular for one", () => {
    const [sofa] = run(ELLA);
    expect(sofa.rows[0].summary).toBe("Booqit · 1 Sofa · CG-004 Wood");
  });
});

// ── The build names itself, and says how many ───────────────────────────────

describe("Build name + quantity", () => {
  /** One customer, one mattress line, King, two of them. */
  const mattress = (over: Partial<ToOrderLine> = {}) =>
    line({
      lineId: "x1", sku: "B1201S-K", orderId: "ox", so: 1284, customerName: "LIM KUAN YANG",
      category: "mattress", supplierId: NICE_FUTURE, leadDays: 7,
      modelName: "B1201S", variant: "King", variantKind: "size", buildKey: null,
      fabricName: null, legHeight: null, itemHeight: null, ...over,
    });

  it("carries the size a factory has to cut to", () => {
    const [p] = run([mattress()]);
    expect(p.rows[0].builds[0].size).toBe("King");
    expect(p.rows[0].builds[0].title).toBe("B1201S King");
  });

  it("counts UNITS, not lines — a line of 2 is 2", () => {
    const [p] = run([mattress({ qty: 2 })]);
    expect(p.rows[0].builds[0].qty).toBe(2);
  });

  it("never lets a sofa part code become a size", () => {
    // Live: all 138 sofa skus are variant_kind='part' with values like 1A(LHF).
    // The fixture is a build of ONE module on purpose — a multi-module build
    // would report no size anyway (its members disagree), so it would pass with
    // the gate deleted and prove nothing.
    const [p] = run([
      line({
        lineId: "s1", sku: "5539-1A(LHF)", orderId: "os", so: 1290, customerName: "solo",
        buildKey: null, variant: "1A(LHF)", variantKind: "part",
      }),
    ]);
    expect(p.rows[0].builds).toHaveLength(1);
    expect(p.rows[0].builds[0].size).toBeNull();
    expect(p.rows[0].builds[0].title).toBe("Booqit");
  });

  it("is ONE unit per sofa however many module lines it has", () => {
    const [p] = run(PETER); // 5 module lines, 2 builds
    expect(p.rows[0].builds.map((b) => b.qty)).toEqual([1, 1]);
  });

  it("drops the ordinal when the build already names itself", () => {
    const [p] = run([mattress()]);
    expect(p.rows[0].builds[0].title).not.toMatch(/Mattress \d/);
  });

  it("earns the ordinal back when a sibling would read identically", () => {
    const [p] = run([mattress(), mattress({ lineId: "x2" })]);
    expect(p.rows[0].builds.map((b) => b.title)).toEqual([
      "Mattress 1 — B1201S King",
      "Mattress 2 — B1201S King",
    ]);
  });

  it("needs no ordinal when the SIZE already tells them apart", () => {
    const [p] = run([
      mattress(),
      mattress({ lineId: "x2", sku: "B1201S-Q", variant: "Queen" }),
    ]);
    expect(p.rows[0].builds.map((b) => b.title)).toEqual(["B1201S King", "B1201S Queen"]);
  });

  it("reports NO size rather than the first when a build spans two", () => {
    expect(
      nameBuild([
        { modelName: "B1201S", sku: "a", variant: "King", variantKind: "size" },
        { modelName: "B1201S", sku: "b", variant: "Queen", variantKind: "size" },
      ]).size,
    ).toBeNull();
  });
});

// ── 7 · 8 · 9 · Stock Ready ─────────────────────────────────────────────────

describe("Stock Ready", () => {
  it("is the engine's arriveBy and nothing recomputed here", () => {
    const [sofa] = run(ELLA);
    // deadline − the arrival buffer, counted on the OFFICE week.
    expect(sofa.rows[0].stockReady).toBe(
      subtractWorkingDays("2026-08-11", BUFFER, { offDays: OFFICE_OFF_DAYS }),
    );
  });

  it("is null when the customer order carries no delivery date", () => {
    const [sofa] = run(KEE_TONG);
    expect(sofa.rows[0].stockReady).toBeNull();
  });

  it("sorts earliest first by default", () => {
    const [sofa] = run([...PETER, ...ELLA]);
    expect(sofa.rows.map((r) => r.customer)).toEqual(["ella", "PETER"]);
  });

  /**
   * The fields `sortToOrderRows` never reads. They were simply omitted here
   * until 2026-08-04, which meant these two fixtures had not type-checked
   * since `delivery` and `orderBy` joined `ToOrderRow` — the objects were
   * `ToOrderRow` in name only. Spreading a complete row keeps the tests about
   * SORTING and stops a new field breaking them.
   */
  const BARE_ROW: ToOrderRow = {
    orderId: "",
    so: null,
    customer: "",
    qty: 1,
    summary: "",
    stockReady: null,
    delivery: null,
    proceedDate: null,
    orderBy: null,
    builds: [],
    freeStock: 0,
    takenFromStock: 0,
    coveredByOpenPo: 0,
    coveredByOpenPoPos: [],
  };

  it("sinks a row with no date in BOTH directions", () => {
    const rows: ToOrderRow[] = [
      { ...BARE_ROW, orderId: "a", so: 1, customer: "a", stockReady: "2026-08-01" },
      { ...BARE_ROW, orderId: "b", so: 2, customer: "b", stockReady: null },
      { ...BARE_ROW, orderId: "c", so: 3, customer: "c", stockReady: "2026-08-20" },
    ];
    expect(sortToOrderRows(rows, "stockReady", true).map((r) => r.orderId)).toEqual(["a", "c", "b"]);
    expect(sortToOrderRows(rows, "stockReady", false).map((r) => r.orderId)).toEqual(["c", "a", "b"]);
  });

  it("sinks a dateless row under EVERY column, in both directions", () => {
    // `aaa` would win a customer sort and `1` would win a Qty sort — it has no
    // deadline, so neither may lift it above dated work.
    const rows: ToOrderRow[] = [
      { ...BARE_ROW, orderId: "none", so: 1, customer: "aaa", summary: "aaa", stockReady: null },
      { ...BARE_ROW, orderId: "b", so: 9, customer: "zzz", qty: 9, summary: "zzz", stockReady: "2026-08-01" },
    ];
    for (const key of ["cust", "so", "qty", "summary", "stockReady"] as const) {
      expect(sortToOrderRows(rows, key, true).map((r) => r.orderId)).toEqual(["b", "none"]);
      expect(sortToOrderRows(rows, key, false).map((r) => r.orderId)).toEqual(["b", "none"]);
    }
  });
});

// ── 12 · a secured requirement leaves the workspace ─────────────────────────

describe("what leaves To Order", () => {
  /**
   * ⭐ T6 REVERSED THE OLD RULE, and Loo reversed it on measured production:
   * 41 of 78 eligible demand lines were covered by an open purchase order and
   * every one of them was covered in FULL, so whole customer orders vanished
   * from the sheet and *"where is SO-1210?"* was answered on no screen.
   *
   * A fully covered build now STAYS, as a RECEIPT — it carries the quantity
   * that purchase order bought and `fullyOnPo`, which is what stops it being
   * ticked, counted or issued anywhere downstream.
   */
  it("keeps a fully covered line as a receipt, never drops it", () => {
    const covered = run(ELLA, {
      supply: { openPoBySku: { "5539-1A(LHF)": 1, "5539-2A(RHF)": 1 } },
    });
    expect(covered).toHaveLength(1);
    const b = covered[0].rows[0].builds[0];
    expect(b.fullyOnPo).toBe(true);
    // The number a receipt states is what was BOUGHT, never a `0` under `Qty`.
    expect(b.qty).toBeGreaterThan(0);
    expect(b.coveredByOpenPo).toBe(2);
  });

  it("keeps the workspace when only part is covered", () => {
    const ps = run(ELLA, { supply: { openPoBySku: { "5539-1A(LHF)": 1 } } });
    expect(ps).toHaveLength(1);
    expect(ps[0].rows[0].builds[0].lines.map((l) => l.sku)).toEqual(["5539-2A(RHF)"]);
    // Partly covered is NOT a receipt — there is still something to buy.
    expect(ps[0].rows[0].builds[0].fullyOnPo).toBe(false);
  });

  it("a line with nothing to buy and no cover to explain it still leaves", () => {
    // The filter did not become "keep everything": a line the STOCK netting
    // emptied (the api reduces `qty` before the engine sees it) has no receipt
    // to show and no purchase order to name, so it goes as it always did.
    const ps = run([{ ...ELLA[0], qty: 0 }, { ...ELLA[1], qty: 0 }]);
    expect(ps).toHaveLength(0);
  });
});

// ── 12b · T3 · what an open purchase order already covers ───────────────────
//
// The number the engine has always computed and never handed to anyone.
// `coveredByOpenPo` had ZERO readers in the repository before this card, so a
// partly covered line printed a REDUCED quantity with nothing beside it.

describe("T3 · On PO", () => {
  /** One mattress line, its own build — the shape a partial cover needs. */
  const MAT = (over: Partial<ToOrderLine> = {}) =>
    line({
      lineId: "m1", sku: "H1401S-K", orderId: "o7", so: 1290, customerName: "ng",
      category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "Haven",
      deadline: "2026-08-20", offDays: OFFICE_OFF_DAYS, qty: 3,
      ...over,
    });

  it("carries the cover onto the build and the row, beside the remainder it explains", () => {
    const r = run([MAT()], { supply: { openPoBySku: { "H1401S-K": 2 } } })[0].rows[0];
    expect(r.qty).toBe(1); // what is still to buy — the engine already netted it
    expect(r.coveredByOpenPo).toBe(2); // …and this is why it is 1 and not 3
    expect(r.builds[0].coveredByOpenPo).toBe(2);
  });

  it("names the purchase orders behind the number", () => {
    const r = run([MAT()], {
      supply: { openPoBySku: { "H1401S-K": 2 } },
      openPoRefs: { "H1401S-K": [{ poId: "PO-2051", qty: 2 }] },
    })[0].rows[0];
    expect(r.coveredByOpenPoPos).toEqual(["PO-2051"]);
    expect(onPoLine(r.coveredByOpenPo, r.coveredByOpenPoPos)).toBe("2 on PO-2051");
  });

  it("names EVERY purchase order a cover spans, in draw order", () => {
    const r = run([MAT({ qty: 4 })], {
      supply: { openPoBySku: { "H1401S-K": 3 } },
      openPoRefs: {
        "H1401S-K": [
          { poId: "PO-2044", qty: 1 },
          { poId: "PO-2051", qty: 2 },
        ],
      },
    })[0].rows[0];
    expect(r.qty).toBe(1);
    expect(r.coveredByOpenPoPos).toEqual(["PO-2044", "PO-2051"]);
    expect(onPoLine(3, r.coveredByOpenPoPos)).toBe("3 on PO-2044 · PO-2051");
  });

  it("replays the ENGINE's own draw — an earlier customer's units are NOT named again", () => {
    // The point of the replay, and the bug a naive `take the first PO` would
    // ship: `early` (qty 1, earliest deadline) eats PO-2044's single unit and
    // leaves the grid fully covered. `late` then draws 2 units, and they come
    // out of PO-2051 — so its hover must say PO-2051 and NOT PO-2044, or an
    // operator phones the wrong factory about the wrong document.
    //
    // It also shows why this column is quiet by construction: the pool is
    // drained earliest-deadline first, so at most ONE line per SKU can end up
    // PARTLY covered — the one the pool ran out on. Every line before it is
    // covered in FULL, and since T6 those stay on the sheet as receipts.
    const ps = run(
      [
        MAT({ lineId: "early", orderId: "oe", so: 1, qty: 1, deadline: "2026-08-10" }),
        MAT({ lineId: "late", orderId: "ol", so: 2, qty: 3, deadline: "2026-08-20" }),
      ],
      {
        supply: { openPoBySku: { "H1401S-K": 3 } },
        openPoRefs: {
          "H1401S-K": [
            { poId: "PO-2044", qty: 1 },
            { poId: "PO-2051", qty: 2 },
          ],
        },
      },
    );
    // T6 — both rows are on the sheet: `early` as a receipt naming the
    // document its unit came from, `late` as the one thing still to buy.
    const byOrder = new Map(ps[0].rows.map((r) => [r.orderId, r]));
    expect([...byOrder.keys()].sort()).toEqual(["oe", "ol"]);
    const early = byOrder.get("oe")!;
    expect(early.builds[0].fullyOnPo).toBe(true);
    expect(early.coveredByOpenPoPos).toEqual(["PO-2044"]);
    const late = byOrder.get("ol")!;
    expect(late.builds[0].fullyOnPo).toBe(false);
    expect(late.qty).toBe(1);
    expect(late.coveredByOpenPo).toBe(2);
    expect(late.coveredByOpenPoPos).toEqual(["PO-2051"]);
  });

  it("ships the number alone when no reference can be resolved — never an invented one", () => {
    const r = run([MAT()], { supply: { openPoBySku: { "H1401S-K": 2 } } })[0].rows[0];
    expect(r.coveredByOpenPo).toBe(2);
    expect(r.coveredByOpenPoPos).toEqual([]);
    expect(onPoLine(2, [])).toBeNull();
  });

  it("a FULLY covered line stays as a receipt — T6 reversed T3's absence", () => {
    // T3 asserted this line was gone and called the absence correct. Loo saw
    // the live page and ruled otherwise: a customer order that disappears
    // because somebody already bought it leaves *"where is SO-1210?"*
    // answerable nowhere. It stays, carrying what was bought and the document.
    const ps = run([MAT()], {
      supply: { openPoBySku: { "H1401S-K": 3 } },
      openPoRefs: { "H1401S-K": [{ poId: "PO-2051", qty: 3 }] },
    });
    expect(ps).toHaveLength(1);
    const b = ps[0].rows[0].builds[0];
    expect(b.fullyOnPo).toBe(true);
    expect(b.qty).toBe(3);
    expect(b.coveredByOpenPoPos).toEqual(["PO-2051"]);
  });

  it("reads 0 with no open purchase orders at all", () => {
    const r = run([MAT()])[0].rows[0];
    expect(r.coveredByOpenPo).toBe(0);
    expect(r.coveredByOpenPoPos).toEqual([]);
  });

  it("a row is the sum of its builds' — by construction", () => {
    const r = run(
      [
        MAT({ lineId: "a", sku: "H1401S-K", qty: 2 }),
        MAT({ lineId: "b", sku: "H1401S-Q", qty: 2 }),
      ],
      {
        supply: { openPoBySku: { "H1401S-K": 1, "H1401S-Q": 1 } },
        openPoRefs: {
          "H1401S-K": [{ poId: "PO-2044", qty: 1 }],
          "H1401S-Q": [{ poId: "PO-2044", qty: 1 }],
        },
      },
    )[0].rows[0];
    expect(r.coveredByOpenPo).toBe(
      r.builds.reduce((s, b) => s + b.coveredByOpenPo, 0),
    );
    expect(r.coveredByOpenPo).toBe(2);
    // One document, named ONCE however many builds drew from it.
    expect(r.coveredByOpenPoPos).toEqual(["PO-2044"]);
  });
});

// ── 15 · a pair with no production days ─────────────────────────────────────

describe("production days", () => {
  it("marks the pair blocked so Issue can refuse it", () => {
    const [sofa] = run(PETER, {
      missingProductionDays: [{ supplierId: OHANA, category: "sofa" }],
    });
    expect(sofa.blocked).toBe("production_days");
  });

  it("leaves a rated pair unblocked", () => {
    const [sofa] = run(PETER);
    expect(sofa.blocked).toBeNull();
  });

  it("a rated pair states its number — the header's fact", () => {
    const [sofa] = run(PETER);
    expect(sofa.productionDays).toBe(14);
  });

  it("a blocked pair states NO number — a fallback here is the silent 7", () => {
    const [sofa] = run(PETER, {
      missingProductionDays: [{ supplierId: OHANA, category: "sofa" }],
    });
    expect(sofa.productionDays).toBeNull();
  });
});

// ── 16 · what never reaches this page ───────────────────────────────────────

describe("inclusion", () => {
  it("admits only the three made-to-order categories", () => {
    expect(isToOrderCategory("sofa")).toBe(true);
    expect(isToOrderCategory("mattress")).toBe(true);
    expect(isToOrderCategory("bedframe")).toBe(true);
    expect(isToOrderCategory("accessory")).toBe(false);
    expect(isToOrderCategory("service")).toBe(false);
    expect(isToOrderCategory("guarantee")).toBe(false);
  });

  it("drops an accessory, a service and a guarantee even when they carry a supplier", () => {
    const ps = run([
      ...ELLA,
      line({ lineId: "x1", sku: "MEMORY-FOAM-PILLOW", orderId: "oB", category: "accessory",
        modelName: "Memory Foam Pillow" }),
      line({ lineId: "x2", sku: "SVC-DISPOSE", orderId: "oC", category: "service",
        modelName: "Service" }),
      line({ lineId: "x3", sku: "GRT-MATTRESS-15Y", orderId: "oD", category: "guarantee",
        modelName: "Mattress Guarantee" }),
    ]);
    expect(ps).toHaveLength(1);
    expect(ps[0].category).toBe("sofa");
    expect(ps[0].rows).toHaveLength(1);
  });
});

// ── the sidebar's own order ─────────────────────────────────────────────────

describe("proposal order", () => {
  it("puts the earliest order-by first", () => {
    const ps = run([
      ...PETER,
      line({ lineId: "m1", sku: "M1401S-Q", orderId: "o7", so: 1290, customerName: "ng",
        category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "M1401S",
        deadline: "2026-08-04", offDays: OFFICE_OFF_DAYS }),
    ]);
    expect(ps[0].label).toBe("Nice Future · Mattress");
    expect(ps[0].orderBy! < ps[1].orderBy!).toBe(true);
  });

  it("sinks a proposal whose every order is dateless", () => {
    const ps = run([
      ...KEE_TONG,
      line({ lineId: "m1", sku: "M1401S-Q", orderId: "o7", so: 1290, customerName: "ng",
        category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "M1401S",
        deadline: "2026-08-04", offDays: OFFICE_OFF_DAYS }),
    ]);
    expect(ps[0].label).toBe("Nice Future · Mattress");
    expect(ps[1].orderBy).toBeNull();
  });
});

// ── the PO Schedule (Jess's freeze, 2026-08-01) ─────────────────────────────
//
// The rail is a purchase calendar. Snap rule, verbatim hers: "Always snap to
// the nearest earlier PO day. Never move later." And the protection rule: a
// passed PO day is OVERDUE — never swallowed by the next run.

const MWF = [1, 3, 5]; // Monday · Wednesday · Friday

describe("snapToPoDay", () => {
  it("her own table, row for row — always earlier, never later", () => {
    // 2026-08-03 is a Monday.
    expect(snapToPoDay("2026-08-03", MWF)).toBe("2026-08-03"); // Mon → Mon
    expect(snapToPoDay("2026-08-04", MWF)).toBe("2026-08-03"); // Tue → Mon
    expect(snapToPoDay("2026-08-05", MWF)).toBe("2026-08-05"); // Wed → Wed
    expect(snapToPoDay("2026-08-06", MWF)).toBe("2026-08-05"); // Thu → Wed
    expect(snapToPoDay("2026-08-07", MWF)).toBe("2026-08-07"); // Fri → Fri
    expect(snapToPoDay("2026-08-08", MWF)).toBe("2026-08-07"); // Sat → Fri
    expect(snapToPoDay("2026-08-09", MWF)).toBe("2026-08-07"); // Sun → Fri
  });

  it("an empty configuration means order any WORKING day — a weekend still snaps back", () => {
    expect(snapToPoDay("2026-08-04", [])).toBe("2026-08-04"); // Tue stands
    expect(snapToPoDay("2026-08-01", [])).toBe("2026-07-31"); // Sat → Fri
  });
});

describe("poScheduleDays", () => {
  it("rolls from today — a Tuesday reads Wed · Fri · Mon, never yesterday's Monday", () => {
    expect(poScheduleDays(MWF, "2026-08-04")).toEqual([
      "2026-08-05",
      "2026-08-07",
      "2026-08-10",
    ]);
  });

  it("today counts when today IS a PO day", () => {
    expect(poScheduleDays(MWF, "2026-08-03")[0]).toBe("2026-08-03");
  });

  it("two configured days → two rows; none → the next WORKING day, never a Saturday", () => {
    expect(poScheduleDays([2, 5], "2026-08-03")).toHaveLength(2);
    expect(poScheduleDays([], "2026-08-04")).toEqual(["2026-08-04"]); // Tue stands
    expect(poScheduleDays([], "2026-08-01")).toEqual(["2026-08-03"]); // Sat → Mon
  });
});

describe("poScheduleBucket", () => {
  const TODAY = "2026-08-05"; // Wednesday

  it("a due run today sits on today's row, not in Overdue", () => {
    expect(poScheduleBucket("2026-08-05", MWF, TODAY)).toEqual({
      kind: "day",
      day: "2026-08-05",
    });
    // Thursday's demand snaps back to... Wednesday — today. Still on time.
    expect(poScheduleBucket("2026-08-06", MWF, TODAY)).toEqual({
      kind: "day",
      day: "2026-08-05",
    });
  });

  it("a passed PO day is OVERDUE — never silently rolled into the next run", () => {
    // Should have gone out Monday; it is Wednesday. Not Friday's work.
    expect(poScheduleBucket("2026-08-04", MWF, TODAY)).toEqual({ kind: "overdue" });
    expect(poScheduleBucket("2026-07-20", MWF, TODAY)).toEqual({ kind: "overdue" });
  });

  it("a dateless demand lands on the FIRST upcoming row — a human decides at the next run", () => {
    expect(poScheduleBucket(null, MWF, "2026-08-04")).toEqual({
      kind: "day",
      day: "2026-08-05",
    });
  });
});

describe("weekdayName", () => {
  it("speaks the operator's word for the row", () => {
    expect(weekdayName("2026-08-05")).toBe("Wednesday");
    expect(weekdayName("2026-08-07")).toBe("Friday");
  });
});

describe("the row's own orderBy", () => {
  it("each row carries its ORDER's earliest raise-by, never a sibling's", () => {
    const ps = run([
      ...PETER,
      line({ lineId: "m1", sku: "M1401S-Q", orderId: "o7", so: 1290, customerName: "ng",
        category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "M1401S",
        deadline: "2026-08-20", offDays: OFFICE_OFF_DAYS }),
      line({ lineId: "m2", sku: "M1401S-K", orderId: "o8", so: 1291, customerName: "tan",
        category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "M1401S",
        deadline: "2026-09-20", offDays: OFFICE_OFF_DAYS }),
    ]);
    const nf = ps.find((p) => p.label === "Nice Future · Mattress")!;
    const near = nf.rows.find((r) => r.so === 1290)!;
    const far = nf.rows.find((r) => r.so === 1291)!;
    expect(near.orderBy).not.toBeNull();
    expect(far.orderBy).not.toBeNull();
    expect(near.orderBy! < far.orderBy!).toBe(true);
    // The pair-level orderBy is the earliest row's, unchanged by the split.
    expect(nf.orderBy).toBe(near.orderBy);
  });

  it("a dateless order's row has no orderBy at all — never a defaulted one", () => {
    const ps = run([...KEE_TONG]);
    expect(ps[0].rows[0].orderBy).toBeNull();
  });
});

// ── 15 · P10 · ready stock is SUGGESTED, never consumed ─────────────────────
//
// Jess's 2026-07-21 ruling stands and is untouched: goods are labelled per
// order, so `consumeFreeStock` stays OFF and nothing here nets free stock out
// of a quantity. What P10 fixes is that the number was computed and shown to
// nobody.

describe("P10 · the free-stock offer", () => {
  /** One mattress line, Nice Future, its own build. */
  const MAT = (over: Partial<ToOrderLine> = {}) =>
    line({
      lineId: "m1", sku: "H1401S-K", orderId: "o7", so: 1290, customerName: "ng",
      category: "mattress", supplierId: NICE_FUTURE, leadDays: 7, modelName: "Haven",
      deadline: "2026-08-20", offDays: OFFICE_OFF_DAYS, qty: 5, stockKey: "haven|K",
      ...over,
    });

  const rowOf = (ls: ToOrderLine[], extra: Parameters<typeof run>[1] = {}) =>
    run(ls, extra)[0].rows[0];

  it("offers nothing at all when the caller passes no free stock — the page is untouched", () => {
    const r = rowOf([MAT()]);
    expect(r.freeStock).toBe(0);
    expect(r.builds[0].freeStock).toBe(0);
    expect(r.builds[0].freeStockItemIds).toEqual([]);
    // And the quantity is the whole requirement: nothing was consumed.
    expect(r.qty).toBe(5);
  });

  it("offers what the warehouse holds, and NEVER subtracts it", () => {
    const r = rowOf([MAT()], {
      freeStock: { "haven|K": [{ id: "i1", qty: 1 }, { id: "i2", qty: 1 }] },
    });
    expect(r.freeStock).toBe(2);
    expect(r.builds[0].freeStockItemIds).toEqual(["i1", "i2"]);
    // THE RULING: the row still says buy 5. The human decides.
    expect(r.qty).toBe(5);
    expect(r.builds[0].qty).toBe(5);
  });

  it("never offers more than the row still needs", () => {
    const r = rowOf([MAT({ qty: 2 })], {
      freeStock: {
        "haven|K": [{ id: "i1", qty: 1 }, { id: "i2", qty: 1 }, { id: "i3", qty: 1 }],
      },
    });
    expect(r.freeStock).toBe(2);
    expect(r.builds[0].freeStockItemIds).toEqual(["i1", "i2"]);
  });

  it("skips a record that would over-reserve rather than splitting it", () => {
    // A bulk record of 555 against a need of 2 would reserve 553 units nobody
    // asked for. The single unit behind it still fits and is offered.
    const r = rowOf([MAT({ qty: 2 })], {
      freeStock: { "haven|K": [{ id: "bulk", qty: 555 }, { id: "one", qty: 1 }] },
    });
    expect(r.freeStock).toBe(1);
    expect(r.builds[0].freeStockItemIds).toEqual(["one"]);
  });

  it("offers a bulk record whole when it fits exactly", () => {
    const r = rowOf([MAT({ qty: 2 })], {
      freeStock: { "haven|K": [{ id: "pair", qty: 2 }] },
    });
    expect(r.freeStock).toBe(2);
    expect(r.builds[0].freeStockItemIds).toEqual(["pair"]);
  });

  it("never offers one unit to two rows — the earliest deadline is served first", () => {
    const ps = run(
      [
        MAT({ lineId: "far", orderId: "of", so: 1, qty: 1, deadline: "2026-09-30" }),
        MAT({ lineId: "near", orderId: "on", so: 2, qty: 1, deadline: "2026-08-10" }),
      ],
      { freeStock: { "haven|K": [{ id: "only", qty: 1 }] } },
    );
    const rows = ps[0].rows;
    const near = rows.find((r) => r.so === 2)!;
    const far = rows.find((r) => r.so === 1)!;
    expect(near.freeStock).toBe(1);
    expect(near.builds[0].freeStockItemIds).toEqual(["only"]);
    expect(far.freeStock).toBe(0);
    expect(far.builds[0].freeStockItemIds).toEqual([]);
  });

  it("two SKU spellings that resolve to ONE pool drain ONE pool", () => {
    // `order_lines.sku` and `ops_stock_items.sku` are two vocabularies. Two
    // lines whose spellings differ but whose stock is the same stock must not
    // both be offered the same unit.
    const ps = run(
      [
        MAT({ lineId: "a", orderId: "oa", so: 1, qty: 1, sku: "H1401S-K", deadline: "2026-08-10" }),
        MAT({ lineId: "b", orderId: "ob", so: 2, qty: 1, sku: "HAVEN SOFTCLOUD H1401S-K",
              deadline: "2026-08-11" }),
      ],
      { freeStock: { "haven|K": [{ id: "only", qty: 1 }] } },
    );
    const total = ps[0].rows.reduce((s, r) => s + r.freeStock, 0);
    expect(total).toBe(1);
  });

  it("a SOFA BUILD of modules is offered nothing — its quantity is one sofa, its members are three SKUs", () => {
    // The keys are the lines' OWN stock keys — `stockKey ?? sku`. Written
    // lower-cased at first, they matched nothing, and this test passed with
    // the module guard removed: it was measuring a typo, not the rule.
    const r = rowOf(PETER, {
      freeStock: {
        // Every module has a free unit on the shelf. It still is not a sofa.
        "5539-1B(LHF)": [{ id: "s1", qty: 1 }],
        "5539-CNR": [{ id: "s2", qty: 1 }],
        "5539-2A(RHF)": [{ id: "s3", qty: 1 }],
        "5539-1A(LHF)": [{ id: "s4", qty: 1 }],
      },
    });
    expect(r.freeStock).toBe(0);
    for (const b of r.builds) expect(b.freeStockItemIds).toEqual([]);
  });

  it("a LONE sofa line is offered stock — the discriminator is the modules, not the category", () => {
    const r = rowOf(
      [line({ lineId: "solo", sku: "TELLUC-1S", orderId: "os", so: 9, buildKey: null,
              qty: 2, stockKey: "telluc1s" })],
      { freeStock: { telluc1s: [{ id: "t1", qty: 1 }] } },
    );
    expect(r.freeStock).toBe(1);
  });

  it("a line already covered by an open purchase order is offered nothing", () => {
    // T6 keeps the line on the sheet as a receipt, so the claim moves from
    // "it is gone" to the one that always mattered: nothing is OFFERED. There
    // is nothing left to buy, so reserving stock against it would solve a
    // problem that no longer exists — and would lock a unit for nobody.
    const ps = run([MAT({ qty: 2 })], {
      supply: { openPoBySku: { "H1401S-K": 2 } },
      freeStock: { "haven|K": [{ id: "i1", qty: 1 }] },
    });
    expect(ps).toHaveLength(1);
    const b = ps[0].rows[0].builds[0];
    expect(b.fullyOnPo).toBe(true);
    expect(b.freeStock).toBe(0);
    expect(b.freeStockItemIds).toEqual([]);
  });

  it("carries what was already taken onto the row, and the quantity is already net of it", () => {
    // The CALLER nets it (the stores are the caller's — the pool-draw ledger
    // and `purchase_demands.remaining_qty`); this only has to carry the fact,
    // or the number falls with nothing saying why.
    const r = rowOf([MAT({ qty: 3, takenFromStock: 2 })]);
    expect(r.qty).toBe(3);
    expect(r.takenFromStock).toBe(2);
    expect(r.builds[0].takenFromStock).toBe(2);
  });

  it("a row's offer is the sum of its builds' — by construction", () => {
    const r = rowOf(
      [
        MAT({ lineId: "x", qty: 1, sku: "H1401S-K", stockKey: "a" }),
        MAT({ lineId: "y", qty: 1, sku: "H1401S-Q", stockKey: "b", modelName: "Haven Q" }),
      ],
      { freeStock: { a: [{ id: "i1", qty: 1 }], b: [{ id: "i2", qty: 1 }] } },
    );
    expect(r.builds.map((b) => b.freeStock)).toEqual([1, 1]);
    expect(r.freeStock).toBe(2);
  });
});

describe("P10 · the three words", () => {
  it("says where the stock is and how much of it there is", () => {
    expect(freeStockLine("Carres Klang", 2)).toBe("Carres Klang: 2 available");
  });

  it("puts the number on the button — there is no quantity box anywhere", () => {
    expect(reserveFromStockLabel(2)).toBe("Reserve 2");
    expect(reserveFromStockLabel(1)).toBe("Reserve 1");
  });

  it("says why a quantity is smaller than what was asked for", () => {
    expect(reservedFromStockLabel(2)).toBe("reserved 2 from stock");
  });

  it("names the row in the expand control, so the number is not lost to a screen reader", () => {
    expect(stockExpandLabel("Haven K", 2)).toBe("Haven K — 2 available");
  });
});

/**
 * P13① — one act may not have two words. The order drawer's picker has said
 * `Reserve {n} to {soRef}` since 2026-06-30; To Order shipped `Take` on
 * 2026-08-04 and Loo ruled the same day that the OLDER word wins.
 */
describe("P13 · the take path speaks the drawer's word", () => {
  it("says Reserve, and `Take` is gone from every string in the path", () => {
    const strings = [
      freeStockLine("Carres Klang", 2),
      reserveFromStockLabel(2),
      reservedFromStockLabel(2),
      stockExpandLabel("Haven K", 2),
      readyStockDrawNote("Haven K"),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/\b(take|takes|taken|took|taking)\b/i);
    }
    expect(reserveFromStockLabel(2)).toContain("Reserve");
    expect(reservedFromStockLabel(2)).toContain("reserved");
  });

  it("records K4's sixth reason, never the catch-all P10 had to use", () => {
    expect(READY_STOCK_DRAW_REASON).toBe("used_instead_of_ordering");
    expect(READY_STOCK_DRAW_REASON).not.toBe("other");
    // The reason is a real member of the shared list, not a string the
    // database would refuse.
    expect(POOL_USE_REASONS).toContain(READY_STOCK_DRAW_REASON);
    expect(poolDrawProblem({ reason: READY_STOCK_DRAW_REASON })).toBeNull();
  });

  it("keeps in the note only what the reason cannot say — which build", () => {
    expect(readyStockDrawNote("Haven K")).toBe("To Order · Haven K");
    // The reason now carries this sentence; the note must not write it twice.
    expect(readyStockDrawNote("Haven K")).not.toContain("purchase order");
  });
});

/**
 * P15 — THE SOURCE LIST IS A MIRROR OF THE DATABASE, NOT A MENU (Loo,
 * 2026-08-04).
 *
 * The same discipline 0322 had to repair on the stock pool's reasons: the list
 * lives in `purchase_demands.purpose`'s CHECK, in `purchasing_create_demand`'s
 * own gate (0323) and here. When only some of them move, a dropdown offers a
 * word the server refuses BY NAME.
 */
describe("P15 · the Source a typed demand may carry", () => {
  it("holds exactly the four the database can store", () => {
    expect(DEMAND_PURPOSES.map((p) => p.value)).toEqual([
      "ready_stock",
      "display",
      "warranty",
      "office",
    ]);
  });

  it("offers no word the store has no value for", () => {
    // `Spare Parts` and `Other…` are RULED WORDS and they are deliberately not
    // offerable — neither has ever had a CHECK value, and inventing one would
    // be a screen ruling on a business question nobody has asked.
    const labels = DEMAND_PURPOSES.map((p) => p.label);
    expect(labels).not.toContain(TO_ORDER_WORDS.reasonSpareParts);
    expect(labels).not.toContain(TO_ORDER_WORDS.reasonOther);
    // ...and the words themselves survive, because a later card may need them.
    expect(TO_ORDER_WORDS.reasonSpareParts).toBe("Spare Parts");
    expect(TO_ORDER_WORDS.reasonOther).toBe("Other…");
  });

  it("every label comes from the words module — none is spelt twice", () => {
    for (const p of DEMAND_PURPOSES) {
      expect(Object.values(TO_ORDER_WORDS)).toContain(p.label);
    }
  });

  it("the default is Ready Stock — the RPC's own default and the common case", () => {
    expect(DEMAND_PURPOSE_DEFAULT).toBe("ready_stock");
    expect(DEMAND_PURPOSES[0].value).toBe(DEMAND_PURPOSE_DEFAULT);
    expect(isDemandPurpose(DEMAND_PURPOSE_DEFAULT)).toBe(true);
  });

  it("the guard admits the four and refuses everything else", () => {
    for (const v of DEMAND_PURPOSE_VALUES) expect(isDemandPurpose(v)).toBe(true);
    for (const v of ["spare_parts", "other", "", "READY_STOCK", null, 7, undefined]) {
      expect(isDemandPurpose(v)).toBe(false);
    }
  });
});

/**
 * P15 — THE PICKER'S TWO STOCK WORDS ARE THE REGISTER'S OWN.
 *
 * `Free` and `Reserved` have ONE home — `OPS_STOCK_STATUS_LABEL` — and the
 * picker's headers mirror it. A copy that may drift is not a mirror, so the
 * equality is asserted rather than trusted to whoever renames next.
 */
describe("P15 · the picker's column words", () => {
  it("Free and Reserved are the register's own labels, character for character", () => {
    expect(TO_ORDER_WORDS.pickerColFree).toBe(OPS_STOCK_STATUS_LABEL.free);
    expect(TO_ORDER_WORDS.pickerColReserved).toBe(OPS_STOCK_STATUS_LABEL.reserved);
  });

  it("the ambiguous column is the SKU, and it is not the Item field's word", () => {
    // P15's defect 1: four SKUs read `Booqit`. The code is what separates them.
    expect(TO_ORDER_WORDS.pickerColSku).toBe("SKU");
    // One word may not label two things in one dialog: the FIELD is `Item`, so
    // the model COLUMN takes the grid's own word for that value.
    expect(TO_ORDER_WORDS.colModel).not.toBe(TO_ORDER_WORDS.itemLabel);
  });
});

/**
 * P18 — THE ORDER'S PROCEED DATE, AND THE COUNT THAT ONLY SPEAKS ONCE IT MEANS
 * SOMETHING.
 *
 * Two separate claims, tested apart because they can fail apart: the engine
 * CARRIES the order fact onto the row (so the group header has something to
 * read), and `proceedWaitedDays` decides WHETHER a waiting count exists at all.
 *
 * Loo ruled the conditional form on 2026-08-05 after being shown that the
 * unconditional one printed `(-1 days)` on live production — `SO-1256`'s proceed
 * date was the following day.
 */
describe("P18 · the order's proceed date reaches the row", () => {
  it("rides the row, read off the order's first line", () => {
    const [sofa] = run(PETER.map((l) => line({ ...l, proceedDate: "2026-07-21" })));
    expect(sofa.rows).toHaveLength(1);
    expect(sofa.rows[0]!.proceedDate).toBe("2026-07-21");
  });

  it("is null when the order has none — never guessed from another date", () => {
    const [sofa] = run(PETER);
    // The order carries a deadline and a placedAt; neither may stand in for a
    // plan the salesperson did not type.
    expect(sofa.rows[0]!.proceedDate).toBeNull();
    expect(sofa.rows[0]!.delivery).toBe("2026-08-22");
  });

  it("a READY STOCK demand has no order and therefore no proceed date", () => {
    const [p] = run([
      line({
        lineId: "r1", sku: "5539-1A(LHF)", orderId: "demand:abc", so: null,
        customerName: null, readyStock: true, destinationName: "Carres Klang",
        buildKey: null,
      }),
    ]);
    expect(p.rows[0]!.readyStock).toBe(true);
    expect(p.rows[0]!.proceedDate).toBeNull();
  });

  it("two orders keep their own dates — it is not hoisted across the proposal", () => {
    const [sofa] = run([
      ...PETER.map((l) => line({ ...l, proceedDate: "2026-07-21" })),
      ...ELLA.map((l) => line({ ...l, proceedDate: "2026-07-28" })),
    ]);
    const byCustomer = new Map(sofa.rows.map((r) => [r.customer, r.proceedDate]));
    expect(byCustomer.get("PETER")).toBe("2026-07-21");
    expect(byCustomer.get("ella")).toBe("2026-07-28");
  });
});

describe("P18 · proceedWaitedDays", () => {
  it("counts the days once the date has passed", () => {
    // The card's own worked example, and the live reading on 2026-08-05.
    expect(proceedWaitedDays("2026-07-21", "2026-08-05")).toBe(15);
    expect(proceedWaitedDays("2026-08-04", "2026-08-05")).toBe(1);
  });

  it("says NOTHING while the date is still ahead — the live SO-1256 case", () => {
    // Measured on production 2026-08-05: SO-1256's proceed date was 2026-08-06.
    // An unconditional count printed `(-1 days)`; this is why Loo ruled option C.
    expect(proceedWaitedDays("2026-08-06", "2026-08-05")).toBeNull();
    expect(proceedWaitedDays("2026-09-01", "2026-08-05")).toBeNull();
  });

  it("says nothing ON the day itself — `(0 days)` would complain about an order that is on time", () => {
    expect(proceedWaitedDays("2026-08-05", "2026-08-05")).toBeNull();
  });

  it("says nothing when either date is missing, rather than counting from nowhere", () => {
    expect(proceedWaitedDays(null, "2026-08-05")).toBeNull();
    expect(proceedWaitedDays(undefined, "2026-08-05")).toBeNull();
    expect(proceedWaitedDays("2026-07-21", null)).toBeNull();
    expect(proceedWaitedDays("2026-07-21", undefined)).toBeNull();
  });

  it("crosses a month and a year boundary by real days, not by arithmetic on the parts", () => {
    expect(proceedWaitedDays("2026-07-31", "2026-08-01")).toBe(1);
    expect(proceedWaitedDays("2025-12-31", "2026-01-01")).toBe(1);
    // 2028 is a leap year: 28 Feb → 1 Mar is TWO days, not one.
    expect(proceedWaitedDays("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("is a pure function of the two dates — no clock, so a test is not date-fused", () => {
    // The same pair answers the same number whenever it is asked. Several
    // fixtures in this repo have silently changed meaning as a real date rolled
    // past them; this one cannot.
    expect(proceedWaitedDays("2026-07-21", "2026-08-05")).toBe(
      proceedWaitedDays("2026-07-21", "2026-08-05"),
    );
  });
});

describe("P18 · the label", () => {
  it("is the four-place live spelling, and not the STATE word `Proceed`", () => {
    expect(TO_ORDER_WORDS.proceedDate).toBe("Proceed date");
    // COPY-STANDARD owns bare `Proceed` as an ORDER STATE (customer confirmed,
    // ready for PO). The date is a different fact and may not wear its word.
    expect(TO_ORDER_WORDS.proceedDate).not.toBe("Proceed");
  });

  it("is labelled BECAUSE the delivery date next to it is not", () => {
    // The header carried exactly one bare date before P18. Two bare dates on
    // one line is the confusion the card's Done-when forbids, so this one takes
    // a label — and the label must not read as the column heading of the other.
    expect(TO_ORDER_WORDS.proceedDate).not.toBe(TO_ORDER_WORDS.colPreferred);
  });
});
