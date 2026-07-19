import { describe, expect, it } from "vitest";
import {
  monthKeyMYT,
  isPoDayMYT,
  nextPoDayMYT,
  poStockLeadDaysFor,
  poUrgentBypass,
  pickNextDutyHolder,
  canRaisePo,
} from "./ops-po-duty";
import { isOpsManager } from "./ops-order-control";

// Fixed instants (UTC) with known MYT (+8) counterparts.
const MON_MYT = new Date("2026-07-20T01:00:00Z"); // Mon 09:00 MYT
const THU_MYT = new Date("2026-07-23T01:00:00Z"); // Thu 09:00 MYT
const TUE_MYT = new Date("2026-07-21T01:00:00Z"); // Tue 09:00 MYT
// 23:00 MYT Sun = 15:00Z Sun — crosses the UTC/MYT date boundary going in.
const SUN_LATE_MYT = new Date("2026-07-19T15:00:00Z");
// 07:00 MYT on Aug 1 = 23:00Z Jul 31 — month boundary case.
const AUG1_EARLY_MYT = new Date("2026-07-31T23:00:00Z");

describe("monthKeyMYT", () => {
  it("uses the MYT calendar month, not UTC", () => {
    expect(monthKeyMYT(MON_MYT)).toBe("2026-07");
    expect(monthKeyMYT(AUG1_EARLY_MYT)).toBe("2026-08"); // still Jul in UTC
  });
});

describe("isPoDayMYT", () => {
  it("Mon + Thu MYT are PO days", () => {
    expect(isPoDayMYT(MON_MYT)).toBe(true);
    expect(isPoDayMYT(THU_MYT)).toBe(true);
  });
  it("other days are not — and the MYT shift decides the weekday", () => {
    expect(isPoDayMYT(TUE_MYT)).toBe(false);
    expect(isPoDayMYT(SUN_LATE_MYT)).toBe(false); // Sun 23:00 MYT (Sun 15:00Z)
  });
});

describe("nextPoDayMYT", () => {
  it("today when today is a PO day (MYT)", () => {
    expect(nextPoDayMYT(MON_MYT)).toBe("2026-07-20");
    expect(nextPoDayMYT(THU_MYT)).toBe("2026-07-23");
  });
  it("rolls forward to the next Mon/Thu otherwise", () => {
    expect(nextPoDayMYT(TUE_MYT)).toBe("2026-07-23"); // Tue → Thu
    expect(nextPoDayMYT(SUN_LATE_MYT)).toBe("2026-07-20"); // Sun 23:00 MYT → Mon
  });
});

describe("poStockLeadDaysFor", () => {
  it("MS/BF 7 · sofa 5 · unknown falls back to 7", () => {
    expect(poStockLeadDaysFor("mattress")).toBe(7);
    expect(poStockLeadDaysFor("bedframe")).toBe(7);
    expect(poStockLeadDaysFor("sofa")).toBe(5);
    expect(poStockLeadDaysFor("accessory")).toBe(7);
    expect(poStockLeadDaysFor(null)).toBe(7);
  });
});

describe("poUrgentBypass", () => {
  const now = MON_MYT; // 2026-07-20 MYT
  it("deadline inside the window → urgent (sofa 5d)", () => {
    expect(poUrgentBypass("2026-07-24", ["sofa"], now)).toBe(true); // 4d left
    expect(poUrgentBypass("2026-07-26", ["sofa"], now)).toBe(false); // 6d left
  });
  it("mattress/bedframe window is 7d", () => {
    expect(poUrgentBypass("2026-07-27", ["mattress"], now)).toBe(true); // 7d left
    expect(poUrgentBypass("2026-07-28", ["mattress"], now)).toBe(false); // 8d left
  });
  it("mixed categories: ANY window hit flags urgent", () => {
    expect(poUrgentBypass("2026-07-26", ["sofa", "bedframe"], now)).toBe(true); // 6d: bf hits
  });
  it("past-deadline is always urgent; no deadline never is", () => {
    expect(poUrgentBypass("2026-07-01", ["sofa"], now)).toBe(true);
    expect(poUrgentBypass(null, ["sofa"], now)).toBe(false);
    expect(poUrgentBypass(undefined, [], now)).toBe(false);
  });
  it("empty categories use the default 7d window", () => {
    expect(poUrgentBypass("2026-07-26", [], now)).toBe(true); // 6d ≤ 7
    expect(poUrgentBypass("2026-07-28", [], now)).toBe(false);
  });
});

describe("pickNextDutyHolder", () => {
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const B = "bbbbbbbb-0000-0000-0000-000000000002";
  const C = "cccccccc-0000-0000-0000-000000000003";
  it("empty pool → null; empty history with a pool picks a member", () => {
    expect(pickNextDutyHolder([{ month: "2026-07", user_id: A }], [])).toBeNull();
    expect(pickNextDutyHolder([], [A])).toBe(A);
  });
  it("never-served members go first (fewest months)", () => {
    const history = [
      { month: "2026-07", user_id: A },
      { month: "2026-08", user_id: B },
    ];
    expect(pickNextDutyHolder(history, [A, B, C])).toBe(C);
  });
  it("all served equally → longest-ago last service rotates", () => {
    const history = [
      { month: "2026-07", user_id: A },
      { month: "2026-08", user_id: B },
      { month: "2026-09", user_id: C },
    ];
    expect(pickNextDutyHolder(history, [A, B, C])).toBe(A); // A served longest ago
  });
  it("deterministic tie-break on userId", () => {
    expect(pickNextDutyHolder([], [C, A, B])).toBe(A);
  });
  it("history rows for members no longer in the pool don't crash the pick", () => {
    const history = [{ month: "2026-07", user_id: "dddddddd-0000-0000-0000-000000000004" }];
    expect(pickNextDutyHolder(history, [A])).toBe(A);
  });
});

describe("canRaisePo", () => {
  const HOLDER = "aaaaaaaa-0000-0000-0000-000000000001";
  const OTHER = "bbbbbbbb-0000-0000-0000-000000000002";
  it("managers always can (jess@ / operation@ / principal)", () => {
    expect(canRaisePo(HOLDER, OTHER, "operation", "jess@carres.com", isOpsManager)).toBe(true);
    expect(canRaisePo(HOLDER, OTHER, "principal", "boss@x.com", isOpsManager)).toBe(true);
  });
  it("the month's holder can; other staff cannot", () => {
    expect(canRaisePo(HOLDER, HOLDER, "operation", "shasha@carres.com", isOpsManager)).toBe(true);
    expect(canRaisePo(HOLDER, OTHER, "operation", "liching@carres.com", isOpsManager)).toBe(false);
  });
  it("dormant (no holder) → everyone can — a missing feature never blocks work", () => {
    expect(canRaisePo(null, OTHER, "operation", "liching@carres.com", isOpsManager)).toBe(true);
  });
});
