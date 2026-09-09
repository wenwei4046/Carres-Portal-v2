import { describe, it, expect } from "vitest";
import {
  applyRailSelection,
  ATTENTION_REASON_LABEL,
  availabilityLabel,
  categoryKeyOf,
  changedWithin,
  EMPTY_RAIL_SELECTION,
  hasAttention,
  isCurrentUnit,
  isRailFiltered,
  matchesRegisterQuery,
  NO_CATALOG_KEY,
  registerSummaryLine,
  summariseRegister,
  type StockRegisterUnit,
} from "./stock-register";

function unit(over: Partial<StockRegisterUnit> = {}): StockRegisterUnit {
  return {
    id: "u1",
    unitCode: "id-abc123456",
    identityScope: "unit",
    sku: "BF03-Jager-K",
    category: "bedframe",
    warehouseId: "wh1",
    siteName: "Carres Klang Warehouse",
    holderPartyId: null,
    holderName: null,
    ownership: "carres_owned",
    supplier: "Ohana",
    poNo: "PO/2508-116",
    status: "free",
    condition: "new",
    needsRepair: false,
    holdReason: null,
    reservedRef: null,
    soldOrderId: null,
    qty: 1,
    dateIn: "2026-08-01",
    lastVerifiedAt: null,
    availability: "available",
    lifecycleOutcome: "active",
    lastEventAt: null,
    lastEvent: null,
    ...over,
  };
}

describe("the default view is CURRENT units (Card §1)", () => {
  it("keeps every availability except ended", () => {
    for (const a of ["available", "reserved", "incoming", "in_transit", "not_available"] as const) {
      expect(isCurrentUnit(unit({ availability: a }))).toBe(true);
    }
    expect(isCurrentUnit(unit({ availability: "ended" }))).toBe(false);
  });

  it("hides ended Units from the default list", () => {
    const rows = [unit({ id: "a" }), unit({ id: "b", availability: "ended" })];
    const out = applyRailSelection(rows, EMPTY_RAIL_SELECTION, new Date());
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("STILL finds an ended Unit by its EXACT id — Card §6 requires the search to open it", () => {
    const ended = unit({ id: "b", unitCode: "id-zzz999999", availability: "ended" });
    const out = applyRailSelection([unit({ id: "a" }), ended], {
      ...EMPTY_RAIL_SELECTION,
      query: "id-zzz999999",
    }, new Date());
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("does NOT surface an ended Unit on a partial or product search", () => {
    const ended = unit({ id: "b", unitCode: "id-zzz999999", availability: "ended" });
    // a prefix is not an exact id, and the SKU is not an id at all
    for (const q of ["id-zzz", "BF03-Jager-K"]) {
      const out = applyRailSelection([ended], { ...EMPTY_RAIL_SELECTION, query: q }, new Date());
      expect(out).toEqual([]);
    }
  });
});

describe("Changed reads the PHYSICAL event ledger, never updated_at (Card §3)", () => {
  /**
   * ⚠ THESE FIXTURES ARE BUILT FROM `now`, NOT WRITTEN AS FIXED OFFSETS.
   *
   * The first version of this block used `+08:00` literals and passed locally
   * while FAILING on CI, which runs UTC — `changedWithin` compares against LOCAL
   * midnight (the operator's today is the browser's, which is the whole point),
   * so a fixed instant lands on a different side of the boundary in a different
   * zone. That is the same defect ENGINEERING §7 records for the Windows path
   * separator: green on the machine that reported, red on the machine that ran.
   *
   * Building each timestamp from `now` in LOCAL terms tests the actual rule —
   * "since local midnight", "since local Monday" — in any timezone.
   */
  const now = new Date(2026, 7, 21, 15, 0, 0); // local Friday 21 Aug 2026, 15:00

  /** A local wall-clock instant, offset from `now` by whole days. */
  function localAt(daysFromNow: number, h: number, m: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  it("a Unit that has never moved is in no time scope", () => {
    const u = unit({ lastEventAt: null });
    expect(changedWithin(u, "today", now)).toBe(false);
    expect(changedWithin(u, "week", now)).toBe(false);
    expect(changedWithin(u, "month", now)).toBe(false);
  });

  it("today means since LOCAL midnight, in whatever zone the operator is in", () => {
    expect(changedWithin(unit({ lastEventAt: localAt(0, 0, 30) }), "today", now)).toBe(true);
    expect(changedWithin(unit({ lastEventAt: localAt(-1, 23, 30) }), "today", now)).toBe(false);
  });

  it("this week starts MONDAY, not Sunday", () => {
    // `now` is a Friday, so Monday is 4 days back and the Sunday before it is 5.
    expect(changedWithin(unit({ lastEventAt: localAt(-4, 9, 0) }), "week", now)).toBe(true);
    expect(changedWithin(unit({ lastEventAt: localAt(-5, 9, 0) }), "week", now)).toBe(false);
  });

  it("this month starts on the 1st", () => {
    const firstOfMonth = new Date(now);
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    const lastOfPrevMonth = new Date(firstOfMonth.getTime() - 60_000);
    expect(changedWithin(unit({ lastEventAt: firstOfMonth.toISOString() }), "month", now)).toBe(true);
    expect(changedWithin(unit({ lastEventAt: lastOfPrevMonth.toISOString() }), "month", now)).toBe(false);
  });

  it("a malformed timestamp is not a match, and does not throw", () => {
    expect(changedWithin(unit({ lastEventAt: "not-a-date" }), "today", now)).toBe(false);
  });
});

describe("Attention chips only exist where the FACT exists", () => {
  it("each reason reads its own fact", () => {
    expect(hasAttention(unit({ holdReason: "inspection" }), "on_hold")).toBe(true);
    expect(hasAttention(unit({ holdReason: null }), "on_hold")).toBe(false);
    expect(hasAttention(unit({ needsRepair: true }), "in_repair")).toBe(true);
    expect(hasAttention(unit({ condition: "damaged" }), "damaged")).toBe(true);
    expect(hasAttention(unit({ poNo: null }), "no_source")).toBe(true);
    expect(hasAttention(unit({ poNo: "PO/1" }), "no_source")).toBe(false);
  });

  it("no chip is named after a fact the database does not hold", () => {
    // The five Card §3 reasons with no column behind them must not have shipped
    // as controls. If a future card adds the fact, it adds the chip WITH it.
    const shipped = Object.keys(ATTENTION_REASON_LABEL);
    for (const absent of ["cannot_find", "unit_id_issue", "site_differs", "components_missing", "evidence_incomplete"]) {
      expect(shipped).not.toContain(absent);
    }
  });
});

describe("the catalog answers the category, and says so when it cannot", () => {
  it("uses the catalog's value", () => {
    expect(categoryKeyOf(unit({ category: "sofa" }))).toBe("sofa");
  });
  it("an unknown SKU lands in the honest bucket, never in Accessory", () => {
    expect(categoryKeyOf(unit({ category: null }))).toBe(NO_CATALOG_KEY);
    expect(categoryKeyOf(unit({ category: null }))).not.toBe("accessory");
  });
});

describe("rail sections combine; one selection applies within a section (Card §3)", () => {
  const now = new Date(2026, 7, 21, 15, 0, 0);
  const rows = [
    unit({ id: "a", availability: "available", ownership: "carres_owned", category: "sofa" }),
    unit({ id: "b", availability: "reserved", ownership: "carres_owned", category: "sofa" }),
    unit({ id: "c", availability: "available", ownership: "supplier_consignment", category: "mattress" }),
  ];

  it("All stock clears every filter", () => {
    expect(isRailFiltered(EMPTY_RAIL_SELECTION)).toBe(false);
    expect(applyRailSelection(rows, EMPTY_RAIL_SELECTION, now)).toHaveLength(3);
  });

  it("two sections AND together", () => {
    const out = applyRailSelection(rows, {
      ...EMPTY_RAIL_SELECTION,
      availability: "available",
      ownership: "carres_owned",
    }, now);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("a filtered rail reports itself as filtered", () => {
    expect(isRailFiltered({ ...EMPTY_RAIL_SELECTION, category: "sofa" })).toBe(true);
    expect(isRailFiltered({ ...EMPTY_RAIL_SELECTION, query: "  " })).toBe(false);
  });
});

describe("search finds a Unit the way an operator looks for one (Card §4)", () => {
  const u = unit({ unitCode: "id-hgt591896", productName: "Dream · King", sku: "Essential Memory Pillow(L)", poNo: "PO/2508-116", reservedRef: "SO-1319", supplier: "Ohana" });
  it.each([
    ["unit id", "id-hgt591896"],
    ["product", "memory pillow"],
    ["product name", "dream"],
    ["source PO", "2508-116"],
    ["sales order", "SO-1319"],
    ["supplier", "ohana"],
  ])("matches on %s", (_label, q) => {
    expect(matchesRegisterQuery(u, q)).toBe(true);
  });
  it("does not match an unrelated string", () => {
    expect(matchesRegisterQuery(u, "zzzz")).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(matchesRegisterQuery(u, "   ")).toBe(true);
  });
});

describe("the footer tells the truth about what can be promised", () => {
  it("counts exact Units and bulk pieces SEPARATELY — they are different facts", () => {
    const rows = [
      unit({ id: "a", availability: "available", qty: 1 }),
      unit({ id: "b", availability: "available", qty: 555 }),
      unit({ id: "c", availability: "reserved", qty: 1 }),
    ];
    expect(summariseRegister(rows)).toEqual({ units: 3, available: 1, bulkOnHand: 555 });
  });

  it("a bulk record NEVER counts as promisable — 0366 forbids it being reserved", () => {
    const { available } = summariseRegister([unit({ availability: "available", qty: 893 })]);
    expect(available).toBe(0);
  });

  it("prints both numbers when bulk exists, and one when it does not", () => {
    expect(registerSummaryLine({ units: 90, available: 85, bulkOnHand: 893 }, 90))
      .toBe("90 Units · 85 you can promise · 893 pieces you cannot");
    expect(registerSummaryLine({ units: 85, available: 85, bulkOnHand: 0 }, 85))
      .toBe("85 Units · 85 you can promise");
  });

  it("says 'of' when the list is narrowed, so a filtered view cannot look whole", () => {
    expect(registerSummaryLine({ units: 12, available: 12, bulkOnHand: 0 }, 90))
      .toBe("12 of 90 Units · 12 you can promise");
  });

  it("is plural-correct for one Unit", () => {
    expect(registerSummaryLine({ units: 1, available: 1, bulkOnHand: 0 }, 1))
      .toBe("1 Unit · 1 you can promise");
  });
});

describe("the operator's word for `reserved` lives only at the UI boundary", () => {
  it("reads Reserved / sold on screen while the VALUE stays reserved", () => {
    expect(availabilityLabel("reserved")).toBe("Reserved / sold");
    expect(availabilityLabel("ended")).toBe("Delivered / history");
    expect(availabilityLabel("available")).toBe("Available");
  });
});
