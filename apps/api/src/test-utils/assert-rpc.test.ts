import { describe, it, expect, vi } from "vitest";
import { assertRpcCallShape } from "./assert-rpc";

/**
 * Regression tests for assertRpcCallShape — the C1 retrofit helper that catches
 * mock-leak bugs (vi.fn() accepts any args, masking arg-shape drift between
 * unit-test mocks and real Postgres function signatures).
 *
 * Why these tests matter: the helper itself runs across ~14 logistics test sites
 * and any silent regression (e.g. swallowed errors, false-positive matches)
 * would re-open the very gap C1 was created to close.
 */
describe("assertRpcCallShape", () => {
  it("happy path: matching keys passes without throwing", () => {
    const rpc = vi.fn();
    rpc("logistics_warehouse_pick", { p_order_id: "o1", p_warehouse_id: "w1" });
    expect(() =>
      assertRpcCallShape(rpc, "logistics_warehouse_pick", ["p_order_id", "p_warehouse_id"]),
    ).not.toThrow();
  });

  it("throws when a key is missing from the actual call", () => {
    const rpc = vi.fn();
    rpc("logistics_attach_do_and_deliver", {
      p_order_id: "o1",
      p_do_number: "DO-1",
      // p_signed missing
    });
    expect(() =>
      assertRpcCallShape(rpc, "logistics_attach_do_and_deliver", [
        "p_order_id",
        "p_do_number",
        "p_signed",
      ]),
    ).toThrow();
  });

  it("throws when an extra unexpected key is in the actual call", () => {
    const rpc = vi.fn();
    rpc("logistics_assign_partner", {
      p_order_id: "o1",
      p_partner_id: "p1",
      p_unexpected: "leak",
    });
    expect(() =>
      assertRpcCallShape(rpc, "logistics_assign_partner", ["p_order_id", "p_partner_id"]),
    ).toThrow();
  });

  it("zero-arg RPC with expectedArgKeys [] passes (call[1] is undefined)", () => {
    const rpc = vi.fn();
    rpc("logistics_dashboard_summary"); // no second arg
    expect(() =>
      assertRpcCallShape(rpc, "logistics_dashboard_summary", []),
    ).not.toThrow();
  });

  it("zero-arg RPC fails when expectedArgKeys is non-empty", () => {
    const rpc = vi.fn();
    rpc("logistics_dashboard_summary"); // no second arg
    expect(() =>
      assertRpcCallShape(rpc, "logistics_dashboard_summary", ["p_order_id"]),
    ).toThrow();
  });

  it("checks every matching call when the same fn is invoked multiple times", () => {
    const rpc = vi.fn();
    rpc("logistics_pick_warehouse", { p_order_id: "o1" });
    // Second call has the wrong shape — helper must catch it even though the first
    // call was fine.
    rpc("logistics_pick_warehouse", { p_order_id: "o2", p_extra: "leak" });
    expect(() =>
      assertRpcCallShape(rpc, "logistics_pick_warehouse", ["p_order_id"]),
    ).toThrow();
  });

  it("throws when the fn name never appears in calls (matchingCalls empty)", () => {
    const rpc = vi.fn();
    rpc("logistics_warehouse_pick", { p_order_id: "o1", p_warehouse_id: "w1" });
    expect(() =>
      assertRpcCallShape(rpc, "logistics_assign_partner", ["p_order_id", "p_partner_id"]),
    ).toThrow();
  });
});
