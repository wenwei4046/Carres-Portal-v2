import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import SalesOrderCompactView from "./SalesOrderCompactView";
import { buildRegisterRow } from "../sales-order-columns";
import type { operationOrderListRow } from "@/lib/queries";
import type { DeliveryMonitorCard } from "../delivery-monitor";
const state = vi.hoisted(() => ({ role: "operation", failed: false, loading: false, card: null as unknown as DeliveryMonitorCard | null, leg: 0 }));
vi.mock("@/lib/auth", () => ({ useAuth: (select: (s: { role: string }) => unknown) => select({ role: state.role }) }));
vi.mock("../delivery-scope-card", () => ({ useDeliveryScopeCard: (_id: string, leg: number) => { state.leg = leg; return state; } }));
vi.mock("@/lib/queries", () => ({ useOrderTimeline: () => ({ data: [{ id: "event", actor_name: "Recorder", kind: "annotation", content: "Saved note", occurred_at: "2026-09-30T08:08:32Z" }] }) }));
vi.mock("./SalesOrderCardDocument", () => ({ default: () => <div>Saved document</div> }));
vi.mock("./DeliveryBrief", () => ({ DeliveryDatesEdit: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Date editor</button>, LogisticsDetailsEdit: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Logistics editor</button> }));
const row = buildRegisterRow({ id: "o", so: 1303, customer_name: "Kimmy", customer_phone: "0191234567", customer_email: "a@example.com", customer_address: "Recorded address", placed_at: "2026-09-30T08:00:00Z", delivery_date: "2026-10-31", proceeded_at: "2026-10-01T08:00:00Z", dealers: { name: "Recorded dealer" }, order_lines: [{ sku: "M", qty: 1, unit_price: 2499 }], paid: 1250 } as operationOrderListRow);
function mount(source = row) { return render(<SalesOrderCompactView row={source} salesLocation="Recorded location" items={<div>Actual Items</div>} documents={<div>Related documents</div>} statuses={<div>Receipt unconfirmed</div>} onOpen={vi.fn()} onClose={vi.fn()} />); }
beforeEach(() => { state.role = "operation"; state.failed = false; state.loading = false; state.card = { leg: 0, items: [{ qty: 1 }], extras: [{ kind: "service", qty: 4 }], readiness: { shortQty: 0, ready: true }, confirmedDate: "2026-10-31", confirmedTime: null, logisticsPartnerName: "NETS", payment: { line1: "Paid" }, settled: false, doNumber: null } as unknown as DeliveryMonitorCard; });
afterEach(cleanup);
describe("real SO card", () => {
  it("keeps saved documents lazy, Info defaults and all former facts reachable", () => {
    mount(); expect(screen.getByText("Recorded address")).toBeVisible(); expect(screen.getByText("Recorded location")).toBeVisible(); expect(screen.queryByText("Saved document")).toBeNull(); expect(screen.queryByText("Actual Items")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sales Order SO-1303" })); expect(screen.getByText("Saved document")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Items" })); expect(screen.getByText("a@example.com")).toBeVisible(); expect(screen.getByText("Recorded dealer")).toBeVisible(); expect(screen.getByText("Related documents")).toBeVisible();
  });
  it("uses real goods only, date-only precision, one formal editor and read-only DO", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByText("Recorded address")).toBeNull(); expect(screen.getByText("1/1")).toBeVisible(); expect(screen.getByText("31 Oct")).toBeVisible(); expect(screen.getByText("Date confirmed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Logistics/ })); expect(screen.getByText("Logistics editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Customer/ })); expect(screen.queryByText("Logistics editor")).toBeNull(); expect(screen.getByText("Date editor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^DO/ })); expect(screen.queryByText("Date editor")).toBeNull(); expect(screen.getByLabelText("Delivery Order")).toBeVisible(); expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("never turns failed reads into stock readiness or absence, and hides writers for other roles", () => {
    state.failed = true; mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByText("1/1")).toBeNull(); expect(screen.queryByText("Date not confirmed")).toBeNull(); expect(screen.getAllByText("Unavailable").length).toBe(4); expect(screen.queryByRole("button", { name: /^Customer/ })).toBeNull();
    cleanup(); state.failed = false; state.role = "finance"; mount(); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(screen.queryByRole("button", { name: /^Customer/ })).toBeNull();
  });
  it("uses the final journey receiver and does not mistake the first leg for it", () => {
    state.card!.leg = 1; mount({ ...row, o: { ...row.o, delivery_stops: [{ leg: 1 }, { leg: 2 }] as operationOrderListRow["delivery_stops"] } }); fireEvent.click(screen.getByRole("button", { name: "Delivery" })); expect(state.leg).toBe(2); expect(screen.queryByText("Date confirmed")).toBeNull();
  });
  it("keeps the complete timestamp and actor only on the avatar", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Show timeline" })); const event = screen.getByText("Saved note").closest("li")!; expect(within(event).getByLabelText("Recorded by Recorder")).toBeVisible(); expect(event.querySelector("time")).toHaveAttribute("dateTime", "2026-09-30T08:08:32Z"); expect(event).toHaveTextContent("30 Sep · 4:08 PM"); expect(event).not.toHaveTextContent("MYT");
  });
});
