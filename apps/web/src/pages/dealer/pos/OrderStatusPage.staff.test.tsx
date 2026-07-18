import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Order } from "@carres/shared";
import { useStaffSession } from "@/lib/staff";

const NOW = Date.now();
function order(over: Partial<Order> & { so: number; status: Order["status"] }): Order {
  return {
    id: `00000000-0000-0000-0000-${String(over.so).padStart(12, "0")}`,
    channel: "dealer", dealerId: "d1", outletId: null, salespersonId: null,
    customer: { name: "Tan", phone: "0123456789", address: "12 Jln, KL", addressUnknown: false, billing: null, billingSame: true, emergency: null },
    delivery: { date: "2026-07-20", proceedDate: null, dateTbd: false, floor: 1, hasLift: true, stairItems: null },
    paid: 1500, signatureUrl: null, paymentSlipUrl: null, termsAccepted: true, paymentMethod: "online",
    approvalCode: null, installmentMonths: null, operationStage: null, warehouseId: null,
    deliveryPartnerId: null, partnerStage: null, partnerPickedAt: null, partnerEta: null,
    doNumber: null, doNote: null, invoiceNo: null, invoicedAt: null,
    placedAt: new Date(NOW - 86_400_000).toISOString(), lineCount: 2, totalAmount: 3000, ...over,
  } as Order;
}
const ORDERS: Order[] = [order({ so: 1301, status: "place" }), order({ so: 1302, status: "delivered", paid: 3000 })];

vi.mock("@/lib/queries", () => ({
  useOrders: () => ({ data: { orders: ORDERS, total: ORDERS.length }, isLoading: false }),
  useSalespersons: () => ({ data: { salespersons: [{ id: "sp-1", name: "Aisyah" }] } }),
}));
vi.mock("./PosOrderDetail", () => ({ default: () => <div /> }));

import OrderStatusPage from "./OrderStatusPage";

function withToken(tier: "principal" | "manager" | "salesperson") {
  useStaffSession.getState().setSession("tok", { sid: "sp-1", tier, name: "Aisyah", color: "flame", outletId: "o1" }, "d1");
}

beforeEach(() => useStaffSession.getState().reset());
afterEach(cleanup);

describe("OrderStatusPage — staff token gate switch", () => {
  it("with a staff token, the legacy PIN gate is skipped and the board renders immediately", () => {
    withToken("manager");
    render(<OrderStatusPage onClose={() => {}} />);
    expect(screen.queryByTestId("os-pin-gate")).toBeNull();
    expect(screen.getByTestId("os-lane-place")).toBeTruthy();
    // No "Lock again" — identity is proven, not passcode-gated.
    expect(screen.queryByTestId("os-lock")).toBeNull();
  });

  it("no staff token: legacy PIN gate is shown (dormant / principal on-behalf)", () => {
    render(<OrderStatusPage onClose={() => {}} />);
    expect(screen.getByTestId("os-pin-gate")).toBeTruthy();
    expect(screen.queryByTestId("os-lane-place")).toBeNull();
  });

  it("manager tier: the per-person compare summary is shown", () => {
    withToken("manager");
    render(<OrderStatusPage onClose={() => {}} />);
    expect(screen.getByText(/Pick a salesperson to compare/)).toBeTruthy();
  });

  it("salesperson tier: the per-person compare summary is hidden (server-scoped to self)", () => {
    withToken("salesperson");
    render(<OrderStatusPage onClose={() => {}} />);
    expect(screen.queryByText(/Pick a salesperson to compare/)).toBeNull();
  });
});
