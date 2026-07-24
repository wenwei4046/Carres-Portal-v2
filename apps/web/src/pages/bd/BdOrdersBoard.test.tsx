/**
 * BdOrdersBoard — the BD network "My orders" board (2026-07-19): every
 * dealer's orders on the store board's 3 lanes, By-dealer filter, dealer
 * chips on cards, AutoCount-archive rows hidden in All-dealers mode, and the
 * all-time footnote when a dealer is picked.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Order } from "@carres/shared";
import BdOrdersBoard from "./BdOrdersBoard";

const NOW = Date.now();
const DEALER_A = "00000000-0000-0000-0000-00000000d001";
const DEALER_ARCHIVE = "00000000-0000-0000-0000-00000000d0aa";

function order(over: Partial<Order> & { so: number; status: Order["status"] }): Order {
  return {
    id: `00000000-0000-0000-0000-${String(over.so).padStart(12, "0")}`,
    channel: "dealer",
    dealerId: DEALER_A,
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
    sourceSystem: null,
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
  order({ so: 1301, status: "place" }),
  // Carries no outlet stamp — outlet attribution falls back to its
  // salesperson (Aisyah @ Mont Kiara).
  order({ so: 1302, status: "proceed_order", paid: 3000, salespersonId: "sp-1" }),
  // AutoCount archive row — must stay OFF the All-dealers board.
  order({ so: 1099, status: "place", sourceSystem: "autocount", dealerId: DEALER_ARCHIVE }),
];

const OUT_1 = "00000000-0000-0000-0000-000000000o01";
const OUT_2 = "00000000-0000-0000-0000-000000000o02";

vi.mock("@/lib/queries", () => ({
  useOrders: () => ({ data: { orders: ORDERS, total: ORDERS.length }, isLoading: false }),
  useBdDealers: () => ({
    data: {
      dealers: [
        {
          id: DEALER_A,
          name: "Kelana Jaya",
          region: "KV",
          contact: null,
          status: "active",
          joinedDate: null,
          orderCount: 2,
          gmv: 7185,
          outstanding: 3592,
          channel: "dealer",
        },
        {
          id: DEALER_ARCHIVE,
          name: "AutoCount Archive",
          region: null,
          contact: null,
          status: "active",
          joinedDate: null,
          orderCount: 184,
          gmv: 0,
          outstanding: 0,
          channel: "showroom",
        },
      ],
    },
    isLoading: false,
  }),
  useSalespersons: () => ({
    data: {
      salespersons: [{ id: "sp-1", name: "Aisyah", dealerId: DEALER_A, outletId: OUT_2 }],
    },
  }),
  useOutlets: () => ({
    data: {
      outlets: [
        { id: OUT_1, dealerId: DEALER_A, name: "Cheras", address: "" },
        { id: OUT_2, dealerId: DEALER_A, name: "Mont Kiara", address: "" },
      ],
    },
  }),
}));
vi.mock("@/pages/dealer/pos/PosOrderDetail", () => ({
  default: ({ id }: { id: string }) => <div data-testid="pos-order-detail">{id}</div>,
}));

describe("BdOrdersBoard", () => {
  it("shows the network lanes with dealer chips; AutoCount rows stay off the All-dealers board", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    // No PIN gate for the BD HQ login.
    expect(screen.queryByTestId("os-pin-gate")).toBeNull();

    const place = screen.getByTestId("os-lane-place");
    expect(within(place).getByTestId("os-card-1301")).toBeTruthy();
    expect(within(screen.getByTestId("os-lane-proceed")).getByTestId("os-card-1302")).toBeTruthy();
    // Archive import hidden in All-dealers mode.
    expect(screen.queryByTestId("os-card-1099")).toBeNull();
    // The owning store is named on every card in All-dealers mode.
    expect(within(place).getByTestId("os-card-dealer").textContent).toContain("Kelana Jaya");
    // Compare card waits for a pick.
    expect(screen.getByText("Pick a store to compare")).toBeTruthy();
  });

  it("groups the store menu into Our showrooms / Dealers (store-kind rule)", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    expect(screen.getByText("Our showrooms")).toBeTruthy();
    expect(screen.getByText("Dealers")).toBeTruthy();
    expect(screen.getByTestId(`bd-dealer-option-${DEALER_ARCHIVE}`)).toBeTruthy();
  });

  it("a picked store with ≥2 outlets gains the outlet level; picking one narrows via stamp + salesperson fallback", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    // Archive store has no outlets → no outlet dropdown.
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    fireEvent.click(screen.getByTestId(`bd-dealer-option-${DEALER_ARCHIVE}`));
    expect(screen.queryByTestId("os-outlet-filter")).toBeNull();
    // Kelana Jaya has 2 → dropdown appears; Mont Kiara keeps only the
    // salesperson-fallback row (1302 via Aisyah), 1301 has no outlet at all.
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    fireEvent.click(screen.getByTestId(`bd-dealer-option-${DEALER_A}`));
    fireEvent.click(screen.getByTestId("os-outlet-filter"));
    fireEvent.click(screen.getByTestId(`os-outlet-option-${OUT_2}`));
    expect(screen.queryByTestId("os-card-1301")).toBeNull();
    expect(screen.getByTestId("os-card-1302")).toBeTruthy();
  });

  it("picking a dealer scopes the board, shows its archive rows + the all-time footnote", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    fireEvent.click(screen.getByTestId(`bd-dealer-option-${DEALER_ARCHIVE}`));

    // Store-board semantics inside one dealer: the AutoCount row shows now.
    expect(screen.getByTestId("os-card-1099")).toBeTruthy();
    // The other dealer's orders are gone.
    expect(screen.queryByTestId("os-card-1301")).toBeNull();
    // All-time footnote from dealers_with_stats.
    expect(screen.getByTestId("os-sumcard-footnote").textContent).toContain("184 orders");
  });

  it("card click opens the shared PosOrderDetail drawer", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("os-card-1301"));
    expect(screen.getByTestId("pos-order-detail").textContent).toContain("1301");
  });
});
