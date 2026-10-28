import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { SoBatchOrderRow } from "@carres/shared";
import SoBatchCompactView from "./SoBatchCompactView";

const source = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries", () => ({ useOperationOrders: source }));
vi.mock("../components/SalesOrderCardDocument", () => ({ default: ({ orderId, onClose }: { orderId: string; onClose: () => void }) =>
  <div><span>Saved Sales Order PDF {orderId}</span><button onClick={onClose}>Close PDF</button></div> }));
const row: SoBatchOrderRow = { orderId: "own", so: 1365, customer: "Abin", status: "blank",
  proceededAt: "2026-09-23", requestedDeliveryDate: "2026-10-27", deliveryCity: "Kuala Lumpur",
  deliveryState: null, pos: [], lines: [], outstandingSuppliers: ["Nice Future"] };
function draw(over: Partial<SoBatchOrderRow> = {}) {
  return render(<SoBatchCompactView row={{ ...row, ...over }} status="Pending" supplier="Nice Future"
    safetyDays="10" items={<div>Customer goods</div>} details={<div>Exact PO lineage</div>} onOpen={vi.fn()} />);
}
beforeEach(() => source.mockReturnValue({ data: { orders: [] }, isPending: false, isError: false, refetch: vi.fn() }));

it("uses only the exact SO source for the shared header even when the source search also returns neighbours", () => {
  source.mockReturnValue({ data: { orders: [
    { id: "neighbour", customer_phone: "Wrong phone", customer_address: "Wrong address", salespersons: { name: "Wrong salesperson" } },
    { id: "own", customer_phone: "Actual phone", customer_address: "Actual address", placed_at: "2026-09-20",
      outlets: { name: "Actual showroom" }, salespersons: { name: "Actual salesperson" } },
  ] }, isPending: false, isError: false, refetch: vi.fn() });
  draw();
  expect(screen.getByText("Actual phone")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Order details" }));
  expect(screen.getByText("Actual showroom")).toBeInTheDocument();
  expect(screen.getByText("Actual salesperson")).toBeInTheDocument();
  expect(screen.queryByText("Wrong salesperson")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delivery address" }));
  expect(screen.getByText("Actual address")).toBeInTheDocument();
  expect(screen.queryByText("Wrong address")).not.toBeInTheDocument();
});

it("a missing SO number never creates a fake numbered document door", () => {
  draw({ so: null });
  expect(screen.queryByRole("button", { name: /Sales Order SO-/ })).not.toBeInTheDocument();
  expect(screen.queryByText("SO-null")).not.toBeInTheDocument();
  expect(screen.queryByText("SO-")).not.toBeInTheDocument();
});

it("the saved source PDF closes back to its own entry and can reopen without closing the SO panel", async () => {
  draw();
  const entry = screen.getByRole("button", { name: "Sales Order SO-1365" });
  fireEvent.click(entry);
  expect(screen.getByText("Saved Sales Order PDF own")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close PDF" }));
  expect(screen.queryByText("Saved Sales Order PDF own")).not.toBeInTheDocument();
  expect(screen.getByText("PO Pending")).toBeInTheDocument();
  expect(entry).toHaveFocus();
  fireEvent.click(entry);
  expect(screen.getByText("Saved Sales Order PDF own")).toBeInTheDocument();
});

it("header failure stays explicit and retries a read, with goods and PO evidence in separate disclosures", () => {
  const retry = vi.fn(); source.mockReturnValue({ isPending: false, isError: true, refetch: retry });
  draw();
  expect(screen.getByText("Could not be loaded")).toBeInTheDocument();
  expect(screen.queryByText("Customer goods")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "SO Batch Purchase · Order details" }));
  expect(screen.getByText("Exact PO lineage")).toBeInTheDocument();
  expect(screen.queryByText("Customer goods")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
