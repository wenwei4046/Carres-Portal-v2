/**
 * OrderStatusPage — the POS "My orders" board (design: pos-order-status.jsx).
 * PIN gate → revenue summary → 3 lanes from REAL dealer orders; card click
 * opens the POS-native PosOrderDetail drawer (mocked here).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Order } from "@carres/shared";
import OrderStatusPage, {
  ORDER_STATUS_PIN,
  checkConditions,
  laneOf,
  paidPct,
  rmGroup,
  sumRevenue,
} from "./OrderStatusPage";

const NOW = Date.now();

function order(over: Partial<Order> & { so: number; status: Order["status"] }): Order {
  return {
    id: `00000000-0000-0000-0000-${String(over.so).padStart(12, "0")}`,
    channel: "dealer",
    dealerId: "d-1",
    outletId: null,
    salespersonId: null,
    customer: {
      name: "Tan Mei",
      phone: "0123456789",
      address: "12 Jalan Test, KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: null,
    },
    delivery: {
      date: "2026-07-20",
      proceedDate: null,
      dateTbd: false,
      floor: 1,
      hasLift: true,
      stairItems: null,
    },
    paid: 1500,
    signatureUrl: null,
    paymentSlipUrl: null,
    termsAccepted: true,
    paymentMethod: "online",
    approvalCode: null,
    installmentMonths: null,
    operationStage: null,
    warehouseId: null,
    deliveryPartnerId: null,
    partnerStage: null,
    partnerPickedAt: null,
    partnerEta: null,
    doNumber: null,
    doNote: null,
    invoiceNo: null,
    invoicedAt: null,
    placedAt: new Date(NOW - 86_400_000).toISOString(),
    lineCount: 2,
    totalAmount: 3000,
    ...over,
  } as Order;
}

const ORDERS: Order[] = [
  order({ so: 1201, status: "place" }),
  order({ so: 1202, status: "proceed_order", paid: 3000 }),
  order({ so: 1203, status: "delivered", paid: 3000 }),
  order({ so: 1204, status: "cancelled" }),
];

vi.mock("@/lib/queries", () => ({
  useOrders: () => ({ data: { orders: ORDERS, total: ORDERS.length }, isLoading: false }),
  useSalespersons: () => ({ data: { salespersons: [{ id: "sp-1", name: "Aisyah" }] } }),
}));
vi.mock("./PosOrderDetail", () => ({
  default: ({ id }: { id: string }) => <div data-testid="pos-order-detail">{id}</div>,
}));

function unlock() {
  for (const d of ORDER_STATUS_PIN) fireEvent.click(screen.getByTestId(`os-pin-${d}`));
}

describe("helpers", () => {
  it("laneOf buckets the four statuses (cancelled off-board)", () => {
    expect(laneOf("place")).toBe("place");
    expect(laneOf("proceed_order")).toBe("proceed");
    expect(laneOf("delivered")).toBe("delivered");
    expect(laneOf("cancelled")).toBeNull();
    // A 'place' order operation already picked up moves to the Proceed lane.
    expect(laneOf("place", "in_production")).toBe("proceed");
    // AutoCount imports enter the pipeline already proceeded (ops-grid rule).
    expect(laneOf("place", null, "autocount")).toBe("proceed");
  });

  it("sumRevenue totals products / collected / outstanding", () => {
    const rev = sumRevenue([ORDERS[0], ORDERS[1]]);
    expect(rev.total).toBe(6000);
    expect(rev.collected).toBe(4500);
    expect(rev.outstanding).toBe(1500);
  });

  it("sumRevenue floors the effective total at paid (AutoCount rows have no line prices)", () => {
    const rev = sumRevenue([order({ so: 8, status: "place", totalAmount: 0, paid: 900 })]);
    expect(rev.total).toBe(900);
    expect(rev.collected).toBe(900);
    expect(rev.outstanding).toBe(0);
  });

  it("paidPct + rmGroup are locale-proof", () => {
    expect(paidPct({ paid: 1500, totalAmount: 3000 })).toBe(50);
    expect(rmGroup(32890)).toBe("32,890");
  });

  it("checkConditions gates on info + address + ≥50% + date", () => {
    const ok = checkConditions(ORDERS[0]);
    expect(ok.allOk).toBe(true);
    const tbd = checkConditions(
      order({ so: 9, status: "place", delivery: { ...ORDERS[0].delivery, date: null, dateTbd: true } }),
    );
    expect(tbd.dateOk).toBe(false);
    expect(tbd.allOk).toBe(false);
  });
});

describe("OrderStatusPage", () => {
  it("gates behind the PIN, then buckets orders into the three lanes", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    expect(screen.getByTestId("os-pin-gate")).toBeTruthy();

    // Wrong pin shakes + clears — board stays hidden. (Any 6 digits that are
    // NOT the real ORDER_STATUS_PIN.)
    for (const d of "990099") fireEvent.click(screen.getByTestId(`os-pin-${d}`));
    expect(screen.queryByTestId("os-lane-place")).toBeNull();
    // The gate clears a wrong entry after ~700ms; keys are ignored until then.
    await new Promise((r) => setTimeout(r, 800));

    unlock();
    const place = await screen.findByTestId("os-lane-place");
    const proceed = screen.getByTestId("os-lane-proceed");
    const delivered = screen.getByTestId("os-lane-delivered");
    expect(within(place).getByTestId("os-card-1201")).toBeTruthy();
    expect(within(proceed).getByTestId("os-card-1202")).toBeTruthy();
    expect(within(delivered).getByTestId("os-card-1203")).toBeTruthy();
    // cancelled #1204 is nowhere on the board
    expect(screen.queryByTestId("os-card-1204")).toBeNull();
  });

  it("search narrows by SO number; card click opens the existing order detail", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();

    fireEvent.change(await screen.findByTestId("os-search"), { target: { value: "1202" } });
    expect(screen.queryByTestId("os-card-1201")).toBeNull();
    const card = screen.getByTestId("os-card-1202");

    fireEvent.click(card);
    expect(screen.getByTestId("pos-order-detail")).toBeTruthy();
  });

  it("Lock again returns to the PIN gate", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();
    fireEvent.click(await screen.findByTestId("os-lock"));
    expect(screen.getByTestId("os-pin-gate")).toBeTruthy();
  });
});
