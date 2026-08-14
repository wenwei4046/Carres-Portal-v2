/**
 * STAGE 1 FIX 1 — SERVER SEARCH, held as a test.
 *
 * **The one property this file exists to hold:** what the operator types in
 * the register's search box reaches `useOperationOrders` as `{ search }` —
 * the API is ASKED, the browser does not merely filter the rows it already
 * has. If the register ever returns to client-only search, the second test
 * here fails: the hook would never see the term.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";

let listHookState: {
  data: { orders: operationOrderListRow[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

let expansionHookState: {
  data: {
    lines: Array<{
      lineId: string;
      sku: string;
      unitIds: string[];
      deliverTo: Array<{ name: string; qty: number }>;
    }>;
  } | undefined;
  isLoading: boolean;
  isError: boolean;
};

/* A spy AROUND the hook: the component's calls — and the filters it passes —
 * are the assertion surface. */
const useOperationOrdersSpy = vi.fn((..._args: unknown[]) => listHookState);
const useSalesOrderExpansionSpy = vi.fn((..._args: unknown[]) => expansionHookState);

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: (...args: unknown[]) => useOperationOrdersSpy(...args),
    useSalesOrderExpansion: (...args: unknown[]) => useSalesOrderExpansionSpy(...args),
  };
});

const order = (over: Partial<operationOrderListRow>): operationOrderListRow =>
  ({
    id: "00000000-0000-0000-0000-00000000cafe",
    so: 1303,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: "Kimmy",
    customer_phone: "019-3478913",
    placed_at: "2026-08-09T02:00:00Z",
    delivery_date: "2026-08-30",
    delivery_date_tbd: false,
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
    dealers: { name: "Carres Kelana Jaya" },
    order_supplier_threads: [],
    order_annotations: [],
    paid: 1250,
    order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" }],
    order_addons: [],
    ...over,
  }) as operationOrderListRow;

function mount() {
  /* The register's own list hook is the mocked spy; the provider serves the
   * OTHER live hooks on the page chrome (ModuleHeader's top-bar badges). */
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/orders"]}>
        <SalesOrdersRegister />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  useOperationOrdersSpy.mockClear();
  useSalesOrderExpansionSpy.mockClear();
  window.localStorage.clear();
  listHookState = {
    data: { orders: [order({})] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  expansionHookState = { data: { lines: [] }, isLoading: false, isError: false };
});

describe("FIX 1 · the register asks the SERVER", () => {
  it("mounts asking for the unfiltered population (no search key)", () => {
    mount();
    expect(useOperationOrdersSpy).toHaveBeenCalled();
    const first = useOperationOrdersSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(first).toEqual({});
  });

  it("the typed term reaches useOperationOrders as { search } — the API is asked, not just the loaded rows filtered", async () => {
    mount();
    const box = screen.getByPlaceholderText("SO number, customer, phone or item…");
    fireEvent.change(box, { target: { value: "  Umi  " } });
    /* The engine debounces 150ms and emits the TRIMMED term; the register
     * must re-call the hook with it. Client-only search would leave every
     * call's filters without a `search` key — exactly what this waits to
     * disprove. */
    await waitFor(() => {
      const calls = useOperationOrdersSpy.mock.calls.map(
        (c) => c[0] as Record<string, unknown>,
      );
      expect(calls.some((f) => f && f.search === "Umi")).toBe(true);
    });
  });

  it("clearing the box returns the hook to the unfiltered population", async () => {
    mount();
    const box = screen.getByPlaceholderText("SO number, customer, phone or item…");
    fireEvent.change(box, { target: { value: "Umi" } });
    await waitFor(() => {
      expect(
        useOperationOrdersSpy.mock.calls.some(
          (c) => (c[0] as Record<string, unknown>)?.search === "Umi",
        ),
      ).toBe(true);
    });
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => {
      const last = useOperationOrdersSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(last).toEqual({});
    });
  });
});

describe("Stage A · one destination identity and one governed work toolbar", () => {
  it("renders one Sales Orders identity with no duplicate tab/title", () => {
    mount();
    expect(screen.getAllByText("Sales Orders")).toHaveLength(1);
    expect(screen.getByTestId("sales-orders-destination-header")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sales Orders" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sales Order")).not.toBeInTheDocument();
  });

  it("renders exactly one work toolbar and one Search", () => {
    mount();
    expect(screen.getAllByTestId("work-toolbar")).toHaveLength(1);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Sales Order" })).toBeInTheDocument();
    expect(screen.queryByText("current view")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not delivered")).not.toBeInTheDocument();
  });

  it("shows only the customer name in the default cell while retaining phone search context", () => {
    mount();
    const customer = screen.getByTitle("Kimmy · 019-3478913");
    expect(customer).toHaveTextContent("Kimmy");
    expect(customer).not.toHaveTextContent("019-3478913");
  });

  it("renders the locked six-column goods table with Stock Unit IDs and Purchasing Deliver To", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            {
              id: "line-1",
              sku: "B1201S-K",
              qty: 11,
              unit_price: 2499,
              label: "B1201S · King",
              attrs: { category: "mattress", firmness: "medium", colour: "Sand" },
            },
          ],
        }),
      ],
    };
    expansionHookState.data = {
      lines: [{
        lineId: "line-1",
        sku: "B1201S-K",
        unitIds: ["id-001", "id-002"],
        deliverTo: [
          { name: "Carres Klang", qty: 10 },
          { name: "AL Sungai Buloh", qty: 1 },
        ],
      }],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const table = screen.getByRole("table", { name: "Goods on SO-1303" });
    expect(table).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Category", "Unit ID", "SKU", "Qty", "Item", "Deliver To",
    ]);
    const row = screen.getByTestId("expanded-good-B1201S-K");
    expect(row).toHaveTextContent("MATTRESS");
    expect(row).toHaveTextContent("id-001");
    expect(row).toHaveTextContent("id-002");
    expect(row).toHaveTextContent("B1201S-K");
    expect(row).toHaveTextContent("11");
    expect(row).toHaveTextContent("B1201S · King");
    expect(row).toHaveTextContent("Firmness: medium");
    expect(row).toHaveTextContent("Colour: Sand");
    expect(row).toHaveTextContent("Carres Klang ×10");
    expect(row).toHaveTextContent("AL Sungai Buloh ×1");
    expect(screen.queryByText(/current location/i)).not.toBeInTheDocument();
  });

  it("classifies legacy item codes before falling back to Other Goods", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            { id: "line-1", sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King", attrs: {} },
          ],
        }),
      ],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.getByText("MATTRESS")).toBeInTheDocument();
    expect(screen.getByText("Not allocated")).toBeInTheDocument();
    expect(screen.queryByText("OTHER GOODS")).not.toBeInTheDocument();
  });

  it("keeps loading inside the work surface instead of adding an outer band", () => {
    listHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    mount();
    expect(screen.getByTestId("sales-orders-grid")).toBeInTheDocument();
    expect(screen.getByTestId("work-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("grid-scroll")).toBeInTheDocument();
  });
});

describe("Copy to new Sales Order", () => {
  it("opens the authoritative create workspace with the source order as a draft seed", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    fireEvent.click(screen.getByRole("button", { name: "Copy to new Sales Order" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/operation/orders/so/new?copyFrom=00000000-0000-0000-0000-00000000cafe",
    );
  });
});

describe("Cancel SO", () => {
  /* The register writes nothing itself: the menu entry may only OPEN the one
   * governed cancellation door, and the row it names is the door's subject.
   * If a future edit ever makes the register cancel directly, the dialog stops
   * being the single door and this test is the thing that notices. */
  it("opens the governed cancellation door for the row, and navigates nowhere", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel SO" }));
    expect(screen.getByText("Cancel SO-1303")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/operation/orders");
  });

  it("keeps the destructive entry last, below a divider, so a slipped click cannot reach it", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .filter((t): t is string =>
        [
          "View",
          "Edit",
          "Preview PDF",
          "Print PDF",
          "Copy to new Sales Order",
          "Cancel SO",
        ].includes(t ?? ""),
      );
    expect(labels[labels.length - 1]).toBe("Cancel SO");
  });
});
