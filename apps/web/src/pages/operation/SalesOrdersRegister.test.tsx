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
import { fmtDate } from "@/lib/fmt-date";

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
    fireEvent.click(screen.getByTestId("search-icon"));
    const box = screen.getByPlaceholderText("Search sales orders…");
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
    fireEvent.click(screen.getByTestId("search-icon"));
    const box = screen.getByPlaceholderText("Search sales orders…");
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

  it("renders exactly one work toolbar, and Search rests as an icon (§6.7)", () => {
    mount();
    expect(screen.getAllByTestId("work-toolbar")).toHaveLength(1);
    /* §6.7 — Search rests as an icon and expands on click. At rest there is no
     * searchbox at all; one click produces exactly one. */
    expect(screen.queryAllByRole("searchbox")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("search-icon"));
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    /* §6.7 — Row 1 carries global utilities only. The one primary create action
     * lives on the LEFT of Row 2. Reversing either half is the defect. */
    expect(
      within(screen.getByTestId("work-toolbar")).getByRole("button", {
        name: "New Sales Order",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("sales-orders-destination-header")).queryByRole("button", {
        name: "New Sales Order",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("current view")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not delivered")).not.toBeInTheDocument();
  });

  it("shows a governed missing Customer Delivery exception instead of a passive empty value", () => {
    listHookState.data = { orders: [order({
      delivery_date: null,
      delivery_date_tbd: true,
      customer_name: "Kimmy",
      salespersons: { name: "Shasha" },
    })] };
    mount();
    const exception = screen.getByText("No delivery date");
    expect(exception).toHaveAttribute("data-attention", "warning");
    /* The cell prints ONE clause that fits the governed 148px column whole;
       who must act, whose phone and what to record ride the hover. */
    expect(screen.getByText("Confirm delivery date")).toBeInTheDocument();
    const cell = exception.closest("span[title]");
    expect(cell).toHaveAttribute(
      "title",
      [
        "Shasha · Kimmy · 019-3478913",
        "Ask which delivery date the customer agrees to.",
        "Record the agreed Customer Delivery date.",
      ].join("\n"),
    );
    expect(cell).toHaveTextContent("Confirm delivery date");
    expect(screen.queryByText("No date yet")).not.toBeInTheDocument();
  });

  /* ⭐ THE TWO-LINE GRAMMAR IS 13 / 11 — owner ruling 2026-08-15, held here so
     the sizes cannot drift back. ui/MASTER.md §5 locks the RANKS (fact above
     action, body above supporting); this asserts the tokens that carry them. */
  it("ranks the guidance cell 13 / 11 — body semibold over label regular", () => {
    listHookState.data = { orders: [order({
      delivery_date: null,
      delivery_date_tbd: true,
      customer_name: "Kimmy",
      salespersons: { name: "Shasha" },
    })] };
    mount();

    // Line 1 — the FACT. Governed body 13 (inherited from the row) at
    // semibold, in the warning ink the §5 lock reserves for it.
    const problem = screen.getByText("No delivery date");
    expect(problem.className).toContain("font-semibold");
    expect(problem.className).not.toContain("text-meta");
    expect(problem.className).not.toContain("text-label");

    // Line 2 — the ACTION. `text-label` is 11px, and `font-normal` overrides
    // that token's own 500 down to regular weight, exactly as ruled.
    const action = screen.getByText("Confirm delivery date");
    expect(action.className).toContain("text-label");
    expect(action.className).toContain("font-normal");
    // The retired size, named so a revert is caught rather than merely absent.
    expect(action.className).not.toContain("text-meta");
  });

  /* ⭐ CUSTOMER NAME — CAPITALIZE UP ONLY, owner ruling 2026-08-15. */
  it("capitalizes a lowercase customer name and leaves existing capitals alone", () => {
    listHookState.data = {
      orders: [
        order({ id: "a", so: 1, customer_name: "jimmy" }),
        order({ id: "b", so: 2, customer_name: "mei emi" }),
        order({ id: "c", so: 3, customer_name: "KJ NG" }),
        order({ id: "d", so: 4, customer_name: "LIM KUAN YANG" }),
      ],
    };
    mount();
    expect(screen.getByText("Jimmy")).toBeInTheDocument();
    expect(screen.getByText("Mei Emi")).toBeInTheDocument();
    // Initials and an all-capitals name survive untouched — the rule raises a
    // first letter and never lowers one.
    expect(screen.getByText("KJ NG")).toBeInTheDocument();
    expect(screen.getByText("LIM KUAN YANG")).toBeInTheDocument();
    expect(screen.queryByText("Kj Ng")).not.toBeInTheDocument();
    expect(screen.queryByText("Lim Kuan Yang")).not.toBeInTheDocument();
    // Display only — nothing is written back to the record.
    expect(listHookState.data.orders.map((o) => o.customer_name)).toEqual([
      "jimmy", "mei emi", "KJ NG", "LIM KUAN YANG",
    ]);
  });

  /* ⭐ THE YEAR RULE — owner ruling 2026-08-15. */
  it("prints a current-year date without its year and an off-year date with it", () => {
    const thisYear = new Date().getFullYear();
    listHookState.data = {
      orders: [
        order({ id: "a", so: 1, delivery_date: `${thisYear}-08-12`, delivery_date_tbd: false }),
        order({ id: "b", so: 2, delivery_date: `${thisYear + 1}-01-15`, delivery_date_tbd: false }),
      ],
    };
    mount();
    expect(screen.getByText(fmtDate(`${thisYear}-08-12`))).toBeInTheDocument();
    expect(fmtDate(`${thisYear}-08-12`)).not.toMatch(/\d{2}$/);
    expect(screen.getByText(fmtDate(`${thisYear + 1}-01-15`))).toBeInTheDocument();
    expect(fmtDate(`${thisYear + 1}-01-15`)).toMatch(/ \d{2}$/);
  });

  it("collapses duplicate city and state into one concise locality", () => {
    listHookState.data = { orders: [order({
      customer_address: "12 Long Street, Kuala Lumpur, Kuala Lumpur",
      customer_address_city: "Kuala Lumpur",
      customer_address_state: "Kuala Lumpur",
    })] };
    mount();
    expect(screen.getByText("Kuala Lumpur")).toBeInTheDocument();
    expect(screen.queryByText("Kuala Lumpur, Kuala Lumpur")).not.toBeInTheDocument();
    expect(screen.queryByText("12 Long Street, Kuala Lumpur, Kuala Lumpur")).not.toBeInTheDocument();
  });

  it("summarises filtered ordered quantities by governed category in the fixed footer", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            { sku: "B1201S-K", qty: 2, unit_price: 2499, label: "B1201S · King" },
            { sku: "Essential Memory Pillow(L)", qty: 4, unit_price: 99, label: "Pillow" },
            { sku: "Microfiber Waterproof Mattress Protector-K", qty: 3, unit_price: 129, label: "Mattress protector" },
          ],
        }),
      ],
    };
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent("1 order");
    expect(footer).toHaveTextContent("Mattress 2");
    expect(footer).toHaveTextContent("Pillow 4");
    /* The governed word, never the AutoCount sheet's `M.P` abbreviation. */
    expect(footer).toHaveTextContent("Mattress protector 3");
    expect(footer).not.toHaveTextContent("M.P");
    expect(footer).not.toHaveTextContent("Reset layout");
    expect(footer).not.toHaveTextContent("rows");
  });

  /**
   * ⭐ THE FOOTER COUNTS EVERYTHING IT SEES, IN THE DICTIONARY'S WORDS.
   *
   * Owner ruling 2026-08-15. The tally used to be filtered through the same
   * array that ordered it, so any word outside that list was silently DROPPED
   * — an unrecognised accessory vanished from a count that claims to describe
   * the filtered result. A footer that under-counts is worse than one that
   * abbreviates: it is a number the operator trusts and cannot reproduce.
   */
  it("counts an unrecognised line as `Other goods` instead of dropping it, and prints no raw SKU word", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            { sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" },
            // Nothing recognises these two — the old whitelist dropped both.
            { sku: "M.P/QUEEN", qty: 2, unit_price: 129, label: "M.P" },
            { sku: "Leg 4\"", qty: 5, unit_price: 20, label: "Leg" },
          ],
        }),
      ],
    };
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent("Mattress 1");
    /* `M.P/QUEEN` IS positively recognised as a protector — the governed word
       prints and the sheet's abbreviation never does. */
    expect(footer).toHaveTextContent("Mattress protector 2");
    expect(footer).toHaveTextContent("Other goods 5");
    expect(footer).not.toHaveTextContent("M.P");
    expect(footer).not.toHaveTextContent("Leg");
  });

  /**
   * ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15.
   * The words are unchanged; only their weight moves, so search, filter, sort
   * and Export still read the same string.
   */
  it("mutes `Not recorded` in the document columns while a real PO number stays full ink", () => {
    listHookState.data = {
      orders: [order({ po_numbers: ["PO-2041"], do_number: null })],
    };
    mount();
    const absences = document.querySelectorAll('[data-absence="true"]');
    expect(absences.length).toBeGreaterThan(0);
    for (const el of absences) expect(el.className).toContain("text-kit-slate-9");
    // The real document is a link, never a muted absence.
    expect(screen.getByText("PO-2041").closest("[data-absence]")).toBeNull();
  });

  /* The re-ruled EIGHTH default column, read-only, no new writer. */
  it("shows Showroom as a default column between Delivery Location and PO No", () => {
    listHookState.data = { orders: [order({ outlets: { name: "Carres Kelana Jaya" } })] };
    mount();
    const headers = [...screen.getByTestId("grid-header").querySelectorAll("th")].map((th) =>
      (th.textContent ?? "").trim(),
    );
    const business = headers.filter(Boolean);
    expect(business.map((h) => h.replace(/[AV]$/, "").trim())).toEqual([
      "SO No",
      "Ordered",
      "Customer Delivery",
      "Customer",
      "Delivery Location",
      "Showroom",
      "PO No",
      "DO No",
    ]);
    expect(screen.getByText("Carres Kelana Jaya")).toBeInTheDocument();
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
              attrs: {
                category: "mattress",
                firmness: "medium",
                colour: "Sand",
                fabric_code: "CG-012",
                x: 60,
                y: 192.5,
                rot: 0,
                cell_index: 1,
                sofa_build_key: "internal-builder-uuid",
              },
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
    expect(row).toHaveTextContent("Fabric code: CG-012");
    expect(row).toHaveTextContent("Carres Klang ×10");
    expect(row).toHaveTextContent("AL Sungai Buloh ×1");
    expect(row).not.toHaveTextContent("X: 60");
    expect(row).not.toHaveTextContent("Cell index");
    expect(row).not.toHaveTextContent("internal-builder-uuid");
    expect(screen.queryByText(/current location/i)).not.toBeInTheDocument();
  });

  it("omits destination quantity for one route and shows it only for a split", () => {
    listHookState.data = { orders: [order({ order_lines: [
      { id: "line-1", sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" },
    ] })] };
    expansionHookState.data = { lines: [{
      lineId: "line-1", sku: "B1201S-K", unitIds: [],
      deliverTo: [{ name: "Carres Klang", qty: 1 }],
    }] };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const row = screen.getByTestId("expanded-good-B1201S-K");
    expect(row).toHaveTextContent("Carres Klang");
    expect(row).not.toHaveTextContent("Carres Klang ×1");
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

  it("uses a dash for Service Unit ID and routing instead of inventing a non-applicable state", () => {
    listHookState.data = {
      orders: [order({ order_lines: [], order_addons: [{ addon_key: "disposal_service", qty: 1, unit_price: 0 }] })],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const goods = screen.getByRole("table", { name: "Goods on SO-1303" });
    expect(goods).not.toHaveTextContent("Not applicable");
    expect(within(goods).getAllByText("—")).toHaveLength(2);
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
