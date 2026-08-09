import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";
import { REGISTER_FIELDS } from "./sales-order-columns";

/**
 * RG-2 · the Sales Orders register runs THE REGISTER ENGINE.
 *
 * **These tests hold THE REGISTER LAW clause by clause, plus RG-2's
 * acceptance sheet.** They are not coverage; each one is a sentence a future
 * change would otherwise quietly break:
 *
 *   one row, one order      no expansion control exists at all
 *   no workflow             no Status / Stock / Next Action column
 *   rental is not ours      a rental-minted order never reaches the register
 *   names, never codes      the row prints `Model · Variant`
 *   the card's six          select · SO No · Customer · Items · Promised
 *                           Delivery · Ordered; everything else in the chooser
 *   customer = name + phone one line, phone rides the same cell
 *   ▽ = 2990's popup        Find · Select all · Select invert · values
 *   columns n/m + persist   the chooser survives a reload; Reset works
 *   selection serves Export "N selected · Clear · Export Excel (N)"
 *   export = current view   visible columns + filtered rows only
 *   the row opens the PANEL ?order=<id>; ↑↓ walks; Esc closes; ⤢ = document
 */

let listHookState: {
  data: { orders: operationOrderListRow[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
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

/* The panel has its own suite (`SalesOrderPanel.test.tsx`). Here it is a
   stub, so these tests hold what the REGISTER does: which order is open,
   where the arrows land, and that the grid is still mounted beside it. */
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

/* The engine dynamic-imports xlsx; mocking it makes Export observable and
   keeps the binary writer out of jsdom. */
const xlsxMock = vi.hoisted(() => ({
  json_to_sheet: vi.fn((..._args: unknown[]) => ({})),
  book_new: vi.fn(() => ({})),
  book_append_sheet: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: xlsxMock.json_to_sheet,
    book_new: xlsxMock.book_new,
    book_append_sheet: xlsxMock.book_append_sheet,
  },
  writeFile: xlsxMock.writeFile,
}));

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

/* The live production SHAPE measured 2026-08-09: a native priced order whose
   SKUs are in the catalog, an AutoCount import whose "sku" is free text, a
   rental-minted order (never ours), a delivered one (out of the default
   scope), and a second live native so selection has three rows to tick. */
function fixture(): operationOrderListRow[] {
  return [
    makeRow({
      id: "o-fresh",
      so: 1311,
      customer_name: "Aina Zulkifli",
      customer_phone: "017-222 3344",
      placed_at: "2026-08-02T02:00:00Z",
      delivery_date: "2026-08-20",
      paid: 0,
      order_lines: [{ sku: "M1402F-Q", qty: 1, unit_price: 2200, label: "Jager · Queen" }],
    }),
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
    /* Delivered — outside the default "Not delivered" scope. */
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

/** Data rows only — skeleton + virtual spacer rows are aria-hidden. */
const rows = () =>
  Array.from(document.querySelectorAll("tbody tr")).filter(
    (tr) => tr.getAttribute("aria-hidden") == null,
  );
const headerTexts = () =>
  Array.from(document.querySelectorAll("thead th")).map((th) => th.getAttribute("title") ?? "");

const GRID_STORE = "carres.salesOrders.grid.v1";

beforeEach(() => {
  listHookState = {
    data: { orders: fixture() },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  };
  window.localStorage.clear();
  xlsxMock.json_to_sheet.mockClear();
  xlsxMock.writeFile.mockClear();
  lastSearch = "";
});

describe("THE REGISTER LAW · the grid", () => {
  it("never expands, and a rental order never reaches the register", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.queryByRole("button", { name: /show items|hide items|expand/i })).toBeNull();
    /* live scope: fresh + native + import. Rental and delivered are absent. */
    expect(rows().length).toBe(3);
    expect(screen.queryByText("Lim Sri Muda")).toBeNull();
    expect(screen.queryByText("Chen Chee Cheong")).toBeNull();
  });

  it("prints names, never codes, and owns no workflow column", () => {
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByText(/Booqit · CNR ×2/)).toBeInTheDocument();
    expect(screen.queryByText("M1401F-K")).toBeNull();
    for (const banned of ["Status", "Stock", "Next Action", "Actions"]) {
      expect(headerTexts()).not.toContain(banned);
    }
  });

  it("defaults to the card's six: select · SO No · Customer · Items · Promised Delivery · Ordered", () => {
    render(wrap(<SalesOrdersRegister />));
    const titles = headerTexts().filter(Boolean);
    expect(titles).toEqual(["SO No", "Customer", "Items", "Promised Delivery", "Ordered"]);
    expect(screen.getAllByRole("checkbox", { name: "Select row" }).length).toBe(3);
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeInTheDocument();
  });

  it("rides the phone on the Customer cell — one line, gray beside the name", () => {
    render(wrap(<SalesOrdersRegister />));
    const cell = screen.getByTitle("MyHouse Management PLT · 012-345 6789");
    expect(cell.textContent).toBe("MyHouse Management PLT · 012-345 6789");
  });
});

describe("RG-2 · the Columns chooser", () => {
  it("counts the catalog on the button — 5 shown of every field", () => {
    render(wrap(<SalesOrdersRegister />));
    const btn = screen.getByRole("button", { name: /Columns/ });
    expect(btn.textContent).toContain(`5/${REGISTER_FIELDS.length}`);
  });

  it("shows a hidden column, remembers it across a remount, and Reset restores the defaults", () => {
    const view = render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Phone" }));
    expect(headerTexts()).toContain("Phone");
    /* The engine wrote the layout; a fresh mount reads it back. */
    const stored = JSON.parse(window.localStorage.getItem(GRID_STORE) ?? "{}") as {
      hidden?: string[];
    };
    expect(stored.hidden).not.toContain("phone");
    view.unmount();
    render(wrap(<SalesOrdersRegister />));
    expect(headerTexts()).toContain("Phone");
    /* Reset — the five defaults come back. */
    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(headerTexts()).not.toContain("Phone");
  });
});

describe("RG-2 · the header ▽ (2990's popup, ported not invented)", () => {
  it("offers Find + Select all + Select invert + the distinct values, and narrows", async () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByRole("button", { name: "Filter SO No" }));
    /* SO No is a numbering column: the type-to-find box always shows. */
    expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select invert" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /SO-1257/ }));
    await waitFor(() => expect(rows().length).toBe(1));
    expect(screen.getByText(/1 of 3 rows/)).toBeInTheDocument();
    /* The one-click reset appears only while a ▽ narrows. */
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(rows().length).toBe(3));
  });

  it("says 'No matching sales orders.' when the search finds nothing", async () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.change(screen.getByPlaceholderText("SO number, customer, phone or item…"), {
      target: { value: "zzz-nothing" },
    });
    /* The engine debounces the search by 150ms. */
    await waitFor(() => expect(screen.getByText("No matching sales orders.")).toBeInTheDocument());
    expect(rows().length).toBe(1); // the empty-message row is the only row
  });
});

describe("RG-2 · selection serves Export ONLY", () => {
  it('ticking rows raises "N selected · Clear · Export Excel (N)", and Clear empties it', () => {
    render(wrap(<SalesOrdersRegister />));
    for (const box of screen.getAllByRole("checkbox", { name: "Select row" })) {
      fireEvent.click(box);
    }
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("3 selected")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Export Excel \(3\)/ })).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("selection-bar")).toBeNull();
  });

  it("exports the CURRENT VIEW: visible columns only, filtered rows only", async () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByRole("button", { name: "Filter SO No" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /SO-1257/ }));
    await waitFor(() => expect(rows().length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /Export Excel — current view/ }));
    await waitFor(() => expect(xlsxMock.writeFile).toHaveBeenCalled());
    const sheetRows = xlsxMock.json_to_sheet.mock.calls[0]![0] as Record<string, unknown>[];
    expect(sheetRows.length).toBe(1);
    expect(Object.keys(sheetRows[0]!)).toEqual([
      "SO No",
      "Customer",
      "Items",
      "Promised Delivery",
      "Ordered",
    ]);
    expect(sheetRows[0]!["SO No"]).toBe("SO-1257");
    expect(sheetRows[0]!["Customer"]).toBe("MyHouse Management PLT · 012-345 6789");
  });

  it("with a selection, the bar's export writes the SELECTED rows only", async () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: /Export Excel \(1\)/ }));
    await waitFor(() => expect(xlsxMock.writeFile).toHaveBeenCalled());
    const sheetRows = xlsxMock.json_to_sheet.mock.calls[0]![0] as Record<string, unknown>[];
    expect(sheetRows.length).toBe(1);
    expect(sheetRows[0]!["SO No"]).toBe("SO-1257");
  });
});

describe("RG-2 · the Detail Panel (page-level wiring)", () => {
  it("row click opens the panel on ?order=<id>, with the grid still mounted beside it", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.click(screen.getByTitle("MyHouse Management PLT · 012-345 6789"));
    expect(lastSearch).toContain("order=o-native");
    const panel = screen.getByTestId("panel-stub");
    expect(panel.getAttribute("data-order-id")).toBe("o-native");
    /* n of N follows the register's own (sorted) order: fresh · native · import. */
    expect(screen.getByTestId("panel-stub-position").textContent).toBe("2 of 3");
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.getByTestId("detail-pane")).toBeInTheDocument();
  });

  it("↑↓ walk the register, Esc closes, and the URL follows", () => {
    render(wrap(<SalesOrdersRegister />, ["/?order=o-native"]));
    expect(screen.getByTestId("panel-stub").getAttribute("data-order-id")).toBe("o-native");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByTestId("panel-stub").getAttribute("data-order-id")).toBe("o-import");
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByTestId("panel-stub").getAttribute("data-order-id")).toBe("o-native");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("panel-stub")).toBeNull();
    expect(lastSearch).not.toContain("order=");
  });

  it("double-click opens the printable DOCUMENT, its own screen", () => {
    render(wrap(<SalesOrdersRegister />));
    fireEvent.doubleClick(screen.getByTitle("MyHouse Management PLT · 012-345 6789"));
    expect(lastSearch).toContain("view=document");
    expect(screen.getByTestId("document-stub")).toBeInTheDocument();
    expect(document.querySelector("table")).toBeNull();
  });
});

describe("states", () => {
  it("shows the load-failure state with Try again", () => {
    listHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: vi.fn(),
    };
    render(wrap(<SalesOrdersRegister />));
    expect(screen.getByText("The register could not be loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(listHookState.refetch).toHaveBeenCalled();
  });

  it("shows skeleton rows while loading", () => {
    listHookState = { data: undefined, isLoading: true, isError: false, error: undefined, refetch: vi.fn() };
    render(wrap(<SalesOrdersRegister />));
    expect(document.querySelectorAll('tbody tr[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
