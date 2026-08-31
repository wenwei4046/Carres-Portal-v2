/**
 * BdOrdersBoard — the BD network "My orders" board (2026-07-19): every
 * DEALER's orders on the store board's 3 lanes, By-dealer filter, dealer
 * chips on cards, AutoCount-archive rows hidden in All-dealers mode, and the
 * all-time footnote when a dealer is picked. BD sees dealers ONLY (Loo
 * 2026-07-25): /api/bd/dealers drops showrooms, and the board additionally
 * gates its orders to that dealer-id set — mocked here with an order whose
 * store is NOT in the list (a showroom's), which must never surface.
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
    /* THE CLOCK, NOT A DATE. The board shows the CURRENT month
       (`inPeriod` = `sameMonth(o.placedAt, monthAnchor)`), and this fixture
       used `NOW - 1 day`. On the 1st of any month "yesterday" is LAST month,
       every card falls out of scope and ten assertions fail on a product that
       is working. It failed on 2026-09-01, having passed on 2026-08-31.

       `NOW` is always inside the month the component anchors to, so the test
       asks what it means to ask. Nothing here depends on the order being a day
       old - the board filters by month and by source, never by age. */
    placedAt: new Date(NOW).toISOString(),
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
  // /api/bd/dealers is dealers-only since 2026-07-25 — the showroom-channel
  // archive store never reaches the client, so it is NOT in this mock; its
  // order (#1099) below must stay off the board via the dealer-id gate.
  useBdDealers: () => ({
    data: {
      dealers: [
        {
          id: DEALER_A,
          name: "litte mattress sdn bhd",
          region: "KV",
          contact: null,
          status: "active",
          joinedDate: null,
          orderCount: 2,
          gmv: 7185,
          outstanding: 3592,
          channel: "dealer",
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
  it("shows the dealer lanes with dealer chips; off-list (showroom) orders never surface", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    // No PIN gate for the BD HQ login.
    expect(screen.queryByTestId("os-pin-gate")).toBeNull();

    const place = screen.getByTestId("os-lane-place");
    expect(within(place).getByTestId("os-card-1301")).toBeTruthy();
    expect(within(screen.getByTestId("os-lane-proceed")).getByTestId("os-card-1302")).toBeTruthy();
    // #1099 belongs to a store NOT in the BD dealers list (a showroom) — the
    // dealer-id gate keeps it off the board in every mode.
    expect(screen.queryByTestId("os-card-1099")).toBeNull();
    // The owning dealer is named on every card in All-dealers mode.
    expect(within(place).getByTestId("os-card-dealer").textContent).toContain(
      "litte mattress sdn bhd",
    );
    // Compare card waits for a pick.
    expect(screen.getByText("Pick a dealer to compare")).toBeTruthy();
  });

  it("the dealer menu is a FLAT dealers-only list — no showroom group, no showroom option", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    // "All dealers" = the button label + the menu's all-option.
    expect(screen.getAllByText("All dealers").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId(`bd-dealer-option-${DEALER_A}`)).toBeTruthy();
    expect(screen.queryByText("Our showrooms")).toBeNull();
    expect(screen.queryByTestId(`bd-dealer-option-${DEALER_ARCHIVE}`)).toBeNull();
  });

  it("a picked dealer with ≥2 outlets gains the outlet level; picking one narrows via stamp + salesperson fallback", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    // litte mattress has 2 outlets → dropdown appears; Mont Kiara keeps only
    // the salesperson-fallback row (1302 via Aisyah), 1301 has no outlet.
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    fireEvent.click(screen.getByTestId(`bd-dealer-option-${DEALER_A}`));
    fireEvent.click(screen.getByTestId("os-outlet-filter"));
    fireEvent.click(screen.getByTestId(`os-outlet-option-${OUT_2}`));
    expect(screen.queryByTestId("os-card-1301")).toBeNull();
    expect(screen.getByTestId("os-card-1302")).toBeTruthy();
  });

  it("picking a dealer scopes the board + shows the all-time footnote", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("bd-dealer-filter"));
    fireEvent.click(screen.getByTestId(`bd-dealer-option-${DEALER_A}`));

    expect(screen.getByTestId("os-card-1301")).toBeTruthy();
    // The off-list showroom order stays hidden even inside a picked dealer.
    expect(screen.queryByTestId("os-card-1099")).toBeNull();
    // All-time footnote from dealers_with_stats.
    expect(screen.getByTestId("os-sumcard-footnote").textContent).toContain("2 orders");
  });

  it("card click opens the shared PosOrderDetail drawer", () => {
    render(<BdOrdersBoard onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("os-card-1301"));
    expect(screen.getByTestId("pos-order-detail").textContent).toContain("1301");
  });
});
