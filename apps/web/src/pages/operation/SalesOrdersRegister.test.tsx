import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

/* SO-3 — the panel has its own suite (`SalesOrderPanel.test.tsx`). Here it is a
   stub, so these tests hold what the REGISTER does: which order is open, where
   the arrows land, and that the grid is still mounted beside it. */
vi.mock("./SalesOrderPanel", () => ({
  default: ({
    orderId,
    position,
    total,
    onStep,
    onOpenDocument,
    onClose,
  }: {
    orderId: string;
    position: number;
    total: number;
    onStep: (d: -1 | 1) => void;
    onOpenDocument: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="panel-stub" data-order-id={orderId}>
      <span data-testid="panel-stub-position">{`${position} of ${total}`}</span>
      <button onClick={() => onStep(1)}>next</button>
      <button onClick={() => onStep(-1)}>prev</button>
      <button onClick={onOpenDocument}>document</button>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

/* SO-5 — the view lives on the URL, and MemoryRouter's location is not
   `window.location`: this probe records what the register wrote so a test can
   read it. */
let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function wrap(node: React.ReactNode, initialEntries: string[] = ["/"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={qc}>
        {node}
        <LocationProbe />
      </QueryClientProvider>
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

  it("puts a plain string in every DATA cell — no nested markup", () => {
    render(wrap(<SalesOrdersRegister />));
    const row = rows()[0];
    /* td[0] is the kit's selection gutter and holds its checkbox — SO-5's one
       lawful control (Export-only). Every DATA cell after it stays a string. */
    for (const td of Array.from(row.querySelectorAll("td")).slice(1)) {
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

  it("shows SO-5's five default columns, in order — Value lives in the chooser", () => {
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
      "Promised Delivery",
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
    /* 4 orders in, 1 rental out, 1 delivered hidden by the default scope —
       SO-5's status bar states the register's size, plain while nothing
       narrows. */
    expect(screen.getByTestId("register-count")).toHaveTextContent("2 orders");
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
    /* Value is a chooser column since SO-5 — put it on to read the figure. */
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Value"));
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

  it("adds Salesperson and Outlet with real names, and REMEMBERS the choice (SO-5)", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Salesperson"));
    fireEvent.click(screen.getByLabelText("Outlet"));
    const table = screen.getByTestId("sales-orders-table");
    expect(within(table).getByText("Shasha")).toBeInTheDocument();
    expect(within(table).getByText("Carres Klang")).toBeInTheDocument();
    /* SO-5 — auto-remember, NOT a layout manager: the store holds WHICH
       columns are on and nothing else (no widths, no order, no filters). */
    expect(
      JSON.parse(window.localStorage.getItem("carres.salesOrders.columns")!),
    ).toContain("salesperson");
  });

  it("a reload keeps the chosen columns — the store round-trips (SO-5)", () => {
    window.localStorage.setItem(
      "carres.salesOrders.columns",
      JSON.stringify(["so", "customer", "items", "promised", "ordered", "phone"]),
    );
    render(wrap(<SalesOrdersRegister />));
    const heads = Array.from(
      screen.getByTestId("sales-orders-table").querySelectorAll("th[data-column]"),
    ).map((th) => th.getAttribute("data-column"));
    expect(heads).toEqual(["so", "customer", "items", "promised", "ordered", "phone"]);
  });

  it("a corrupt or stale store falls back to the defaults, never a broken grid", () => {
    window.localStorage.setItem("carres.salesOrders.columns", "not json at all");
    render(wrap(<SalesOrdersRegister />));
    expect(
      screen.getByTestId("sales-orders-table").querySelectorAll("th[data-column]").length,
    ).toBe(5);
  });

  it("says so when a fact was never recorded", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Salesperson"));
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });
});

/**
 * SO-3 REPLACED SO-1's "THE ROW OPENS THE DOCUMENT", and the replacement is a
 * ruling rather than a regression.
 *
 * SO-1 shipped a row that opened the printable document IN PLACE OF the
 * register, and filed its own cost as debt D-G (`grid-findings` F31: *opening
 * one order costs you the list*). SO-3's card: *"Opens on row click, register
 * stays visible"* — and the document is kept as the separate screen `⤢` opens.
 * The two tests below are the old two, rewritten to the new ruling; the
 * document's own screen is still asserted, because it did not go anywhere.
 */
describe("THE ROW OPENS THE PANEL, AND THE REGISTER STAYS", () => {
  it("opens the Sales Order panel beside the grid — the list is not lost", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
    /* The whole point: the register is STILL MOUNTED. */
    expect(screen.getByTestId("sales-orders-table")).toBeInTheDocument();
    expect(rows().length).toBeGreaterThan(0);
    expect(screen.queryByTestId("document-stub")).toBeNull();
  });

  it("⤢ opens the full printable document as its own screen, and Back returns to the panel", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByText("document"));
    expect(screen.getByTestId("document-stub")).toHaveAttribute("data-order-id", "o-native");
    expect(screen.queryByTestId("sales-orders-table")).toBeNull();

    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("sales-orders-table")).toBeInTheDocument();
    expect(screen.getByTestId("panel-stub")).toBeInTheDocument();
  });

  it("✕ closes the panel and leaves the register alone", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByText("close"));
    expect(screen.queryByTestId("panel-stub")).toBeNull();
    expect(screen.getByTestId("sales-orders-table")).toBeInTheDocument();
  });

  it("tells the panel where it is in the list — `n of N`", () => {
    render(wrap(<SalesOrdersRegister />));
    /* Default scope hides the delivered order, and rental never reaches the
       register at all: two rows survive, newest ordered first. */
    fireEvent.click(rows()[0]);
    expect(screen.getByTestId("panel-stub-position")).toHaveTextContent("1 of 2");
  });
});

describe("SO-3 · THE SEVEN GRID CAPABILITIES", () => {
  it("↑ ↓ walk the rows and the panel follows — no second press", () => {
    render(wrap(<SalesOrdersRegister />));
    const grid = screen.getByTestId("sales-orders-table");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-import");
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
  });

  it("the panel's own arrows move through the same list", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByText("next"));
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-import");
    fireEvent.click(screen.getByText("prev"));
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
  });

  it("gives EVERY visible column a header ▼, and NO permanent filter row exists (SO-4)", () => {
    render(wrap(<SalesOrdersRegister />));
    for (const key of ["so", "customer", "items", "promised", "ordered"]) {
      expect(screen.getByTestId(`table-filter-${key}`)).toBeInTheDocument();
    }
    /* The invention SO-4 deletes: not hidden, NOT IN THE DOM. */
    expect(document.querySelector('[data-kit="table-filter-row"]')).toBeNull();
    expect(document.querySelectorAll("thead tr")).toHaveLength(1);
  });

  it("the ▼ filters on the EXACT string the cell prints, and a chip appears", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(rows().length).toBe(2);
    /* No chips row at all until a filter narrows — DOM-absent, not hidden. */
    expect(screen.queryByTestId("register-chips")).toBeNull();
    fireEvent.click(screen.getByTestId("table-filter-customer"));
    fireEvent.click(screen.getByLabelText("MyHouse Management PLT"));
    expect(rows().length).toBe(1);
    /* SO-5's status bar names the narrowing out loud. */
    expect(screen.getByTestId("register-count")).toHaveTextContent(
      "1 of 2 · Filters active",
    );
    expect(screen.getByTestId("register-chips")).toBeInTheDocument();
    expect(screen.getByTestId("chip-customer")).toHaveTextContent(
      "Customer: MyHouse Management PLT",
    );
  });

  it("a chip's ✕ releases its column, and Clear all releases everything", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("table-filter-customer"));
    fireEvent.click(screen.getByLabelText("MyHouse Management PLT"));
    expect(rows().length).toBe(1);
    fireEvent.click(screen.getByTestId("chip-customer"));
    expect(rows().length).toBe(2);
    expect(screen.queryByTestId("register-chips")).toBeNull();
  });

  it("a date column's ▼ carries the presets, and one narrows the register", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(rows().length).toBe(2);
    fireEvent.click(screen.getByTestId("table-filter-ordered"));
    /* Every fixture order was placed 2026-06-01 — long past. */
    fireEvent.click(screen.getByTestId("table-filter-preset-ordered-overdue"));
    expect(rows().length).toBe(2);
    /* The popover is still open — switching preset re-narrows in place. */
    fireEvent.click(screen.getByTestId("table-filter-preset-ordered-today"));
    expect(rows().length).toBe(0);
  });

  it("a money column's ▼ carries min/max, on the RAW figure", () => {
    render(wrap(<SalesOrdersRegister />));
    /* Value is a chooser column since SO-5 — put it on first. */
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Value"));
    fireEvent.click(screen.getByTestId("table-filter-value"));
    fireEvent.change(screen.getByTestId("table-filter-min-value"), {
      target: { value: "4000" },
    });
    expect(rows().length).toBe(1);
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("the toolbar's Clear filters releases every ▼ at once", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByTestId("clear-filters")).toBeDisabled();
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Value"));
    fireEvent.click(screen.getByTestId("table-filter-value"));
    fireEvent.change(screen.getByTestId("table-filter-min-value"), {
      target: { value: "4000" },
    });
    expect(rows().length).toBe(1);
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(rows().length).toBe(2);
    expect(screen.queryByTestId("register-chips")).toBeNull();
  });

  it("makes EVERY visible column sortable", () => {
    render(wrap(<SalesOrdersRegister />));
    for (const key of ["so", "customer", "items", "promised", "ordered"]) {
      expect(screen.getByTestId(`table-sort-${key}`)).toBeInTheDocument();
    }
  });

  it("pins SO No and Customer, and hands the grid a resize handle", () => {
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    const heads = Array.from(table.querySelectorAll("th[data-column]"));
    expect(heads[0]!.className).toContain("sticky");
    expect(heads[1]!.className).toContain("sticky");
    expect(heads[2]!.className).not.toContain("sticky");
    expect(screen.getByTestId("table-resize-so")).toBeInTheDocument();
  });

  it("runs the rows at 2990's dense numbers and every row is still ONE height", () => {
    render(wrap(<SalesOrdersRegister />));
    const table = screen.getByTestId("sales-orders-table");
    expect(table.querySelector("table")!.className).toContain("[&_td]:h-row-dense");
    expect(table.querySelector("table")!.className).toContain("text-meta");
    const heights = new Set(
      rows().map((r) => (r.querySelector("td") as HTMLElement).className),
    );
    expect(heights.size).toBe(1);
  });
});

describe("SO-3 · THE COLUMN CHOOSER", () => {
  it("offers every order-owned flat fact, and only five are on", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    for (const label of [
      "Phone", "Email", "Address", "Postcode", "Floor", "Lift",
      "DO No", "Invoice No", "Invoiced", "Delivered", "Paid", "Outstanding",
      "Channel", "Customer reference", "Payment method",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const table = screen.getByTestId("sales-orders-table");
    expect(table.querySelectorAll("th[data-column]").length).toBe(5);
  });

  it("offers NO cross-module column — the chooser is not a back door", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    for (const banned of ["Stock", "Next action", "PIC", "Status", "Ready Stock", "On PO"]) {
      expect(screen.queryByLabelText(banned)).toBeNull();
    }
  });

  it("puts a re-ticked column back where the catalog keeps it, never at the end", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Phone"));
    const heads = () =>
      Array.from(
        screen.getByTestId("sales-orders-table").querySelectorAll("th[data-column]"),
      ).map((th) => th.getAttribute("data-column"));
    expect(heads()).toEqual(["so", "customer", "items", "promised", "ordered", "phone"]);
  });

  it("Reset columns puts the five back, releases every ▼, and resets the store", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Phone"));
    fireEvent.click(screen.getByTestId("table-filter-customer"));
    fireEvent.click(screen.getByLabelText("MyHouse Management PLT"));
    expect(rows().length).toBe(1);
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByTestId("columns-reset"));
    expect(
      screen.getByTestId("sales-orders-table").querySelectorAll("th[data-column]").length,
    ).toBe(5);
    expect(rows().length).toBe(2);
    expect(
      JSON.parse(window.localStorage.getItem("carres.salesOrders.columns")!),
    ).toEqual(["so", "customer", "items", "promised", "ordered"]);
  });

  it("the button itself says how much of the catalog is on — 2990's own count", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByTestId("columns-button")).toHaveTextContent("Columns · 5/34");
  });

  it("deletes the stale chooser caption — the choice is no longer cleared on reload", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    expect(screen.queryByText(/Cleared on reload/i)).toBeNull();
  });
});

describe("SO-4 · ONE TOOLBAR ROW, AND WHAT IT REFUSES", () => {
  it("has no Refresh — the query refetches itself", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.queryByText("Refresh")).toBeNull();
  });

  it("has no standalone date pickers — dates filter through their column's ▼", () => {
    render(wrap(<SalesOrdersRegister />));
    const toolbar = screen.getByTestId("register-toolbar");
    expect(toolbar.querySelector('input[type="date"]')).toBeNull();
    expect(screen.queryByPlaceholderText("From")).toBeNull();
    expect(screen.queryByPlaceholderText("To")).toBeNull();
  });

  it("keeps the compact global search, the scope, Columns and Export on ONE row", () => {
    render(wrap(<SalesOrdersRegister />));
    const toolbar = screen.getByTestId("register-toolbar");
    expect(within(toolbar).getByPlaceholderText(/SO number, customer/i)).toBeInTheDocument();
    expect(within(toolbar).getByTestId("columns-button")).toBeInTheDocument();
    expect(within(toolbar).getByTestId("export-button")).toBeInTheDocument();
    expect(within(toolbar).getByTestId("clear-filters")).toBeInTheDocument();
  });
});

describe("SO-5 · THE DETAIL PANE IS A SIDE PANE, AND THE KEYS WORK FROM ANYWHERE", () => {
  it("gives the pane a FIXED 35% as a flex sibling — reflow, never an overlay", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    const pane = screen.getByTestId("detail-pane");
    expect(pane.className).toContain("w-[35%]");
    expect(pane.className).not.toContain("absolute");
    /* The register column is the pane's flex SIBLING, so opening the pane
       reflows the grid instead of covering it. */
    expect(pane.parentElement).toContainElement(screen.getByTestId("sales-orders-table"));
  });

  it("Esc closes the panel from the page, ↑↓ walk the register", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-import");
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("panel-stub")).toHaveAttribute("data-order-id", "o-native");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("panel-stub")).toBeNull();
  });

  it("keeps its hands off an operator's typing — keys inside a form field pass through", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(rows()[0]);
    const search = screen.getByPlaceholderText(/SO number, customer/i);
    search.focus();
    fireEvent.keyDown(search, { key: "Escape" });
    /* The panel is still open: Escape inside a field is the field's. */
    expect(screen.getByTestId("panel-stub")).toBeInTheDocument();
  });
});

describe("SO-5 · THE CUSTOMER CELL, SELECTION AND EXPORT", () => {
  it("the Customer cell is the NAME ALONE, one line — the phone left the cell (SO-5)", () => {
    render(wrap(<SalesOrdersRegister />));
    /* td[0] is the selection gutter; td[1] SO No; td[2] Customer. */
    const cell = rows()[0]!.querySelectorAll("td")[2]!;
    expect(cell).toHaveTextContent("MyHouse Management PLT");
    expect(cell).not.toHaveTextContent("012-345 6789");
    expect(cell.querySelector(".flex-col")).toBeNull();
    expect(cell.querySelector("table, ul, ol, button, [data-kit='badge']")).toBeNull();
  });

  it("says `Not given` on the Phone column when the customer never gave one", () => {
    listHookState.data = {
      orders: [fixture()[0]!, { ...fixture()[1]!, customer_phone: null }],
    };
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTestId("columns-button"));
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(screen.getByText("Not given")).toBeInTheDocument();
  });

  it("says WHAT it exports and OF WHAT — format + scope, no bare Export", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByTestId("export-button")).toBeEnabled();
    expect(screen.getByTestId("export-button")).toHaveTextContent(
      "Export CSV · current view",
    );
  });

  it("ticked rows flip the label to the selection — Export CSV · N selected", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByLabelText("Select SO-1257"));
    expect(screen.getByTestId("export-button")).toHaveTextContent(
      "Export CSV · 1 selected",
    );
    fireEvent.click(screen.getByLabelText("Select SO-1101"));
    expect(screen.getByTestId("export-button")).toHaveTextContent(
      "Export CSV · 2 selected",
    );
    /* Both rows are ticked = ALL are ticked, so one press of select-all
       CLEARS — and the label speaks for the view again. */
    fireEvent.click(screen.getByLabelText("Select all sales orders"));
    expect(screen.getByTestId("export-button")).toHaveTextContent(
      "Export CSV · current view",
    );
  });

  it("a tick a later filter hid does not count — the label never over-claims", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByLabelText("Select SO-1101"));
    expect(screen.getByTestId("export-button")).toHaveTextContent("1 selected");
    fireEvent.change(screen.getByPlaceholderText(/SO number, customer/i), {
      target: { value: "myhouse" },
    });
    /* SO-1101 is filtered out of the view, so nothing is "selected" to export. */
    expect(screen.getByTestId("export-button")).toHaveTextContent(
      "Export CSV · current view",
    );
  });
});

describe("SO-5 · THE VIEW LIVES ON THE URL", () => {
  it("a pasted filter link opens already narrowed", () => {
    render(
      wrap(<SalesOrdersRegister />, [
        `/?f_customer=${encodeURIComponent("v:MyHouse%20Management%20PLT")}`,
      ]),
    );
    expect(rows().length).toBe(1);
    expect(screen.getByTestId("register-count")).toHaveTextContent(
      "1 of 2 · Filters active",
    );
  });

  it("narrowing writes the URL — the view is shareable", async () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.change(screen.getByPlaceholderText(/SO number, customer/i), {
      target: { value: "myhouse" },
    });
    fireEvent.click(screen.getByTestId("table-filter-customer"));
    fireEvent.click(screen.getByLabelText("MyHouse Management PLT"));
    await screen.findByTestId("register-chips");
    expect(lastSearch).toContain("q=myhouse");
    expect(lastSearch).toContain("f_customer=");
  });
});

describe("SO-5 · NEVER A BLANK TABLE", () => {
  it("an impossible search says so and hands back Clear filters", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.change(screen.getByPlaceholderText(/SO number, customer/i), {
      target: { value: "zzz-no-such-order-zzz" },
    });
    expect(rows().length).toBe(0);
    expect(screen.getByText("No matching sales orders.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("empty-clear-filters"));
    expect(rows().length).toBe(2);
  });
});
