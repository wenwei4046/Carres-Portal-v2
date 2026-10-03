import { expect, it, vi } from "vitest";
import { loadAmendmentWork } from "./amendment-work";
import { userClient } from "./supabase";
vi.mock("./supabase", () => ({ userClient: vi.fn() }));
const c = { env: {}, var: { auth: { jwt: "fixture" } } } as never;
const base = { id: "amendment-1", order_id: "order-1", so: 1319, status: "submitted",
  gates: { supplier_waiting: [{}], sales_approval_required: true, sales_approval_recorded: false } };
it("routes both gates through shared Work with one object destination and no invented deadline", async () => {
  vi.mocked(userClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [base], error: null }) } as never);
  const rows = await loadAmendmentWork(c);
  expect(rows.map((r) => r.owner.dutyKey)).toEqual(["po_duty", "sales_approver"]);
  expect(rows.every((r) => r.owner.state === "not_assigned" && r.timing.actionOn === null)).toBe(true);
  expect(rows.every((r) => r.destination === "/operation/orders/so/order-1")).toBe(true);
  expect(new Set(rows.map((r) => r.id)).size).toBe(2);
});
it("a recorded price approval removes only that gate; the supplier obligation remains", async () => {
  vi.mocked(userClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ ...base, gates: { ...base.gates, sales_approval_recorded: true } }], error: null }) } as never);
  expect((await loadAmendmentWork(c)).map((r) => r.ruleKey)).toEqual(["orders.amendment_supplier"]);
});
it("a failed policy read is not an empty desk", async () => {
  vi.mocked(userClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unreadable" } }) } as never);
  await expect(loadAmendmentWork(c)).rejects.toThrow("unreadable");
});
