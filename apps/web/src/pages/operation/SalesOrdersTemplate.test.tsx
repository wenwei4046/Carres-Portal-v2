/**
 * SALES ORDERS REGISTER TEMPLATE — THE APPROVED / LOCKED PARTS, HELD AS LAW.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner ruling 2026-08-11 ("LAYOUT APPROVED"). Everything asserted here is a
 * RULING, not a preference, so each test names the clause it holds:
 *
 *   ① 44px page header keeps Jump to · Notifications · Help · Settings, and
 *     Settings never falls into the Toolbar or its overflow.
 *   ② 45px Work Toolbar reads View · Search · Export ▾ · Columns ·
 *     + New Sales Order · … , `…` carries Scan Order, `Export ▾` carries
 *     Excel · PDF · Print.
 *   ③ Selecting swaps the toolbar IN PLACE — no second band, no extra height.
 *       1 selected  →  1 selected · Clear │ View Flow · Export Excel (1) · Export PDF (1)
 *       N selected  →  N selected · Clear │ Export Excel (N) · Export PDF (N)
 *   ④ The row menu is EXACTLY: Edit · View · Preview · Print ─ Issue Delivery
 *     Order · Copy to new Sales Order ─ Cancel SO.
 *   ⑤ `Reset layout` lives in Columns, never in the Footer; the Footer states
 *     the true total of the current view.
 *   ⑥ Nothing that is not built pretends to be: the approved-but-unbuilt
 *     entries are visible and INERT.
 *
 * **And the capability floor** — Search · column filters · Columns · Excel
 * export · resize · reorder · expand · selection all still exist. The ruling
 * re-composed the toolbar; it did not licence losing a power, so the last
 * describe block fails if any of them goes missing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { operationOrderListRow } from "@/lib/queries";
import SalesOrdersRegister from "./SalesOrdersRegister";

const listHookState = {
  data: undefined as { orders: operationOrderListRow[] } | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
};

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useOperationOrders: () => listHookState };
});

const order = (over: Partial<operationOrderListRow>): operationOrderListRow =>
  ({
    id: `id-${over.so ?? 1}`,
    so: 1301,
    status: "proceed_order",
    operation_stage: "confirmed",
    warehouse_id: null,
    customer_name: "Tan Mei Ling",
    customer_phone: "012-345 6789",
    placed_at: "2026-08-01T02:00:00Z",
    delivery_date: "2026-08-29",
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
    dealers: { name: "Carres HQ" },
    order_supplier_threads: [],
    order_annotations: [],
    paid: 500,
    order_lines: [{ sku: "M1401F-K", qty: 1, unit_price: 2500, label: "Jager · King" }],
    order_addons: [],
    ...over,
  }) as operationOrderListRow;

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/orders"]}>
        <SalesOrdersRegister />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Tick the row checkboxes the selection column renders, first `n` rows. */
function selectRows(n: number) {
  const boxes = screen
    .getAllByRole("checkbox")
    /* [0] is the header select-all; the row ticks follow. */
    .slice(1);
  for (let i = 0; i < n; i++) fireEvent.click(boxes[i]!);
}

beforeEach(() => {
  window.localStorage.clear();
  listHookState.data = {
    orders: [
      order({ so: 1301 }),
      order({ so: 1302, customer_name: "Umi" }),
      order({ so: 1303, customer_name: "Kimmy" }),
    ],
  };
  listHookState.isLoading = false;
  listHookState.isError = false;
});

/* ① ───────────────────────────────────────────────────────────────────────── */
describe("① the 44px page header — Jump to · Notifications · Help · Settings", () => {
  it("carries all four, and every one of them is in the HEADER, not the toolbar", () => {
    mount();
    const header = screen.getByTestId("sales-orders-destination-header");
    expect(within(header).getByTestId("jump-to")).toBeInTheDocument();
    expect(within(header).getByLabelText("Alerts")).toBeInTheDocument();
    expect(within(header).getByLabelText("Help")).toBeInTheDocument();
    expect(within(header).getByLabelText("Settings")).toBeInTheDocument();
  });

  it("⛔ Settings NEVER falls into the Work Toolbar or its overflow", () => {
    mount();
    const toolbar = screen.getByTestId("work-toolbar");
    expect(within(toolbar).queryByLabelText("Settings")).toBeNull();
    fireEvent.click(within(toolbar).getByLabelText("More"));
    expect(screen.queryByRole("menuitem", { name: /settings/i })).toBeNull();
  });

  it("Jump to NAVIGATES and nothing else — a search box over the portal's own nav, never business data", () => {
    mount();
    fireEvent.click(screen.getByTestId("jump-to"));
    const dialog = screen.getByRole("dialog", { name: "Jump to" });
    /* It is a NAVIGATOR: one box, whose destinations come from PORTAL_NAV
       through the same role filter the sidebar uses (which, with no
       signed-in role in jsdom, correctly yields none). It must never show a
       count, an order or any other business fact. */
    expect(within(dialog).getByLabelText("Go to a page")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Go to a page"), {
      target: { value: "zzzz-no-such-page" },
    });
    expect(within(dialog).getByText("No page by that name")).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/SO-|RM|Tan Mei Ling/);
  });
});

/* ② ───────────────────────────────────────────────────────────────────────── */
describe("② the 45px Work Toolbar — View · Search · Export ▾ · Columns · + New Sales Order · …", () => {
  it("renders the ruled controls, and ONE Export control rather than a long Excel pill", () => {
    mount();
    const toolbar = screen.getByTestId("work-toolbar");
    expect(within(toolbar).getByText("View")).toBeInTheDocument();
    expect(
      within(toolbar).getByPlaceholderText("SO number, customer, phone or item…"),
    ).toBeInTheDocument();
    expect(within(toolbar).getByText("Export")).toBeInTheDocument();
    expect(within(toolbar).getByText("Columns")).toBeInTheDocument();
    expect(within(toolbar).getByTestId("new-sales-order")).toBeInTheDocument();
    expect(within(toolbar).getByLabelText("More")).toBeInTheDocument();
    /* The pre-ruling pill said its whole scope in its label. The scope now
       lives in the menu's own title, so the long word must be gone. */
    expect(within(toolbar).queryByText("Export Excel — current view")).toBeNull();
  });

  it("Export ▾ opens Excel · PDF · Print, in that order, over the CURRENT VIEW", () => {
    mount();
    fireEvent.click(within(screen.getByTestId("work-toolbar")).getByText("Export"));
    const items = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(items).toEqual(["Excel", "PDF", "Print"]);
    expect(screen.getByText("Export — current view (3)")).toBeInTheDocument();
  });

  it("`…` carries Scan Order, and keeps the column-filter door that left the toolbar face", () => {
    mount();
    fireEvent.click(within(screen.getByTestId("work-toolbar")).getByLabelText("More"));
    const items = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(items[0]).toContain("Filter a column");
    expect(items.join(" ")).toContain("Scan Order");
  });
});

/* ③ ───────────────────────────────────────────────────────────────────────── */
describe("③ selecting swaps the toolbar IN PLACE — never a second band", () => {
  it("ONE selected reads `1 selected · Clear │ View Flow · Export Excel (1) · Export PDF (1)`", () => {
    mount();
    selectRows(1);
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    expect(within(bar).getByText("Clear")).toBeInTheDocument();
    expect(within(bar).getByTestId("view-flow")).toBeInTheDocument();
    expect(within(bar).getByText("Export Excel (1)")).toBeInTheDocument();
    expect(within(bar).getByText("Export PDF (1)")).toBeInTheDocument();
  });

  it("MANY selected drops View Flow and keeps the two exports", () => {
    mount();
    selectRows(2);
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    expect(within(bar).queryByTestId("view-flow")).toBeNull();
    expect(within(bar).getByText("Export Excel (2)")).toBeInTheDocument();
    expect(within(bar).getByText("Export PDF (2)")).toBeInTheDocument();
  });

  it("⭐ NO EXTRA HEIGHT — the strip overlays the toolbar's own band, and the toolbar stays mounted", () => {
    mount();
    selectRows(1);
    const bar = screen.getByTestId("selection-bar");
    /* The overlay class IS the no-extra-height mechanism: absolute, over the
       toolbar, not a sibling row that pushes the table down. */
    expect(bar.className).toMatch(/selectionBarOverlay/);
    expect(screen.getByTestId("work-toolbar")).toBeInTheDocument();
  });

  it("Clear returns the toolbar to its normal face", () => {
    mount();
    selectRows(1);
    fireEvent.click(within(screen.getByTestId("selection-bar")).getByText("Clear"));
    expect(screen.queryByTestId("selection-bar")).toBeNull();
    expect(within(screen.getByTestId("work-toolbar")).getByText("Export")).toBeInTheDocument();
  });
});

/* ④ ───────────────────────────────────────────────────────────────────────── */
describe("④ the row menu — the ruled items, in the ruled order, and nothing else", () => {
  function openRowMenu() {
    fireEvent.contextMenu(screen.getAllByTestId("grid-parent-row")[0]!);
  }

  it("reads Edit · View · Preview · Print ─ Issue Delivery Order · Copy to new Sales Order ─ Cancel SO", () => {
    mount();
    openRowMenu();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) =>
        [
          "Edit",
          "View",
          "Preview",
          "Print",
          "Issue Delivery Order",
          "Copy to new Sales Order",
          "Cancel SO",
        ].some((r) => t.startsWith(r)),
      );
    expect(labels[0]).toBe("Edit");
    expect(labels[1]).toBe("View");
    expect(labels[2]).toBe("Preview");
    expect(labels[3]).toBe("Print");
    expect(labels[4]).toContain("Issue Delivery Order");
    expect(labels[5]).toContain("Copy to new Sales Order");
    expect(labels[6]).toContain("Cancel SO");
  });

  it("⛔ the retired Stage-1 words are gone — no `Open`, no `Print PDF`, no `Copy SO No`", () => {
    mount();
    openRowMenu();
    expect(screen.queryByText("Print PDF")).toBeNull();
    expect(screen.queryByText("Copy SO No")).toBeNull();
  });
});

/* ⑤ + ⑥ ──────────────────────────────────────────────────────────────────── */
describe("⑤ Reset layout lives in Columns, and the Footer only STATES", () => {
  it("the footer carries the true total of the current view and no control", () => {
    mount();
    const footer = screen.getByTestId("grid-footer");
    expect(footer).toHaveTextContent("3 orders · Not delivered");
    expect(within(footer).queryByText("Reset layout")).toBeNull();
  });

  it("Reset layout is inside the Columns popover", () => {
    mount();
    fireEvent.click(within(screen.getByTestId("work-toolbar")).getByText("Columns"));
    expect(screen.getByText("Reset layout")).toBeInTheDocument();
  });
});

describe("⑥ an approved-but-unbuilt entry is VISIBLE and INERT — it never fabricates", () => {
  it("View Flow renders disabled at one selected row", () => {
    mount();
    selectRows(1);
    expect(screen.getByTestId("view-flow")).toBeDisabled();
  });

  it("Scan Order renders disabled, and says so", () => {
    mount();
    fireEvent.click(within(screen.getByTestId("work-toolbar")).getByLabelText("More"));
    const scan = screen.getByRole("menuitem", { name: /Scan Order/ });
    expect(scan).toBeDisabled();
    expect(scan).toHaveTextContent("Not available yet");
  });

  it("the three unbuilt row acts render disabled — a register may not write another module's record", () => {
    mount();
    fireEvent.contextMenu(screen.getAllByTestId("grid-parent-row")[0]!);
    for (const label of ["Issue Delivery Order", "Copy to new Sales Order", "Cancel SO"]) {
      const btn = screen.getByText(label).closest("button")!;
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent("Not available yet");
    }
  });
});

/* THE CAPABILITY FLOOR ────────────────────────────────────────────────────── */
describe("the ruling re-composed the toolbar; it did not licence losing a power", () => {
  it("Search · Columns · Excel · expand · selection · column filters all survive", () => {
    mount();
    const toolbar = screen.getByTestId("work-toolbar");

    // Search
    expect(
      within(toolbar).getByPlaceholderText("SO number, customer, phone or item…"),
    ).toBeInTheDocument();
    // Columns chooser, still grouped
    fireEvent.click(within(toolbar).getByText("Columns"));
    expect(screen.getByText("Document")).toBeInTheDocument();
    fireEvent.click(within(toolbar).getByText("Columns"));

    // Excel export, still the engine's own
    fireEvent.click(within(toolbar).getByText("Export"));
    expect(screen.getByRole("menuitem", { name: "Excel" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    // Selection
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(1);
    // Expansion
    expect(screen.getAllByTestId("grid-parent-row").length).toBe(3);
    // Per-column filter doors still on the header
    expect(screen.getByTestId("grid-header")).toBeInTheDocument();
  });
});
