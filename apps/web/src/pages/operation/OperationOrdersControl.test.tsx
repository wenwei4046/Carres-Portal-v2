import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperationOrdersControl, {
  buildOrdersCsv,
  buildOrdersPrintHtml,
  catQty,
  nextActionOf,
  openActionsOf,
  stockEtaOf,
  stockReadiness,
  orderHasPurchaseOrder,
  slackDays,
  logisticStateOf,
  rowDotsOf,
  isImportedArchive,
} from "./OperationOrdersControl";
import type {
  StockInfo,
  StockEta,
  LogisticState,
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
  default: ({
    orderId,
    onClose,
    journey,
  }: {
    orderId: string;
    onClose: () => void;
    // J3 — serialised onto the stub so a test can prove the list hands the
    // drawer the LADDER's own answer rather than a second derivation.
    journey?: unknown;
  }) => (
    <div
      data-testid="drawer-stub"
      data-order-id={orderId}
      data-journey={journey ? JSON.stringify(journey) : ""}
    >
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
    expect(g.getByRole("button", { name: /To book\s*1/ })).toBeInTheDocument();
    expect(g.getByRole("button", { name: /Customer confirmed\s*2/ })).toBeInTheDocument();
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
    clickStatus("Customer confirmed");
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
    clickStatus("To book"); // order d has ops_assigned_logistic=p-nets
    const row = screen.getAllByTestId("order-row")[0];
    expect(within(row).getByText("NETS")).toBeInTheDocument();
  });

  it("shows the formal joined LP name on scheduled orders", () => {
    wrap(<OperationOrdersControl />);
    clickStatus("Customer confirmed");
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

  // ── J3 — the journey strip cannot disagree with the row it came from ──
  // The list computes the ladder ONCE and hands the result down, so these
  // assertions are the whole "the strip agrees with the ladder/queues for the
  // same order, always" guarantee: what the drawer receives IS `nextActionOf`.
  it("hands the drawer the SAME verb the row's MANAGE pill shows", () => {
    // Asserted against the RENDERED row, not against a re-run of the ladder:
    // if these two ever diverge the drawer is lying about the row it opened.
    wrap(<OperationOrdersControl />);
    // The list UNMOUNTS when the drawer opens (it renders in place), so every
    // row node must be re-queried after each close — a cached node is detached.
    const total = screen.getAllByTestId("order-row").length;
    let checked = 0;
    for (let i = 0; i < total; i++) {
      const row = screen.getAllByTestId("order-row")[i];
      const pill = row.querySelector("[data-next-action]");
      if (!pill) continue;
      const rowVerb = pill.getAttribute("data-next-action");
      fireEvent.click(row);
      const stub = screen.queryByTestId("drawer-stub");
      if (!stub) continue; // row click consumed by an in-row control
      const journey = JSON.parse(stub.getAttribute("data-journey") || "null");
      expect(journey).not.toBeNull();
      expect(journey.next.label).toBe(rowVerb);
      checked += 1;
      fireEvent.click(screen.getByText("close"));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("tells the drawer the photo answer is UNKNOWN rather than 'no photo'", () => {
    // T7's three-way law travels intact: a row whose overlay does not carry the
    // ledger must not make the strip accuse anyone of a missing photo.
    wrap(<OperationOrdersControl />);
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1003"))!;
    fireEvent.click(row);
    const journey = JSON.parse(
      screen.getByTestId("drawer-stub").getAttribute("data-journey") || "null",
    );
    expect(journey.photoOnFile).toBeNull();
  });

  it("reports no PayHold amount when no balance is on record", () => {
    // Live prod shape: ops_order_control.balance is NULL on every order, so the
    // ladder's 🔒 never fires and the strip must not invent a settled figure.
    wrap(<OperationOrdersControl />);
    const row = screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes("SO-1003"))!;
    fireEvent.click(row);
    const journey = JSON.parse(
      screen.getByTestId("drawer-stub").getAttribute("data-journey") || "null",
    );
    expect(journey.holdAmount).toBeNull();
    expect(journey.next.locked).toBeFalsy();
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

/* ───────────────────────────────────────────────────────────────────────────
 * S1 (2026-08-07) — the list renders through `kit/DataTable`.
 *
 * Two guards, and both exist because S1 replaced something that could not go
 * wrong quietly with something that can. The other 150-odd tests in this file
 * are the migration's real proof: they assert what an operator sees, they were
 * written against the hand-written table, and they were not touched.
 * ────────────────────────────────────────────────────────────────────────── */
describe("OperationOrdersControl · S1 · the kit renders the table", () => {
  it("budgets the whole table — a list grid never scrolls sideways (§7)", () => {
    listHookState.data = { orders: [makeRow({ id: "w1", so: 9001 })] };
    wrap(<OperationOrdersControl />);
    const cols = Array.from(screen.getByRole("table").querySelectorAll("col")).map(
      (c) => (c as HTMLElement).style.width,
    );
    expect(cols).toHaveLength(10); // select + Follow-up + the 8 business columns

    // `Follow-up` is the ONE column sized in PIXELS, and that is load-bearing:
    // its header is a WORD of fixed width, a `th` wraps rather than ellipsises,
    // and a percentage of a table that changes width cannot protect it. This
    // shipped as a percentage first and wrapped in a real browser the moment
    // the nav was expanded (850px table). jsdom has no layout, so no unit test
    // can catch the wrap — it can only pin the pixel that prevents it.
    expect(cols[1]).toBe("72px");

    // Everything else is a share of the table, and the shares must land on the
    // whole: over it, the browser renormalises every column and C14's measured
    // widths stop meaning anything; under it, `table-fixed` hands the slack
    // back out and does the same. 72px is 7.11% of C14's 1012px reference.
    const pct = cols.filter((w) => w.endsWith("%")).map(Number.parseFloat);
    expect(pct).toHaveLength(9);
    expect(pct.reduce((a, b) => a + b, 0)).toBeCloseTo(100 - (72 / 1012) * 100, 6);
  });

  it("persists no column shape — F58's localStorage key died with the hand-written table", () => {
    // Loo ruled it on 2026-08-04 (grid-findings F61): "no page may persist
    // column order, width or visibility". The kit's own guard (grid-powers,
    // rule L) scans only the kit, so F58 was invisible to it — this asserts it
    // from the page's side, which is where the violation actually lived.
    const wrote: string[] = [];
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((k: string) => void wrote.push(k));
    listHookState.data = { orders: [makeRow({ id: "w2", so: 9002 })] };
    wrap(<OperationOrdersControl />);
    expect(localStorage.getItem("carres.orders.hiddenCols")).toBeNull();
    expect(wrote).not.toContain("carres.orders.hiddenCols");
    spy.mockRestore();
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
    // ONE header row (10 columns). C rebuild (Jess 2026-07-18): the 三线点
    // Status dots lead; SO+Ref merge into Order, Customer absorbs Region
    // (caption line), LOGISTIC became Delivery (truth-ladder words) and the
    // "Actions" pills close the row.
    //
    // S1 (2026-08-07) — the follow-up column's header is a WORD, not the flag
    // icon it carried while this page hand-wrote its own `<th>`. `Column.label`
    // is a `string` in `kit/DataTable` (and in every grid engine measured for
    // card 01), so no column here can be headed by a picture. The word is the
    // QUEUES rail's own — `Follow-up`, §3 — so the rail row and the column say
    // one thing once. The CELL is unchanged and still icon-only.
    const head = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(head.map((h) => h.textContent)).toEqual([
      "", // select-all checkbox
      "Follow-up",
      "Status",
      "Order",
      "Customer",
      "Deadline", // right after Customer (Jess 2026-07-18)
      "Stock",
      "Delivery",
      "PIC", // staff owner — its own column (Jess 2026-07-18)
      "Actions", // every action as a tone-coloured pill (Jess 2026-07-19/27)
    ]);
    // SO (emphasis) + Ref (caption) share the Order cell; the phone tooltip
    // stays with those two lines; the Status cell names the pipeline STAGE in
    // words.
    const row = screen.getByTestId("order-row");
    expect(within(row).getByText("SO-3012")).toBeInTheDocument();
    expect(within(row).getByText("Tan Ah Kow")).toBeInTheDocument();
    expect(within(row).getByText("TCF2024/06-461")).toBeInTheDocument();
    const orderCell = within(row).getByText("SO-3012").closest("td")!;
    expect(within(row).getByText("TCF2024/06-461").closest("td")).toBe(orderCell);
    // S1 — the phone tooltip hangs on the two-line BLOCK, not on the `<td>`:
    // the kit owns the cell and offers no per-cell `title`, and a tooltip
    // belongs to the thing it describes rather than to the padding around it.
    // What matters to an operator is unchanged — hover the SO number, read the
    // phone — so that is what this asserts.
    expect(within(row).getByText("SO-3012").closest("[title]")).toHaveAttribute(
      "title",
      "012-3456789",
    );
    // Status (Jess 2026-07-19): the Status cell shows the STAGE word (same
    // vocabulary as the tabs). A native placed order reads "Placed" as a pill.
    const stagePill = within(row).getByText("Placed");
    expect(stagePill).toBeInTheDocument();
    expect(stagePill.className).toContain("pill");
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
    // Delivered = closed → the Manage cell is BLANK (no "Done" pill): the STATUS
    // column already says Delivered (Jess 2026-07-19). The live order DOES carry
    // a Manage action.
    expect(within(done).queryByText("Done")).not.toBeInTheDocument();
    expect(within(done).queryByRole("button", { name: /Chase|Order PO|Assign|Confirm|Collect/ })).not.toBeInTheDocument();
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
    // Deadline sits right after Customer (Jess 2026-07-18): index 5 —
    // select · flag · Status dots · Order · Customer · Deadline.
    const cells = within(screen.getByTestId("order-row")).getAllByRole("cell");
    expect(cells[5].textContent).not.toBe("—");
    expect(cells[5].textContent).toMatch(/\d/);
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
    // The toolbar "N of M" counter is gone (Jess 2026-07-18 — it duplicated
    // the footer count); the sentinel row advertises what's left to load.
    expect(screen.getByText(/Loading more… \(30 of 120\)/)).toBeInTheDocument();
  });

  it("QUEUES speaks the NEXT verbs — a verb row filters to exactly its count (C-vocab)", () => {
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*7/ }));
    // C-vocab (Jess 2026-07-19): queue rows ARE the actions — one vocabulary
    // across QUEUES · the Actions column · the drawer. The BANNED words never
    // render (C1, 2026-07-27); a rendered row's count = the open rows whose
    // action it names, and clicking it filters the table to exactly those.
    expect(screen.queryByRole("button", { name: /Chase/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Order PO/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Waiting stock/ })).toBeNull();
    // Locate queue rows via their unique tooltips (per-row action pills also
    // carry a matching accessible name — the title disambiguates).
    // T7 moved the two delivery actions into their own DELIVERY group (with
    // their own deadlines) — they are covered by the DELIVERY-queue tests
    // below, so this list is the STOCK actions that stayed in QUEUES.
    // `Send PO` and `Prepare PO` are both retired; the first tooltip is the ONE
    // purchasing act's, and the second no longer says a retired verb either.
    const verbTitles = [
      "Nothing ordered and no purchase order covers these goods — issue one, which mints the PO number and the document the supplier receives",
      "PO issued but goods not in yet — call the supplier for the ready date (red once inside the stock window)",
    ];
    const row = verbTitles.map((t) => screen.queryByTitle(t)).find((b) => !!b);
    expect(row).toBeTruthy();
    const count = Number((row!.textContent ?? "").replace(/[^0-9]/g, ""));
    expect(count).toBeGreaterThan(0);
    fireEvent.click(row!);
    expect(screen.getAllByTestId("order-row")).toHaveLength(count);
  });

  it("QUEUES gains the T3 delay-radar row — count matches NEXT, click filters, completed never counts", () => {
    listHookState.data = {
      orders: [
        // Open order whose latest stock ETA overshoots the customer date.
        makeRow({
          id: "dr1",
          so: 1301,
          delivery_date: relISO(10),
          order_lines: [{ sku: "mattress:MAT-1", qty: 1, source_po: "PO/1" }],
          ops_order_control: {
            line_stock_status: { "mattress:MAT-1": "waiting" },
            line_etas: { "mattress:MAT-1": relISO(14) },
          },
        }),
        // Delivered twin with the same overshoot — guardrail #2: never counted.
        makeRow({
          id: "dr2",
          so: 1302,
          status: "delivered",
          operation_stage: "delivered",
          delivery_date: relISO(10),
          order_lines: [{ sku: "mattress:MAT-1", qty: 1, source_po: "PO/1" }],
          ops_order_control: {
            line_stock_status: { "mattress:MAT-1": "waiting" },
            line_etas: { "mattress:MAT-1": relISO(14) },
          },
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*2/ }));
    // C8 — the tooltip used to end "call the customer now", which is the one
    // thing Law 4 rung 2 forbids. The queue is the DECISION now.
    const row = screen.getByTitle(
      "Supplier date lands after the promised date — decide before anyone calls (Delay planning)",
    );
    expect(Number((row.textContent ?? "").replace(/[^0-9]/g, ""))).toBe(1);
    fireEvent.click(row);
    expect(rowsBySo()).toEqual(["1301"]);
  });

  // ── C8b · the two delay clocks (Loo 2026-07-28) ────────────────────────────
  // `Delay planning` gets 2 working days from the day the supplier's date first
  // overshot the promise; the logistics call gets the SAME working day from the
  // moment Operations recorded that the promise cannot be met. Both on the
  // OFFICE calendar. The facet says so the same way every other deadline on
  // this page does: the "· N late" tail.
  const delayOvershoot = (
    id: string,
    so: number,
    control: Record<string, unknown>,
  ) =>
    makeRow({
      id,
      so,
      delivery_date: relISO(10),
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, source_po: "PO/1" }],
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": relISO(14) },
        ...control,
      },
    });

  it("Delay planning past its 2 working days reads '· N late' by itself", () => {
    listHookState.data = {
      orders: [
        // Sighted a fortnight ago — two office working days are long gone.
        delayOvershoot("dp-late", 1501, {
          delay_detected_at: `${relISO(-14)}T09:00:00+08:00`,
          delay_detected_eta: relISO(14),
        }),
        // Sighted TODAY: due today, and an action due today is never late today.
        delayOvershoot("dp-fresh", 1502, {
          delay_detected_at: `${relISO(0)}T09:00:00+08:00`,
          delay_detected_eta: relISO(14),
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*2/ }));
    const row = screen.getByTitle(/decide before anyone calls/);
    expect(row.textContent).toContain("2 · 1 late");
    expect(row.getAttribute("title")).toContain("1 of 2 already past that deadline");
  });

  it("a sighting about a DIFFERENT supplier date carries no deadline at all", () => {
    listHookState.data = {
      orders: [
        // The factory slipped AGAIN: the stamp names the date it was made about
        // (0305's pair), and that is no longer the date the ladder is reading.
        // Silence beats dating this delay from a sighting of the last one.
        delayOvershoot("dp-stale", 1511, {
          delay_detected_at: `${relISO(-14)}T09:00:00+08:00`,
          delay_detected_eta: relISO(12),
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*1/ }));
    const row = screen.getByTitle(/decide before anyone calls/);
    expect(row.textContent).not.toContain("late");
  });

  it("the logistics call is late the working day after the decision, not before", () => {
    listHookState.data = {
      orders: [
        delayOvershoot("an-late", 1521, {
          delay_decision: "new_date",
          delay_decision_eta: relISO(14),
          delay_decision_at: `${relISO(-14)}T16:30:00+08:00`,
        }),
        // Decided today — due TODAY, which is not late today.
        delayOvershoot("an-fresh", 1522, {
          delay_decision: "new_date",
          delay_decision_eta: relISO(14),
          delay_decision_at: `${relISO(0)}T16:30:00+08:00`,
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*2/ }));
    const row = screen.getByTitle(/logistics arranges the new date/);
    expect(row.textContent).toContain("2 · 1 late");
  });

  it("no stamp, no deadline — the delay queues stay quiet instead of crying wolf", () => {
    listHookState.data = {
      orders: [
        // A pre-0305 Worker selects neither stamp. The queue still holds the
        // order; what it may not do is call it late on no evidence.
        delayOvershoot("dp-nostamp", 1531, {}),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*1/ }));
    const row = screen.getByTitle(/decide before anyone calls/);
    expect(row.textContent).not.toContain("late");
  });

  // ── T7 · DELIVERY queues + auto-overdue ────────────────────────────────────
  // The delivery lifecycle is its own facet group, each row carrying its own
  // deadline so an item turns late by itself.
  it("DELIVERY group holds the four delivery queues, and each count equals its NEXT verb", () => {
    listHookState.data = {
      orders: [
        // Stock ready, no carrier → Assign logistic. Date 10d out = NOT late.
        makeRow({
          id: "q1",
          so: 1401,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(10),
        }),
        // Carrier assigned, customer not confirmed → Chase logistic.
        makeRow({
          id: "q2",
          so: 1402,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(10),
          delivery_partners: { id: "p-nets", name: "NETS" },
        }),
        // Customer confirmed for TODAY → Deliver today.
        makeRow({
          id: "q3",
          so: 1403,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(0),
          delivery_partners: { id: "p-nets", name: "NETS" },
          ops_order_control: {
            booking_stage: "confirmed",
            confirmed_date: relISO(0),
            confirmed_time_slot: "Morning (9–11 AM)",
          },
        }),
        // Delivered with an EMPTY photo ledger → Upload delivery photo.
        makeRow({
          id: "q4",
          so: 1404,
          status: "delivered",
          operation_stage: "delivered",
          delivered_at: relISO(-1),
          ops_order_control: { delivery_photos: [] },
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*4/ }));
    const g = within(screen.getByTestId("filter-delivery"));
    for (const label of [
      "Assign logistics",
      "Confirm delivery date",
      "Deliver today",
      "Upload delivery photo",
    ]) {
      const row = g.getByRole("button", { name: new RegExp(label) });
      expect(row.textContent).toMatch(/1$/); // one order each, none late
    }
  });

  it("a step past its OWN deadline reads '· N late' without anyone watching", () => {
    listHookState.data = {
      orders: [
        // Stock ready, no carrier, customer date is TOMORROW — assign was due 3
        // working days ago, so this row is late on its own.
        makeRow({
          id: "late1",
          so: 1411,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(1),
        }),
        // Same queue, date far out → not late. Count 2, late 1.
        makeRow({
          id: "ok1",
          so: 1412,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(30),
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*2/ }));
    const row = within(screen.getByTestId("filter-delivery")).getByRole("button", {
      name: /Assign logistics/,
    });
    expect(row.textContent).toContain("2 · 1 late");
    expect(row.getAttribute("title")).toContain("1 of 2 already past that deadline");
  });

  it("a TBD customer date is never late (silence beats a false alarm)", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "tbd1",
          so: 1421,
          status: "proceed_order",
          operation_stage: "ready_to_dispatch",
          delivery_date: relISO(1),
          delivery_date_tbd: true,
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*1/ }));
    const row = within(screen.getByTestId("filter-delivery")).getByRole("button", {
      name: /Assign logistics/,
    });
    expect(row.textContent).not.toContain("late");
  });

  it("the photo queue spans DELIVERED orders — clicking it keeps them in the table", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "p1",
          so: 1431,
          status: "delivered",
          operation_stage: "delivered",
          delivered_at: relISO(-1),
          ops_order_control: { delivery_photos: [] },
        }),
        // Delivered WITH proof — Done, never in the queue.
        makeRow({
          id: "p2",
          so: 1432,
          status: "delivered",
          operation_stage: "delivered",
          delivered_at: relISO(-1),
          ops_order_control: {
            delivery_photos: [{ path: "order/p2/a.jpg", at: relISO(-1), by: null }],
          },
        }),
      ],
    };
    wrap(<OperationOrdersControl />);
    fireEvent.click(statusGroup().getByRole("button", { name: /All\s*2/ }));
    const row = within(screen.getByTestId("filter-delivery")).getByRole("button", {
      name: /Upload delivery photo/,
    });
    expect(row.textContent).toMatch(/1$/);
    fireEvent.click(row);
    expect(rowsBySo()).toEqual(["1431"]);
  });

  it("the DELIVERY group hides entirely when there is no delivery work", () => {
    listHookState.data = {
      orders: [
        // No PO raised → the stock track owns this row; nothing delivery-side,
        // and it has a carrier so it isn't Unassigned either.
        makeRow({
          id: "s1",
          so: 1441,
          status: "proceed_order",
          operation_stage: "in_production",
          delivery_date: relISO(10),
          delivery_partners: { id: "p-nets", name: "NETS" },
          order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
        }),
      ],
    };
    stockHookState = { data: stockResponse([{ sku: "other", available: 0 }]) };
    wrap(<OperationOrdersControl />);
    expect(screen.queryByTestId("filter-delivery")).toBeNull();
  });

  // C2 — the `To book` predicate now matches its own word (found by C1).
  // The old split also demanded stock be IN, so an order whose customer had
  // already confirmed a date sat in `To book` with nothing left to book.
  it("a customer-confirmed order sits in Customer confirmed even while its goods are out", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "t1",
          so: 1451,
          status: "proceed_order",
          operation_stage: "in_production",
          delivery_date: relISO(10),
          delivery_partners: { id: "p-nets", name: "NETS" },
          order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
          ops_order_control: {
            booking_stage: "confirmed",
            confirmed_date: relISO(6),
            confirmed_time_slot: "Morning (9–11 AM)",
          },
        }),
      ],
    };
    // A live stock snapshot that covers NONE of the order's SKUs → goods out.
    stockHookState = { data: stockResponse([{ sku: "other", available: 0 }]) };
    wrap(<OperationOrdersControl />);
    clickStatus("Customer confirmed");
    expect(rowsBySo()).toEqual(["1451"]);
    clickStatus("To book");
    expect(screen.queryAllByTestId("order-row")).toHaveLength(0);
  });

  it("a provisional logistics date is NOT a booking — that order stays in To book", () => {
    listHookState.data = {
      orders: [
        makeRow({
          id: "t2",
          so: 1452,
          status: "proceed_order",
          operation_stage: "in_production",
          delivery_date: relISO(10),
          delivery_partners: { id: "p-nets", name: "NETS" },
          order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
          ops_order_control: {
            booking_stage: "provisional",
            logistic_eta: relISO(6),
          },
        }),
      ],
    };
    stockHookState = { data: stockResponse([{ sku: "other", available: 0 }]) };
    wrap(<OperationOrdersControl />);
    clickStatus("To book");
    expect(rowsBySo()).toEqual(["1452"]);
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
      "SO,Customer,Phone,Address,Units,Items,Deadline,Proceed,Location,Logistics,Status",
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
    // Export/print live behind the row checkboxes + the bulk-bar More ▾ menu
    // (tick one customer → More → Print prints just that order).
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: /Export CSV/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Print \/ Save as PDF/ }),
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
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Export CSV/ }));

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
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Print \/ Save as PDF/ }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(fakeWin.document.write).toHaveBeenCalledTimes(1);
    // the written HTML carries a ticked order's SO
    expect(fakeWin.document.write.mock.calls[0][0]).toContain("SO-");

    open.mockRestore();
  });

  it("bulk Logistics ⋮ → Call opens the logistics message review", () => {
    wrap(<OperationOrdersControl />);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    // Option B: counterparty menus, not verb buttons — open Logistics ⋮ first.
    fireEvent.click(screen.getByRole("button", { name: "Logistics" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Call logistics — confirm delivery date/ }),
    );
    expect(screen.getByTestId("chase-partner-review")).toBeInTheDocument();
  });

  it("bulk Supplier ⋮ → Call opens the supplier message review", () => {
    wrap(<OperationOrdersControl />);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Supplier" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Call suppliers — confirm ready date/ }),
    );
    expect(screen.getByTestId("chase-supplier-review")).toBeInTheDocument();
  });

  it("DEADLINE band is multi-select — two buckets can be active at once (B redesign)", () => {
    wrap(<OperationOrdersControl />);
    const grp = within(screen.getByTestId("filter-deadline"));
    // C14 — the band's buckets are the three FUTURE windows now; `Overdue`
    // moved to its one home in QUEUES, so this reads over two survivors.
    const dueSoon = grp.getByRole("button", { name: /^Due ≤3d/ });
    const nextWeek = grp.getByRole("button", { name: /^Next week/ });
    fireEvent.click(dueSoon);
    fireEvent.click(nextWeek);
    expect(dueSoon).toHaveAttribute("aria-pressed", "true");
    expect(nextWeek).toHaveAttribute("aria-pressed", "true");
    // A second click clears just that one (still multi, independent).
    fireEvent.click(dueSoon);
    expect(dueSoon).toHaveAttribute("aria-pressed", "false");
    expect(nextWeek).toHaveAttribute("aria-pressed", "true");
  });

  it("the DEADLINE band holds only future windows — Overdue is not one of them (C14)", () => {
    wrap(<OperationOrdersControl />);
    const grp = within(screen.getByTestId("filter-deadline"));
    // The group's own collapse toggle is a button too; the PILLS are the ones
    // that carry a trailing count.
    const pills = grp
      .getAllByRole("button")
      .map((b) => b.textContent?.trim() ?? "")
      .filter((t) => /\d$/.test(t));
    expect(pills).toEqual(["Due ≤3d 0", "This week 0", "Next week 0"]);
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
      label: "Confirm delivery date",
      tone: "danger",
    });
  });

  it("past deadline + NO partner → stays on the stock track (not Chase logistic — can't chase an unassigned logistic)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(-2) });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).not.toBe("Confirm delivery date");
  });

  it("past deadline + partner + No PO → Order PO (RUNG 1 not leapfrogged by the overdue escalation — SO-1104)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(-2), ops_assigned_logistic: "p1" });
    // stock.state 'unknown' = No PO → the real unblock is Order PO, not Chase logistic.
    expect(nextActionOf(o, { state: "unknown" }, MS).label).toBe("Issue PO");
  });

  // ── STOCK TRACK — leads until goods are secured ──
  it("no PO (unknown stock) → Order PO (red)", () => {
    const o = makeRow({ id: "x", so: 1 });
    expect(nextActionOf(o, { state: "unknown" }, [])).toMatchObject({
      label: "Issue PO",
      tone: "danger",
    });
  });

  it("PO open + inside the MS/BF window (deadline−7d) → Chase supplier (red)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(5) });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Confirm ready date",
      tone: "danger",
    });
  });

  it("PO open + still outside the window → Chase supplier (amber)", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: inDays(10) });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Confirm ready date",
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

  // ── T3 · Delay Radar — catch the miss BEFORE the window ──
  it("stock ETA overshoots the customer date (date still future) → Delay planning (red)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(14) },
      },
    });
    // Without the radar this would be the supplier call (amber) — the radar
    // outranks it: calling the supplier can no longer save the date.
    //
    // C8 — and what it opens is a DECISION, not a call. Nobody is phoned until
    // Operations has answered "can we still make the promised date?"; before
    // this card the radar opened `Call {customer} — agree new delivery date`
    // on the spot, which Law 4 rung 2 forbids twice over.
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Delay planning",
      tone: "danger",
    });
  });

  it("C8 · the decision is what opens the logistics call — and only the NO answer", () => {
    const withDecision = (decision: "keep" | "new_date" | null) =>
      makeRow({
        id: "x",
        so: 1,
        delivery_date: inDays(10),
        ops_order_control: {
          line_stock_status: { "mattress:MAT-1": "waiting" },
          line_etas: { "mattress:MAT-1": inDays(14) },
          ...(decision
            ? { delay_decision: decision, delay_decision_eta: inDays(14) }
            : {}),
        },
      });
    // YES — solved internally. The customer is never told, and the goods track
    // carries on with the ordinary supplier call, which is the truth.
    expect(
      nextActionOf(withDecision("keep"), { state: "awaiting" }, MS).label,
    ).toBe("Confirm ready date");
    // NO — and the row names LOGISTICS, never the customer.
    const no = nextActionOf(withDecision("new_date"), { state: "awaiting" }, MS);
    expect(no.label).toBe("Arrange new delivery date");
    // A decision taken about an OLDER supplier date silences nothing.
    const slippedAgain = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(20) },
        delay_decision: "keep",
        delay_decision_eta: inDays(14),
      },
    });
    expect(nextActionOf(slippedAgain, { state: "awaiting" }, MS).label).toBe(
      "Delay planning",
    );
  });

  it("stock ETA still makes the date (even inside the buffer) → stays Chase supplier, radar silent", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(9) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Confirm ready date");
  });

  it("stock ETA exactly ON the date → not a delay (strict overshoot only)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(10) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Confirm ready date");
  });

  it("waiting stock with NO ETA → Chase supplier, never stock delay (radar needs a real ETA)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: { line_stock_status: { "mattress:MAT-1": "waiting" } },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Confirm ready date");
  });

  it("delivered order with an overshooting ETA → Done (guardrail #2 — completed never alarms)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      status: "delivered",
      operation_stage: "delivered",
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(14) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Done",
      tone: "neutral",
    });
  });

  it("Master says all lines Ready → radar can't fire (goods secured, logistic track)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "ready" },
        line_etas: { "mattress:MAT-1": inDays(14) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Assign logistics");
  });

  it("No PO + overshooting ETA → Order PO (RUNG 1 not leapfrogged by the radar)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(14) },
      },
    });
    expect(nextActionOf(o, { state: "unknown" }, MS).label).toBe("Issue PO");
  });

  it("TBD delivery date → radar silent (no date to overshoot)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(10),
      delivery_date_tbd: true,
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(14) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Confirm ready date");
  });

  it("past deadline + partner + waiting stock + overshooting ETA → Chase logistic stays (locked escalation not overridden)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(-2),
      ops_assigned_logistic: "p1",
      ops_order_control: {
        line_stock_status: { "mattress:MAT-1": "waiting" },
        line_etas: { "mattress:MAT-1": inDays(5) },
      },
    });
    expect(nextActionOf(o, { state: "awaiting" }, MS)).toMatchObject({
      label: "Confirm delivery date",
      tone: "danger",
    });
  });

  // ── LOGISTIC TRACK — stock in, arrange delivery ──
  it("ready + no carrier → Assign logistic (blue)", () => {
    const o = makeRow({ id: "x", so: 1 });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Assign logistics",
      tone: "info",
    });
  });

  it("ready + carrier + no ETA → Chase logistic", () => {
    const o = makeRow({ id: "x", so: 1, ops_assigned_logistic: "p1" });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Confirm delivery date");
  });

  it("Master says Ready (line_stock_status) → logistic track, NOT Chase supplier (#5 fix)", () => {
    // The AutoCount SKU misses the catalog so stockReadiness = "awaiting", but
    // the Master import marked every line ready → NEXT must follow the STOCK
    // column and move to the logistic track (Assign logistic here), not stay on
    // "Chase supplier" (Jess 2026-07-19 #5).
    const o = makeRow({
      id: "x",
      so: 1,
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, source_po: "PO/1" }],
      ops_order_control: { line_stock_status: { "mattress:MAT-1": "ready" } },
    });
    // stock arg = the awaiting SKU-mismatch signal the row would pass.
    expect(nextActionOf(o, { state: "awaiting" }, MS).label).toBe("Assign logistics");
  });

  // ── CONFIRM gate — money-hold 🔒 only here (ops never schedules / calls) ──
  // T1 (0277): the gate opens on the CUSTOMER's confirmation, never on the
  // carrier's provisional logistic_eta alone.
  // Relative, NOT a fixed calendar date: T7 splits a confirmed booking by its
  // date (today → Deliver today · passed → Chase logistic), so a hardcoded
  // "2026-08-01" would silently start testing a different rung once that day
  // passed. inDays(6) keeps this fixture "confirmed for a future day" forever.
  const BOOKED = {
    logistic_eta: inDays(6),
    booking_stage: "confirmed" as const,
    confirmed_date: inDays(6),
    confirmed_time_slot: "Morning (9–11 AM)",
  };
  /** C7 — a trip whose PAPER exists. The `Delivering` FACT means "nothing for
   *  a human to do", and until the delivery order is issued there is still one
   *  thing: issuing it. So every FACT fixture below carries a DO number, and
   *  the one that does not is C7's own test. */
  const ISSUED = { do_number: "DO-270726-4821" };

  it("ready + carrier + provisional carrier date only → STILL Chase logistic (not Confirm)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { logistic_eta: "2026-08-01", booking_stage: "provisional" },
    });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Confirm delivery date");
  });

  it("past deadline + partner + provisional date → Chase logistic (red) — carrier's word doesn't clear the escalation", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_date: inDays(-2),
      ops_assigned_logistic: "p1",
      ops_order_control: { logistic_eta: inDays(1), booking_stage: "provisional" },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Confirm delivery date",
      tone: "danger",
    });
  });

  // C3 (Jess 2026-07-27) — "everything ready, the day has not come" stopped
  // being an action: it was the one row in the drawer no button could close.
  // The ladder answers with the quiet FACT instead, and `Deliver today` takes
  // over on the day.
  it("ready + carrier + customer confirmed + paid + DO issued → the Delivering FACT, quiet", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ...ISSUED,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Delivering",
      tone: "neutral",
    });
    // Never red, and never an action: the drawer's list is EMPTY for this row.
    expect(openActionsOf(o, { state: "ready" }, [])).toEqual([]);
  });

  it("ready + carrier + customer confirmed + owing balance → Collect, held (🔒)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, balance: 2248 },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Collect",
      locked: true,
    });
  });

  // ── C5 · the money hold reads the number that exists ──────────────────────
  // Until 2026-07-27 this 🔒 read `ops_order_control.balance`, NULL on all 55
  // live control rows, so it had never fired for a single order while 18 of
  // them owed RM 56,859. It now reads the shared `orderMoney` — the priced
  // lines against `orders.paid` — the SAME rule the server's booking gate asks.

  it("SO-1256's shape: priced lines with a 50% deposit → held (🔒)", () => {
    const o = makeRow({
      id: "x",
      so: 1256,
      ops_assigned_logistic: "p1",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 3998 }],
      order_addons: [{ qty: 1, unit_price: 250 }],
      paid: 2124,
      ops_order_control: { ...BOOKED },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Collect",
      locked: true,
    });
  });

  it("SO-1209's shape: paid in full → NOT held, and the day is simply ahead", () => {
    // The live false-block. RM 6,998 + RM 250 of add-ons, `orders.paid`
    // RM 7,248, balance NULL. Nothing may hold this delivery.
    const o = makeRow({
      id: "x",
      so: 1209,
      ...ISSUED,
      ops_assigned_logistic: "p1",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 6998 }],
      order_addons: [{ qty: 1, unit_price: 250 }],
      paid: 7248,
      ops_order_control: { ...BOOKED },
    });
    const r = nextActionOf(o, { state: "ready" }, []);
    expect(r.label).toBe("Delivering");
    expect(r.locked).toBeFalsy();
  });

  it("an unpriced import with no keyed balance is UNKNOWN — unknown never holds", () => {
    // SO-1221's shape. Nobody has said what it is worth, so it cannot owe a
    // figure; the 37 imported archive rows must not all lock overnight.
    const o = makeRow({
      id: "x",
      so: 1221,
      ops_assigned_logistic: "p1",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
      paid: 1300,
      ops_order_control: { ...BOOKED },
    });
    expect(nextActionOf(o, { state: "ready" }, []).locked).toBeFalsy();
  });

  it("priced lines beat a stale keyed balance — a paid order is never held by an old number", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }],
      paid: 4000,
      ops_order_control: { ...BOOKED, balance: 5000 },
    });
    expect(nextActionOf(o, { state: "ready" }, []).locked).toBeFalsy();
  });

  it("ready + carrier + customer confirmed + owing storage → held", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, storage_fee_msbf: 150 },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Collect",
      locked: true,
    });
  });

  // ── C9 · the manager's release (Jess 2026-07-27) ──
  it("storage RELEASED → nothing is held, and Collect stays on the worklist", () => {
    // The card's own done-when: "a release that does not waive leaves the money
    // action open". The manager let the goods go; the RM 150 is still ours, so
    // since C3 the row's headline IS that collection — unlocked.
    const o = makeRow({
      id: "x",
      so: 1,
      ...ISSUED,
      ops_assigned_logistic: "p1",
      ops_order_control: {
        ...BOOKED,
        storage_fee_msbf: 150,
        storage_waiver_status: "approved",
      },
    });
    const r = nextActionOf(o, { state: "ready" }, []);
    expect(r.label).toBe("Collect");
    expect(r.locked).toBeFalsy();
    expect(openActionsOf(o, { state: "ready" }, []).map((a) => a.key)).toContain(
      "collect",
    );
  });

  it("storage WAIVED (the override written to 0) → nothing left to collect", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: {
        ...BOOKED,
        storage_fee_msbf: 150,
        storage_fee_override: 0,
        storage_waiver_status: "approved",
      },
    });
    expect(nextActionOf(o, { state: "ready" }, []).locked).toBeFalsy();
    expect(
      openActionsOf(o, { state: "ready" }, []).map((a) => a.key),
    ).not.toContain("collect");
  });

  it("a keyed override beats the Master figure — 'No storage' really means no fee", () => {
    // The ladder used to read storage_fee_msbf and ignore the override, so an
    // order the operator had exempted still showed its 🔒.
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, storage_fee_msbf: 150, storage_fee_override: 0 },
    });
    expect(nextActionOf(o, { state: "ready" }, []).locked).toBeFalsy();
  });

  // ── T7 · the confirmed date is itself a deadline ──
  it("confirmed for TODAY → Deliver today (its own queue, not the resting Confirm)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, confirmed_date: inDays(0) },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Deliver today",
      tone: "info",
    });
  });

  it("confirmed date PASSED with no delivery recorded → Chase logistic (red) — the queue turns late by itself", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, confirmed_date: inDays(-2) },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Confirm delivery date",
      tone: "danger",
    });
  });

  it("confirmed for a future day → the quiet FACT, with no action behind it", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ...ISSUED,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, confirmed_date: inDays(3) },
    });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Delivering");
    expect(openActionsOf(o, { state: "ready" }, [])).toEqual([]);
  });

  // ── C7 · the last act before the truck (Jess 2026-07-27) ──
  it("arranged, paid, and NO delivery order yet → Issue delivery order", () => {
    // Before C7 this row sat in no queue at all and read `Delivering`. It has
    // one thing left to do, and it is the paper logistics asks for the evening
    // before — which used to be typed by hand, after dispatch.
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED },
    });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe(
      "Issue delivery order",
    );
    expect(openActionsOf(o, { state: "ready" }, []).map((a) => a.key)).toEqual([
      "issue_delivery_order",
    ]);
  });

  it("owing balance beats Deliver today (PayHold: never arrange a delivery we may not make)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      ops_assigned_logistic: "p1",
      ops_order_control: { ...BOOKED, confirmed_date: inDays(0), balance: 2248 },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Collect",
      locked: true,
    });
  });

  // ── T7 · the delivery photo is the last outstanding act on a closed order ──
  it("delivered with an EMPTY photo ledger → Upload delivery photo (amber, never red — guardrail #2)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      status: "delivered",
      operation_stage: "delivered",
      delivered_at: inDays(-3),
      ops_order_control: { delivery_photos: [] },
    });
    expect(nextActionOf(o, { state: "ready" }, [])).toMatchObject({
      label: "Upload delivery photo",
      tone: "warning",
    });
  });

  it("delivered WITH a photo → Done", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      status: "delivered",
      operation_stage: "delivered",
      delivered_at: inDays(-3),
      ops_order_control: {
        delivery_photos: [{ path: "order/x/a.jpg", at: inDays(-3), by: null }],
      },
    });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Done");
  });

  it("delivered with the ledger ABSENT → Done (an old Worker must not flood every row)", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      status: "delivered",
      operation_stage: "delivered",
      delivered_at: inDays(-3),
      ops_order_control: { balance: 0 },
    });
    expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Done");
  });

  // ── C2 · the SPLIT — every rung above is unchanged, and now nothing hides ──
  // Every assertion in this describe block ran green BEFORE the two-layer
  // split and after it: that suite is the parity oracle proving Layer 2 keeps
  // the ladder's locked rulings. What follows tests the half that is new —
  // that Layer 1 stops one track eating another's work.
  describe("openActionsOf (C2 · Layer 1)", () => {
    it("the card's own example: no PO + no logistics + owing → THREE open actions", () => {
      // The old ladder showed the purchasing act and the other two facts vanished.
      const o = makeRow({
        id: "x",
        so: 1,
        order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }],
        paid: 2000,
      });
      expect(openActionsOf(o, { state: "unknown" }, MS).map((a) => a.key)).toEqual([
        "issue_po",
        "assign_logistics",
        "collect",
      ]);
    });

    it("goods still coming no longer hides the delivery call — the live board's shape", () => {
      // 51 of 56 live orders carry a logistics company and NONE has a confirmed
      // booking, so this is what most of the board looks like today.
      const o = makeRow({ id: "x", so: 1, ops_assigned_logistic: "p1" });
      expect(openActionsOf(o, { state: "awaiting" }, MS).map((a) => a.key)).toEqual([
        "confirm_ready_date",
        "confirm_delivery_date",
      ]);
    });

    it("the drawer's first row IS the row's pill — they cannot disagree", () => {
      const rows = [
        makeRow({ id: "a", so: 1, order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }], paid: 0 }),
        makeRow({ id: "b", so: 2, ops_assigned_logistic: "p1", delivery_date: inDays(-2) }),
        makeRow({ id: "c", so: 3, ops_assigned_logistic: "p1", ops_order_control: { ...BOOKED } }),
      ];
      for (const o of rows) {
        const stock = { state: "awaiting" } as const;
        expect(openActionsOf(o, stock, MS)[0]?.key).toBe(
          nextActionOf(o, stock, MS).key,
        );
      }
    });

    it("a delivered order that still owes money keeps its collect action", () => {
      const o = makeRow({
        id: "x",
        so: 1,
        status: "delivered",
        operation_stage: "delivered",
        delivered_at: inDays(-3),
        order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }],
        paid: 1000,
        ops_order_control: {
          delivery_photos: [{ path: "order/x/a.jpg", at: inDays(-3), by: null }],
        },
      });
      // Delivered is not paid (ORDERS-WORKING-FLOW §3). This is the ONE row
      // whose headline C2 changes: it used to read Done and show nothing.
      expect(openActionsOf(o, { state: "ready" }, MS).map((a) => a.key)).toEqual([
        "collect",
      ]);
      expect(nextActionOf(o, { state: "ready" }, MS).key).toBe("collect");
    });

    it("a closed, paid, photographed order has no open action at all", () => {
      const o = makeRow({
        id: "x",
        so: 1,
        status: "delivered",
        operation_stage: "delivered",
        delivered_at: inDays(-3),
        ops_order_control: {
          delivery_photos: [{ path: "order/x/a.jpg", at: inDays(-3), by: null }],
        },
      });
      expect(openActionsOf(o, { state: "ready" }, [])).toEqual([]);
      expect(nextActionOf(o, { state: "ready" }, []).label).toBe("Done");
    });
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

describe("logisticStateOf (LOGISTIC delivery state machine — T1 booking truth, 0277)", () => {
  const pn = new Map<string, string>();

  it("completed → delivered", () => {
    const o = makeRow({ id: "x", so: 1, status: "delivered", operation_stage: "delivered" });
    expect(logisticStateOf(o, pn).key).toBe("delivered");
  });

  it("customer confirmed (booking_stage + date + slot) → confirmed, with date + slot", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      ops_order_control: {
        logistic_eta: "2026-07-25",
        booking_stage: "confirmed",
        confirmed_date: "2026-07-27",
        confirmed_time_slot: "Morning (9–11 AM)",
      },
    });
    expect(logisticStateOf(o, pn)).toMatchObject({
      key: "confirmed",
      date: "2026-07-27",
      slot: "Morning (9–11 AM)",
    });
  });

  it("carrier date alone (logistic_eta, no customer confirmation) → provisional, NEVER confirmed", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      ops_order_control: { logistic_eta: "2026-08-01", booking_stage: "provisional" },
    });
    expect(logisticStateOf(o, pn)).toMatchObject({ key: "provisional", date: "2026-08-01" });
  });

  it("booking_stage='confirmed' WITHOUT a confirmed_date is not trusted (invariant #1) → provisional", () => {
    const o = makeRow({
      id: "x",
      so: 1,
      delivery_partners: { id: "p", name: "NETS" },
      ops_order_control: { logistic_eta: "2026-08-01", booking_stage: "confirmed" },
    });
    expect(logisticStateOf(o, pn).key).toBe("provisional");
  });

  it("no partner → unassigned", () => {
    expect(logisticStateOf(makeRow({ id: "x", so: 1 }), pn).key).toBe("unassigned");
  });

  it("partner + no date at all → need_booking (the old call_now/no_date window split is dead)", () => {
    for (const due of [relISO(2), relISO(10)]) {
      const o = makeRow({
        id: "x",
        so: 1,
        delivery_partners: { id: "p", name: "NETS" },
        delivery_date: due,
      });
      expect(logisticStateOf(o, pn).key).toBe("need_booking");
    }
  });
});

// ── T1 · the Delivery column tells the booking truth (0277) ──────────────────
describe("Delivery column (T1 booking truth)", () => {
  const bookingRows: operationOrderListRow[] = [
    makeRow({
      id: "conf",
      so: 2001,
      status: "proceed_order",
      operation_stage: "in_production",
      delivery_partners: { id: "p-nets", name: "NETS" },
      ops_order_control: {
        logistic_eta: "2026-07-25",
        booking_stage: "confirmed",
        confirmed_date: "2026-07-27",
        confirmed_time_slot: "Morning (9–11 AM)",
      },
    }),
    makeRow({
      id: "prov",
      so: 2002,
      status: "proceed_order",
      operation_stage: "in_production",
      delivery_partners: { id: "p-nets", name: "NETS" },
      ops_order_control: { logistic_eta: "2026-07-27", booking_stage: "provisional" },
    }),
    makeRow({
      id: "nb",
      so: 2003,
      status: "proceed_order",
      operation_stage: "in_production",
      delivery_partners: { id: "p-nets", name: "NETS" },
    }),
  ];

  beforeEach(() => {
    listHookState.data = { orders: bookingRows };
  });

  function row(so: number) {
    return screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes(`SO-${so}`))!;
  }

  it("confirmed → date · slot; provisional → logistics said; every banned gap-word renders NOWHERE", () => {
    wrap(<OperationOrdersControl />);
    expect(within(row(2001)).getByText("27 Jul · 9–11 AM")).toBeInTheDocument();
    expect(within(row(2002)).getByText(/logistics said 27 Jul/)).toBeInTheDocument();
    expect(screen.queryByText(/unscheduled/i)).toBeNull();
    expect(screen.queryByText(/not booked/i)).toBeNull();
    expect(screen.queryByText(/need booking/i)).toBeNull();
  });

  it("C14 · assigned-with-no-date shows the CARRIER and not the sentence Actions already carries", () => {
    wrap(<OperationOrdersControl />);
    // SO-2003 is the gap row: a carrier, no provisional date, no confirmation.
    // Until C14 this cell printed `NETS — confirm delivery date` while the
    // Actions cell one column over printed `Call NETS — confirm delivery
    // date`. MEASURED on production 2026-08-05: the same fact on 30 of 30 data
    // rows, and BOTH cells truncated carrying it.
    const cell = within(row(2003));
    expect(cell.getByText("NETS")).toBeInTheDocument();
    expect(cell.queryByText("NETS — confirm delivery date")).toBeNull();
  });

  it("C14 · the sentence is gone from the whole LIST, not just from one fixture row", () => {
    // A per-row assertion only proves the branch its fixture reaches. This one
    // is over the rendered page: the verb-less gap fact may not appear at all.
    wrap(<OperationOrdersControl />);
    // The verb-LESS form is the duplicate; an exact-string query, because
    // `Call NETS — confirm delivery date` legitimately ends the same way and a
    // loose regex would match the very line this card is protecting.
    expect(screen.queryByText("NETS — confirm delivery date")).toBeNull();
    // ...and that protected line is still there. Same words, one home each:
    // `deliveryDateGapFact` still lives, in the drawer badge.
    expect(
      screen.getAllByText(/Call NETS — confirm delivery date/).length,
    ).toBeGreaterThan(0);
  });

  it("C14 · the toolbar's PIC chip row is gone — the rail's TEAM group is its one home", () => {
    wrap(<OperationOrdersControl />);
    // `Everyone` was the row's clear-state chip and existed nowhere else.
    expect(screen.queryByRole("button", { name: /^Everyone/ })).toBeNull();
  });

  it("a provisional row never paints the green booking text (green is the customer's yes only)", () => {
    wrap(<OperationOrdersControl />);
    const prov = within(row(2002)).getByText(/logistics said 27 Jul/);
    expect(prov).toHaveClass("text-warning"); // amber token, not the green ink
    expect(prov).not.toHaveStyle({ color: "#3B6D11" });
    const conf = within(row(2001)).getByText("27 Jul · 9–11 AM");
    expect(conf).toHaveStyle({ color: "#3B6D11" });
  });
});

// ── C10 · the three dots become real ────────────────────────────────────────
// `rowDotsOf` computed goods · delivery · money for nine days and NOTHING
// rendered it — and, contrary to what the C5 note and the C10 card both state,
// nothing TESTED it either. So this block is the first cover the truth table
// (ORDERS-WORKING-FLOW §7) has ever had, and it is written against the STATE
// the function returns, never the hex the renderer paints.
describe("The three dots (C10 · Law 6 · ORDERS-WORKING-FLOW §7)", () => {
  const READY: StockInfo = { state: "ready" };
  const NO_PO: StockInfo = { state: "unknown" };
  const WAITING: StockInfo = { state: "awaiting" };
  const NO_ETA: StockEta = { etaIso: null, waiting: false, state: "none" };
  const LATE_ETA: StockEta = { etaIso: "2026-07-01", waiting: true, state: "late" };
  const NO_LOGI: LogisticState = { key: "unassigned", partner: null, date: null, slot: null };
  const CONFIRMED: LogisticState = {
    key: "confirmed",
    partner: "NETS",
    date: "2026-07-27",
    slot: "Morning (9–11 AM)",
  };
  const PROVISIONAL: LogisticState = {
    key: "provisional",
    partner: "NETS",
    date: "2026-07-27",
    slot: null,
  };
  const NEED_BOOKING: LogisticState = {
    key: "need_booking",
    partner: "NETS",
    date: null,
    slot: null,
  };
  const day = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };
  /** Priced RM 4,000 of goods, nothing paid → the money dot is RED. */
  const owing = { order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }], paid: 0 };
  const settled = { ...owing, paid: 4000 };

  it("returns the three tracks in the LAW's order — goods · delivery · money", () => {
    // Law 6's sketch and §7's table both read goods → delivery → money. (The
    // §14 note of 2026-07-18 had money first; it was re-ruled, and since nothing
    // had ever rendered these dots, no screen changed when this flipped.)
    const o = makeRow({ id: "x", so: 1, ...owing });
    const [goods, delivery, money] = rowDotsOf(o, NO_PO, NO_ETA, NO_LOGI);
    expect(goods.title).toMatch(/^Stock —/);
    expect(delivery.title).toMatch(/^Delivery —/);
    expect(money.title).toMatch(/^Money —/);
  });

  it("goods: all in → green · no PO → red · supplier ETA late → red · otherwise waiting → amber", () => {
    const o = makeRow({ id: "x", so: 1, ...settled });
    expect(rowDotsOf(o, READY, NO_ETA, NO_LOGI)[0].state).toBe("green");
    expect(rowDotsOf(o, NO_PO, NO_ETA, NO_LOGI)[0].state).toBe("red");
    expect(rowDotsOf(o, WAITING, LATE_ETA, NO_LOGI)[0].state).toBe("red");
    expect(rowDotsOf(o, WAITING, NO_ETA, NO_LOGI)[0].state).toBe("amber");
  });

  it("delivery: the CUSTOMER's yes is the only green — a logistics date stays amber", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: day(5), ...settled });
    expect(rowDotsOf(o, READY, NO_ETA, CONFIRMED)[1].state).toBe("green");
    expect(rowDotsOf(o, READY, NO_ETA, PROVISIONAL)[1].state).toBe("amber");
    expect(rowDotsOf(o, READY, NO_ETA, NEED_BOOKING)[1].state).toBe("amber");
    // Nothing is known yet — grey states an absence, it does not alarm.
    expect(rowDotsOf(o, READY, NO_ETA, NO_LOGI)[1].state).toBe("grey");
  });

  it("delivery: past the deadline and still unconfirmed → red", () => {
    const o = makeRow({ id: "x", so: 1, delivery_date: day(-2), ...settled });
    expect(rowDotsOf(o, READY, NO_ETA, NEED_BOOKING)[1].state).toBe("red");
    expect(rowDotsOf(o, READY, NO_ETA, PROVISIONAL)[1].state).toBe("red");
  });

  it("money: settled → green · owing → red with the figure · unpriced → grey, never an alarm", () => {
    const o = makeRow({ id: "x", so: 1, ...settled });
    expect(rowDotsOf(o, READY, NO_ETA, NO_LOGI)[2].state).toBe("green");
    const red = rowDotsOf(makeRow({ id: "y", so: 2, ...owing }), READY, NO_ETA, NO_LOGI)[2];
    expect(red.state).toBe("red");
    // C11 — to the cent. This read `RM 4,000` until 2026-08-05, which was the
    // rounding half of the bug: the dot's own tooltip built its money string by
    // hand, beside the label rather than through it.
    expect(red.title).toBe("Money — RM 4,000.00 outstanding");
    // An order nobody has priced: 37 live rows look like this. A number nobody
    // knows may not paint an alarm (ORDERS-WORKING-FLOW §2).
    const unpriced = makeRow({
      id: "z",
      so: 3,
      order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
      paid: 0,
    });
    expect(rowDotsOf(unpriced, READY, NO_ETA, NO_LOGI)[2].state).toBe("grey");
  });

  it("a DELIVERED order never alarms on goods or delivery — and still shows red money", () => {
    // §7's last line, and the card's own done-when. Delivered is not paid.
    const done = makeRow({
      id: "x",
      so: 1,
      status: "delivered",
      operation_stage: "delivered",
      delivery_date: day(-30),
      ...owing,
    });
    // The worst possible goods/delivery inputs — no PO, a late supplier ETA, no
    // logistics, a deadline a month gone. A closed order alarms on none of it.
    expect(rowDotsOf(done, NO_PO, LATE_ETA, NO_LOGI).map((d) => d.state)).toEqual([
      "green",
      "green",
      "red",
    ]);
  });
});

// ── C10 · the dots on screen, beside the stage pill ─────────────────────────
describe("The three dots on the row (C10)", () => {
  const dotRows: operationOrderListRow[] = [
    makeRow({
      id: "open",
      so: 3001,
      status: "proceed_order",
      operation_stage: "in_production",
      delivery_partners: { id: "p-nets", name: "NETS" },
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }],
      paid: 0,
    }),
    makeRow({
      id: "done",
      so: 3002,
      status: "delivered",
      operation_stage: "delivered",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 4000 }],
      paid: 0,
    }),
  ];
  beforeEach(() => {
    listHookState.data = { orders: dotRows };
  });
  function row(so: number) {
    return screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes(`SO-${so}`))!;
  }

  it("every row renders three dots, in the law's order, each naming its own track", () => {
    wrap(<OperationOrdersControl />);
    const r = within(row(3001));
    // Order on screen, not merely presence.
    const rendered = [...r.getByTestId("row-dots").children].map((c) =>
      c.getAttribute("data-testid"),
    );
    expect(rendered).toEqual(["row-dot-goods", "row-dot-delivery", "row-dot-money"]);
    // Each dot says what it is — a colour on its own names nothing.
    expect(r.getByTestId("row-dot-money").getAttribute("title")).toMatch(/^Money —/);
    expect(r.getByTestId("row-dot-goods").getAttribute("title")).toMatch(/^Stock —/);
  });

  it("the dots sit BESIDE the stage pill — neither replaces the other (Jess 2026-07-27)", () => {
    wrap(<OperationOrdersControl />);
    const r = within(row(3001));
    // The pill is untouched by this card: same word, same shared pill map.
    const pill = r.getByText("To book");
    expect(pill).toHaveClass("pill");
    // One cell holds both.
    expect(pill.closest("td")).toBe(r.getByTestId("row-dots").closest("td"));
  });

  it("a delivered row keeps its Delivered word, alarms on neither goods nor delivery, and still shows red money", () => {
    wrap(<OperationOrdersControl />);
    const r = within(row(3002));
    expect(r.getByText("Delivered")).toBeInTheDocument();
    expect(r.getByTestId("row-dot-goods").getAttribute("data-dot-state")).toBe("green");
    expect(r.getByTestId("row-dot-delivery").getAttribute("data-dot-state")).toBe("green");
    expect(r.getByTestId("row-dot-money").getAttribute("data-dot-state")).toBe("red");
  });

  it("the dots are ICONS, never emoji and never a bare coloured circle (UI-KIT §A11 rule 2)", () => {
    wrap(<OperationOrdersControl />);
    const dots = within(row(3001)).getByTestId("row-dots");
    // No text at all in the group — the glyphs carry it.
    expect(dots.textContent).toBe("");
    // Three Lucide SVGs at the kit's 14px inline size.
    const svgs = dots.querySelectorAll("svg");
    expect(svgs).toHaveLength(3);
    svgs.forEach((s) => expect(s.getAttribute("width")).toBe("14"));
    expect(/\p{Extended_Pictographic}/u.test(dots.innerHTML)).toBe(false);
  });
});


// ─── C3 · the Actions column shows the whole truth ───────────────────────────
// (docs/portal-core-execution-queue.md · Jess 2026-07-27)
//
// Two things ship here. The `+N` — the row shows Layer 2's top action and says
// how many more are open, so nothing is hidden by the one that leads. And the
// retirement of `Confirm delivery with {customer}`: "everything ready, the day
// has not come" is a FACT, not work, so the cell states it quietly and the
// drawer's list is one row shorter instead of holding a row no button can
// close.
describe("Actions column · +N and the delivering FACT (C3)", () => {
  const iso = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  /** Three open actions: nothing ordered (goods) · no logistics (delivery) ·
   *  a priced order with nothing paid (money). The card's own example. */
  const THREE = makeRow({
    id: "three",
    so: 3001,
    status: "proceed_order",
    operation_stage: "confirmed",
    customer_name: "John Tan",
    delivery_date: iso(10),
    order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 2455 }],
    paid: 0,
  });
  /** One open action: goods are in, the money is settled, no logistics yet. */
  const ONE = makeRow({
    id: "one",
    so: 3002,
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    customer_name: "Siti",
    delivery_date: iso(10),
    order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 1000 }],
    paid: 1000,
    ops_order_control: { line_stock_status: { "mattress:MAT-1": "ready" } },
  });
  /** Everything arranged, the day is ahead, paid in full → the FACT. */
  const ARRANGED = makeRow({
    id: "arranged",
    so: 3003,
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    customer_name: "Kong",
    delivery_date: iso(6),
    delivery_partners: { id: "p-nets", name: "NETS" },
    order_lines: [{ sku: "mattress:MAT-1", qty: 1, unit_price: 1000 }],
    paid: 1000,
    // C7 — the paper exists, so there really is nothing left to do and the
    // row prints the quiet FACT.
    do_number: "DO-270726-4821",
    ops_order_control: {
      line_stock_status: { "mattress:MAT-1": "ready" },
      booking_stage: "confirmed",
      confirmed_date: iso(6),
      confirmed_time_slot: "Morning (9–11 AM)",
    },
  });

  beforeEach(() => {
    listHookState.data = { orders: [THREE, ONE, ARRANGED] };
  });

  function row(so: number) {
    return screen
      .getAllByTestId("order-row")
      .find((r) => r.textContent?.includes(`SO-${so}`))!;
  }

  it("an order with three open actions leads with one and counts the rest", () => {
    wrap(<OperationOrdersControl />);
    const cell = row(3001);
    expect(within(cell).getByText("Issue PO to supplier")).toBeInTheDocument();
    expect(within(cell).getByTestId("next-more")).toHaveTextContent("+2");
  });

  it("a row with one action shows no +N", () => {
    wrap(<OperationOrdersControl />);
    expect(within(row(3002)).getByText("Assign logistics")).toBeInTheDocument();
    expect(within(row(3002)).queryByTestId("next-more")).toBeNull();
  });

  it("the count always equals C2's row count — 1 + N is the drawer's list length", () => {
    // Asserted against the DRAWER the row opens, never against a second run of
    // the ladder: if these two ever diverge the row is lying about what is open.
    wrap(<OperationOrdersControl />);
    for (const so of [3001, 3002]) {
      const cell = row(so);
      const more = within(cell).queryByTestId("next-more");
      const claimed = 1 + (more ? Number(more.textContent!.replace("+", "")) : 0);
      fireEvent.click(cell);
      const journey = JSON.parse(
        screen.getByTestId("drawer-stub").getAttribute("data-journey") || "null",
      );
      expect(journey.openActions).toHaveLength(claimed);
      fireEvent.click(screen.getByText("close"));
    }
  });

  it("the +N names what it is hiding and opens the drawer's full list", () => {
    wrap(<OperationOrdersControl />);
    const more = within(row(3001)).getByTestId("next-more");
    // C11 — the figure carries its sen (it read `RM 2,455` before 2026-08-05).
    expect(more.getAttribute("title")).toContain("Collect RM 2,455.00 from John Tan");
    fireEvent.click(more);
    expect(screen.getByTestId("drawer-stub")).toHaveAttribute("data-order-id", "three");
  });

  it("everything arranged, the day ahead → a quiet FACT, no verb and nothing to click", () => {
    wrap(<OperationOrdersControl />);
    const cell = row(3003);
    const fact = within(cell).getByText("Delivering");
    // A fact, not a pill: a pill in this column is a button, and there is
    // nothing here for a human to press.
    expect(fact.className).toContain("t4-caption");
    expect(fact.className).not.toContain("pill");
    expect(within(cell).queryByTestId("next-more")).toBeNull();
    expect(within(cell).queryByText(/Confirm delivery with/)).toBeNull();
    // Never red — quiet tone is the ruling.
    expect(fact.className).not.toContain("danger");
  });

  it("the row keeps the day OUT of the cell and the drawer states it in full", () => {
    // The Delivery cell one column to the left already prints the booked day,
    // so printing it again here would say the same thing twice; the tooltip
    // carries it, and the drawer's journey strip says the whole sentence.
    wrap(<OperationOrdersControl />);
    const cell = row(3003);
    const fact = within(cell).getByText("Delivering");
    expect(fact.getAttribute("title")).toMatch(/Nothing to do until/);
    fireEvent.click(cell);
    const journey = JSON.parse(
      screen.getByTestId("drawer-stub").getAttribute("data-journey") || "null",
    );
    expect(journey.next.line).toMatch(/^Delivering \d+ \w+ · 9–11 AM$/);
    // …and the drawer's dynamic checklist is EMPTY: one fewer row, not a row
    // nobody can act on.
    expect(journey.openActions).toEqual([]);
  });
});

// ── C13 · the imported archive is not work ───────────────────────────────────
//
// Loo, 2026-08-04, measured on prod: 37 of 37 Overdue orders were the AutoCount
// archive and not one of the 28 real orders was late, so the page showed a day's
// work that does not exist.
//
// The fixture below carries BOTH provenances and puts an overdue order on each
// side, which is the only shape that can tell "the archive is excluded" apart
// from "everything overdue is excluded".
describe("The imported archive is excluded from WORK, never from the record (C13)", () => {
  const inDays = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  /** A queue row renders `{label}{count}` with no separator, so `Overdue1`
   *  gives `\b1\b` no boundary to find. Read the trailing number instead. */
  const queueCount = (el: HTMLElement) =>
    Number((el.textContent ?? "").match(/(\d+)\s*$/)?.[1] ?? NaN);

  // 1 native overdue · 2 archive overdue · 1 native due next week.
  // Prod's own shape in miniature — the archive is the majority of the misses.
  const MIXED: operationOrderListRow[] = [
    makeRow({
      id: "n-late",
      so: 2001,
      customer_name: "Real Late",
      delivery_date: inDays(-2),
    }),
    makeRow({
      id: "a-late-1",
      so: 2002,
      customer_name: "Archive One",
      source_system: "autocount",
      source_ref: ["CR0001"],
      delivery_date: inDays(-9),
    }),
    makeRow({
      id: "a-late-2",
      so: 2003,
      customer_name: "Archive Two",
      source_system: "autocount",
      source_ref: ["CR0002"],
      delivery_date: inDays(-30),
    }),
    makeRow({
      id: "n-soon",
      so: 2004,
      customer_name: "Real Soon",
      delivery_date: inDays(8),
    }),
  ];

  beforeEach(() => {
    listHookState = {
      data: { orders: MIXED },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  it("isImportedArchive reads source_system and nothing else", () => {
    expect(isImportedArchive(makeRow({ id: "x", so: 1, source_system: "autocount" }))).toBe(true);
    expect(isImportedArchive(makeRow({ id: "x", so: 1, source_system: null }))).toBe(false);
    // A row that is late, unpaid and ancient is still not archive — provenance
    // is the ONLY test, so nothing else on the row can be mistaken for it.
    expect(
      isImportedArchive(makeRow({ id: "x", so: 1, delivery_date: inDays(-99) })),
    ).toBe(false);
  });

  it("Overdue counts the real order only — 1, not 3 — and says it in ONE place", () => {
    wrap(<OperationOrdersControl />);
    // C13 asserted this over BOTH homes, because `Overdue` was rendered twice
    // (the QUEUES row and the DEADLINE bucket, sharing `dueEntries`) and
    // reading both at once proved they could not drift.
    // C14 removed the drift by removing the second home: two renders of one
    // filter is the duplication this card exists to end, so the stronger
    // assertion is now that there is exactly ONE of them.
    const overdues = screen.getAllByRole("button", { name: /^Overdue/ });
    expect(overdues).toHaveLength(1);
    // 1 = the native miss. 3 = what the page said before C13.
    expect(queueCount(overdues[0])).toBe(1);
    // ...and it is the QUEUES row, not the DEADLINE band: a breach is not a
    // future window, and QUEUES is where the page keeps its alarm.
    expect(
      within(screen.getByTestId("filter-deadline")).queryByRole("button", {
        name: /^Overdue/,
      }),
    ).toBeNull();
  });

  it("the DELIVERY group skips the archive too — ONE filter reaches every count", () => {
    wrap(<OperationOrdersControl />);
    // All FOUR fixture rows carry no logistics company, so this queue is the
    // sharpest reading available: 4 without the filter, 2 with it. `unassigned`
    // is a DIFFERENT memo from `dueEntries`, which is the point — the card's
    // rule is that ONE filter in `liveScope` reaches every count, not that
    // Overdue was patched by hand.
    const grp = within(screen.getByTestId("filter-delivery"));
    const noLogistics = grp.getByRole("button", { name: /No logistics picked/ });
    expect(queueCount(noLogistics)).toBe(2);
  });

  it("the LOGISTICS facet reads the same scope — a third independent memo", () => {
    // Give ONE native and ONE archive row the same carrier. `logisticEntries`
    // is a different memo from `dueEntries`, which is C13's point: the rule is
    // that ONE filter in `liveScope` reaches every count.
    listHookState.data = {
      orders: MIXED.map((o) =>
        o.id === "n-late" || o.id === "a-late-1"
          ? { ...o, delivery_partners: { id: "p-nets", name: "NETS" } }
          : o,
      ),
    };
    wrap(<OperationOrdersControl />);
    const grp = within(screen.getByTestId("filter-logistic"));
    // 1, not 2 — the archive row carries the same carrier and is not work.
    expect(queueCount(grp.getByRole("button", { name: /^NETS/ }))).toBe(1);
  });

  it("a carrier with no live orders gets no row, and an empty fleet gets no group (C14)", () => {
    // Every fixture row is carrier-less, so every carrier counts 0. Before C14
    // the whole fleet rendered anyway (Jess 2026-07-19) and each row was a
    // click that could only answer `No orders in this tab.`
    wrap(<OperationOrdersControl />);
    expect(screen.queryByTestId("filter-logistic")).toBeNull();
  });

  it("the archive rows are STILL in the table — readable, openable, searchable", () => {
    wrap(<OperationOrdersControl />);
    // All four rows render. Excluded from WORK, never hidden from the record.
    expect(rowsBySo().sort()).toEqual(["2001", "2002", "2003", "2004"]);
    expect(screen.getByText("Archive One")).toBeInTheDocument();
    expect(screen.getByText("Archive Two")).toBeInTheDocument();
  });

  it("clicking Overdue returns exactly the order the count promised", () => {
    wrap(<OperationOrdersControl />);
    // C14 — `Overdue` now has one home (QUEUES), so this is no longer scoped
    // to the DEADLINE band. The law under test is unchanged.
    fireEvent.click(screen.getByRole("button", { name: /^Overdue/ }));
    // The portal's own law: a facet must never print a number its own click
    // cannot produce. 1 on the row → 1 row on the click.
    expect(rowsBySo()).toEqual(["2001"]);
  });

  it("the page says out loud what it left out", () => {
    wrap(<OperationOrdersControl />);
    const note = screen.getByTestId("orders-archive-note");
    expect(note).toHaveTextContent(
      "2 imported archive orders are not counted in the queues",
    );
  });

  it("no archive on file → no sentence (it disappears at go-live by itself)", () => {
    listHookState.data = { orders: MIXED.filter((o) => !isImportedArchive(o)) };
    wrap(<OperationOrdersControl />);
    expect(screen.queryByTestId("orders-archive-note")).toBeNull();
    // …and the real work is untouched: the one genuine miss still counts.
    for (const b of screen.getAllByRole("button", { name: /^Overdue/ }))
      expect(queueCount(b)).toBe(1);
  });
});

// ── D1 · the list can see a real purchase order (2026-08-06) ─────────────────
//
// Before D1 the only PO evidence on the wire was `order_lines.source_po`, a
// column ONLY the AutoCount importer writes. Measured on production: 19 of 28
// live orders were covered by a real purchase order and 0 carried `source_po`,
// so the ladder told an operator to `Issue PO` on goods already bought
// (SO-1206 · SO-1213 · SO-1216 · SO-1257).
describe("D1 — a native order covered by a real purchase order", () => {
  const MS = [{ sku: "mattress:MAT-1", qty: 1 }];
  // A native order whose SKU is NOT in the free-stock map: exactly the shape
  // that used to fall through to `unknown` → `Issue PO`.
  const native = (extra: Partial<operationOrderListRow> = {}) =>
    makeRow({
      id: "d1",
      so: 1206,
      status: "place",
      order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
      ...extra,
    });
  // The map is present and does NOT hold this SKU — the live case.
  const otherSkus = new Map<string, number>([["mattress:OTHER", 5]]);

  it("po_skus present → the goods are ON ORDER, not unordered", () => {
    const o = native({ po_skus: ["mattress:MAT-1"] });
    expect(orderHasPurchaseOrder(o)).toBe(true);
    expect(stockReadiness(o, otherSkus).state).toBe("awaiting");
    expect(nextActionOf(o, stockReadiness(o, otherSkus), MS).label).not.toBe(
      "Issue PO",
    );
  });

  it("po_skus present → the goods dot stops saying no PO was raised", () => {
    const o = native({ po_skus: ["mattress:MAT-1"] });
    const [goods] = rowDotsOf(
      o,
      stockReadiness(o, otherSkus),
      stockEtaOf(o),
      { key: "unassigned", partner: null, date: null, slot: null },
    );
    expect(goods.title).not.toMatch(/no PO raised/i);
  });

  it("NEGATIVE CONTROL — the same order with NO po_skus still reads Issue PO", () => {
    const o = native();
    expect(orderHasPurchaseOrder(o)).toBe(false);
    expect(stockReadiness(o, otherSkus).state).toBe("unknown");
    expect(nextActionOf(o, stockReadiness(o, otherSkus), MS).label).toBe(
      "Issue PO",
    );
  });

  it("an EMPTY po_skus array is not a purchase order", () => {
    expect(orderHasPurchaseOrder(native({ po_skus: [] }))).toBe(false);
  });

  it("po_skus ABSENT is UNKNOWN, not a claim — a pre-D1 Worker behaves as before", () => {
    // The field is optional on purpose. Absent must reproduce the pre-D1
    // answer exactly rather than accuse an order of something we cannot see.
    const o = native();
    expect(o.po_skus).toBeUndefined();
    expect(orderHasPurchaseOrder(o)).toBe(false);
  });

  it("the AutoCount source_po path is untouched", () => {
    const o = makeRow({
      id: "d1b",
      so: 900,
      status: "place",
      source_system: "autocount",
      order_lines: [{ sku: "MS01-K", qty: 1, source_po: "PO-OLD" }],
    });
    expect(orderHasPurchaseOrder(o)).toBe(true);
  });
});
