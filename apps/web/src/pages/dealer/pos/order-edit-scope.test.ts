/**
 * order-edit-scope — pins the §1 editable matrix (design:
 * docs/superpowers/plans/2026-07-14-pos-order-detail.md). The Carres mirror
 * of 2990s `so-edit-scope.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { getOrderEditScope, laneOf, todayMYISO } from "./order-edit-scope";

const TODAY = "2026-07-14";
const YESTERDAY = "2026-07-13";
const TOMORROW = "2026-07-15";

function scope(over: Partial<Parameters<typeof getOrderEditScope>[0]> = {}) {
  return getOrderEditScope(
    {
      status: "place",
      operationStage: null,
      sourceSystem: null,
      proceedDate: null,
      ...over,
    },
    TODAY,
  );
}

describe("getOrderEditScope", () => {
  it("place lane — everything editable, no unproceed", () => {
    const s = scope();
    expect(s).toEqual({
      isDeliveredLane: false,
      editablePlaced: true,
      editableProceed: false,
      canEditDetails: true,
      canUnproceed: false,
    });
  });

  it("proceed_order + confirmed — proceed lane, canUnproceed with null proceedDate", () => {
    const s = scope({ status: "proceed_order", operationStage: "confirmed" });
    expect(s.editablePlaced).toBe(false);
    expect(s.editableProceed).toBe(true);
    expect(s.canEditDetails).toBe(true);
    expect(s.canUnproceed).toBe(true);
  });

  it("proceed_order + confirmed — canUnproceed with today / future proceedDate", () => {
    expect(
      scope({ status: "proceed_order", operationStage: "confirmed", proceedDate: TODAY })
        .canUnproceed,
    ).toBe(true);
    expect(
      scope({ status: "proceed_order", operationStage: "confirmed", proceedDate: TOMORROW })
        .canUnproceed,
    ).toBe(true);
  });

  it("proceed_order with a PASSED proceedDate — still editable, no unproceed", () => {
    const s = scope({
      status: "proceed_order",
      operationStage: "confirmed",
      proceedDate: YESTERDAY,
    });
    expect(s.editableProceed).toBe(true);
    expect(s.canEditDetails).toBe(true);
    expect(s.canUnproceed).toBe(false);
  });

  it("proceed_order past 'confirmed' (ops working on it) — no unproceed", () => {
    const s = scope({ status: "proceed_order", operationStage: "in_production" });
    expect(s.editableProceed).toBe(true);
    expect(s.canUnproceed).toBe(false);
  });

  it("place + autocount — proceed lane, no unproceed (status is still place)", () => {
    const s = scope({ sourceSystem: "autocount" });
    expect(s.editablePlaced).toBe(false);
    expect(s.editableProceed).toBe(true);
    expect(s.canEditDetails).toBe(true);
    expect(s.canUnproceed).toBe(false);
  });

  it("place already picked up by ops (stage set) — proceed lane, no unproceed", () => {
    const s = scope({ operationStage: "confirmed" });
    expect(s.editablePlaced).toBe(false);
    expect(s.editableProceed).toBe(true);
    expect(s.canUnproceed).toBe(false);
  });

  it("delivered — fully locked", () => {
    const s = scope({ status: "delivered" });
    expect(s).toEqual({
      isDeliveredLane: true,
      editablePlaced: false,
      editableProceed: false,
      canEditDetails: false,
      canUnproceed: false,
    });
  });

  it("cancelled — off the board, everything false", () => {
    const s = scope({ status: "cancelled" });
    expect(s.isDeliveredLane).toBe(false);
    expect(s.canEditDetails).toBe(false);
    expect(s.canUnproceed).toBe(false);
  });
});

describe("laneOf", () => {
  it("buckets the four statuses (cancelled off-board)", () => {
    expect(laneOf("place")).toBe("place");
    expect(laneOf("proceed_order")).toBe("proceed");
    expect(laneOf("delivered")).toBe("delivered");
    expect(laneOf("cancelled")).toBeNull();
    expect(laneOf("place", "in_production")).toBe("proceed");
    expect(laneOf("place", null, "autocount")).toBe("proceed");
  });
});

describe("todayMYISO", () => {
  it("shifts to UTC+8 before slicing the date", () => {
    // 2026-07-14 23:00 UTC = 2026-07-15 07:00 MYT.
    expect(todayMYISO(Date.UTC(2026, 6, 14, 23, 0, 0))).toBe("2026-07-15");
    // 2026-07-14 08:00 UTC = 2026-07-14 16:00 MYT.
    expect(todayMYISO(Date.UTC(2026, 6, 14, 8, 0, 0))).toBe("2026-07-14");
  });
});
