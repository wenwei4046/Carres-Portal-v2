import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperationOrdersControl from "./OperationOrdersControl";
import type {
  operationOrdersListResponse,
  operationOrderListRow,
  operationStockResponse,
  DeliveryPartnersListResponse,
} from "@/lib/queries";

/**
 * OperationOrdersControl — the unified Orders control table (Jess redesign
 * step 2). Mirrors OperationOrders.test.tsx's vi.mock(@/lib/queries) pattern.
 *
 * The OrderDetailDrawer is stubbed to a testid carrying the orderId so we can
 * assert a row click opens the right order without mocking the detail fetch.
 */

let listHookState: {
  data: operationOrdersListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let partnersHookState: {
  data: DeliveryPartnersListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
let stockHookState: { data: operationStockResponse | undefined };

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => listHookState,
    useDeliveryPartners: () => partnersHookState,
    useOperationStock: () => stockHookState,
  };
});

/** Minimal /api/operation/stock payload — only `sku` + `available` matter to the
 *  control table's Stock column; the rest is padded to satisfy the type. */
function stockResponse(
  rows: { sku: string; available: number }[],
): operationStockResponse {
  return {
    warehouses: [{ id: "w1", name: "Carres Klang" }],
    skus: rows.map((r) => ({
      sku: r.sku,
      name: r.sku,
      category: null,
      price: 0,
      available: r.available,
      lowThreshold: 0,
      incoming: 0,
      perWarehouse: {},
    })),
    summary: { totalSkus: rows.length, lowStockCount: 0, openPos: 0 },
  };
}

vi.mock("./components/OrderDetailDrawer", () => ({
  default: ({ orderId, onClose }: { orderId: string; onClose: () => void }) => (
    <div data-testid="drawer-stub" data-order-id={orderId}>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

function makeRow(
  partial: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "place",
    operation_stage: null,
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
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ...partial,
  };
}

// One order per control tab + the entry-rule pair (native vs AutoCount placed).
const ROWS: operationOrderListRow[] = [
  // A — native placed → Placed
  makeRow({ id: "a", so: 1001, source_system: null, customer_name: "Native New" }),
  // B — AutoCount placed → Proceed (entry rule), with items + ref
  makeRow({
    id: "b",
    so: 1002,
    source_system: "autocount",
    source_ref: ["CR0418"],
    customer_name: "Imported",
    order_lines: [
      { sku: "mattress:MAT-1", qty: 2 },
      { sku: "bedframe:BF-1", qty: 1 },
    ],
  }),
  // C — proceed_request → Proceed
  makeRow({ id: "c", so: 1003, status: "proceed_order", operation_stage: "proceed_request" }),
  // D — awaiting → Pending, with a triage LP that resolves via partners map
  makeRow({
    id: "d",
    so: 1004,
    status: "proceed_order",
    operation_stage: "awaiting_operation_action",
    ops_assigned_logistic: "p-nets",
  }),
  // E — ready_to_dispatch → Scheduled, with a formal LP joined
  makeRow({
    id: "e",
    so: 1005,
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    delivery_partners: { id: "p-teow", name: "TEOW" },
  }),
  // F — dispatched → Scheduled
  makeRow({ id: "f", so: 1006, status: "proceed_order", operation_stage: "dispatched" }),
  // G — delivered → Completed
  makeRow({ id: "g", so: 1007, status: "delivered", operation_stage: "delivered" }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/orders"]}>
        <Routes>
          <Route path="/operation/orders" element={node} />
          <Route path="/operation/orders/:stage" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowsBySo(): string[] {
  return screen
    .getAllByTestId("order-row")
    .map((r) => r.textContent?.match(/SO-(\d+)/)?.[1] ?? "")
    .filter(Boolean);
}

beforeEach(() => {
  listHookState = {
    data: { orders: ROWS },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  partnersHookState = {
    data: {
      partners: [{ id: "p-nets", name: "NETS", contact: null, zones: null }],
    },
    isLoading: false,
    isError: false,
  };
  // Default: no stock snapshot loaded → Stock column falls back to stage-only
  // state (the pre-existing behaviour the original tests assume).
  stockHookState = { data: undefined };
});

describe("OperationOrdersControl", () => {
  it("renders the 6 status tabs with correct per-tab counts", () => {
    wrap(<OperationOrdersControl />);
    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    // counts: Placed 1, Proceed 2, Pending 1, Scheduled 2, Completed 1, All 7
    expect(within(tabs[0]).getByText("1")).toBeInTheDocument(); // Placed
    expect(within(tabs[1]).getByText("2")).toBeInTheDocument(); // Proceed
    expect(within(tabs[2]).getByText("1")).toBeInTheDocument(); // Pending
    expect(within(tabs[3]).getByText("2")).toBeInTheDocument(); // Scheduled
    expect(within(tabs[4]).getByText("1")).toBeInTheDocument(); // Completed
    expect(within(tabs[5]).getByText("7")).toBeInTheDocument(); // All
  });

  it("defaults to the All tab and shows every order", () => {
    wrap(<OperationOrdersControl />);
    expect(rowsBySo()).toEqual(
      expect.arrayContaining(["1001", "1002", "1003", "1004", "1005", "1006", "1007"]),
    );
    expect(rowsBySo()).toHaveLength(7);
  });

  it("entry rule: AutoCount placed → Proceed, native placed → Placed", () => {
    wrap(<OperationOrdersControl />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");

    fireEvent.click(tabs[0]); // Placed
    expect(rowsBySo()).toEqual(["1001"]); // only the native-placed order

    fireEvent.click(tabs[1]); // Proceed
    // AutoCount-placed (1002) + proceed_request (1003), NOT the native one.
    expect(rowsBySo().sort()).toEqual(["1002", "1003"]);
  });

  it("Scheduled tab buckets both ready_to_dispatch and dispatched", () => {
    wrap(<OperationOrdersControl />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    fireEvent.click(tabs[3]); // Scheduled
    expect(rowsBySo().sort()).toEqual(["1005", "1006"]);
  });

  it("renders an items summary from order_lines", () => {
    wrap(<OperationOrdersControl />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    fireEvent.click(tabs[1]); // Proceed (contains the AutoCount order with lines)
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1002"))!;
    // 2 + 1 = 3 units across 2 lines
    expect(within(row).getByText(/3 units/)).toBeInTheDocument();
    expect(within(row).getByText("CR0418")).toBeInTheDocument();
  });

  it("resolves the triage LP (ops_assigned_logistic) via the partners map", () => {
    wrap(<OperationOrdersControl />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    fireEvent.click(tabs[2]); // Pending (order d has ops_assigned_logistic=p-nets)
    const row = screen.getAllByTestId("order-row")[0];
    expect(within(row).getByText("NETS")).toBeInTheDocument();
  });

  it("shows the formal joined LP name on scheduled orders", () => {
    wrap(<OperationOrdersControl />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    fireEvent.click(tabs[3]); // Scheduled
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1005"))!;
    expect(within(row).getByText("TEOW")).toBeInTheDocument();
  });

  it("opens the detail drawer for the clicked order", () => {
    wrap(<OperationOrdersControl />);
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1003"))!;
    fireEvent.click(row);
    expect(screen.getByTestId("drawer-stub")).toHaveAttribute("data-order-id", "c");
  });

  it("preselects a tab from the :stage URL param", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/operation/orders/awaiting_operation_action"]}>
          <Routes>
            <Route
              path="/operation/orders/:stage"
              element={<OperationOrdersControl />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // awaiting_operation_action maps to the Pending tab → only order d.
    expect(rowsBySo()).toEqual(["1004"]);
  });

  it("fires onImport when the import button is clicked", () => {
    const onImport = vi.fn();
    wrap(<OperationOrdersControl onImport={onImport} />);
    fireEvent.click(screen.getByText(/Import from AutoCount/i));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("renders the loading skeleton while fetching", () => {
    listHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    wrap(<OperationOrdersControl />);
    expect(
      screen.getByTestId("operation-orders-control-skeleton"),
    ).toBeInTheDocument();
  });
});

describe("OperationOrdersControl · Stock column", () => {
  function oneRow(partial: Partial<operationOrderListRow> & { id: string; so: number }) {
    listHookState.data = { orders: [makeRow(partial)] };
  }

  it("shows In stock + coverage when free balance covers every line (native, early stage)", () => {
    oneRow({
      id: "ns",
      so: 2001,
      status: "place",
      source_system: null,
      customer_name: "Native InStock",
      order_lines: [
        { sku: "SOFA-1", qty: 2 },
        { sku: "BED-1", qty: 1 },
      ],
    });
    stockHookState.data = stockResponse([
      { sku: "SOFA-1", available: 5 },
      { sku: "BED-1", available: 3 },
    ]);
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("In stock")).toBeInTheDocument();
    // have = min(5,2)+min(3,1) = 3 ; need = 3
    expect(within(row).getByText("3/3 units")).toBeInTheDocument();
  });

  it("shows Make to order + partial coverage when a line is short", () => {
    oneRow({
      id: "sh",
      so: 2002,
      status: "place",
      source_system: null,
      order_lines: [
        { sku: "SOFA-1", qty: 3 },
        { sku: "BED-1", qty: 2 },
      ],
    });
    stockHookState.data = stockResponse([
      { sku: "SOFA-1", available: 1 },
      { sku: "BED-1", available: 2 },
    ]);
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Make to order")).toBeInTheDocument();
    // have = min(1,3)+min(2,2) = 3 ; need = 5
    expect(within(row).getByText("3/5 units")).toBeInTheDocument();
  });

  it("falls back to — for AutoCount free-text SKUs absent from the catalog", () => {
    oneRow({
      id: "ac",
      so: 2003,
      status: "place",
      source_system: "autocount",
      order_lines: [{ sku: "Some Free Text Sofa", qty: 1 }],
    });
    stockHookState.data = stockResponse([{ sku: "SOFA-1", available: 5 }]);
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(row.querySelector('[data-stock-state="unknown"]')).toBeTruthy();
    expect(within(row).queryByText("In stock")).not.toBeInTheDocument();
    expect(within(row).queryByText("Make to order")).not.toBeInTheDocument();
  });

  it("keeps Ready (stage-derived) for ready_to_dispatch even when free balance is 0", () => {
    // Proves the reserved-double-count guard: stock is already reserved, so a
    // naive free-balance recount (0 here) must NOT downgrade it to short.
    oneRow({
      id: "rd",
      so: 2004,
      status: "proceed_order",
      operation_stage: "ready_to_dispatch",
      order_lines: [{ sku: "SOFA-1", qty: 99 }],
    });
    stockHookState.data = stockResponse([{ sku: "SOFA-1", available: 0 }]);
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Ready")).toBeInTheDocument();
    expect(row.querySelector('[data-stock-state="ready"]')).toBeTruthy();
  });

  it("shows Awaiting stock for awaiting_operation_action (PO already open)", () => {
    oneRow({
      id: "aw",
      so: 2005,
      status: "proceed_order",
      operation_stage: "awaiting_operation_action",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Awaiting stock")).toBeInTheDocument();
  });

  it("falls back to — for an early native order while the stock snapshot is still loading", () => {
    oneRow({
      id: "ld",
      so: 2006,
      status: "place",
      source_system: null,
      order_lines: [{ sku: "SOFA-1", qty: 1 }],
    });
    stockHookState.data = undefined; // not loaded yet
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(row.querySelector('[data-stock-state="unknown"]')).toBeTruthy();
  });
});

describe("OperationOrdersControl · listing columns (A1–A4)", () => {
  function oneRow(partial: Partial<operationOrderListRow> & { id: string; so: number }) {
    listHookState.data = { orders: [makeRow(partial)] };
  }

  it("rolls items up into the Master-Sheet category short-form (A1)", () => {
    oneRow({
      id: "r1",
      so: 3001,
      order_lines: [
        { sku: "MS01-L1201S-Q", qty: 2 }, // Mattress, Queen
        { sku: "BF02-1013", qty: 1 }, // Bedframe, no size
        { sku: "Pillow", qty: 3 }, // accessory → short type name
        { sku: "Microfiber Waterproof Mattress Protector-K", qty: 1 }, // → M.P
        { sku: "Sofa Disposal", qty: 1 }, // → Disposal
      ],
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(
      within(row).getByText(
        "2× Mattress(Q) · 1× Bedframe · Pillow ×3 · M.P · Disposal",
      ),
    ).toBeInTheDocument();
  });

  it("shows the real delivery location for outstation + a 📞 flag, NOT the word 'Outstation' (A2/A4)", () => {
    oneRow({
      id: "r2",
      so: 3002,
      customer_address: "5, Lorong Y, Georgetown, Penang",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Penang")).toBeInTheDocument();
    expect(within(row).queryByText("Outstation")).not.toBeInTheDocument();
    // 📞 call-first flag present for outstation
    expect(
      within(row).getByLabelText("call customer before raising PO"),
    ).toBeInTheDocument();
  });

  it("shows a KV location in green with no 📞 flag (A2/A4)", () => {
    oneRow({
      id: "r3",
      so: 3003,
      customer_address: "12, Jln X, Shah Alam, Selangor",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Selangor")).toBeInTheDocument();
    expect(
      within(row).queryByLabelText("call customer before raising PO"),
    ).not.toBeInTheDocument();
  });

  it("labels the date column 'Deadline' and shows the 📞 contact window inside 3 days (A3)", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const iso = soon.toISOString().slice(0, 10);
    oneRow({ id: "r4", so: 3004, delivery_date: iso });
    wrap(<OperationOrdersControl />);
    // header renamed
    const head = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(head.map((h) => h.textContent)).toContain("Deadline");
    // 2-day-out deadline → "2d" + a Phone icon contact-window cue
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("2d")).toBeInTheDocument();
  });

  it("paginates — 50/page by default, Next works", () => {
    listHookState.data = {
      orders: Array.from({ length: 120 }, (_, i) =>
        makeRow({ id: `p${i}`, so: 4000 + i }),
      ),
    };
    wrap(<OperationOrdersControl />);
    expect(screen.getByText(/1.50 of 120/)).toBeInTheDocument();
    expect(screen.getAllByTestId("order-row")).toHaveLength(50);

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText(/51.100 of 120/)).toBeInTheDocument();
  });

  it("gives each status tab a plain-English tooltip (legend)", () => {
    oneRow({ id: "lg", so: 5001 });
    wrap(<OperationOrdersControl />);
    const proceedTab = screen.getByRole("tab", { name: /Proceed/ });
    expect(proceedTab).toHaveAttribute(
      "title",
      expect.stringContaining("Confirmed"),
    );
  });
});
