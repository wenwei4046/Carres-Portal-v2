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
  unitsHeadline,
  poScheduleDays,
  snapToPoDay,
  poScheduleBucket,
  weekdayName,
  type ToOrderLine,
  type ToOrderRow,
} from "./to-order";
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

  it("sinks a row with no date in BOTH directions", () => {
    const rows: ToOrderRow[] = [
      { orderId: "a", so: 1, customer: "a", qty: 1, summary: "", stockReady: "2026-08-01", builds: [] },
      { orderId: "b", so: 2, customer: "b", qty: 1, summary: "", stockReady: null, builds: [] },
      { orderId: "c", so: 3, customer: "c", qty: 1, summary: "", stockReady: "2026-08-20", builds: [] },
    ];
    expect(sortToOrderRows(rows, "stockReady", true).map((r) => r.orderId)).toEqual(["a", "c", "b"]);
    expect(sortToOrderRows(rows, "stockReady", false).map((r) => r.orderId)).toEqual(["c", "a", "b"]);
  });

  it("sinks a dateless row under EVERY column, in both directions", () => {
    // `aaa` would win a customer sort and `1` would win a Qty sort — it has no
    // deadline, so neither may lift it above dated work.
    const rows: ToOrderRow[] = [
      { orderId: "none", so: 1, customer: "aaa", qty: 1, summary: "aaa", stockReady: null, builds: [] },
      { orderId: "b", so: 9, customer: "zzz", qty: 9, summary: "zzz", stockReady: "2026-08-01", builds: [] },
    ];
    for (const key of ["cust", "so", "qty", "summary", "stockReady"] as const) {
      expect(sortToOrderRows(rows, key, true).map((r) => r.orderId)).toEqual(["b", "none"]);
      expect(sortToOrderRows(rows, key, false).map((r) => r.orderId)).toEqual(["b", "none"]);
    }
  });
});

// ── 12 · a secured requirement leaves the workspace ─────────────────────────

describe("what leaves To Order", () => {
  it("drops a line an open purchase order already covers", () => {
    const covered = run(ELLA, {
      supply: { openPoBySku: { "5539-1A(LHF)": 1, "5539-2A(RHF)": 1 } },
    });
    expect(covered).toHaveLength(0);
  });

  it("keeps the workspace when only part is covered", () => {
    const ps = run(ELLA, { supply: { openPoBySku: { "5539-1A(LHF)": 1 } } });
    expect(ps).toHaveLength(1);
    expect(ps[0].rows[0].builds[0].lines.map((l) => l.sku)).toEqual(["5539-2A(RHF)"]);
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
