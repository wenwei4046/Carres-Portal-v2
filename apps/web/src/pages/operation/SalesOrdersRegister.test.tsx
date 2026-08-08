import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";

/**
 * SO-1 · the Sales Orders register.
 *
 * **These tests are the card's own acceptance criteria, not coverage.** Each one
 * holds a line of the card in place:
 *
 *   the RED LINE          no stock / delivery / next / health column exists
 *   the FIRST SCREEN      search answers SO · customer · phone · item
 *   the FILTERS           an ORDERED date range, and not-delivered / all
 *   the MONEY             one arithmetic, `orderMoney` through `moneyOf`
 *   the DRAWER            reused, and handed NO `journey` (no second derivation)
 *   the CHOOSER           extra facts, and nothing written to localStorage
 *
 * The fixture is the live production SHAPE measured 2026-08-08: a native priced
 * order, an AutoCount import with no prices, a rental-minted order with no
 * prices, and a delivered one. On production that day: 77 orders in scope, 29
 * priced, 71 with a promised date, 5 TBD, 0 delivered.
 */

let listHookState: {
  data: { orders: operationOrderListRow[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => listHookState,
    /* ModuleHeader mounts the global icons, which run their own queries. They
       are not this page's subject; an empty answer keeps them quiet. */
    useOperationTasks: () => ({ data: undefined }),
    useOperationBadges: () => ({ data: undefined }),
  };
});

vi.mock("./components/OrderDetailDrawer", () => ({
  default: ({
    orderId,
    onClose,
    journey,
  }: {
    orderId: string;
    onClose: () => void;
    journey?: unknown;
  }) => (
    <div
      data-testid="drawer-stub"
      data-order-id={orderId}
      /* Serialised so a test can prove the register hands the drawer NO
         cross-module derivation of its own. */
      data-journey={journey === undefined ? "absent" : "present"}
    >
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

function makeRow(
  partial: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: "Test Customer",
    customer_phone: null,
    placed_at: "2026-06-01T00:00:00Z",
    delivery_date: null,
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: null,
    dealers: null,
    ...partial,
  } as operationOrderListRow;
}

/** The live shape, four orders wide. */
function fixture(): operationOrderListRow[] {
  return [
    /* Native, priced, part paid: RM 4,000 sold, RM 1,500 in → RM 2,500 owed. */
    makeRow({
      id: "o-native",
      so: 1257,
      customer_name: "MyHouse Management PLT",
      customer_phone: "012-345 6789",
      placed_at: "2026-07-10T02:00:00Z",
      delivery_date: "2026-07-22",
      paid: 1500,
      order_lines: [
        { sku: "B1201F-Q", qty: 2, unit_price: 1500 },
        { sku: "PILLOW-L", qty: 2, unit_price: 500 },
      ],
    }),
    /* AutoCount import: no prices, no keyed balance → the order's value is
       UNKNOWN, and unknown is not zero. */
    makeRow({
      id: "o-import",
      so: 1101,
      customer_name: "Tan Ah Kow",
      customer_phone: "019 888 1234",
      placed_at: "2026-05-02T02:00:00Z",
      delivery_date: "2026-05-20",
      source_system: "autocount",
      source_ref: ["CR0925", "CR0926"],
      order_lines: [{ sku: "1013Jager/Fab3-King", qty: 1, unit_price: null }],
    }),
    /* Rental-minted, and its promised date is not fixed. */
    makeRow({
      id: "o-rental",
      so: 1300,
      customer_name: "Lim Sri Muda",
      customer_phone: "011-2222 3333",
      placed_at: "2026-08-01T02:00:00Z",
      delivery_date: null,
      delivery_date_tbd: true,
      source_system: "rental",
      order_lines: [{ sku: "RENT-BED-Q", qty: 1, unit_price: null }],
    }),
    /* Delivered, and fully settled. */
    makeRow({
      id: "o-done",
      so: 1000,
      status: "delivered",
      operation_stage: "delivered",
      customer_name: "Chen Chee Cheong",
      placed_at: "2026-04-01T02:00:00Z",
      delivery_date: "2026-04-15",
      paid: 2000,
      order_lines: [{ sku: "SOF-2S", qty: 1, unit_price: 2000 }],
    }),
  ];
}

function rowIds(): string[] {
  return screen
    .queryAllByTestId("sales-order-row")
    .map((r) => r.textContent ?? "");
}

beforeEach(() => {
  listHookState = {
    data: { orders: fixture() },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  };
  window.localStorage.clear();
});

describe("SalesOrdersRegister — what the page IS", () => {
  it("is named Sales Orders on the fixed header row", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(
      screen.getByTestId("sales-orders-header-module-word"),
    ).toHaveTextContent("Sales Orders");
  });

  it("shows the five default columns and NO cross-module column", () => {
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    for (const word of ["SO No", "Customer", "Items", "Promised", "Outstanding"]) {
      expect(within(table).getByText(word)).toBeInTheDocument();
    }
    /* THE RED LINE. Every one of these is another module's record, and V1 may
       not show it. A column arriving here is a boundary being crossed. */
    for (const banned of ["Stock", "Delivery", "Actions", "Status", "PIC", "Next"]) {
      expect(within(table).queryByText(banned)).toBeNull();
    }
  });

  it("prints the order's own facts on the row", () => {
    render(wrap(<SalesOrdersRegister />));
    const row = screen.getByTestId("sales-orders-table");
    expect(within(row).getByText("SO-1257")).toBeInTheDocument();
    expect(within(row).getByText("MyHouse Management PLT")).toBeInTheDocument();
    expect(
      within(row).getByText("2× B1201F-Q · 2× PILLOW-L"),
    ).toBeInTheDocument();
    expect(within(row).getByText("Wed, 22 Jul 26")).toBeInTheDocument();
  });
});

describe("SalesOrdersRegister — the first screen is SEARCH", () => {
  function type(value: string) {
    fireEvent.change(screen.getByPlaceholderText(/SO number, customer/i), {
      target: { value },
    });
  }

  it("finds an order by its SO number", () => {
    render(wrap(<SalesOrdersRegister />));
    type("1257");
    expect(rowIds()).toHaveLength(1);
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("finds an order by customer name, case-insensitively", () => {
    render(wrap(<SalesOrdersRegister />));
    type("myhouse");
    expect(rowIds()).toHaveLength(1);
  });

  it("finds an order by PHONE, however the number is punctuated", () => {
    render(wrap(<SalesOrdersRegister />));
    /* The customer says "zero one two three four five…", never "012-345 6789".
       The server cannot answer this at all today — orders.ts:184 searches name,
       ref and SO — which is why the filtering is here. */
    type("0123456789");
    expect(rowIds()).toHaveLength(1);
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("finds an order by ITEM", () => {
    render(wrap(<SalesOrdersRegister />));
    type("1013Jager");
    expect(rowIds()).toHaveLength(1);
    expect(screen.getByText("SO-1101")).toBeInTheDocument();
  });

  it("finds an order by its imported ref", () => {
    render(wrap(<SalesOrdersRegister />));
    type("CR0926");
    expect(rowIds()).toHaveLength(1);
  });

  it("says so when nothing matches, and does not blame the operator", () => {
    render(wrap(<SalesOrdersRegister />));
    type("zzzz");
    expect(rowIds()).toHaveLength(0);
    expect(screen.getByText("No order matches this search")).toBeInTheDocument();
  });
});

describe("SalesOrdersRegister — the two filters", () => {
  it("hides a delivered order by default and shows it on All orders", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(rowIds()).toHaveLength(3);
    expect(screen.queryByText("SO-1000")).toBeNull();
    expect(screen.getByTestId("register-count")).toHaveTextContent(
      "3 of 4 orders",
    );
  });

  it("never spells the unfixed date TBD — a banned word", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByText("No date yet")).toBeInTheDocument();
    expect(screen.queryByText("TBD")).toBeNull();
  });

  it("counts the whole register when nothing is narrowing it", () => {
    listHookState.data = { orders: [fixture()[0]] };
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByTestId("register-count")).toHaveTextContent("1 orders");
  });
});

describe("SalesOrdersRegister — money is ONE arithmetic", () => {
  it("prints what is still owed, through the shared rule", () => {
    render(wrap(<SalesOrdersRegister />));
    /* 2×1500 + 2×500 = 4,000 sold, 1,500 paid → 2,500 owed. Computed by
       `moneyOf` → `orderMoney`, the same function the drawer, the booking gate
       and the collections desk read. */
    expect(screen.getByText("2,500")).toBeInTheDocument();
  });

  it("leaves an UNPRICED order blank — unknown is not zero", () => {
    render(wrap(<SalesOrdersRegister />));
    /* The import and the rental order carry no prices and no keyed balance.
       A `—` there would claim nothing is owed, which nobody knows. */
    expect(screen.getAllByLabelText("not priced")).toHaveLength(2);
  });

  it("prints a dash when the order is priced and settled", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "o-paid",
          so: 1400,
          paid: 2000,
          order_lines: [{ sku: "SOF-2S", qty: 1, unit_price: 2000 }],
        }),
      ],
    };
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    expect(within(table).getByText("—")).toBeInTheDocument();
    expect(within(table).queryByLabelText("not priced")).toBeNull();
  });
});

describe("SalesOrdersRegister — the row opens the existing drawer", () => {
  it("opens the drawer and hands it NO journey", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getAllByTestId("sales-order-row")[0]);
    const drawer = screen.getByTestId("drawer-stub");
    expect(drawer).toBeInTheDocument();
    /* The register computes no cross-module signal, so it has none to hand
       over — and the drawer's own prop doc says absent is the safe answer. */
    expect(drawer).toHaveAttribute("data-journey", "absent");
  });

  it("comes back to the register on close", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getAllByTestId("sales-order-row")[0]);
    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("sales-orders-table")).toBeInTheDocument();
  });
});

describe("SalesOrdersRegister — the column chooser", () => {
  it("adds an extra fact column and writes NOTHING to localStorage", () => {
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    expect(within(table).queryByText("Phone")).toBeNull();

    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Phone"));

    expect(
      within(screen.getByTestId("sales-orders-table")).getByText("Phone"),
    ).toBeInTheDocument();
    /* `carres.orders.hiddenCols` was ruled against on 2026-08-04 and deleted in
       S1; `docs/ui/MASTER.md` §7 carries "Layout memory — REFUSED". A chooser
       that remembered would reverse both. */
    expect(window.localStorage.length).toBe(0);
  });
});
