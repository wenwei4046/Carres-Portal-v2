import { describe, expect, it } from "vitest";
import {
  isPoDayMYT,
  nextPoDayMYT,
  poUrgentBypass,
} from "./ops-po-duty";

// Fixed instants (UTC) with known MYT (+8) counterparts.
const MON_MYT = new Date("2026-07-20T01:00:00Z"); // Mon 09:00 MYT
const WED_MYT = new Date("2026-07-22T01:00:00Z"); // Wed 09:00 MYT
const FRI_MYT = new Date("2026-07-24T01:00:00Z"); // Fri 09:00 MYT
const TUE_MYT = new Date("2026-07-21T01:00:00Z"); // Tue 09:00 MYT
const THU_MYT = new Date("2026-07-23T01:00:00Z"); // Thu 09:00 MYT — no longer a PO day
// 23:00 MYT Sun = 15:00Z Sun — crosses the UTC/MYT date boundary going in.
const SUN_LATE_MYT = new Date("2026-07-19T15:00:00Z");
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
