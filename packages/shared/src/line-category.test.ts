import { describe, it, expect } from "vitest";
import {
  accShort,
  accessoryType,
  lineCategory,
  lineClass,
  lineKind,
  lineSortRank,
} from "./line-category";
import { lineReadiness, readinessCounts } from "./line-readiness";

/**
 * D9 — an unrecognised SKU may not claim it is safe to deliver.
 *
 * The defect these tests exist to keep dead: `lineCategory` used to end in
 * `return "acc"`, and §7 rules that an accessory never blocks a delivery. So a
 * SKU nothing recognised was silently declared safe, reported "1/1 ready" on
 * zero units, and the drawer's ladder answered *goods secured*.
 *
 * The thirteen SKUs below are not invented. They were read off PRODUCTION on
 * 2026-08-08 by replaying the classifier's exact branches in SQL: 36 lines
 * across 17 of 77 live orders were core goods reading as accessories, and 12
 * orders classified as accessories end to end — orders that could never fail a
 * stock check. `CLAUDE.md` §6 rules every live row is TEST data, so those
 * counts are evidence about the CODE, never about business volume.
 */
const MISREAD_SOFA_MODULES = [
  "5539-1A(LHF)",
  "5539-1B(LHF)",
  "5539-2A(RHF)",
  "5539-2B(LHF)",
  "5539-CNR",
  "5539-L(RHF)",
  "5539-STOOL",
  "LYYAR-1A(LHF)",
  "LYYAR-1A(RHF)",
  "TELLUC-1S",
];
const MISREAD_MATTRESS_SHAPED = ["M1201F-K", "N1001S-Q", "GRT-MATTRESS-15Y"];
const MISREAD = [...MISREAD_SOFA_MODULES, ...MISREAD_MATTRESS_SHAPED];

/** The fixture four tests were passing against while believing it was a sofa
 *  (`OperationOrders.test.tsx`) — the SKU that found D9. */
const FIXTURE_FAKE_SOFA = "SOFA-NORD-3S";

describe("lineClass — the fourth answer (D9)", () => {
  it("does not call a production sofa module an accessory", () => {
    for (const sku of MISREAD_SOFA_MODULES)
      expect(`${sku} → ${lineClass(sku)}`).toBe(`${sku} → unknown`);
  });

  it("does not call a production mattress-shaped sku an accessory", () => {
    for (const sku of MISREAD_MATTRESS_SHAPED)
      expect(`${sku} → ${lineClass(sku)}`).toBe(`${sku} → unknown`);
  });

  it("M1401F-K is a mattress and M1201F-K is not — one digit, and that is the point", () => {
    // The keyword list holds `m140`. `M1201F-K` is one product family away and
    // used to fall through to "accessory, therefore always ready". It is now
    // `unknown`, which is the honest answer until the family is named.
    expect(lineClass("M1401F-K")).toBe("mattress");
    expect(lineClass("M1201F-K")).toBe("unknown");
  });

  it("the SKU that found the bug is unknown, not an accessory", () => {
    expect(lineClass(FIXTURE_FAKE_SOFA)).toBe("unknown");
  });

  it("an accessory is EARNED by a word, never by elimination", () => {
    expect(lineClass("Memory Foam Pillow")).toBe("acc");
    expect(lineClass("Mattress Protector-Q")).toBe("acc");
    expect(lineClass("SVC-DISPOSE-OLD-SOFA-BIG-SOFA")).toBe("acc");
    expect(lineClass("Carress Footrest-K")).toBe("acc");
    expect(lineClass("Cool Gel Topper")).toBe("acc");
    expect(lineClass("Per Floor Charge")).toBe("acc");
    // …and a thing no word recognises is not promoted into that company.
    expect(accessoryType("ZZTOP-9000")).toBeNull();
    expect(lineClass("ZZTOP-9000")).toBe("unknown");
  });

  it("keeps every classification the rule already made — core first, acc guard before it", () => {
    // Regression on the pre-D9 answers: the fix changed the DEFAULT, not the
    // recognition order. "Mattress Protector" must still beat the core lists.
    expect(lineClass("mattress:FirmCare-K")).toBe("mattress");
    expect(lineClass("sofa:Nuvio")).toBe("sofa");
    expect(lineClass("bedframe:Hilton/COL:KN390-15")).toBe("bedframe");
    expect(lineClass("Muro 3 Seater")).toBe("sofa");
    expect(lineClass("Breeze FirmCare-B1201F-Q")).toBe("mattress");
    expect(lineClass("Hilton Divan/Fab3-King")).toBe("bedframe");
    expect(lineClass("MS12-Queen")).toBe("mattress");
    expect(lineClass("BF07-King")).toBe("bedframe");
    expect(lineClass("SF21-3S")).toBe("sofa");
    expect(lineClass("Mattress Protector-K")).toBe("acc");
    expect(lineClass("Memory Pillow")).toBe("acc");
  });

  it("a broad accessory word never outranks a core model name", () => {
    // "delivery" / "ottoman" live in the accessory vocabulary but are tested
    // AFTER the core lists precisely so a model carrying one stays core.
    expect(lineClass("Muro 3 Seater with Ottoman")).toBe("sofa");
    expect(lineClass("MS12-Queen delivery set")).toBe("mattress");
  });
});

describe("lineCategory — the narrowed display view", () => {
  it("still answers acc for an unknown sku, and that is documented, not accidental", () => {
    // Two screens group their rows by this and D9 was scoped to the shared
    // rule. The FOLD is allowed; the CLAIM is not — see the next describe.
    expect(lineCategory(FIXTURE_FAKE_SOFA)).toBe("acc");
    expect(lineCategory("Memory Pillow")).toBe("acc");
  });

  it("agrees with lineClass on everything lineClass can name", () => {
    for (const sku of [
      "mattress:FirmCare-K",
      "sofa:Nuvio",
      "Muro 3 Seater",
      "BF07-King",
      "Memory Pillow",
    ])
      expect(lineCategory(sku)).toBe(lineClass(sku));
  });
});

describe("lineKind — the safety answer", () => {
  it("gives an unrecognised sku its own seat, never core / acc / service", () => {
    expect(lineKind(FIXTURE_FAKE_SOFA)).toBe("unknown");
    for (const sku of MISREAD) expect(lineKind(sku)).toBe("unknown");
  });

  it("still separates core, accessory and service", () => {
    expect(lineKind("mattress:FirmCare-K")).toBe("core");
    expect(lineKind("Memory Pillow")).toBe("acc");
    expect(lineKind("Disposal of old mattress")).toBe("service");
    expect(lineKind("No Lift Charge")).toBe("service");
  });
});

describe("accShort", () => {
  it("speaks the recognised type, and falls back to the first word otherwise", () => {
    expect(accShort("Memory Foam Pillow")).toBe("Pillow");
    expect(accShort("Mattress Protector-Q")).toBe("Mattress protector");
    expect(accShort("Carress Footrest-K")).toBe("Footrest");
    expect(accShort("Microfiber Cloth")).toBe("Microfiber");
  });
});

describe("lineSortRank", () => {
  it("puts an unknown line with the core goods, not under the pillows", () => {
    expect(lineSortRank(FIXTURE_FAKE_SOFA)).toBeGreaterThan(
      lineSortRank("sofa:Nuvio"),
    );
    expect(lineSortRank(FIXTURE_FAKE_SOFA)).toBeLessThan(
      lineSortRank("Memory Pillow"),
    );
  });

  it("keeps the frozen order mattress → bedframe → sofa → pillow → protector → service", () => {
    const ranks = [
      "mattress:FirmCare-K",
      "bedframe:Hilton",
      "sofa:Nuvio",
      "Memory Pillow",
      "Mattress Protector-K",
      "Disposal of old mattress",
    ].map(lineSortRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("lineReadiness — the claim D9 removed", () => {
  const base = { qty: 1, reservedCount: 0, freeCount: 0, hasPo: false };

  it("an unrecognised sku with nothing on hand is NOT ready", () => {
    // THE bug, in one assertion: this used to answer "reserved".
    expect(lineReadiness({ ...base, sku: FIXTURE_FAKE_SOFA })).toBe("unknown");
    for (const sku of MISREAD)
      expect(lineReadiness({ ...base, sku })).not.toBe("reserved");
  });

  it("a recognised accessory is still always ready (Jess 2026-07-07)", () => {
    expect(lineReadiness({ ...base, sku: "Memory Pillow" })).toBe("reserved");
  });

  it("unknown yields to every piece of real evidence", () => {
    const sku = FIXTURE_FAKE_SOFA;
    // Units actually reserved to this SO are proof, whatever the thing is.
    expect(lineReadiness({ ...base, sku, reservedCount: 1 })).toBe("reserved");
    expect(lineReadiness({ ...base, sku, freeCount: 3 })).toBe("to_reserve");
    expect(lineReadiness({ ...base, sku, hasPo: true })).toBe("on_po");
    expect(lineReadiness({ ...base, sku, override: "ready" })).toBe("to_reserve");
  });

  it("unknown is not no_po — 'nobody ordered it' is a claim about a thing we can name", () => {
    expect(lineReadiness({ ...base, sku: "mattress:FirmCare-K" })).toBe("no_po");
    expect(lineReadiness({ ...base, sku: FIXTURE_FAKE_SOFA })).toBe("unknown");
  });

  it("readinessCounts keeps unknown out of the raise-a-PO pile", () => {
    const c = readinessCounts([
      lineReadiness({ ...base, sku: "mattress:FirmCare-K" }),
      lineReadiness({ ...base, sku: FIXTURE_FAKE_SOFA }),
      lineReadiness({ ...base, sku: "Memory Pillow" }),
    ]);
    expect(c).toEqual({
      ready: 1,
      toReserve: 0,
      onPo: 0,
      noPo: 1,
      unknown: 1,
      total: 3,
    });
  });

  it("the headline: an all-unknown order can no longer report every line ready", () => {
    // The 12 production orders whose EVERY line classified as `acc`. Under the
    // old rule this array was five × "reserved" and the ladder said `ready`.
    const lines = MISREAD_SOFA_MODULES.slice(0, 5).map((sku) =>
      lineReadiness({ ...base, sku }),
    );
    const counts = readinessCounts(lines);
    expect(counts.ready).toBe(0);
    expect(counts.unknown).toBe(5);
  });
});
