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
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
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

let deliveryOrdersHookState: {
  data: {
    deliveryOrders: DeliveryOrderRow[];
    attempts: [];
    handoverEvents: [];
  } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

/* A spy AROUND the hook: the component's calls — and the filters it passes —
 * are the assertion surface. */
const useOperationOrdersSpy = vi.fn((..._args: unknown[]) => listHookState);
const useSalesOrderExpansionSpy = vi.fn((..._args: unknown[]) => expansionHookState);
const useDeliveryOrdersRegisterSpy = vi.fn((..._args: unknown[]) => deliveryOrdersHookState);

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: (...args: unknown[]) => useOperationOrdersSpy(...args),
    useSalesOrderExpansion: (...args: unknown[]) => useSalesOrderExpansionSpy(...args),
    useDeliveryOrdersRegister: (...args: unknown[]) => useDeliveryOrdersRegisterSpy(...args),
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
  useDeliveryOrdersRegisterSpy.mockClear();
  window.localStorage.clear();
  listHookState = {
    data: { orders: [order({})] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  expansionHookState = { data: { lines: [] }, isLoading: false, isError: false };
  deliveryOrdersHookState = {
    data: { deliveryOrders: [], attempts: [], handoverEvents: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
});

function deliveryOrder(
  doNumber: string,
  orderId = "00000000-0000-0000-0000-00000000cafe",
): DeliveryOrderRow {
  return {
    id: `delivery-${doNumber}`,
    order_id: orderId,
    do_number: doNumber,
    issued_at: "2026-08-20T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-08-24",
    time_slot: "Afternoon",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: {
      id: orderId,
      so: 1303,
      customer_name: "Kimmy",
      delivery_date: "2026-08-24",
      delivery_date_tbd: false,
    },
  };
}

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

  it("the Destination Header is 50px, wordmark-only, at the governed 24px (§6.7)", () => {
    mount();
    const word = screen.getByTestId("sales-orders-destination-header-module-word");
    expect(word).toHaveTextContent("Sales Orders");
    /* The icon is gone: the word alone carries the identity, so nothing else
     * may sit inside the nameplate. */
    expect(word.querySelector("svg")).toBeNull();
    expect(word).toHaveClass("text-page");
    expect(screen.getByTestId("sales-orders-destination-header")).toHaveClass("h-[50px]");
  });

  it("Showroom drops the house name — every showroom is ours (§6.7)", () => {
    listHookState.data = { orders: [order({
      outlets: { name: "Carres Maluri Cheras" },
    })] };
    mount();
    expect(screen.getByText("Maluri Cheras")).toBeInTheDocument();
    expect(screen.queryByText("Carres Maluri Cheras")).not.toBeInTheDocument();
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

  it("Export is icon-only and its menu offers Excel, PDF and Print (§6.7)", () => {
    mount();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    /* Icon-only: the accessible name comes from aria-label, so the word must
     * NOT also be rendered as text — otherwise it is not icon-only. */
    expect(exportBtn).not.toHaveTextContent("Export");
    expect(exportBtn).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(exportBtn);
    expect(screen.getByRole("menuitem", { name: "Excel" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "PDF" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Print" })).toBeInTheDocument();
  });

  it("ticking rows offers the REAL sales orders, not a picture of the list (§6.7)", () => {
    mount();
    /* Normal state carries the list outputs only — no document action is
     * offered for a selection that does not exist yet. */
    expect(screen.queryByRole("button", { name: /Print \d+ sales order/ })).not.toBeInTheDocument();
    /* Re-query after each tick: selection REPLACES the toolbar, so the
     * select-all box leaves the DOM and a stale snapshot holds detached nodes. */
    const rowBoxes = () => screen.getAllByRole("checkbox").slice(-2);
    fireEvent.click(rowBoxes()[0]!);
    /* Selection replaces the toolbar in place and prints the truthful count. */
    expect(screen.getByTestId("selection-bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print 1 sales order" })).toBeInTheDocument();
    /* Excel stays scoped to the same selection beside it — the selection bar
     * offers list output AND document output, both counting the same rows. */
    expect(screen.getByRole("button", { name: /Export Excel \(1\)/ })).toBeInTheDocument();
  });

  it("a customer who already answered is not work to do — the 8 read differently from the 3", () => {
    listHookState.data = { orders: [order({
      delivery_date: null,
      delivery_date_tbd: true,
      customer_name: "Kimmy",
      salespersons: { name: "Shasha" },
    })] };
    mount();
    /* The customer WAS asked. No warning, and no instruction to ask again —
     * printing `Confirm delivery date` here is the wrong attribution this
     * ruling corrects (docs/orders/MASTER.md · THE THREE DELIVERY DATES). */
    expect(screen.getByText("To be confirmed")).toBeInTheDocument();
    expect(screen.queryByText("No delivery date")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirm delivery date")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-warning")).not.toBeInTheDocument();
    /* The full governed sentence, the party and the phone stay reachable. */
    const hover = screen.getByTitle(/Delivery date to be confirmed/);
    expect(hover).toHaveAttribute("title", expect.stringContaining("Kimmy"));
    expect(hover).toHaveAttribute("title", expect.stringContaining("Shasha"));
  });

  it("shows a governed missing Customer Delivery exception instead of a passive empty value", () => {
    listHookState.data = { orders: [order({
      delivery_date: null,
      delivery_date_tbd: false,
      customer_name: "Kimmy",
      salespersons: { name: "Shasha" },
    })] };
    mount();
    const exception = screen.getByText("No delivery date");
    expect(exception).toHaveAttribute("data-attention", "warning");
    /* ⭐ THE FACT ALONE — owner ruling 2026-08-18: a register lists documents;
       actions live in My Work / Team Work / the Order Route. The instruction
       clause left the cell; who must act, whose phone and what to record
       still ride the hover. */
    expect(screen.queryByText("Confirm delivery date")).toBeNull();
    const cell = exception.closest("span[title]");
    expect(cell).toHaveAttribute(
      "title",
      [
        "Shasha · Kimmy · 019-3478913",
        "Ask which delivery date the customer agrees to.",
        "Record the agreed Customer Delivery date.",
      ].join("\n"),
    );
    expect(screen.queryByText("No date yet")).not.toBeInTheDocument();
  });

  /* ⭐ THE CELL IS THE FACT ALONE — owner ruling 2026-08-18 (supersedes the
     in-cell 13/11 action pair of 2026-08-15). The fact keeps the governed
     body rank and the warning ink; NO action clause renders in any register
     cell. The two-line grammar lives on where actions live — My Work / Team
     Work / the Order Route. */
  it("the guidance cell is the FACT alone — no action sentence in a register cell", () => {
    listHookState.data = { orders: [order({
      delivery_date: null,
      delivery_date_tbd: false,
      customer_name: "Kimmy",
      salespersons: { name: "Shasha" },
    })] };
    mount();

    // The FACT. Governed body 13 (inherited from the row) at semibold, in
    // the warning ink reserved for it.
    const problem = screen.getByText("No delivery date");
    expect(problem.className).toContain("font-semibold");
    expect(problem.className).not.toContain("text-meta");
    expect(problem.className).not.toContain("text-label");

    // The ACTION clause is GONE from the cell — named, so a revert is caught.
    expect(screen.queryByText("Confirm delivery date")).toBeNull();
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
   * THE FOOTER READS THE SAME LADDER AS THE DOCUMENT (2026-08-24).
   *
   * Jess: "Other goods 44 - the number doesn't tally." The arithmetic was
   * never wrong; the CLASSIFIER was. The footer read the SKU text alone
   * while the SO detail reads recorded `attrs.category`, then the catalog,
   * then the SKU - so a product the document named MATTRESS counted here as
   * `Other goods`, and the number could not be reproduced from the orders
   * the operator can open.
   */
  it("counts an AutoCount line by its CATALOG category, not the unreadable SKU text", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            // Free-text AutoCount SKU no parser can read - but the catalog
            // knows it, and the server now sends that word.
            { sku: "1013Jager/Fab3-King/PC151-01", qty: 2, unit_price: 3200, category: "mattress" },
          ],
        }),
      ],
    };
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent("Mattress 2");
    expect(footer).not.toHaveTextContent("Other goods");
  });

  it("prefers what the ORDER recorded over what the catalog says today", () => {
    // `attrs.category` is what this order agreed to. A later catalog
    // re-classification must never rewrite a committed line.
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            {
              sku: "FREE-TEXT-THING",
              qty: 1,
              unit_price: 500,
              attrs: { category: "sofa" },
              category: "mattress",
            },
          ],
        }),
      ],
    };
    mount();
    expect(screen.getByTestId("grid-footer")).toHaveTextContent("Sofa 1");
  });

  it("a catalog ACCESSORY whose type is recognised prints the TYPE, not the bare word", () => {
    listHookState.data = {
      orders: [
        order({
          order_lines: [
            { sku: "SOME-PILLOW-CODE", qty: 4, unit_price: 89, category: "accessory" },
          ],
        }),
      ],
    };
    mount();
    expect(screen.getByTestId("grid-footer")).toHaveTextContent("Pillow 4");
  });

  it("a catalog ACCESSORY whose type nothing recognises prints `Accessory`, NOT `Other goods`", () => {
    // The catalog positively says accessory. Calling it `Other goods` would
    // report a classification failure over a line that IS classified.
    listHookState.data = {
      orders: [
        order({
          order_lines: [{ sku: "XZ-9931", qty: 3, unit_price: 40, category: "accessory" }],
        }),
      ],
    };
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent("Accessory 3");
    expect(footer).not.toHaveTextContent("Other goods");
  });

  it("NEGATIVE CONTROL: a line nothing recognises is STILL `Other goods` - the word keeps its meaning", () => {
    // The fix must not launder unclassified goods into a category. This
    // number is a real data-quality signal and has to survive.
    listHookState.data = {
      orders: [
        order({ order_lines: [{ sku: "Leg 4\"", qty: 5, unit_price: 20, category: null }] }),
      ],
    };
    mount();
    expect(screen.getByTestId("grid-footer")).toHaveTextContent("Other goods 5");
  });

  it("an OLDER Worker that sends no category behaves exactly as before", () => {
    // Absent (not null) - the field simply is not on the wire. The parser
    // rungs still answer, so this build is safe against a lagging Worker.
    listHookState.data = {
      orders: [order({ order_lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499 }] })],
    };
    mount();
    expect(screen.getByTestId("grid-footer")).toHaveTextContent("Mattress 1");
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
    expect(screen.getByText("Kelana Jaya")).toBeInTheDocument();
  });

  it("says plainly when the Sales Order has produced no Delivery Order", () => {
    listHookState.data = { orders: [order({ do_number: null })] };
    deliveryOrdersHookState.data = { deliveryOrders: [], attempts: [], handoverEvents: [] };
    mount();
    expect(screen.getByText("No delivery order yet")).toBeInTheDocument();
  });

  it("opens the one authoritative Delivery Order when exactly one exists", () => {
    deliveryOrdersHookState.data = {
      deliveryOrders: [deliveryOrder("DO-200826-1234")],
      attempts: [],
      handoverEvents: [],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "DO-200826-1234" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/operation/delivery-orders/DO-200826-1234",
    );
  });

  it("shows every Delivery Order relationship instead of hiding all but one", () => {
    deliveryOrdersHookState.data = {
      deliveryOrders: [
        deliveryOrder("DO-200826-1234"),
        deliveryOrder("DO-210826-5678"),
      ],
      attempts: [],
      handoverEvents: [],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "2 Delivery Orders" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/operation/delivery-orders?order=00000000-0000-0000-0000-00000000cafe",
    );
    expect(screen.queryByText("DO-200826-1234")).not.toBeInTheDocument();
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
      "Category", "Unit ID", "Deliver To", "SKU", "Qty", "Item",
    ]);
    const row = screen.getByTestId("expanded-good-B1201S-K");
    expect(row).toHaveTextContent("Mattress");
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
    expect(screen.getByText("Mattress")).toBeInTheDocument();
    expect(screen.getByText("Not allocated")).toBeInTheDocument();
    expect(screen.queryByText(/other goods/i)).not.toBeInTheDocument();
  });

  /**
   * ⭐ THE CHILD BOX BEGINS AT `SO No` — owner ruling 2026-08-15.
   *
   * The indent is the parent-child link, and it is the TABLE's own column
   * layout that draws it: one real EMPTY cell per gutter column, then the box
   * spanning the data columns with no padding of its own. A computed
   * `padding-left` was tried and measured wrong — `width` on a `<td>` is a
   * hint, and this grid stretches its columns to fill the frame, so the 30px
   * ☐ and 32px ▸ render 41 and 43 at 1440 and a 62px padding lands 22px short.
   */
  it("starts the expansion at the first data column, with the gutter left empty", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const gutter = screen.getAllByTestId(/^grid-expansion-gutter-/);
    expect(gutter.map((c) => c.dataset.testid)).toEqual([
      "grid-expansion-gutter-__select__",
      "grid-expansion-gutter-__expand__",
    ]);
    for (const cell of gutter) expect(cell).toBeEmptyDOMElement();
    /* Eight default business columns; the gutter is not one of them, and the
       box's right edge is therefore the parent table's. */
    expect(screen.getByTestId("grid-expansion-cell")).toHaveAttribute("colspan", "8");
    /* Air above and below, NOTHING left or right — horizontal padding is the
       very thing the gutter cells replaced (owner correction 2026-08-15). */
    expect(screen.getByTestId("grid-expansion-cell")).toHaveStyle({
      paddingTop: "12px",
      paddingBottom: "12px",
      paddingLeft: "0px",
      paddingRight: "0px",
    });
  });

  /** The child of a record is its own object, and the frame is what says so. */
  it("draws the child table as a bordered box, not a continuation of the sheet", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const box = screen.getByTestId("goods-mini-table");
    expect(box.className).toContain("rounded-control");
    expect(box.className).toContain("border-base-200");
    expect(box.className).not.toContain("border-y");
  });

  it("draws a readable grid through every expanded goods column and row", () => {
    listHookState.data = { orders: [order({ order_lines: [
      { id: "line-1", sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" },
      { id: "line-2", sku: "SOFA9", qty: 1, unit_price: 3999, label: "Sofa 9" },
    ] })] };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const goods = screen.getByRole("table", { name: "Goods on SO-1303" });
    const [head, body] = within(goods).getAllByRole("rowgroup");
    expect(within(head).getByRole("row").className).toContain("divide-x");
    expect(body.className).toContain("divide-y");
    expect(body.className).toContain("divide-base-200");
    for (const row of within(body).getAllByRole("row")) {
      expect(row.className).toContain("divide-x");
      expect(row.className).toContain("divide-base-200");
    }
  });

  /**
   * ⭐ TWO TYPE LEVELS, AND A REGISTER SELECTS NOTHING (owner rulings
   * 2026-08-15). The header is the parent header's own 11px grey; every value
   * is 13px `text-body`; and no child row on a TRUTH register may carry a
   * checkbox — the parent row's tick already scopes Export, and a second tick
   * inside the box would claim the register can act on one line.
   */
  it("prints the child header at 11px with no checkbox, and every value at 13px", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const goods = screen.getByRole("table", { name: "Goods on SO-1303" });
    for (const header of within(goods).getAllByRole("columnheader")) {
      expect(header.className).toContain("text-label");
      expect(header.className).toContain("text-base-500");
    }
    expect(within(goods).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(goods).getAllByRole("rowgroup")[1].className).toContain("text-body");
  });

  /** An absence keeps its word and loses its weight — inside the box too. */
  it("mutes the governed absences in the child table", () => {
    listHookState.data = { orders: [order({ order_lines: [
      { id: "line-1", sku: "B1201S-K", qty: 1, unit_price: 2499, label: "B1201S · King" },
    ] })] };
    expansionHookState.data = { lines: [] };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const goods = screen.getByRole("table", { name: "Goods on SO-1303" });
    expect(within(goods).getByText("Not allocated")).toHaveAttribute("data-absence", "true");
    expect(within(goods).getByText("Not recorded")).toHaveAttribute("data-absence", "true");
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
