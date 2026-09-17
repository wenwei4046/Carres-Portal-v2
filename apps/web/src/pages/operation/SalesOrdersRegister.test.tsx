/**
 * STAGE 1 FIX 1 — SERVER SEARCH, held as a test.
 *
 * **The one property this file exists to hold:** what the operator types in
 * the register's search box reaches `useOperationOrders` as `{ search }` —
 * the API is ASKED, the browser does not merely filter the rows it already
 * has. If the register ever returns to client-only search, the second test
 * here fails: the hook would never see the term.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";
import { fmtDate } from "@/lib/fmt-date";

let listHookState: {
  data: { orders: operationOrderListRow[]; salesOrderTotal?: number | null } | undefined;
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
      unverifiedUnitIds?: string[];
      verifiedUnitIds?: string[];
      unitQuantityMismatch?: boolean;
      deliverTo: Array<{ name: string; qty: number }>;
    }>;
  } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch?: () => void;
};

/* A spy AROUND the hook: the component's calls — and the filters it passes —
 * are the assertion surface. */
const useOperationOrdersSpy = vi.fn((..._args: unknown[]) => listHookState);
const useSalesOrderExpansionSpy = vi.fn((..._args: unknown[]) => expansionHookState);
/* D4 · a tripwire, not a fixture. The register must NOT consult this hook:
 * its read is capped at the newest 500 Delivery Orders, so order 501 and
 * older printed "No delivery order yet" while holding a DO. It answers with
 * nothing, so a register that went back to it would fail twice — here on the
 * call, and below on the DO number that vanished. */
const useDeliveryOrdersRegisterSpy = vi.fn((..._args: unknown[]) => ({
  data: { deliveryOrders: [], attempts: [], handoverEvents: [] },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
}));

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
});

describe("FIX 1 · the register asks the SERVER", () => {
  it("distinguishes a server search with no matches from an empty system", async () => {
    listHookState.data = { orders: [] };
    mount();
    expect(screen.getByText("No sales orders yet")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing-order" } });
    await waitFor(() => expect(screen.getByText("No sales orders match these filters")).toBeInTheDocument());
    expect(screen.queryByText("No sales orders yet")).not.toBeInTheDocument();
  });

  it.each(["loading", "error"])("never calls %s expansion data Not allocated", (state) => {
    expansionHookState = { data: undefined, isLoading: state === "loading", isError: state === "error", refetch: vi.fn() };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.queryByText("Not allocated")).not.toBeInTheDocument();
    if (state === "error") {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not load goods details");
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(expansionHookState.refetch).toHaveBeenCalledOnce();
    } else expect(within(screen.getByTestId("row-expansion")).getByRole("status")).toHaveTextContent("Loading…");
  });

  it("keeps fourteen uncertain IDs inspectable without claiming they belong to the Qty 1 line", () => {
    listHookState.data = { orders: [order({ order_lines: [{ id: "l1", sku: "H1401F-K", qty: 1, unit_price: 100 }] })] };
    expansionHookState.data = { lines: [{ lineId: "l1", sku: "H1401F-K", unitIds: Array.from({ length: 14 }, (_, i) => `ID-${i}`), verifiedUnitIds: [], unverifiedUnitIds: Array.from({ length: 14 }, (_, i) => `ID-${i}`), deliverTo: [] }] };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.getByText("Unit ID link not verified")).toBeInTheDocument();
    expect(screen.queryByText("ID-13")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unit ID (14)" }));
    expect(screen.getByText("ID-0")).toBeInTheDocument();
    expect(screen.getByText("ID-13")).toBeInTheDocument();
  });

  it("mounts asking for the unfiltered population (no search key)", () => {
    mount();
    expect(useOperationOrdersSpy).toHaveBeenCalled();
    const first = useOperationOrdersSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(first).toEqual({});
  });

  it("the typed term reaches useOperationOrders as { search } — the API is asked, not just the loaded rows filtered", async () => {
    mount();
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

  it("keeps one work toolbar with discoverable Search, Export and Columns", () => {
    mount();
    expect(screen.getAllByTestId("work-toolbar")).toHaveLength(1);
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

  it("labels Export and its menu offers Excel, PDF and Print", () => {
    mount();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    expect(exportBtn).toHaveTextContent("Export");
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

  it("shows a governed missing Requested Delivery Date exception instead of a passive empty value", () => {
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
        "Record the agreed Requested Delivery Date.",
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
    expect(footer).toHaveTextContent("1 sales order");
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
    // September 11 review: every counted quantity has a visible category.
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

  /* ⭐ THIS IS NOW THE LOAD-BEARING HALF (YH, 2026-08-27).
     While `Other goods` printed, a laundered line was merely mislabelled and
     visible. Now that the word is hidden, laundering would be INVISIBLE — an
     unrecognised line quietly inflating `Accessory` or `Mattress` with nobody
     able to see it. So the assertion inverts with the ruling: an unrecognised
     line must reach NO printed category at all. */
  it("NEGATIVE CONTROL: a line nothing recognises is laundered into no category", () => {
    listHookState.data = {
      orders: [
        order({ order_lines: [{ sku: "Leg 4\"", qty: 5, unit_price: 20, category: null }] }),
      ],
    };
    mount();
    const footer = screen.getByTestId("grid-footer");
    for (const word of [
      "Mattress",
      "Bedframe",
      "Sofa",
      "Pillow",
      "Topper",
      "Footrest",
      "Accessory",
      "Service",
    ]) {
      expect(footer, `an unrecognised line reached \`${word}\``).not.toHaveTextContent(word);
    }
    expect(footer).toHaveTextContent("Other goods 5");
    expect(footer).toHaveTextContent("1 sales order");
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
    for (const el of absences) expect(el.className).toContain("text-kit-slate-11");
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
      "SO Date",
      "SO No",
      "Requested Delivery Date",
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
    mount();
    expect(screen.getByText("No delivery order yet")).toBeInTheDocument();
  });

  it("reads the Delivery Orders off the order row, not a second capped read", () => {
    listHookState.data = {
      orders: [order({ ops_delivery_orders: [{ do_number: "DO-200826-1234" }] })],
    };
    mount();
    expect(screen.getByRole("button", { name: "DO-200826-1234" })).toBeInTheDocument();
    expect(useDeliveryOrdersRegisterSpy).not.toHaveBeenCalled();
  });

  it("opens the one authoritative Delivery Order when exactly one exists", () => {
    listHookState.data = {
      orders: [order({ ops_delivery_orders: [{ do_number: "DO-200826-1234" }] })],
    };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "DO-200826-1234" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/operation/delivery-orders/DO-200826-1234",
    );
  });

  it("shows every Delivery Order relationship instead of hiding all but one", () => {
    listHookState.data = {
      orders: [
        order({
          ops_delivery_orders: [
            { do_number: "DO-200826-1234" },
            { do_number: "DO-210826-5678" },
          ],
        }),
      ],
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
    const row = screen.getByTestId("grid-parent-row");
    const customer = within(row).getByText("Kimmy");
    expect(customer).not.toHaveTextContent("019-3478913");
    expect(row).not.toHaveTextContent("019-3478913");
  });

  it("renders six goods columns with separate SKU, Stock Unit IDs and Purchasing Deliver To", () => {
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
    expect(row).toHaveTextContent("Unit ID (2)");
    expect(within(row).queryByText("id-001")).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Unit ID (2)" }));
    expect(screen.getByText("id-001")).toBeInTheDocument();
    expect(screen.getByText("id-002")).toBeInTheDocument();
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

  it("starts under SO Date, the first column, with a separate bordered child and 12px vertical gaps", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const gutters = screen.getAllByTestId(/^grid-expansion-gutter-/);
    expect(gutters.map((cell) => cell.dataset.testid)).toEqual([
      "grid-expansion-gutter-__select__",
      "grid-expansion-gutter-__expand__",
    ]);
    for (const gutter of gutters) expect(gutter).toBeEmptyDOMElement();
    const cell = screen.getByTestId("grid-expansion-cell");
    expect(cell).toHaveAttribute("colspan", "8");
    expect(cell.querySelector('[class*="100cqw"]')).toBeNull();
    expect(within(cell).getByRole("table")).toHaveStyle({ minWidth: "908px" });
    /* The child owns its border; only vertical padding separates it. */
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
      /* S5 (2026-09-16): the shared child header follows the slate Register
         header — slate-11 ink, 600, normal casing. */
      expect(header.className).toContain("text-kit-slate-11");
      expect(header.className).not.toContain("uppercase");
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

/* COPY IS RETIRED — Jess, 2026-08-28, relayed by YH.
 *
 * This block used to prove the copy door opened the authoritative create
 * workspace with the source order as a seed. That behaviour is GONE, and the
 * reason is not tidiness: a copied order silently dropped each line’s
 * configuration (fabric, colour), so Purchasing received a PO it could not
 * autofill — a quiet wrong order rather than a visible failure. Jess called
 * the act dangerous and it is not retained.
 *
 * The pin is rewritten to its SURVIVING invariant rather than deleted: the
 * register offers no copy act, and no hand-typed `?copyFrom=` URL is minted
 * from here. If copy ever returns it needs a card, a configuration answer and
 * a new test — not the quiet return of this one.
 */
describe("Copy to new Sales Order — retired", () => {
  it("offers no copy act on the row menu", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    // The menu still renders — so this is a real absence, not an empty query.
    expect(screen.getByRole("menuitem", { name: "Cancel SO" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Copy to new Sales Order" })).toBeNull();
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel SO" }));
    expect(screen.getByText("Cancel SO-1303")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/operation/orders");
  });

  it("keeps the destructive entry last, below a divider, so a slipped click cannot reach it", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    const labels = screen
      .getAllByRole("menuitem")
      .map((b) => b.textContent?.trim())
      .filter((t): t is string =>
        [
          "View",
          "Edit",
          "Print PDF",
          "Cancel SO",
        ].includes(t ?? ""),
      );
    expect(labels[labels.length - 1]).toBe("Cancel SO");
  });

  /* ONE ACT, ONE NAME (YH, 2026-08-28). `Preview PDF` and `Print PDF` were
     two rows calling one handler with one argument list, so the menu offered
     a choice that did not exist. This pins the INTENT — the row menu names an
     act once — not the surviving spelling of the word. */
  it("names the document act ONCE — no Preview row shadowing Print", () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId("grid-parent-row"));
    const labels = screen
      .getAllByRole("menuitem")
      .map((b) => b.textContent?.trim());
    expect(labels).toContain("Print PDF");
    expect(labels).not.toContain("Preview PDF");
  });
});


describe("Sales Orders table correction", () => {
  it("keeps the full date label on its sort and filter doors", () => {
    mount();
    const sort = screen.getByRole("button", { name: "Requested Delivery Date" });
    expect(sort.querySelector("br")).not.toBeNull();
    fireEvent.click(sort);
    expect(screen.getByRole("button", { name: "Requested Delivery Date" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filter Requested Delivery Date" }));
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("preserves saved widths and optional columns, but a saved order cannot move SO Date · SO No off the front", () => {
    const saved = {
      order: ["customer", "so", "ordered", "customer_delivery", "delivery_location", "showroom", "po_number", "do_number", "phone"],
      widths: { customer: 288, customer_delivery: 240 },
      hidden: [], groupBy: [], sort: null,
    };
    localStorage.setItem("carres.salesOrders.register.v5.anon", JSON.stringify(saved));
    mount();
    const business = [...screen.getByTestId("grid-header").querySelectorAll("th")].map((th) => th.getAttribute("title")).filter(Boolean);
    expect(business.slice(0, 3)).toEqual(["SO Date", "SO No", "Customer"]);
    expect(screen.getByRole("button", { name: "Customer" }).closest("th")).toHaveStyle({width: "288px"});
    expect(screen.getByRole("button", { name: "Requested Delivery Date" }).closest("th")).toHaveStyle({width: "240px"});
    expect(screen.getByRole("button", { name: "Filter Phone" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.getAllByTestId(/^grid-expansion-gutter-/).map((e) => e.dataset.testid)).toEqual([
      "grid-expansion-gutter-__select__", "grid-expansion-gutter-__expand__",
    ]);
    expect(JSON.parse(localStorage.getItem("carres.salesOrders.register.v5.anon")!).widths).toEqual(saved.widths);
  });
});

/**
 * LISTING STANDARD — owner approved 2026-09-16, the page-local half.
 * (The shared search, palette, width rule, `Reset columns` label and keyboard
 * row menu wait for the shared register work in PR #1395.)
 */
describe("Listing Standard 2026-09-16 · page-local", () => {
  it("counts sales orders by their document name, singular and filtered", async () => {
    listHookState.data = { orders: [order({}), order({ id: "o-2", so: 1304, customer_name: "Wong Mei Ling" })], salesOrderTotal: 2 };
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent(/^2 sales orders/);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Wong" } });
    await waitFor(() => expect(footer).toHaveTextContent(/^1 of 2 sales orders/));
    expect(footer).not.toHaveTextContent(/\borders\b(?! )/);
  });

  /* ⭐ `{m}` IS THE SERVER'S COUNT (2026-09-17). Not `rows.length`, not a
     number remembered from an earlier unsearched read. */
  describe("the total is the server's count", () => {
    const wong = order({ id: "o-3", so: 1305, customer_name: "Wong Mei Ling" });
    const everyone = [order({}), order({ id: "o-2", so: 1304 }), wong];
    const searchOf = (args: unknown[]) => (args[0] as { search?: string } | undefined)?.search;
    const serverAnswered = (term: string) =>
      waitFor(() => expect(useOperationOrdersSpy.mock.calls.some((c) => searchOf(c) === term)).toBe(true));
    afterEach(() => useOperationOrdersSpy.mockImplementation((..._args: unknown[]) => listHookState));

    it("a search answered BEFORE any unsearched load still says `of` the server total", async () => {
      /* The unsearched read never arrives; only the searched answer does. */
      useOperationOrdersSpy.mockImplementation((...args: unknown[]) =>
        searchOf(args)
          ? { ...listHookState, data: { orders: [wong], salesOrderTotal: 3 } }
          : { ...listHookState, data: undefined });
      mount();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Wong" } });
      await serverAnswered("Wong");
      await waitFor(() => expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^1 of 3 sales orders/));
    });

    it("an order created during a search moves the total on the next read", async () => {
      let total = 3;
      useOperationOrdersSpy.mockImplementation((...args: unknown[]) => ({
        ...listHookState,
        data: searchOf(args) ? { orders: [wong], salesOrderTotal: total } : { orders: everyone, salesOrderTotal: total },
      }));
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = () => (
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/operation/orders"]}>
            <SalesOrdersRegister />
          </MemoryRouter>
        </QueryClientProvider>
      );
      const view = render(tree());
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Wong" } });
      await serverAnswered("Wong");
      await waitFor(() => expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^1 of 3 sales orders/));
      /* Another operator creates an order; the list query is invalidated and re-read. */
      total = 4;
      view.rerender(tree());
      await waitFor(() => expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^1 of 4 sales orders/));
    });

    it("a limited read (the 500-row cap) is `{loaded} of {server total}`, not `{loaded}`", () => {
      listHookState.data = { orders: everyone, salesOrderTotal: 612 };
      mount();
      expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^3 of 612 sales orders/);
    });

    it.each([
      ["null", null],
      ["absent (older Worker)", undefined],
    ])("an unknown total (%s) prints the count alone — never a guessed `of`", async (_label, unknown) => {
      useOperationOrdersSpy.mockImplementation((...args: unknown[]) => ({
        ...listHookState,
        data: { orders: searchOf(args) ? [wong] : everyone, ...(unknown === undefined ? {} : { salesOrderTotal: unknown }) },
      }));
      mount();
      expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^3 sales orders/);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Wong" } });
      await serverAnswered("Wong");
      await waitFor(() => expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^1 sales order\b/));
      expect(screen.getByTestId("grid-footer")).not.toHaveTextContent(" of ");
    });
  });

  it("names a single ticked row in the singular", () => {
    mount();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]!);
    expect(screen.getByTestId("grid-footer")).toHaveTextContent(/^1 selected sales order\b/);
  });

  it("draws New Sales Order as the kit primary 32px control, not a page-local capsule", () => {
    mount();
    const create = screen.getByTestId("new-sales-order");
    expect(create).toHaveAttribute("data-kit", "button");
    expect(create.className).toContain("h-8");
    expect(create.className).not.toContain("rounded-full");
    expect(create.querySelector("svg")).toHaveAttribute("stroke-width", "2");
  });

  it("says a failed load in one kit error with the fact and Try again", () => {
    const refetch = vi.fn();
    listHookState = { data: undefined, isLoading: false, isError: true, error: new Error("socket hang up"), refetch };
    mount();
    const alert = screen.getByRole("alert");
    expect(alert.querySelector('[data-kit="empty-state"]')).not.toBeNull();
    expect(alert).toHaveTextContent("Sales orders could not be loaded");
    expect(alert).not.toHaveTextContent("socket hang up");
    expect(alert.innerHTML).not.toMatch(/\bbase-\d/);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps the toolbar and New Sales Order when the list fails to load", () => {
    listHookState = { data: undefined, isLoading: false, isError: true, error: new Error("x"), refetch: vi.fn() };
    mount();
    expect(within(screen.getByTestId("work-toolbar")).getByTestId("new-sales-order")).toBeInTheDocument();
    expect(screen.getByTestId("grid-footer")).not.toHaveTextContent("sales order");
  });

  it("runs the shared slate register palette and governed search", () => {
    mount();
    const root = screen.getByTestId("work-toolbar").parentElement!;
    expect(root.className).toMatch(/rootPaletteSlate/);
    expect(root.className).toMatch(/rootSearchResponsive/);
  });

  it("prints Delivery Location as left-aligned text, not a centred button that cuts both ends", () => {
    mount();
    const row = screen.getByTestId("grid-parent-row");
    expect(within(row).queryByRole("button", { name: /Kelana|Selangor|Not recorded/ })).toBeNull();
  });
});
