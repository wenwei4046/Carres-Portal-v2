import { describe, expect, it } from "vitest";
import {
  monthKeyMYT,
  grnDutyMonth,
  isPoDayMYT,
  nextPoDayMYT,
  poUrgentBypass,
  pickNextDutyHolder,
  canRaisePo,
} from "./ops-po-duty";
import { isOpsManager } from "./ops-order-control";

// Fixed instants (UTC) with known MYT (+8) counterparts.
const MON_MYT = new Date("2026-07-20T01:00:00Z"); // Mon 09:00 MYT
const WED_MYT = new Date("2026-07-22T01:00:00Z"); // Wed 09:00 MYT
const FRI_MYT = new Date("2026-07-24T01:00:00Z"); // Fri 09:00 MYT
const TUE_MYT = new Date("2026-07-21T01:00:00Z"); // Tue 09:00 MYT
const THU_MYT = new Date("2026-07-23T01:00:00Z"); // Thu 09:00 MYT — no longer a PO day
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

// P1 (0303): the PO days are a SETTING, passed in. The seed is Mon/Wed/Fri.
const PO_DAYS = [1, 3, 5];

describe("isPoDayMYT", () => {
  it("Mon + Wed + Fri MYT are PO days", () => {
    expect(isPoDayMYT(MON_MYT, PO_DAYS)).toBe(true);
    expect(isPoDayMYT(WED_MYT, PO_DAYS)).toBe(true);
    expect(isPoDayMYT(FRI_MYT, PO_DAYS)).toBe(true);
  });
  it("other days are not — and the MYT shift decides the weekday", () => {
    expect(isPoDayMYT(TUE_MYT, PO_DAYS)).toBe(false);
    expect(isPoDayMYT(THU_MYT, PO_DAYS)).toBe(false);
    expect(isPoDayMYT(SUN_LATE_MYT, PO_DAYS)).toBe(false); // Sun 23:00 MYT (Sun 15:00Z)
  });
  it("follows the SETTING, not a constant — Thu becomes a PO day if Jess says so", () => {
    expect(isPoDayMYT(THU_MYT, [4])).toBe(true);
    expect(isPoDayMYT(MON_MYT, [4])).toBe(false);
  });
});

describe("nextPoDayMYT", () => {
  it("today when today is a PO day (MYT)", () => {
    expect(nextPoDayMYT(MON_MYT, PO_DAYS)).toBe("2026-07-20");
    expect(nextPoDayMYT(WED_MYT, PO_DAYS)).toBe("2026-07-22");
    expect(nextPoDayMYT(FRI_MYT, PO_DAYS)).toBe("2026-07-24");
  });
  it("rolls forward to the next PO day otherwise", () => {
    expect(nextPoDayMYT(TUE_MYT, PO_DAYS)).toBe("2026-07-22"); // Tue → Wed
    expect(nextPoDayMYT(THU_MYT, PO_DAYS)).toBe("2026-07-24"); // Thu → Fri
    expect(nextPoDayMYT(SUN_LATE_MYT, PO_DAYS)).toBe("2026-07-20"); // Sun 23:00 MYT → Mon
  });
  it("no day configured → no date, never a guessed one", () => {
    expect(nextPoDayMYT(MON_MYT, [])).toBe("");
  });
});

describe("poUrgentBypass", () => {
  const now = MON_MYT; // 2026-07-20 MYT
  it("deadline inside the window → urgent", () => {
    expect(poUrgentBypass("2026-07-24", 5, now)).toBe(true); // 4d left
    expect(poUrgentBypass("2026-07-26", 5, now)).toBe(false); // 6d left
  });
  it("a longer window flags earlier", () => {
    expect(poUrgentBypass("2026-07-27", 7, now)).toBe(true); // 7d left
    expect(poUrgentBypass("2026-07-28", 7, now)).toBe(false); // 8d left
  });
  it("past-deadline is always urgent; no deadline never is", () => {
    expect(poUrgentBypass("2026-07-01", 5, now)).toBe(true);
    expect(poUrgentBypass(null, 5, now)).toBe(false);
    expect(poUrgentBypass(undefined, 5, now)).toBe(false);
  });
  it("an unrated category (window 0) never makes an order urgent", () => {
    // P1: nobody set a number, so nothing here may claim to know better.
    expect(poUrgentBypass("2026-07-20", 0, now)).toBe(false);
    expect(poUrgentBypass("2026-07-01", 0, now)).toBe(false);
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

/**
 * GRN duty reaches FORWARD, not back (built 2026-08-15).
 *
 * `purchasing/MASTER.md` §2.2 locks the two-duty rota: read its table down a
 * column and July's GRN holder is Yu Jun, who is AUGUST's PO holder. The Team
 * panel and `work-engine.ts` both described this as "offset−1" and the panel
 * implemented it by looking at the PREVIOUS month — a month the API's roster
 * (which starts at the current one) never contains, so `GRN DUTY` read
 * `Not assigned` every month from the day it shipped.
 */
describe("grnDutyMonth — the receiver is the NEXT month's PO holder", () => {
  it("steps forward one month", () => {
    expect(grnDutyMonth("2026-07")).toBe("2026-08");
    expect(grnDutyMonth("2026-08")).toBe("2026-09");
  });

  it("crosses the year end", () => {
    expect(grnDutyMonth("2026-12")).toBe("2027-01");
  });

  it("pads a single-digit month so the key still sorts as a string", () => {
    expect(grnDutyMonth("2026-09")).toBe("2026-10");
    expect(grnDutyMonth("2027-01")).toBe("2027-02");
  });

  it("matches the locked rota table: Jul PO Shasha → Jul GRN = Aug PO Yu Jun", () => {
    const rota: Record<string, string> = {
      "2026-07": "Shasha",
      "2026-08": "Yu Jun",
      "2026-09": "Khor Yee",
    };
    expect(rota[grnDutyMonth("2026-07")]).toBe("Yu Jun");
    expect(rota[grnDutyMonth("2026-08")]).toBe("Khor Yee");
    // And the receiver is never the month's own PO holder.
    expect(rota[grnDutyMonth("2026-07")]).not.toBe(rota["2026-07"]);
  });
});
