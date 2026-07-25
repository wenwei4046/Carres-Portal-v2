/**
 * OrderStatusPage — the POS "My orders" board (design: pos-order-status.jsx).
 * PIN gate → revenue summary → 3 lanes from REAL dealer orders; card click
 * opens the POS-native PosOrderDetail drawer (mocked here).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Order } from "@carres/shared";
import { useAuth } from "@/lib/auth";
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

// Mutable mock feeds — the cascade describe swaps them per test; the store-
// board describes run on the defaults.
/* eslint-disable prefer-const */
let MOCK_ORDERS: Order[] = ORDERS;
let MOCK_STAFF: Array<Record<string, unknown>> = [{ id: "sp-1", name: "Aisyah" }];
let MOCK_OUTLETS: Array<Record<string, unknown>> = [];
let MOCK_STORES: Array<Record<string, unknown>> = [];
/* eslint-enable prefer-const */

vi.mock("@/lib/queries", () => ({
  useOrders: () => ({ data: { orders: MOCK_ORDERS, total: MOCK_ORDERS.length }, isLoading: false }),
  useSalespersons: () => ({ data: { salespersons: MOCK_STAFF } }),
  useOutlets: () => ({ data: { outlets: MOCK_OUTLETS } }),
  usePrincipalDealers: () => ({ data: { dealers: MOCK_STORES } }),
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
    // 2026-07-25 (Loo) — cards carry the official SO number, not a # code.
    expect(within(place).getByText("SO-1201")).toBeTruthy();
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

describe("OrderStatusPage — store → outlet → salesperson cascade (2026-07-25)", () => {
  const STORE_SR = "00000000-0000-0000-0000-00000000aaa1"; // showroom
  const STORE_DL = "00000000-0000-0000-0000-00000000bbb1"; // dealer, 2 outlets
  const OUT_1 = "00000000-0000-0000-0000-000000000o01";
  const OUT_2 = "00000000-0000-0000-0000-000000000o02";

  beforeEach(() => {
    useAuth.setState({ role: "principal" });
    MOCK_STORES = [
      { id: STORE_DL, name: "Litte Mattress", channel: "dealer" },
      { id: STORE_SR, name: "Kelana Jaya", channel: "showroom" },
    ];
    MOCK_OUTLETS = [
      { id: OUT_1, dealerId: STORE_DL, name: "Cheras", address: "" },
      { id: OUT_2, dealerId: STORE_DL, name: "Mont Kiara", address: "" },
    ];
    MOCK_STAFF = [
      { id: "sp-1", name: "Aisyah", dealerId: STORE_DL, outletId: OUT_1 },
      { id: "sp-2", name: "Mayson", dealerId: STORE_DL, outletId: OUT_2 },
      { id: "sp-3", name: "Alvin", dealerId: STORE_SR, outletId: null },
    ];
    MOCK_ORDERS = [
      order({ so: 2001, status: "place", dealerId: STORE_DL, outletId: OUT_1 }),
      // No outlet stamp — attributed via its salesperson (sp-2 @ Mont Kiara).
      order({ so: 2002, status: "place", dealerId: STORE_DL, salespersonId: "sp-2" }),
      order({ so: 2003, status: "place", dealerId: STORE_SR }),
      order({ so: 2004, status: "place", dealerId: STORE_DL, sourceSystem: "autocount" }),
    ];
  });
  afterEach(() => {
    useAuth.setState({ role: null });
    MOCK_STORES = [];
    MOCK_OUTLETS = [];
    MOCK_STAFF = [{ id: "sp-1", name: "Aisyah" }];
    MOCK_ORDERS = ORDERS;
  });

  it("network mode: grouped store menu; salespeople hidden until a store is picked; archive off the all-stores board", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();
    expect(await screen.findByTestId("os-store-filter")).toBeTruthy();
    expect(screen.queryByTestId("os-sales-filter")).toBeNull();
    expect(screen.queryByTestId("os-outlet-filter")).toBeNull();
    // Every store's orders on one board; the AutoCount archive stays off it.
    expect(screen.getByTestId("os-card-2001")).toBeTruthy();
    expect(screen.getByTestId("os-card-2003")).toBeTruthy();
    expect(screen.queryByTestId("os-card-2004")).toBeNull();
    // The store menu splits Our showrooms / Dealers (store-kind rule).
    fireEvent.click(screen.getByTestId("os-store-filter"));
    expect(screen.getByText("Our showrooms")).toBeTruthy();
    expect(screen.getByText("Dealers")).toBeTruthy();
    expect(screen.getByTestId(`os-store-option-${STORE_SR}`)).toBeTruthy();
  });

  it("picking a store scopes the board and reveals outlet (≥2 only) + salespeople", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();
    fireEvent.click(await screen.findByTestId("os-store-filter"));
    fireEvent.click(screen.getByTestId(`os-store-option-${STORE_DL}`));
    // Other store gone; the archive row shows inside its own store.
    expect(screen.queryByTestId("os-card-2003")).toBeNull();
    expect(screen.getByTestId("os-card-2004")).toBeTruthy();
    expect(screen.getByTestId("os-outlet-filter")).toBeTruthy();
    expect(screen.getByTestId("os-sales-filter")).toBeTruthy();
    // The showroom has no second branch → no outlet dropdown there.
    fireEvent.click(screen.getByTestId("os-store-filter"));
    fireEvent.click(screen.getByTestId(`os-store-option-${STORE_SR}`));
    expect(screen.queryByTestId("os-outlet-filter")).toBeNull();
  });

  it("outlet filter matches the order's stamp AND the salesperson fallback; staff list narrows too", async () => {
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();
    fireEvent.click(await screen.findByTestId("os-store-filter"));
    fireEvent.click(screen.getByTestId(`os-store-option-${STORE_DL}`));
    fireEvent.click(screen.getByTestId("os-outlet-filter"));
    fireEvent.click(screen.getByTestId(`os-outlet-option-${OUT_2}`));
    expect(screen.queryByTestId("os-card-2001")).toBeNull(); // stamped Cheras
    expect(screen.getByTestId("os-card-2002")).toBeTruthy(); // fallback via Mayson
    fireEvent.click(screen.getByTestId("os-sales-filter"));
    expect(screen.queryByTestId("os-sales-option-sp-1")).toBeNull();
    expect(screen.getByTestId("os-sales-option-sp-2")).toBeTruthy();
  });

  it("a store login with ≥2 outlets gets the outlet dropdown, never the store one", async () => {
    useAuth.setState({ role: "dealer" });
    MOCK_STORES = [];
    MOCK_ORDERS = [
      order({ so: 2101, status: "place", outletId: OUT_1 }),
      order({ so: 2102, status: "place", outletId: OUT_2 }),
    ];
    render(<OrderStatusPage onClose={() => {}} />);
    unlock();
    expect(await screen.findByTestId("os-outlet-filter")).toBeTruthy();
    expect(screen.queryByTestId("os-store-filter")).toBeNull();
    fireEvent.click(screen.getByTestId("os-outlet-filter"));
    fireEvent.click(screen.getByTestId(`os-outlet-option-${OUT_1}`));
    expect(screen.getByTestId("os-card-2101")).toBeTruthy();
    expect(screen.queryByTestId("os-card-2102")).toBeNull();
  });
});
