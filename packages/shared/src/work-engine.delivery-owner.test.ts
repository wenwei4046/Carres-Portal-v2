/**
 * DELIVERY WORK OWNER = THE SALES ORDER'S PIC (owner ruling 2026-09-17,
 * overriding the 2026-09-13 Delivery Duty routing).
 *
 * Routine Delivery work resolves to the person the Sales Order was dealt to
 * (`ops_order_control.assigned_staff`, read through 0504's
 * `delivery_responsible_operation` — the ONE responsibility read, cover and
 * all). Delivery Duty is only the fallback when the order has no PIC.
 */
import { describe, expect, it } from "vitest";
import { myHolidaySet } from "./my-holidays";
import {
  ORDER_WORK_RULES,
  workItemsForOrder,
  type WorkItem,
} from "./work-engine";
import type { WorkspaceDutyResolution } from "./workspace-duty";

const HOLS = { holidays: myHolidaySet() };
const YUJUN = { userId: "u-yujun", name: "Yu Jun" };
const SHASHA = { userId: "u-shasha", name: "Shasha" };
const LICHING = { userId: "u-liching", name: "Li Ching" };

const DELIVERY_KEYS = [
  "assign_logistics",
  "confirm_delivery_date",
  "deliver_today",
  "upload_delivery_photo",
  "check_delivery_proof",
  "collect_loan_item",
] as const;

function resolution(over: Partial<WorkspaceDutyResolution>): WorkspaceDutyResolution {
  return {
    dutyKey: "delivery_duty", onDate: "2026-09-17",
    normalOwner: null, buddy: null, activeCover: null, actingPerson: null,
    state: "not_assigned", assignmentId: null,
    ...over,
  };
}
const dealtTo = (p: typeof YUJUN) =>
  resolution({ normalOwner: p, actingPerson: p, state: "primary" });
const coveredBy = (normal: typeof YUJUN, cover: typeof YUJUN) =>
  resolution({ normalOwner: normal, buddy: cover, activeCover: cover, actingPerson: cover, state: "covered" });

/** Every delivery item the engine can compose, on one order. */
function deliveryItems(dutyResolutions: Partial<Record<string, WorkspaceDutyResolution>>): WorkItem[] {
  const open = [
    { key: "assign_logistics" as const, track: "delivery" as const, tone: "warning" as const },
    { key: "confirm_delivery_date" as const, track: "delivery" as const, tone: "warning" as const },
    { key: "deliver_today" as const, track: "delivery" as const, tone: "warning" as const },
    { key: "upload_delivery_photo" as const, track: "delivery" as const, tone: "warning" as const },
  ];
  return workItemsForOrder(
    open,
    {
      orderId: "o-1", so: 1400,
      // The raw assignment on the order is NOT the owner source — a shared
      // login can sit there. Only the resolved read decides.
      picName: "Operations", picUserId: "u-shared-login",
      promisedDateIso: "2026-09-17", confirmedDateIso: "2026-09-17",
      deliveredAtIso: "2026-09-17T03:00:00Z", delayDetectedAtIso: null, delayDecisionAtIso: null,
      loanOutstanding: true, proofReviewPending: true,
      dutyResolutions: dutyResolutions as never,
    },
    "2026-09-17",
    HOLS,
  );
}

describe("the rule table — Delivery work belongs to the order's responsible Operation person", () => {
  it("every routine Delivery rule names the responsible_operation owner rule", () => {
    const byKey = new Map(ORDER_WORK_RULES.map((r) => [r.key, r]));
    for (const key of DELIVERY_KEYS) {
      expect(byKey.get(key)!.ownerRule, key).toBe("responsible_operation");
      expect(byKey.get(key)!.owner, key).not.toMatch(/^Delivery Duty —/);
    }
  });
});

describe("resolution — PIC first, cover preserved, Delivery Duty only without a PIC", () => {
  it("an order dealt to Yu Jun → every delivery action is Yu Jun's", () => {
    const items = deliveryItems({ responsible_operation: dealtTo(YUJUN) });
    const keys = new Set(items.map((i) => i.ruleKey));
    for (const key of DELIVERY_KEYS) expect(keys.has(key), key).toBe(true);
    for (const item of items.filter((i) => (DELIVERY_KEYS as readonly string[]).includes(i.ruleKey))) {
      expect(item.ownerRule).toBe("responsible_operation");
      expect(item.normalOwner).toEqual(YUJUN);
      expect(item.actingPerson).toEqual(YUJUN);
      expect(item.ownerUserId).toBe(YUJUN.userId);
      expect(item.ownerState).toBe("primary");
      expect(item.ownerDuty).toBeUndefined();
    }
  });

  it("Yu Jun away with Shasha covering → acting Shasha, normal Yu Jun", () => {
    const items = deliveryItems({ responsible_operation: coveredBy(YUJUN, SHASHA) });
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.normalOwner).toEqual(YUJUN);
    expect(assign.activeCover).toEqual(SHASHA);
    expect(assign.actingPerson).toEqual(SHASHA);
    expect(assign.ownerUserId).toBe(SHASHA.userId);
    expect(assign.ownerState).toBe("covered");
  });

  it("a PIC outranks a held Delivery Duty — the holder never takes a dealt order's work", () => {
    const items = deliveryItems({
      responsible_operation: dealtTo(YUJUN),
      delivery_duty: resolution({ normalOwner: LICHING, actingPerson: LICHING, state: "primary", assignmentId: "a-dd" }),
    });
    for (const item of items.filter((i) => i.module === "delivery")) {
      expect(item.ownerUserId, item.ruleKey).toBe(YUJUN.userId);
    }
  });

  it("no PIC → the Delivery Duty holder (cover and all)", () => {
    const items = deliveryItems({
      responsible_operation: resolution({}),
      delivery_duty: resolution({
        normalOwner: LICHING, buddy: SHASHA, activeCover: SHASHA, actingPerson: SHASHA,
        state: "covered", assignmentId: "a-dd",
      }),
    });
    const assign = items.find((i) => i.ruleKey === "assign_logistics")!;
    expect(assign.ownerDutyKey).toBe("delivery_duty");
    expect(assign.normalOwner).toEqual(LICHING);
    expect(assign.actingPerson).toEqual(SHASHA);
    expect(assign.ownerDuty).toBeUndefined();
  });

  it("no PIC and nobody holds Delivery Duty → the Delivery Duty word stands, keyed for `Nobody holds Delivery Duty.`", () => {
    for (const supplied of [{}, { responsible_operation: resolution({}) }]) {
      const items = deliveryItems(supplied);
      for (const item of items.filter((i) => i.module === "delivery")) {
        expect(item.ownerRule).toBe("responsible_operation");
        expect(item.ownerDutyKey).toBe("delivery_duty");
        expect(item.ownerDuty).toBe("Delivery Duty");
        expect(item.actingPerson).toBeNull();
        expect(item.ownerState).toBe("not_assigned");
      }
    }
  });

  it("the raw assignment is never read as the owner — a shared login on the order owns nothing", () => {
    const items = deliveryItems({});
    for (const item of items.filter((i) => i.module === "delivery")) {
      expect(item.ownerUserId).not.toBe("u-shared-login");
      expect(item.ownerName).not.toBe("Operations");
    }
  });
});
