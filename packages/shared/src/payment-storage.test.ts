import { describe, expect, it } from "vitest";
import { storageCheckDue, storageChargeOf } from "./payment-storage";

/** The §7 worked examples, verbatim — start 2026-09-07 makes day N easy:
 *  day N = 2026-09-(6+N) while September lasts. */
const MATTRESS = {
  storageStart: "2026-09-07", ruleFreeDays: 14, ruleChargeAmount: 150, ruleCycleDays: 30,
};
const SOFA = {
  storageStart: "2026-09-07", ruleFreeDays: 14, ruleChargeAmount: 200, ruleCycleDays: 14,
};

function day(n: number): string {
  const d = new Date(Date.UTC(2026, 8, 7));
  d.setUTCDate(d.getUTCDate() + (n - 1));
  return d.toISOString().slice(0, 10);
}

describe("storageChargeOf — the §7 worked examples", () => {
  it("mattress default: day 1–14 RM0 · 15–44 RM150 · 45–74 RM300", () => {
    expect(storageChargeOf(MATTRESS, day(1)).amountOwed).toBe(0);
    expect(storageChargeOf(MATTRESS, day(14)).amountOwed).toBe(0);
    expect(storageChargeOf(MATTRESS, day(15)).amountOwed).toBe(150);
    expect(storageChargeOf(MATTRESS, day(44)).amountOwed).toBe(150);
    expect(storageChargeOf(MATTRESS, day(45)).amountOwed).toBe(300);
    expect(storageChargeOf(MATTRESS, day(74)).amountOwed).toBe(300);
    expect(storageChargeOf(MATTRESS, day(75)).amountOwed).toBe(450);
    expect(storageChargeOf(MATTRESS, day(14)).freeUntilIso).toBe(day(14));
    expect(storageChargeOf(MATTRESS, day(14)).chargeStartIso).toBe(day(15));
  });
  it("approved through day 21: day 1–21 RM0 · 22–51 RM150 · 52–81 RM300", () => {
    const approved = { ...MATTRESS, approvedFreeUntil: day(21) };
    expect(storageChargeOf(approved, day(21)).amountOwed).toBe(0);
    expect(storageChargeOf(approved, day(22)).amountOwed).toBe(150);
    expect(storageChargeOf(approved, day(51)).amountOwed).toBe(150);
    expect(storageChargeOf(approved, day(52)).amountOwed).toBe(300);
    expect(storageChargeOf(approved, day(81)).amountOwed).toBe(300);
  });
  it("sofa: day 1–14 RM0 · 15–28 RM200 · 29–42 RM400", () => {
    expect(storageChargeOf(SOFA, day(14)).amountOwed).toBe(0);
    expect(storageChargeOf(SOFA, day(15)).amountOwed).toBe(200);
    expect(storageChargeOf(SOFA, day(28)).amountOwed).toBe(200);
    expect(storageChargeOf(SOFA, day(29)).amountOwed).toBe(400);
    expect(storageChargeOf(SOFA, day(42)).amountOwed).toBe(400);
  });
  it("an approval that is not past the automatic free end changes nothing", () => {
    const shorter = { ...MATTRESS, approvedFreeUntil: day(10) };
    expect(storageChargeOf(shorter, day(15)).amountOwed).toBe(150);
    expect(storageChargeOf(shorter, day(15)).freeUntilIso).toBe(day(14));
  });
  it("says which storage day today is", () => {
    expect(storageChargeOf(MATTRESS, day(1)).dayOfStorage).toBe(1);
    expect(storageChargeOf(MATTRESS, day(21)).dayOfStorage).toBe(21);
  });
});

describe("storageCheckDue — §6's inspection interval, one arithmetic", () => {
  it("counts from the storage start when nothing has been checked yet", () => {
    const d = storageCheckDue(
      { storageStart: "2026-09-01", lastCheckedOn: null, inspectionDays: 30 },
      "2026-09-08",
    );
    expect(d.dueIso).toBe("2026-10-01");
    expect(d.due).toBe(false);
    expect(d.daysLate).toBe(0);
  });

  /** A case checked on time never accumulates a backlog of missed intervals —
   *  the clock restarts at the check, so there is one open item at a time. */
  it("restarts at the last recorded check", () => {
    const d = storageCheckDue(
      { storageStart: "2026-07-01", lastCheckedOn: "2026-09-05", inspectionDays: 30 },
      "2026-09-08",
    );
    expect(d.dueIso).toBe("2026-10-05");
    expect(d.due).toBe(false);
  });

  it("is due on the day itself, and counts the days after it", () => {
    const onDay = storageCheckDue(
      { storageStart: "2026-08-09", lastCheckedOn: null, inspectionDays: 30 },
      "2026-09-08",
    );
    expect(onDay.due).toBe(true);
    expect(onDay.daysLate).toBe(0);
    const late = storageCheckDue(
      { storageStart: "2026-07-01", lastCheckedOn: null, inspectionDays: 30 },
      "2026-09-08",
    );
    expect(late.due).toBe(true);
    expect(late.daysLate).toBe(39);   // due 2026-07-31, today 2026-09-08
  });

  it("never divides by a zero or negative interval", () => {
    const d = storageCheckDue(
      { storageStart: "2026-09-01", lastCheckedOn: null, inspectionDays: 0 },
      "2026-09-08",
    );
    expect(d.dueIso).toBe("2026-09-02");
  });
});
