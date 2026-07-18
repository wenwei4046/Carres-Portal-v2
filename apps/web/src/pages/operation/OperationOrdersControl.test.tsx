import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperationOrdersControl, {
  buildOrdersCsv,
  buildOrdersPrintHtml,
  catQty,
  nextActionOf,
  stockEtaOf,
  slackDays,
  logisticStateOf,
} from "./OperationOrdersControl";
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
  makeRow({ id: "c", so: 1003, status: "proceed_order", operation_stage: "confirmed" }),
  // D — awaiting → Pending, with a triage LP that resolves via partners map
  makeRow({
    id: "d",
    so: 1004,
    status: "proceed_order",
    operation_stage: "in_production",
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

/** The Status filter group — its chips replaced the old role="tablist" tabs
 *  (Jess 2026-06-25 boxed filter: Status is now one labelled chip-group box).
 *  Scoping queries to it keeps labels that also appear elsewhere ("All" sits in
 *  every group) unambiguous. */
function statusGroup() {
  return within(screen.getByTestId("filter-status"));
}
function clickStatus(label: string) {
  fireEvent.click(statusGroup().getByRole("button", { name: new RegExp(`^${label}`) }));
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
  it("renders the 6 status chips (5 stages + All) with correct per-tab counts", () => {
    wrap(<OperationOrdersControl />);
    const g = statusGroup();
    expect(g.getAllByRole("button")).toHaveLength(6);
    // counts: All 7, Placed 1, Proceed 2, Pending 1, Scheduled 2, Delivered 1.
    expect(g.getByRole("button", { name: /All\s*7/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Placed\s*1/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Proceed\s*2/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Pending\s*1/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Scheduled\s*2/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Delivered\s*1/ })).toBeInTheDocument();
  });

  it("defaults to All and shows every order (completed 1007 sorts to the bottom)", () => {
    wrap(<OperationOrdersControl />);
    expect(rowsBySo()).toEqual(
      expect.arrayContaining(["1001", "1002", "1003", "1004", "1005", "1006", "1007"]),
    );
    expect(rowsBySo()).toHaveLength(7);
    // The completed order is last (live work shows first).
    expect(rowsBySo()[rowsBySo().length - 1]).toBe("1007");
  });

  it("entry rule: AutoCount placed → Proceed, native placed → Placed", () => {
    wrap(<OperationOrdersControl />);

    clickStatus("Placed");
    expect(rowsBySo()).toEqual(["1001"]); // only the native-placed order

    clickStatus("Proceed");
    // AutoCount-placed (1002) + proceed_request (1003), NOT the native one.
    expect(rowsBySo().sort()).toEqual(["1002", "1003"]);
  });

  it("Scheduled tab buckets both ready_to_dispatch and dispatched", () => {
    wrap(<OperationOrdersControl />);
    clickStatus("Scheduled");
    expect(rowsBySo().sort()).toEqual(["1005", "1006"]);
  });

  it("renders an items summary from order_lines", () => {
    wrap(<OperationOrdersControl />);
    clickStatus("Proceed"); // contains the AutoCount order with lines
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1002"))!;
    // AutoCount free-text SKUs → red "No PO" pill; the core arrival ratio counts
    // 2 mattress + 1 bedframe = 3 core units.
    expect(within(row).getByText("No PO")).toBeInTheDocument();
    expect(within(row).getByText("0/3")).toBeInTheDocument();
    // the CR/TCF ref shows in the merged Ref column.
    expect(row).toHaveTextContent("CR0418");
  });

  it("resolves the triage LP (ops_assigned_logistic) via the partners map", () => {
    wrap(<OperationOrdersControl />);
    clickStatus("Pending"); // order d has ops_assigned_logistic=p-nets
    const row = screen.getAllByTestId("order-row")[0];
    expect(within(row).getByText("NETS")).toBeInTheDocument();
  });

  it("shows the formal joined LP name on scheduled orders", () => {
    wrap(<OperationOrdersControl />);
    clickStatus("Scheduled");
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
        <MemoryRouter initialEntries={["/operation/orders/in_production"]}>
          <Routes>
            <Route
              path="/operation/orders/:stage"
              element={<OperationOrdersControl />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // in_production maps to the Pending tab → only order d.
    expect(rowsBySo()).toEqual(["1004"]);
  });

  it("fires onImport when the import button is clicked", () => {
    const onImport = vi.fn();
    wrap(<OperationOrdersControl onImport={onImport} />);
    fireEvent.click(screen.getByText(/\+ AutoCount/i));
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

  it("shows a green Ready dot when free balance covers every line (native, early stage)", () => {
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
    // every line covered (in_stock) → "Ready" dot (no qty on the cell now).
    expect(within(row).getByText("Ready")).toBeInTheDocument();
    expect(row.querySelector('[data-stock-state="in_stock"]')).toBeTruthy();
  });

  it("shows Waiting (Partial folded in) when some — but not all — units are on hand", () => {
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
    // have = 3 ; need = 5 → partial arrival = waiting. C rebuild (§14): the
    // word "Waiting" is gone — the cell shows the grey ETA sub-line ("ETA —"
    // here, nothing imported) and the 货 dot carries the amber.
    expect(within(row).getByText("ETA —")).toBeInTheDocument();
    expect(row.querySelector('[data-stock-state="need_po"]')).toBeTruthy();
  });

  it("falls back to a red No PO dot for AutoCount free-text SKUs absent from the catalog", () => {
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
    // free-text SKU → red "No PO" (alert: a human must set readiness).
    expect(within(row).getByText("No PO")).toBeInTheDocument();
    expect(within(row).queryByText(/^Ready/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/^Waiting/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/^Partial/)).not.toBeInTheDocument();
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
    // secured stage → green "Ready" dot (no qty).
    expect(within(row).getByText("Ready")).toBeInTheDocument();
    expect(row.querySelector('[data-stock-state="ready"]')).toBeTruthy();
  });

  it("shows the waiting stock state for awaiting_operation_action (PO already open)", () => {
    oneRow({
      id: "aw",
      so: 2005,
      status: "proceed_order",
      operation_stage: "in_production",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    // C rebuild (§14): no "Waiting" word — the grey ETA sub-line + the state
    // attribute carry it (colour lives in the 货 dot).
    expect(row.querySelector('[data-stock-state="awaiting"]')).toBeTruthy();
    expect(row.querySelector('[data-stock-eta]')).toBeTruthy();
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

  it("catQty classifies core lines by category — MS / BF / Sofa (services + accessories excluded) (A1)", () => {
    const lines = [
      { sku: "MS01-L1201S-Q", qty: 2 }, // Mattress, Queen → core
      { sku: "BF02-1013", qty: 1 }, // Bedframe, no size → core
      { sku: "Pillow", qty: 3 }, // accessory — not a core category
      { sku: "Microfiber Waterproof Mattress Protector-K", qty: 1 }, // → M.P, accessory
      { sku: "Sofa Disposal", qty: 1 }, // → Disposal, SERVICE
    ];
    // Accessories + service never count towards a core category.
    expect(catQty(lines, "mattress")).toBe(2);
    expect(catQty(lines, "bedframe")).toBe(1);
    expect(catQty(lines, "sofa")).toBe(0);
  });

  it("catQty classifies real AutoCount free-text SKUs into MS/BF/Sofa — even with COL: colour codes and non-MS/BF/SF model families (P1 classifier fix)", () => {
    const lines = [
      // The COL: colour code used to shove this whole row into "acc" → leaked
      // the raw model name. Now classifies as sofa (no K/Q/S size on sofas).
      { sku: 'SF03-HK5535/30"(L+2 SEATER)/COL:KN390-15 DEEP GREY', qty: 1 },
      // Bedframe family "Jager", size written as a WORD mid-SKU + COL: code.
      { sku: "1013Jager/Fab3-King/COL:PC151-02", qty: 1 },
      { sku: "1013Jager/Fab3-Queen/COL:PC151-02", qty: 2 },
      // Mattress families, size in the canonical -K/-Q suffix.
      { sku: "Breeze FirmCare-B1201F-K", qty: 1 },
      { sku: "Lumi FirmCare-L1201F-Q", qty: 2 },
      // Sofa family "Glano" — no MS/BF/SF prefix at all.
      { sku: 'Glano TH5090/30"(2 Seater)/KN390-14 Metal', qty: 1 },
    ];
    // Aggregate across sizes: MS = 1+2 = 3, BF = 1+2 = 3, Sofa = 1+1 = 2.
    expect(catQty(lines, "mattress")).toBe(3);
    expect(catQty(lines, "bedframe")).toBe(3);
    expect(catQty(lines, "sofa")).toBe(2);
  });

  it("the Stock cell shows a No PO pill with the core arrival ratio (0/2)", () => {
    oneRow({
      id: "r1b",
      so: 3010,
      order_lines: [{ sku: "SF03-HK5535", qty: 2 }], // sofa only, free-text SKU
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    // Free-text SKU → red "No PO" pill; the 2 sofa units drive the core ratio.
    expect(within(row).getByText("No PO")).toBeInTheDocument();
    expect(within(row).getByText("0/2")).toBeInTheDocument();
  });

  it("orders columns: select · Follow-up · Status dots · Order · Customer · Stock · Delivery · Deadline · Next (C rebuild §14)", () => {
    oneRow({
      id: "p2",
      so: 3012,
      customer_name: "Tan Ah Kow",
      customer_phone: "012-3456789",
      source_ref: ["TCF2024/06-461"],
    });
    wrap(<OperationOrdersControl />);
    // ONE header row (9 columns). The follow-up flag is the 2nd column (icon-only
    // header). C rebuild (Jess 2026-07-18): the 三线点 Status dots lead; SO+Ref
    // merge into Order, Customer absorbs Region (caption line), Logistic became
    // Delivery (truth-ladder words) and the "Next" verb closes the row.
    const head = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(head.map((h) => h.textContent)).toEqual([
      "", // select-all checkbox
      "", // follow-up flag — icon-only header
      "Status",
      "Order",
      "Customer",
      "Stock",
      "Delivery",
      "Deadline",
      "Next",
    ]);
    // SO (emphasis) + Ref (caption) share the Order cell; the phone tooltip
    // stays on that cell; the row always renders its three status dots.
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("SO-3012")).toBeInTheDocument();
    expect(within(row).getByText("Tan Ah Kow")).toBeInTheDocument();
    expect(within(row).getByText("TCF2024/06-461")).toBeInTheDocument();
    const orderCell = within(row).getByText("SO-3012").closest("td")!;
    expect(orderCell).toHaveAttribute("title", "012-3456789");
    expect(within(row).getByText("TCF2024/06-461").closest("td")).toBe(orderCell);
    expect(within(row).getByTestId("row-dots").children).toHaveLength(3);
  });

  it("a delivered order NEVER shows the red over pill (guardrail #2)", () => {
    // Past deadline + delivered → muted date only; an open order with the same
    // past deadline keeps its "over" pill.
    listHookState.data = {
      orders: [
        makeRow({
          id: "done",
          so: 7001,
          status: "delivered",
          operation_stage: "delivered",
          delivery_date: "2026-03-26",
        }),
        makeRow({ id: "live", so: 7002, delivery_date: "2026-03-26" }),
      ],
    };
    wrap(<OperationOrdersControl />);
    const rows = screen.getAllByTestId("order-row");
    const live = rows.find((r) => r.textContent?.includes("SO-7002"))!;
    const done = rows.find((r) => r.textContent?.includes("SO-7001"))!;
    expect(within(live).getByText("over")).toBeInTheDocument();
    expect(within(done).queryByText("over")).not.toBeInTheDocument();
    expect(within(done).getByText("Done")).toBeInTheDocument();
  });

  it("sorts by deadline ascending — overdue/earliest first, TBD + undated last (P3)", () => {
    listHookState.data = {
      orders: [
        makeRow({ id: "s1", so: 6001, delivery_date: "2026-07-01", placed_at: "2026-06-01T00:00:00Z" }),
        makeRow({ id: "s2", so: 6002, delivery_date: "2026-05-30", placed_at: "2026-06-02T00:00:00Z" }),
        makeRow({ id: "s3", so: 6003, delivery_date: null, placed_at: "2026-06-03T00:00:00Z" }),
        makeRow({
          id: "s4",
          so: 6004,
          delivery_date: "2026-06-20",
          delivery_date_tbd: true,
          placed_at: "2026-06-04T00:00:00Z",
        }),
        makeRow({ id: "s5", so: 6005, delivery_date: "2026-06-15", placed_at: "2026-06-05T00:00:00Z" }),
      ],
    };
    wrap(<OperationOrdersControl />);
    // Dated rows ascend (5/30 → 6/15 → 7/1); the TBD + undated tail keeps the
    // old newest-placed-first order (s4 placed 6/4 → s3 placed 6/3).
    expect(rowsBySo()).toEqual(["6002", "6005", "6001", "6004", "6003"]);
  });

  it("shows the real outstation location, NOT the word 'Outstation' — call-first flag moved into the drawer (A2/A4)", () => {
    oneRow({
      id: "r2",
      so: 3002,
      customer_address: "5, Lorong Y, Georgetown, Penang",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("Penang")).toBeInTheDocument();
    expect(within(row).queryByText("Outstation")).not.toBeInTheDocument();
    // The "Call before PO" flag is no longer in the LIST — the call-first action
    // now lives inside the order drawer (Jess 2026-06-24), keeping the row calm.
    expect(within(row).queryByText(/Call before PO/i)).not.toBeInTheDocument();
    expect(
      within(row).queryByLabelText("call customer before raising PO"),
    ).not.toBeInTheDocument();
  });

  it("shows a KV location in neutral grey (no green) with no call flag (A2/A4)", () => {
    oneRow({
      id: "r3",
      so: 3003,
      customer_address: "12, Jln X, Shah Alam, Selangor",
    });
    wrap(<OperationOrdersControl />);
    const row = screen.getByTestId("order-row");
    const loc = within(row).getByText("Selangor");
    expect(loc).toBeInTheDocument();
    // Q1 colour restraint: KV is no longer painted green — it reads neutral.
    expect(loc.className).not.toContain("text-success");
    expect(
      within(row).queryByLabelText("call customer before raising PO"),
    ).not.toBeInTheDocument();
  });

  it("labels the date column 'Deadline' and renders the date + weekday for a dated order (A3)", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    // Local-parts ISO (not toISOString/UTC) so the date is exactly 2 days out
    // regardless of the UTC offset (was flaky in MYT pre-dawn).
    const iso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    oneRow({ id: "r4", so: 3004, delivery_date: iso });
    wrap(<OperationOrdersControl />);
    // header present
    const head = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(head.map((h) => h.textContent)).toContain("Deadline");
    // Deadline is now the 8th cell (index 7: select · flag · Order ID · Ref No ·
    // Customer · Region · Logistic · Deadline) — the Logistic-ETA column was
    // removed (Jess spec 2026-07-11). date + weekday.
    const cells = within(screen.getByTestId("order-row")).getAllByRole("cell");
    expect(cells[7].textContent).not.toBe("—");
    expect(cells[7].textContent).toMatch(/\d/);
  });

  it("windows to the first 30 rows + shows the load-more sentinel (infinite scroll)", () => {
    listHookState.data = {
      orders: Array.from({ length: 120 }, (_, i) =>
        makeRow({ id: `p${i}`, so: 4000 + i }),
      ),
    };
    wrap(<OperationOrdersControl />);
    // P11: render only the first batch (30) into the DOM; the rest lazy-load as
    // the bottom sentinel scrolls into view (IntersectionObserver — not firable
    // in jsdom, so only the initial window is asserted here).
    expect(screen.getAllByTestId("order-row")).toHaveLength(30);
    expect(screen.getByText("30 of 120")).toBeInTheDocument();
    // The sentinel row advertises what's left to load.
    expect(screen.getByText(/Loading more/)).toBeInTheDocument();
  });

  it("surfaces an Unassigned-carrier alert (no-carrier count) and filters on click", () => {
    wrap(<OperationOrdersControl />);
    // Count over the full set (the default Open tab hides the completed 1007).
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*7/ }));
    // 7 orders; D has a carrier via the partner map (NETS), E has TEOW joined →
    // the other 5 have no carrier. The Unassigned chip lives in CHASE NOW
    // (Jess 2026-07-10: moved there from LOGISTIC — no carrier ⇒ chase).
    const chip = screen.getByRole("button", { name: /Unassigned/ });
    expect(chip).toHaveTextContent("5");
    fireEvent.click(chip);
    expect(screen.getAllByTestId("order-row")).toHaveLength(5);
  });

  it("gives each status chip a plain-English tooltip (legend)", () => {
    oneRow({ id: "lg", so: 5001 });
    wrap(<OperationOrdersControl />);
    const proceedChip = statusGroup().getByRole("button", { name: /Proceed/ });
    expect(proceedChip).toHaveAttribute(
      "title",
      expect.stringContaining("Confirmed"),
    );
  });

  // P11 (Gmail-style bulk header) — a partial tick offers "Select all N in
  // <tab>"; clicking it selects the whole filtered tab; the in-bar checkbox
  // stays put and unticks everything in place.
  it("offers cross-tab select-all + unticks in place from the bulk header", () => {
    wrap(<OperationOrdersControl />);
    fireEvent.click(screen.getByLabelText("Select SO-1001"));
    fireEvent.click(screen.getByLabelText("Select SO-1002"));
    fireEvent.click(screen.getByLabelText("Select SO-1003"));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    // "Select all 7 in All" — the whole tab, not just the ticked rows.
    fireEvent.click(screen.getByRole("button", { name: /Select all 7 in All/ }));
    expect(screen.getByText("7 selected")).toBeInTheDocument();
    // Banner disappears once everything is already selected.
    expect(
      screen.queryByRole("button", { name: /Select all 7/ }),
    ).not.toBeInTheDocument();

    // The header checkbox is still there (not hidden) and clears in place.
    fireEvent.click(screen.getByLabelText("Deselect all"));
    expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument();
  });
});

// ─── Orders export — bulk ⋮ menu, CSV + Print (Jess 2026-06-26, #4) ──────────
describe("orders export", () => {
  it("buildOrdersCsv — header (incl. Address) + one row per order, commas quoted", () => {
    const rows = [
      makeRow({
        id: "x",
        so: 1001,
        customer_name: "Tan Ah Kow",
        customer_phone: "012-3456789",
        customer_address: "5, Jln A, Penang",
        order_lines: [{ sku: "mattress:MAT-1", qty: 2 }],
      }),
    ];
    const csv = buildOrdersCsv(rows, new Map());
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "SO,Customer,Phone,Address,Units,Items,Deadline,Proceed,Location,Logistic,Status",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("SO-1001");
    expect(lines[1]).toContain("Tan Ah Kow");
    // Address has commas → it must be wrapped in quotes, not split into columns.
    expect(lines[1]).toContain('"5, Jln A, Penang"');
  });

  it("buildOrdersCsv — resolves the carrier name from the partner map", () => {
    const rows = [makeRow({ id: "d", so: 1004, ops_assigned_logistic: "p-nets" })];
    const csv = buildOrdersCsv(rows, new Map([["p-nets", "NETS"]]));
    expect(csv.split("\n")[1]).toContain("NETS");
  });

  it("buildOrdersPrintHtml — a titled HTML table with the Address column + escaping", () => {
    const rows = [makeRow({ id: "x", so: 1001, customer_name: "A & <B>" })];
    const html = buildOrdersPrintHtml(rows, new Map(), "Orders");
    expect(html).toContain("<title>Orders</title>");
    expect(html).toContain("<th>Address</th>");
    expect(html).toContain("SO-1001");
    expect(html).toContain("1 orders");
    // HTML-unsafe characters in the data must be escaped.
    expect(html).toContain("A &amp; &lt;B&gt;");
  });

  it("bulk Export menu (ticked rows) offers Export CSV + Print / Save as PDF", () => {
    wrap(<OperationOrdersControl />);
    // Export/print live behind the row checkboxes + the bulk-bar Export ▾ menu
    // (tick one customer → Export → Print prints just that order).
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Print \/ Save as PDF/ }),
    ).toBeInTheDocument();
  });

  it("bulk ⋮ → CSV downloads the ticked rows", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const url = URL as unknown as {
      createObjectURL?: unknown;
      revokeObjectURL?: unknown;
    };
    const origCreate = url.createObjectURL;
    const origRevoke = url.revokeObjectURL;
    url.createObjectURL = createObjectURL;
    url.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    wrap(<OperationOrdersControl />);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    click.mockRestore();
    url.createObjectURL = origCreate;
    url.revokeObjectURL = origRevoke;
  });

  it("bulk ⋮ → Print opens a print window for the ticked rows", () => {
    const fakeWin = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    };
    const open = vi
      .spyOn(window, "open")
      .mockImplementation(() => fakeWin as unknown as Window);

    wrap(<OperationOrdersControl />);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: /Print \/ Save as PDF/ }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(fakeWin.document.write).toHaveBeenCalledTimes(1);
    // the written HTML carries a ticked order's SO
    expect(fakeWin.document.write.mock.calls[0][0]).toContain("SO-");

    open.mockRestore();
  });
});

// ── C2 · nextActionOf — the single most-urgent next step per order ────────────
describe("nextActionOf (C2)", () => {
  // Local-midnight date N days from today → daysToDue returns exactly N.
  const inDays = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };
  const MS = [{ sku: "mattress:MAT-1", qty: 1 }];
  const SOFA = [{ sku: "sofa:SOF-1", qty: 1 }];

  it("completed order → Done (grey)", () => {
    const o = makeRow({ id: "x", so: 1, status: "delivered", operation_stage: "delivered" });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({ label: "Done", tone: "neutral" });
  });

  // ── Past-deadline escalation (Loo locked): overdue + partner + unbooked ──
  it("past deadline + partner assigned + unbooked → Chase logistic (ops escalation, overrides the stock track)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(-2), ops_assigned_logistic: "p1" });
    // stock is still awaiting, but the overdue unbooked delivery escalates to ops
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Chase logistic",
      tone: "danger",
    });
  });

  it("past deadline + NO partner → stays on the stock track (not Chase logistic — can't chase an unassigned logistic)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(-2) });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).not.toBe("Chase logistic");
  });

  it("past deadline + partner + No PO → Order PO (RUNG 1 not leapfrogged by the overdue escalation — SO-1104)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(-2), ops_assigned_logistic: "p1" });
    // stock.state 'unknown' = No PO → the real unblock is Order PO, not Chase logistic.
    expect(nextActionOf(o, { state: "unknown" }, MS).label).toBe("Order PO");
  });

  // ── STOCK TRACK — leads until goods are secured ──
  it("no PO (unknown stock) → Order PO (red)", () => {
    const o = makeRow({ id: "x", so: 1 });
    expect(nextActionOf(o, { state: "unknown" }, [])).toMatchObject({
      label: "Order PO",
      tone: "danger",
    });
  });

  it("PO open + inside the MS/BF window (deadline−7d) → Chase supplier (red)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(5) });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Chase supplier",
      tone: "danger",
    });
  });

  it("PO open + still outside the window → Chase supplier (amber)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(10) });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Chase supplier",
      tone: "warning",
    });
  });

  it("Sofa uses a 5-day window, not 7 (deadline−6d = amber, −3d = red)", () => {
    expect(
      nextActionOf(makeRow({ id: "x", so: 1, delivery_date: inDays(6) }), { state: "awaiting" }, SOFA).tone,
    ).toBe("warning");
    expect(
      nextActionOf(makeRow({ id: "y", so: 2, delivery_date: inDays(3) }), { state: "awaiting" }, SOFA).tone,
    ).toBe("danger");
  });

  // ── LOGISTIC TRACK — stock in, arrange delivery ──
  it("ready + no carrier → Book logistic (blue)", () => {
    const o = makeRow({ id: "x", so: 1 });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Book logistic",
      tone: "info",
    });
  });

  it("ready + carrier + no ETA → Chase logistic", () => {
    const o = makeRow({ id: "x", so: 1, ops_assigned_logistic: "p1" });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Chase logistic");
  });

  // ── CONFIRM gate — money-hold 🔒 only here (ops never schedules / calls) ──
  it("ready + carrier + ETA + paid → Confirm (green)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { logistic_eta: "2026-08-01" },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Confirm",
      tone: "success",
    });
  });

  it("ready + carrier + ETA + owing balance → Confirm, held (🔒)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { logistic_eta: "2026-08-01", balance: 2248 },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Confirm",
      locked: true,
    });
  });

  it("ready + carrier + ETA + owing storage → Confirm, held", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { logistic_eta: "2026-08-01", storage_fee_msbf: 150 },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Confirm",
      locked: true,
    });
  });

  it("ready + carrier + ETA + storage waived → Confirm, NOT held", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: {
        logistic_eta: "2026-08-01",
        storage_fee_msbf: 150,
        storage_waiver_status: "approved",
      },
    });
    const r = nextActionOf(o, { state: "ready" }, []);
    expect(r.label).toBe("Confirm");
    expect(r.locked).toBeFalsy();
  });
});

// Relative local-midnight ISO date, N days from today (daysToDue → exactly N).
const relISO = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

describe("stockEtaOf (STOCK supplier ETA — stock_eta version)", () => {
  it("no overlay → none", () => {
    expect(stockEtaOf(makeRow({ id: "x", so: 1 })).state).toBe("none");
  });

  it("all lines ready → ready, no ETA line", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_order_control: { line_stock_status: { A: "ready", B: "ready" } },
    });
    expect(stockEtaOf(o)).toMatchObject({ state: "ready", waiting: false });
  });

  it("waiting + ETA in the past → overdue", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: relISO(10),
      ops_order_control: { line_stock_status: { A: "waiting" }, line_etas: { A: relISO(-2) } },
    });
    expect(stockEtaOf(o).state).toBe("overdue");
  });

  it("waiting + ETA later than deadline−3d → late", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: relISO(5),
      ops_order_control: { line_stock_status: { A: "waiting" }, line_etas: { A: relISO(4) } },
    });
    expect(stockEtaOf(o).state).toBe("late");
  });

  it("waiting + ETA well before deadline−3d → on_track", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: relISO(10),
      ops_order_control: { line_stock_status: { A: "waiting" }, line_etas: { A: relISO(2) } },
    });
    expect(stockEtaOf(o).state).toBe("on_track");
  });

  it("waiting + no ETA entered → no_eta (Not set, never a made-up date)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_order_control: { line_stock_status: { A: "waiting" } },
    });
    expect(stockEtaOf(o)).toMatchObject({ state: "no_eta", etaIso: null });
  });

  it("latest ETA among the waiting lines wins (when the whole order can ship)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: relISO(30),
      ops_order_control: {
        line_stock_status: { A: "waiting", B: "waiting" },
        line_etas: { A: relISO(3), B: relISO(9) },
      },
    });
    expect(stockEtaOf(o).etaIso).toBe(relISO(9));
  });
});

describe("slackDays (Option B — DEADLINE-primary + bounded stock bump)", () => {
  it("completed sinks to the bottom; TBD / undated sit just above it", () => {
    expect(
      slackDays(makeRow({ id: "x", so: 1, status: "delivered", operation_stage: "delivered" })),
    ).toBe(99_999);
    expect(slackDays(makeRow({ id: "y", so: 2, delivery_date: null }))).toBe(9_000);
  });

  it("DEADLINE is the spine — a past-deadline order outranks one due tomorrow with OVERDUE stock", () => {
    const pastDeadline = makeRow({ id: "a", so: 1, delivery_date: relISO(-6) }); // slack −6
    const dueSoonStockOverdue = makeRow({
      id: "b",
      so: 2,
      delivery_date: relISO(1), // 1 − 5 bump = −4
      ops_order_control: { line_stock_status: { A: "waiting" }, line_etas: { A: relISO(-1) } },
    });
    expect(slackDays(pastDeadline)).toBeLessThan(slackDays(dueSoonStockOverdue));
  });

  it("stock risk is a BOUNDED bump: overdue −5, late/no-eta −3, ready/none 0", () => {
    const at = (extra: Partial<operationOrderListRow>) =>
      slackDays(makeRow({ id: "x", so: 1, delivery_date: relISO(10), ...extra }));
    expect(at({})).toBe(10); // no stock data → no bump
    expect(
      at({ ops_order_control: { line_stock_status: { A: "waiting" }, line_etas: { A: relISO(-1) } } }),
    ).toBe(5); // overdue → −5
    expect(at({ ops_order_control: { line_stock_status: { A: "waiting" } } })).toBe(7); // no-eta → −3
  });
});

describe("logisticStateOf (LOGISTIC delivery state machine)", () => {
  const pn = new Map<string, string>();

  it("completed → delivered", () => {
    const o = makeRow({ id: "x", so: 1, status: "delivered", operation_stage: "delivered" });
    expect(logisticStateOf(o, pn).key).toBe("delivered");
  });

  it("committed delivery date → scheduled (+ the date)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      ops_order_control: { logistic_eta: "2026-08-01" },
    });
    expect(logisticStateOf(o, pn)).toMatchObject({ key: "scheduled", date: "2026-08-01" });
  });

  it("no partner → unassigned", () => {
    expect(logisticStateOf(makeRow({ id: "x", so: 1 }), pn).key).toBe("unassigned");
  });

  it("partner + no date + inside the ≤3-day window → call_now", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      delivery_date: relISO(2),
    });
    expect(logisticStateOf(o, pn).key).toBe("call_now");
  });

  it("partner + no date + still early → no_date", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      delivery_date: relISO(10),
    });
    expect(logisticStateOf(o, pn).key).toBe("no_date");
  });
});
