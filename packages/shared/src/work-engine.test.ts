import { describe, expect, it } from "vitest";
import { myHolidaySet } from "./my-holidays";
import { openOrderActions, type OrderActionSignals } from "./order-actions";
import {
  MODULE_WORK_RULES,
  ORDER_WORK_RULES,
  WORK_RULES,
  workDayLabel,
  workItemsForOrder,
} from "./work-engine";

const HOLS = { holidays: myHolidaySet() };

const baseSignals: OrderActionSignals = {
  completed: false,
  goodsReady: true,
  goodsUnordered: false,
  stockEtaIso: null,
  promisedDateIso: "2026-08-20",
  daysToDue: 9,
  stockWindowDays: 7,
  hasLogistics: false,
  bookingConfirmed: false,
  confirmedDateIso: null,
  todayIso: "2026-08-11",
  deliveryOrderIssued: null,
  photoOnFile: null,
  moneyOwing: false,
};

const ctx = {
  orderId: "o-1",
  so: 1318,
  picName: "Shasha",
  promisedDateIso: "2026-08-20",
  confirmedDateIso: null,
  deliveredAtIso: null,
  delayDetectedAtIso: null,
  delayDecisionAtIso: null,
};

describe("WORK_RULES — five parts, or no entry", () => {
  it("every rule names all five parts, and the completion fact is never empty", () => {
    for (const r of WORK_RULES) {
      expect(r.key.length).toBeGreaterThan(0);
      expect(r.trigger.length).toBeGreaterThan(5);
      expect(r.owner.length).toBeGreaterThan(5);
      expect(r.action.length).toBeGreaterThan(0);
      expect(r.dueRule.length).toBeGreaterThan(5);
      expect(r.completionFact.length).toBeGreaterThan(10);
    }
  });

  it("every action key the ORDER engine can raise has a registry entry", () => {
    // The raisable keys, straight from the engine's own vocabulary.
    const raisable = [
      "issue_po", "confirm_ready_date", "delay_planning",
      "arrange_new_delivery_date", "assign_logistics", "confirm_delivery_date",
      "issue_delivery_order", "deliver_today", "upload_delivery_photo", "collect",
    ];
    const keys = new Set(ORDER_WORK_RULES.map((r) => r.key));
    for (const k of raisable) expect(keys.has(k)).toBe(true);
  });

  it("no rule mints a Done button — every completion fact names a store or arithmetic", () => {
    for (const r of WORK_RULES) {
      expect(r.completionFact.toLowerCase()).not.toContain("tick");
      expect(r.completionFact.toLowerCase()).not.toContain("done button");
    }
  });

  it("cross-module rules name their duty-derived owners, never a stored assignee", () => {
    for (const r of MODULE_WORK_RULES) {
      expect(r.owner).toMatch(/duty|holder/i);
    }
  });
});

describe("workItemsForOrder — WHO + ACTION + actual working day", () => {
  it("composes the engine's open set with the PIC and weekday+date dues", () => {
    const open = openOrderActions(baseSignals); // assign_logistics expected
    const items = workItemsForOrder(open, ctx, "2026-08-11", HOLS);
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.ownerName).toBe("Shasha");
    expect(assign.soRef).toBe("SO-1318");
    // Thu 2026-08-20 − 3 working days (Mon–Sat) = Mon 17 Aug.
    expect(assign.dueIso).toBe("2026-08-17");
    expect(assign.dueLabel).toBe("Mon 17 Aug");
    expect(assign.workingDaysLate).toBe(0);
  });

  it("never prints a bare Today/Tomorrow — the label is weekday + date", () => {
    expect(workDayLabel("2026-08-11")).toBe("Tue 11 Aug");
    expect(workDayLabel(null)).toBeNull();
  });

  it("late work keeps its ORIGINAL due date with working days late", () => {
    const open = openOrderActions(baseSignals);
    const items = workItemsForOrder(open, ctx, "2026-08-19", HOLS);
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.dueIso).toBe("2026-08-17"); // unchanged — the due never moves
    expect(assign.workingDaysLate).toBe(2); // Tue 18, Wed 19
  });

  it("collect and issue_delivery_order share the ONE T−1 arithmetic", () => {
    const s: OrderActionSignals = {
      ...baseSignals,
      hasLogistics: true,
      bookingConfirmed: true,
      confirmedDateIso: "2026-08-20",
      deliveryOrderIssued: false,
      moneyOwing: true,
    };
    const open = openOrderActions(s);
    const items = workItemsForOrder(
      open,
      { ...ctx, confirmedDateIso: "2026-08-20" },
      "2026-08-11",
      HOLS,
    );
    const collect = items.find((i) => i.ruleKey === "collect")!;
    expect(collect.dueIso).toBe("2026-08-19");
    expect(collect.locked).toBe(true);
  });

  it("a step with no anchor has no due and can never be late", () => {
    const open = openOrderActions({ ...baseSignals, promisedDateIso: null, daysToDue: null });
    const items = workItemsForOrder(
      open,
      { ...ctx, promisedDateIso: null },
      "2026-08-11",
      HOLS,
    );
    for (const i of items) {
      expect(i.dueIso).toBeNull();
      expect(i.workingDaysLate).toBe(0);
    }
  });

  it("purchasing-owned clocks are NOT respelt here — issue_po carries no due", () => {
    const open = openOrderActions({ ...baseSignals, goodsReady: false, goodsUnordered: true });
    const items = workItemsForOrder(open, ctx, "2026-08-11", HOLS);
    const po = items.find((i) => i.ruleKey === "issue_po")!;
    expect(po.dueIso).toBeNull();
  });
});
