import { describe, expect, it } from "vitest";
import { myHolidaySet } from "./my-holidays";
import { openOrderActions, type OrderActionSignals } from "./order-actions";
import {
  MODULE_WORK_RULES,
  ORDER_WORK_RULES,
  WORK_RULES,
  groupWorkItemsByDay,
  workItemsForOrder,
  type WorkItem,
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

describe("Payment MASTER — no blind collection Work", () => {
  const waiting = { ...baseSignals, goodsReady: false, moneyOwing: true };

  it("keeps goods work but creates no collection even with a customer delivery date", () => {
    const items = workItemsForOrder(openOrderActions(waiting), ctx, "2026-08-18", HOLS);
    expect(items.some((item) => item.ruleKey === "confirm_ready_date")).toBe(true);
    expect(items.some((item) => item.ruleKey === "collect")).toBe(false);
  });

  it("still raises the independent Finance Exception while collection waits", () => {
    const items = workItemsForOrder(
      openOrderActions({ ...waiting, financeExceptionHolds: true }),
      { ...ctx, financeExceptionHolds: true },
      "2026-08-18",
      HOLS,
    );
    expect(items.filter((item) => item.ruleKey === "collect")).toHaveLength(0);
    expect(items.find((item) => item.ruleKey === "resolve_payment_exception")).toMatchObject({
      ownerDuty: "Finance",
      dueIso: "2026-08-18",
    });
  });

  it("creates collection when arrival becomes known and removes it when that fact is withdrawn", () => {
    const itemsFor = (stockEtaIso: string | null) => workItemsForOrder(
      openOrderActions({ ...waiting, stockEtaIso }), ctx, "2026-08-18", HOLS,
    );
    expect(itemsFor("2026-08-19").find((item) => item.ruleKey === "collect")).toMatchObject({
      ownerName: "Shasha",
      dueIso: "2026-08-18",
    });
    expect(itemsFor(null).some((item) => item.ruleKey === "collect")).toBe(false);
  });
});

describe("the blueprint card's two composed Work items (owner-approved 2026-08-16)", () => {
  it("an OPEN Finance exception composes `Resolve the payment exception` — Finance's duty, due today", () => {
    const items = workItemsForOrder(
      [],
      { ...ctx, financeExceptionHolds: true },
      "2026-08-18",
      HOLS,
    );
    const item = items.find((i) => i.ruleKey === "resolve_payment_exception")!;
    expect(item).toBeTruthy();
    expect(item.action).toBe("Resolve the payment exception");
    // No finance roster fact exists — the duty word stands, never a
    // hand-picked person and never the PIC borrowed for Finance's work.
    expect(item.ownerName).toBeNull();
    expect(item.ownerDuty).toBe("Finance");
    expect(item.dueIso).toBe("2026-08-18"); // immediately
  });

  it("a loan still out on the delivery day composes `Collect the loan item` — Delivery staff's duty", () => {
    const items = workItemsForOrder(
      [],
      { ...ctx, loanOutstanding: true, confirmedDateIso: "2026-08-18" },
      "2026-08-18",
      HOLS,
    );
    const item = items.find((i) => i.ruleKey === "collect_loan_item")!;
    expect(item).toBeTruthy();
    expect(item.ownerName).toBeNull();
    expect(item.ownerDuty).toBe("Delivery staff");
    expect(item.dueIso).toBe("2026-08-18"); // the delivery day itself
  });

  it("neither composes before its fact holds — a loan waits for the delivery day", () => {
    const quiet = workItemsForOrder([], ctx, "2026-08-18", HOLS);
    expect(quiet.length).toBe(0);
    const early = workItemsForOrder(
      [],
      { ...ctx, loanOutstanding: true, confirmedDateIso: "2026-08-25" },
      "2026-08-18",
      HOLS,
    );
    expect(early.find((i) => i.ruleKey === "collect_loan_item")).toBeUndefined();
  });
});

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

  it("every rule carries its STRUCTURED Owner Rule (§0.1, built 2026-08-27)", () => {
    for (const r of WORK_RULES) {
      expect(r.ownerRule.length).toBeGreaterThan(0);
    }
    // The approved table's decisive rows, pinned so a refactor cannot
    // silently hand Purchasing's work back to the PIC:
    const byKey = new Map(WORK_RULES.map((r) => [r.key, r]));
    expect(byKey.get("issue_po")!.ownerRule).toBe("po_duty");
    expect(byKey.get("confirm_ready_date")!.ownerRule).toBe("po_duty");
    expect(byKey.get("ask_delivery_date")!.ownerRule).toBe("salesperson");
    expect(byKey.get("collect")!.ownerRule).toBe("payment_duty");
    expect(byKey.get("issue_delivery_order")!.ownerRule).toBe("system");
    expect(byKey.get("collect_loan_item")!.ownerRule).toBe("delivery_duty");
    expect(byKey.get("resolve_payment_exception")!.ownerRule).toBe("finance_duty");
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

describe("the Action Owner Engine resolution (§0.1, built 2026-08-27)", () => {
  const duty = { userId: "u-duty", name: "Yu Jun" };
  const coveredPoDuty = {
    dutyKey: "po_duty",
    onDate: "2026-08-11",
    normalOwner: { userId: "u-duty", name: "Yu Jun" },
    buddy: { userId: "u-cover", name: "Khor Yee" },
    activeCover: { userId: "u-cover", name: "Khor Yee" },
    actingPerson: { userId: "u-cover", name: "Khor Yee" },
    state: "covered" as const,
    assignmentId: "a-po",
  };

  it("routes My Work to today's cover while preserving Team Work's normal owner", () => {
    const open = openOrderActions({ ...baseSignals, goodsReady: false, goodsUnordered: true });
    const po = workItemsForOrder(
      open,
      { ...ctx, picUserId: "u-pic", dutyResolutions: { po_duty: coveredPoDuty } },
      "2026-08-11",
      HOLS,
    ).find((item) => item.ruleKey === "issue_po")!;

    expect(po.ownerRule).toBe("po_duty");
    expect(po.ownerDutyKey).toBe("po_duty");
    expect(po.normalOwner).toEqual({ userId: "u-duty", name: "Yu Jun" });
    expect(po.activeCover).toEqual({ userId: "u-cover", name: "Khor Yee" });
    expect(po.actingPerson).toEqual({ userId: "u-cover", name: "Khor Yee" });
  });

  it("Purchasing's order-track work lands on the PO-duty holder, never the PIC", () => {
    const open = openOrderActions({
      ...baseSignals,
      goodsReady: false,
      goodsUnordered: true,
    });
    const items = workItemsForOrder(open, { ...ctx, picUserId: "u-pic", poDuty: duty }, "2026-08-11", HOLS);
    const po = items.find((i) => i.ruleKey === "issue_po")!;
    expect(po.ownerName).toBe("Yu Jun");
    expect(po.ownerUserId).toBe("u-duty");
    expect(po.ownerDuty).toBeUndefined();
  });

  it("a dormant duty layer leaves the duty word standing — the PIC is never borrowed for Purchasing's work", () => {
    const open = openOrderActions({
      ...baseSignals,
      goodsReady: false,
      goodsUnordered: true,
    });
    const items = workItemsForOrder(open, { ...ctx, picUserId: "u-pic", poDuty: null }, "2026-08-11", HOLS);
    const po = items.find((i) => i.ruleKey === "issue_po")!;
    expect(po.ownerName).toBeNull();
    expect(po.ownerUserId).toBeNull();
    expect(po.ownerDuty).toBe("Purchasing");
  });

  it("Payment Duty with no assignment fails closed and never borrows the PIC", () => {
    const open = openOrderActions({
      ...baseSignals,
      hasLogistics: true,
      bookingConfirmed: true,
      confirmedDateIso: "2026-08-20",
      deliveryOrderIssued: false,
      moneyOwing: true,
    });
    const items = workItemsForOrder(
      open,
      { ...ctx, picUserId: "u-pic", poDuty: duty, confirmedDateIso: "2026-08-20" },
      "2026-08-11",
      HOLS,
    );
    const collect = items.find((i) => i.ruleKey === "collect")!;
    expect(collect.ownerRule).toBe("payment_duty");
    expect(collect.normalOwner).toBeNull();
    expect(collect.actingPerson).toBeNull();
    expect(collect.ownerDutyKey).toBe("payment_duty");
  });

  it("the missing customer promise composes `Ask for the delivery date` — the salesperson's work, a name without an account", () => {
    const items = workItemsForOrder(
      [],
      { ...ctx, promisedDateIso: null, askDeliveryDate: true, salespersonName: "Mei Ling" },
      "2026-08-11",
      HOLS,
    );
    const ask = items.find((i) => i.ruleKey === "ask_delivery_date")!;
    expect(ask).toBeTruthy();
    expect(ask.action).toBe("Ask for the delivery date");
    expect(ask.ownerName).toBe("Mei Ling");
    expect(ask.ownerUserId).toBeNull(); // not an ops account — a person group by name
    expect(ask.tone).toBe("warning"); // the register's amber fact, same rows
    expect(ask.dueIso).toBeNull(); // nothing anchors it — never late
    expect(ask.workingDaysLate).toBe(0);
  });

  it("no salesperson recorded → the duty word `Sales` stands, exactly as the hover guidance falls back", () => {
    const items = workItemsForOrder(
      [],
      { ...ctx, promisedDateIso: null, askDeliveryDate: true, salespersonName: null },
      "2026-08-11",
      HOLS,
    );
    const ask = items.find((i) => i.ruleKey === "ask_delivery_date")!;
    expect(ask.ownerName).toBeNull();
    expect(ask.ownerDuty).toBe("Sales");
  });

  it("it does not compose when the fact does not hold — the 8 who answered `not yet` are not work", () => {
    // The CALLER answers askDeliveryDate from delivery_date_tbd (the 8 vs the
    // 3, owner ruling 2026-08-15); false means no item, whatever else is open.
    const items = workItemsForOrder([], { ...ctx, promisedDateIso: null }, "2026-08-11", HOLS);
    expect(items.find((i) => i.ruleKey === "ask_delivery_date")).toBeUndefined();
  });
});

describe("workItemsForOrder — WHO + ACTION + actual working day", () => {
  it("composes the engine's open set with the PIC and weekday+date dues", () => {
    const open = openOrderActions(baseSignals); // assign_logistics expected
    // Owner re-ruling 2026-08-16 (blueprint card §7, supersedes the
    // 3-working-days law): due WITHIN THE DAY the PO was issued.
    const items = workItemsForOrder(
      open,
      { ...ctx, poIssuedAtIso: "2026-08-11" },
      "2026-08-11",
      HOLS,
    );
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.ownerName).toBe("Shasha");
    expect(assign.soRef).toBe("SO-1318");
    expect(assign.dueIso).toBe("2026-08-11"); // the PO's own issue day
    expect(assign.workingDaysLate).toBe(0);
  });

  it("hands the caller a DAY and no word — the engine spells no dates", async () => {
    // THE YEAR RULE (owner ruling 2026-08-15) deleted `workDayLabel`, the
    // engine's own fifth date spelling. A business engine that cannot format a
    // date cannot format one wrongly; the screen calls the one formatter.
    const engine = await import("./work-engine");
    expect("workDayLabel" in engine).toBe(false);
    const open = openOrderActions(baseSignals);
    for (const i of workItemsForOrder(open, ctx, "2026-08-11", HOLS)) {
      expect("dueLabel" in i).toBe(false);
    }
  });

  it("late work keeps its ORIGINAL due date with working days late", () => {
    const open = openOrderActions(baseSignals);
    const items = workItemsForOrder(
      open,
      { ...ctx, poIssuedAtIso: "2026-08-17" },
      "2026-08-19",
      HOLS,
    );
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.dueIso).toBe("2026-08-17"); // unchanged — the due never moves
    expect(assign.workingDaysLate).toBe(2); // Tue 18, Wed 19
  });

  it("collect keeps the ONE T−2 arithmetic (deadline re-ruled 2026-08-19) — and the delivery order is nobody's work (Slice 2)", () => {
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
    /* Thu 2026-08-20 delivery → deadline Tue 08-18 (T−2): logistics takes the
       DO on Wed (T−1), so the money must land before that day. */
    expect(collect.dueIso).toBe("2026-08-18");
    /* Decision A (2026-08-16): a plain balance no longer locks the collect.
       Slice 2 then removed the press itself: the SYSTEM issues the document
       when every requirement holds, so `issue_delivery_order` may never
       appear on a person's worklist — My Work and Team Work compose only
       from what the engine raises, and it no longer raises this. */
    expect(collect.locked).toBeFalsy();
    expect(items.find((i) => i.ruleKey === "issue_delivery_order")).toBeUndefined();
  });

  it("⭐ the issue_delivery_order rule names no person (Slice 2 — the DONE WHEN)", () => {
    const rule = ORDER_WORK_RULES.find((r) => r.key === "issue_delivery_order")!;
    // `docs/cards/CARD-2026-08-16-order-route-implementation-plan.md`:
    // "work-engine.ts no longer names the PIC as the action owner of a step
    // nobody performs" — and the trigger's "money passed" died with decision A.
    expect(rule.owner).not.toContain("PIC");
    expect(rule.owner).toContain("SYSTEM");
    expect(rule.trigger).not.toContain("money passed");
    expect(rule.trigger).toContain("Finance exception");
    expect(rule.completionFact).toContain("orders.do_number");
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

  it("groups by actual working day — days ascend, broken first, No date last", () => {
    const mk = (over: Partial<WorkItem>): WorkItem => ({
      ruleKey: "assign_logistics",
      module: "orders",
      soRef: "SO-1",
      orderId: "o",
      action: "Assign logistics",
      ownerRule: "order_pic",
      ownerDutyKey: null,
      normalOwner: { userId: "u-pic", name: "Shasha" },
      activeCover: null,
      actingPerson: { userId: "u-pic", name: "Shasha" },
      ownerState: "primary",
      ownerName: "Shasha",
      ownerUserId: "u-pic",
      tone: "info",
      locked: false,
      broken: false,
      dueIso: "2026-08-17",
      workingDaysLate: 0,
      ...over,
    });
    const groups = groupWorkItemsByDay([
      mk({ soRef: "SO-3", dueIso: "2026-08-18" }),
      mk({ soRef: "SO-2", dueIso: null }),
      mk({ soRef: "SO-1", workingDaysLate: 2 }),
      mk({ soRef: "SO-9", broken: true }),
    ]);
    expect(groups.map((g) => g.dayIso)).toEqual(["2026-08-17", "2026-08-18", null]);
    // Within Mon 17: the broken commitment leads.
    expect(groups[0].items.map((i) => i.soRef)).toEqual(["SO-9", "SO-1"]);
    expect(groups[0].late).toBe(1);
    expect(groups[2].dayIso).toBeNull();
  });

  it("purchasing-owned clocks are NOT respelt here — issue_po carries no due", () => {
    const open = openOrderActions({ ...baseSignals, goodsReady: false, goodsUnordered: true });
    const items = workItemsForOrder(open, ctx, "2026-08-11", HOLS);
    const po = items.find((i) => i.ruleKey === "issue_po")!;
    expect(po.dueIso).toBeNull();
  });
});
