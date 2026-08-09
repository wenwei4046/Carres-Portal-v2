import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";
import { itemsSummary, lineName, outstandingState, valueState, moneyOfOrder } from "./sales-order-facts";

/**
 * SO-1 FINAL · the Sales Orders register.
 *
 * **These tests hold THE REGISTER LAW in place, clause by clause.** They are not
 * coverage; each one is a sentence of the card that a future change would
 * otherwise quietly break:
 *
 *   one row, one order      no expansion control exists at all
 *   one cell, one fact      a cell's content is a string — never nested markup
 *   never explains          no expand, no second line, equal row heights
 *   no workflow             no Status / Stock / Delivery / Next Action column
 *   rental is not ours      channel=rental never reaches the register
 *   names, never codes      the row prints `Model · Variant`
 *   a blank has ONE meaning Value + Outstanding always print a sentence
 *   the row opens the DOC   ?order=<id>, and the document is not the cockpit
 *
 * The fixture is the live production SHAPE measured 2026-08-09: a native priced
 * order whose SKUs are in the catalog, an AutoCount import whose "sku" is free
 * text and which no catalog row can name, a rental-minted order, and a
 * delivered one.
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
    useOperationTasks: () => ({ data: undefined }),
    useOperationBadges: () => ({ data: undefined }),
  };
});

vi.mock("./SalesOrderDocument", () => ({
  default: ({ orderId, onClose }: { orderId: string; onClose: () => void }) => (
    <div data-testid="document-stub" data-order-id={orderId}>
      <button onClick={onClose}>back</button>
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

function fixture(): operationOrderListRow[] {
  return [
    /* Native, catalog-named, part paid: RM 4,000 sold, RM 1,500 in. */
    makeRow({
      id: "o-native",
      so: 1257,
      customer_name: "MyHouse Management PLT",
      customer_phone: "012-345 6789",
      placed_at: "2026-07-10T02:00:00Z",
      delivery_date: "2026-07-22",
      paid: 1500,
      salespersons: { name: "Shasha" },
      outlets: { name: "Carres Klang" },
      order_lines: [
        { sku: "M1401F-K", qty: 2, unit_price: 1500, label: "M1401F · King" },
        { sku: "5539-CNR", qty: 2, unit_price: 500, label: "Booqit · CNR" },
      ],
    }),
    /* AutoCount import: the "sku" IS the product text, and no catalog row can
       name it (measured: 0 of 94 imported lines resolve). Unpriced. */
    makeRow({
      id: "o-import",
      so: 1101,
      customer_name: "Tan Ah Kow",
      customer_phone: "019 888 1234",
      placed_at: "2026-05-02T02:00:00Z",
      delivery_date: "2026-05-20",
      source_system: "autocount",
      source_ref: ["CR0925", "CR0926"],
      order_lines: [
        { sku: "1013Jager/Fab3-King/PC151-01", qty: 1, unit_price: null, label: null },
      ],
    }),
    /* Rental-minted — the Rental module's, not this register's. */
    makeRow({
      id: "o-rental",
      so: 1300,
      customer_name: "Lim Sri Muda",
      placed_at: "2026-08-01T02:00:00Z",
      delivery_date_tbd: true,
      source_system: "rental",
      order_lines: [{ sku: "RENT-BED-Q", qty: 1, unit_price: null, label: null }],
    }),
    /* Delivered, priced, and fully settled. */
    makeRow({
      id: "o-done",
      so: 1000,
      status: "delivered",
      operation_stage: "delivered",
      customer_name: "Chen Chee Cheong",
      placed_at: "2026-04-01T02:00:00Z",
      delivery_date: "2026-04-15",
      paid: 2000,
      order_lines: [{ sku: "SOF-2S", qty: 1, unit_price: 2000, label: "Lyyar · 2S" }],
    }),
  ];
}

const rows = () => screen.queryAllByTestId("sales-order-row");

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

describe("THE REGISTER LAW · one row, one order", () => {
  it("has NO expansion control — the register never expands", () => {
    render(wrap(<SalesOrdersRegister />));
    /* The kit draws a disclosure button per row only when `expansion` is
       passed. Not passing it is the law; asserting it is what keeps it. */
    expect(screen.queryByRole("button", { name: /show items|hide items|expand/i })).toBeNull();
    const table = screen.getByTestId("sales-orders-table");
    expect(within(table).queryByTestId("order-lines")).toBeNull();
  });

  it("puts a plain string in every cell — no nested markup", () => {
    render(wrap(<SalesOrdersRegister />));
    const row = rows()[0];
    for (const td of Array.from(row.querySelectorAll("td"))) {
      /* Money renders one <span> pair; every other cell is bare text. Nothing
         anywhere is a card, a table, a chip or a pill. */
      expect(td.querySelector("table, ul, ol, button, [data-kit='badge']")).toBeNull();
    }
  });

  it("shows NO workflow column", () => {
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    for (const banned of ["Status", "Stock", "Delivery", "Actions", "Next", "PIC"]) {
      expect(within(table).queryByText(banned)).toBeNull();
    }
  });

  it("shows the card's six default columns, in order", () => {
    render(wrap(<SalesOrdersRegister />));
    const heads = Array.from(
      screen.getByTestId("sales-orders-table").querySelectorAll("thead th"),
    )
      .map((th) => th.textContent?.trim())
      .filter(Boolean);
    expect(heads).toEqual([
      "SO No",
      "Customer",
      "Items",
      "Value",
      "Promised",
      "Ordered",
    ]);
  });

  it("offers no import action — a register has no actions", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.queryByText(/import/i)).toBeNull();
  });
});

describe("THE REGISTER LAW · rental is not a customer order here", () => {
  it("never shows a rental-minted order", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.queryByText("Lim Sri Muda")).toBeNull();
    expect(screen.queryByText("SO-1300")).toBeNull();
  });

  it("does not count rental in the register total", () => {
    render(wrap(<SalesOrdersRegister />));
    /* 4 orders in, 1 rental out, 1 delivered hidden by the default scope. */
    expect(screen.getByTestId("register-count")).toHaveTextContent("2 of 3 orders");
  });
});

describe("THE REGISTER LAW · names, never codes", () => {
  it("prints the catalog name and the quantity", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(
      screen.getByText("M1401F · King ×2 · Booqit · CNR ×2"),
    ).toBeInTheDocument();
  });

  it("falls back to the order's own text when no catalog row can name it", () => {
    render(wrap(<SalesOrdersRegister />));
    /* An AutoCount "sku" IS the product text a salesperson typed. There is no
       code being shown — there is no name to show instead. */
    expect(
      screen.getByText("1013Jager/Fab3-King/PC151-01 ×1"),
    ).toBeInTheDocument();
  });

  it("summarises a long order to ONE line", () => {
    const o = makeRow({
      id: "o-long",
      so: 1500,
      order_lines: [
        { sku: "A", qty: 1, unit_price: 10, label: "Mattress" },
        { sku: "B", qty: 1, unit_price: 10, label: "Bedframe" },
        { sku: "C", qty: 3, unit_price: 10, label: "Pillow" },
        { sku: "D", qty: 1, unit_price: 10, label: "Topper" },
      ],
    });
    expect(itemsSummary(o)).toBe("Mattress ×1 · Bedframe ×1 · +2 more");
  });

  it("prefers the label, and falls back to the sku text", () => {
    expect(lineName({ sku: "X-1", label: "Booqit · CNR" })).toBe("Booqit · CNR");
    expect(lineName({ sku: "X-1", label: "   " })).toBe("X-1");
    expect(lineName({ sku: "X-1", label: null })).toBe("X-1");
  });
});

describe("THE REGISTER LAW · a blank may never carry two meanings", () => {
  it("prints the amount, Paid in full, or No price yet — never nothing", () => {
    render(wrap(<SalesOrdersRegister />));
    /* Native order: 2×1500 + 2×500 = 4,000 through the shared orderMoney. */
    expect(screen.getByText("4,000")).toBeInTheDocument();
    /* The AutoCount row carries no prices at all. */
    expect(screen.getAllByText("No price yet").length).toBeGreaterThan(0);
  });

  it("says Paid in full when a priced order owes nothing", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "o-paid",
          so: 1400,
          paid: 2000,
          order_lines: [{ sku: "SOF-2S", qty: 1, unit_price: 2000, label: "Lyyar · 2S" }],
        }),
      ],
    };
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Outstanding"));
    expect(screen.getByText("Paid in full")).toBeInTheDocument();
  });

  it("computes the three states from the shared rule, not from a blank", () => {
    const priced = moneyOfOrder(
      makeRow({ id: "a", so: 1, paid: 400, order_lines: [{ sku: "x", qty: 1, unit_price: 1000 }] }),
    );
    expect(outstandingState(priced)).toEqual({ kind: "amount", value: 600 });
    expect(valueState(priced)).toEqual({ kind: "amount", value: 1000 });

    const settled = moneyOfOrder(
      makeRow({ id: "b", so: 2, paid: 1000, order_lines: [{ sku: "x", qty: 1, unit_price: 1000 }] }),
    );
    expect(outstandingState(settled)).toEqual({ kind: "settled" });

    const unpriced = moneyOfOrder(
      makeRow({ id: "c", so: 3, order_lines: [{ sku: "x", qty: 1, unit_price: null }] }),
    );
    expect(outstandingState(unpriced)).toEqual({ kind: "unpriced" });
    expect(valueState(unpriced)).toEqual({ kind: "unpriced" });
  });
});

describe("THE FIRST SCREEN · search", () => {
  const type = (v: string) =>
    fireEvent.change(screen.getByPlaceholderText(/SO number, customer/i), {
      target: { value: v },
    });

  it("finds by SO number", () => {
    render(wrap(<SalesOrdersRegister />));
    type("1257");
    expect(rows()).toHaveLength(1);
  });

  it("finds by customer name, case-insensitively", () => {
    render(wrap(<SalesOrdersRegister />));
    type("myhouse");
    expect(rows()).toHaveLength(1);
  });

  it("finds by phone however the customer says it", () => {
    render(wrap(<SalesOrdersRegister />));
    type("0123456789");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("finds by the item NAME the row prints", () => {
    render(wrap(<SalesOrdersRegister />));
    type("booqit");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("finds by the raw sku behind the name, for someone reading a printed order", () => {
    render(wrap(<SalesOrdersRegister />));
    type("5539-CNR");
    expect(rows()).toHaveLength(1);
  });

  it("finds by the imported reference", () => {
    render(wrap(<SalesOrdersRegister />));
    type("CR0926");
    expect(rows()).toHaveLength(1);
  });
});

describe("THE FILTERS", () => {
  it("hides a delivered order by default, and All orders brings it back", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.queryByText("SO-1000")).toBeNull();
  });

  it("never spells an unfixed date TBD", () => {
    listHookState.data = {
      orders: [makeRow({ id: "x", so: 9, delivery_date_tbd: true })],
    };
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByText("No date yet")).toBeInTheDocument();
    expect(screen.queryByText("TBD")).toBeNull();
  });
});

describe("THE HIDDEN FACT COLUMNS", () => {
  it("offers exactly the four the card names, and none by default", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    for (const w of ["Phone", "Salesperson", "Outlet", "Outstanding"]) {
      expect(screen.getByLabelText(w)).toBeInTheDocument();
    }
  });

  it("adds Salesperson and Outlet with real names, and writes nothing to localStorage", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Salesperson"));
    fireEvent.click(screen.getByLabelText("Outlet"));
    const table = screen.getByTestId("sales-orders-table");
    expect(within(table).getByText("Shasha")).toBeInTheDocument();
    expect(within(table).getByText("Carres Klang")).toBeInTheDocument();
    /* Layout memory is REFUSED (ui/MASTER.md §7). */
    expect(window.localStorage.length).toBe(0);
  });

  it("says so when a fact was never recorded", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Salesperson"));
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });
});

describe("THE ROW OPENS THE DOCUMENT", () => {
  it("opens the Sales Order document, not the cockpit", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    expect(screen.getByTestId("document-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("sales-orders-table")).toBeNull();
  });

  it("comes back to the register", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("sales-orders-table")).toBeInTheDocument();
  });
});
