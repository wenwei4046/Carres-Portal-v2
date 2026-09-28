import { describe, expect, it } from "vitest";
import { decodeReceiveTarget, encodeReceiveTarget, receiveButtonOf, receiveTargetOf } from "./WorkReceivingView";

describe("Receiving act → the Receiving object Workspace hosts (§5.10)", () => {
  it("reads the Work item's own destination: a PO with nothing counted, or a submitted count", () => {
    expect(receiveTargetOf("/operation?tab=receiving&po=PO260903-4316")).toEqual({ kind: "po", id: "PO260903-4316" });
    expect(receiveTargetOf("/operation?tab=receiving&session=r-1")).toEqual({ kind: "session", id: "r-1" });
    expect(receiveTargetOf("/operation/issues?issue=i-1")).toBeNull();
    expect(receiveTargetOf("/operation/orders/so/order-1")).toBeNull();
  });

  it("wears Receiving's own words: Start receiving before a count, Check in for a submitted count", () => {
    expect(receiveButtonOf("/operation?tab=receiving&po=PO-1")?.label).toBe("Start receiving");
    expect(receiveButtonOf("/operation?tab=receiving&session=r-1")?.label).toBe("Check in");
  });

  it("round-trips through the Workspace URL", () => {
    const t = { kind: "session", id: "r-1" } as const;
    expect(decodeReceiveTarget(encodeReceiveTarget(t))).toEqual(t);
    expect(decodeReceiveTarget(null)).toBeNull();
    expect(decodeReceiveTarget("nonsense")).toBeNull();
  });
});
