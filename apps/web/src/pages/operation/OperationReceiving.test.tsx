import { useState } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RECEIVING_UNIT_OUTCOME_LABEL } from "@carres/shared";
import type { operationPoListRow, SupplierRow } from "@/lib/queries";
import OperationReceiving from "./OperationReceiving";
import ReceivingWorkspace from "./components/ReceivingWorkspace";
import ReceivingRecord from "./components/ReceivingRecord";

/**
 * OperationReceiving — the formal GRN Register and its object surfaces
 * (owner correction 2026-09-06).
 *
 *   My Work / Team Work = what staff must receive or review
 *   Receiving           = formal GRN records
 *
 * The laws held as assertions:
 *   · THE REGISTER BOUNDARY — a row exists only once Save Receiving created
 *     the GRN; a submitted count is NOT a Register row (it lives in Work and
 *     deep-links to its review),
 *   · the rail is exactly CATEGORY (the five governed rows, shared-ladder
 *     order) · SUPPLIER · GOODS ARRIVED AT · Clear filters — no state rows,
 *     no `All …`, no `Any`, no date filter (the table's date column owns
 *     dates), no invented category,
 *   · document status words are `Valid` / `Cancelled` — never `Posted` /
 *     `Voided` on a normal user's screen,
 *   · the corrected location/date words — `Deliver To` · `Goods arrived at`
 *     · `Goods received on`; `Actual Site` and `Goods Received At` retired,
 *   · the GRN object is 50/50: Receiving Record left, the REAL A4 GRN
 *     preview right with Print/Download; Void hides in `More ▾`; Amend
 *     takes the left half while the preview stays live,
 *   · the register stays MOUNTED (`invisible`) under an open object,
 *   · the supplier's DO number starts EMPTY — never invented,
 *   · Save names the FIRST missing fact (`receivingSaveBlocker`, one copy),
 *   · one physical result per governed Unit, quantities DERIVED from them,
 *   · duty comes from the ONE resolver — a page without it gets the refusal
 *     sentence, never a button the server would refuse.
 */

/* ── Mutable hook state — the mocked @/lib/queries reads these at call time ── */

const h = vi.hoisted(() => ({
  dutyAllowed: true,
  receipts: [] as unknown[],
  waiting: 0,
  receiptsError: false,
  /** The paged register's page size — small in the pagination test. */
  pageLimit: 50,
  /** Every ask the page sent the paged register hook — filters + offset. */
  registerAsks: [] as Array<Record<string, unknown>>,
  pos: [] as unknown[],
  poReceiving: {
    sessions: [] as unknown[],
    events: [] as unknown[],
    expected_units: [] as unknown[],
  },
  sessionDetail: null as unknown,
  officeReceive: [] as Array<[string, Record<string, unknown>]>,
  amend: [] as Array<[string, Record<string, unknown>]>,
  voided: [] as Array<[string, Record<string, unknown>]>,
  review: [] as Array<[string, Record<string, unknown>]>,
}));

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  const shared =
    await vi.importActual<typeof import("@carres/shared")>("@carres/shared");
  return {
    ...actual,
    useReceivingDuty: () => ({
      data: { allowed: h.dutyAllowed },
      isLoading: false,
      isError: false,
    }),
    /* The paged register, emulated with the SAME shared arithmetic the
     * Worker runs (`buildGrnRegisterView`) over the fixtures — the test and
     * the server cannot hold two filtering rules. */
    useOperationGrnRegister: (filters: {
      offset: number;
      category: string | null;
      supplier: string | null;
      site: string | null;
      expected: string | null;
      q: string;
    }) => {
      h.registerAsks.push({ ...filters });
      if (h.receiptsError)
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          refetch: () => Promise.resolve(),
        };
      type R = Record<string, unknown>;
      const grn = (h.receipts as R[]).filter(
        (r) => r.status === "posted" || r.status === "voided",
      );
      const view = shared.buildGrnRegisterView(
        grn.map((r) => ({
          id: r.id as string,
          categories: (r.categories as string[] | undefined) ?? [],
          supplierName: (r.supplier_name as string | null) ?? null,
          siteName:
            (r.actual_site_name as string | null) ??
            (r.warehouse_name as string | null) ??
            null,
          supplierDeliveryDateIso:
            (r.supplier_delivery_date as string | null) ?? null,
          searchText: [r.grn_no, r.po_id, r.do_number, r.supplier_name]
            .filter(Boolean)
            .join(" "),
        })),
        filters,
        filters.offset,
        h.pageLimit,
      );
      const byId = new Map(grn.map((r) => [r.id as string, r]));
      return {
        data: {
          receipts: view.pageIds.map((id) => byId.get(id)),
          page: {
            offset: filters.offset,
            limit: h.pageLimit,
            total: view.total,
            total_all: grn.length,
          },
          facets: view.facets,
          counts: { waiting: h.waiting },
        },
        isLoading: false,
        isError: false,
        refetch: () => Promise.resolve(),
      };
    },
    useOperationPos: () => ({
      data: { pos: h.pos },
      isLoading: false,
      isError: false,
    }),
    useOperationSuppliers: () => ({
      data: { suppliers: SUPPLIERS },
      isLoading: false,
      isError: false,
    }),
    useOperationWarehouse: () => ({
      data: { warehouses: WAREHOUSES },
      isLoading: false,
      isError: false,
    }),
    usePoReceiving: () => ({
      data: h.poReceiving,
      isLoading: false,
      isError: false,
    }),
    useOfficeReceiveMutation: (poId: string) => ({
      mutate: (input: Record<string, unknown>) =>
        h.officeReceive.push([poId, input]),
      isPending: false,
    }),
    useReceivingSessionDetail: () => ({
      data: h.sessionDetail,
      isLoading: false,
      isError: h.sessionDetail == null,
      refetch: () => Promise.resolve(),
    }),
    useReceivingAmendMutation: (id: string) => ({
      mutate: (body: Record<string, unknown>) => h.amend.push([id, body]),
      isPending: false,
    }),
    useReceivingVoidMutation: (id: string) => ({
      mutate: (body: Record<string, unknown>) => h.voided.push([id, body]),
      isPending: false,
    }),
    useWarehouseReceiptReviewMutation: (move: string) => ({
      mutate: (body: Record<string, unknown>) => h.review.push([move, body]),
      isPending: false,
    }),
  };
});

/* Real hooks spread from the actual module (top bar etc.) still call apiFetch;
 * it resolves quietly instead of touching a network. */
const apiFetchMock = vi.fn(() => Promise.resolve({}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: () => apiFetchMock() };
});

/* The GRN preview paints through pdf.js — imperative canvas work jsdom cannot
 * do. The painter and the renderer are mocked; the DATA they are fed is
 * covered by grn-template-data.test.ts against the same builder. */
vi.mock("@/lib/pdf/render", () => ({
  renderGrnPdf: vi.fn(() => Promise.resolve(new Blob())),
}));
vi.mock("@/lib/pdf/use-pdf-canvases", () => ({
  usePdfCanvases: () => ({ pdfError: null, setPane: () => {}, retry: () => {} }),
}));

/* The three upload fields go browser → Storage; each is replaced with the
 * smallest control that can hand its value back. */
vi.mock("@/components/DOFileUploadField", () => ({
  default: ({ onUploaded }: { onUploaded: (p: string) => void }) => (
    <button
      type="button"
      data-testid="mock-do-upload"
      onClick={() => onUploaded("dos/PO-2001/do.pdf")}
    >
      Upload signed DO
    </button>
  ),
}));
vi.mock("@/components/ClaimPhotoUploadField", () => ({
  default: ({ testId }: { testId?: string }) => (
    <div data-testid={testId ?? "mock-claim-photos"} />
  ),
}));
vi.mock("@/components/ArrivalEvidenceUploadField", () => ({
  default: ({ testId }: { testId?: string }) => (
    <div data-testid={testId ?? "mock-arrival-evidence"} />
  ),
}));

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const SUPPLIERS = [
  { id: "sup-nf", name: "Nice Future", kind: "factory_pickup" },
  { id: "sup-oh", name: "Ohana", kind: "factory_pickup" },
] as unknown as SupplierRow[];

const WAREHOUSES = [
  { id: "wh-klang", name: "Carres Klang" },
  { id: "wh-setia", name: "Carres Setia" },
];

/** An EVIDENCED supplier reply — the only thing the governed
 *  `Supplier Delivery Date` (and so a Calendar marker) may come from. */
function supplierReply(date: string) {
  return {
    kind: "tomorrow_delivery",
    answer: "confirmed",
    about_date: null,
    new_date: date,
    po_version: 1,
    channel: "whatsapp",
    recipient: "Supplier group",
    evidence: "evidence/reply.jpg",
    reported_by: "Factory PIC",
    reported_at: "2026-09-01T02:00:00Z",
    recorded_by: "u-1",
    recorded_at: "2026-09-01T03:00:00Z",
    reason: null,
    remarks: null,
  };
}

function po(p: {
  id: string;
  supplier_id: string;
  status?: string;
  promises?: unknown[];
  lines: Array<{
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    damaged_qty?: number;
    wrong_item_qty?: number;
  }>;
}): operationPoListRow {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    warehouse_id: "wh-klang",
    status: p.status ?? "open",
    sup_status: "in_production",
    so: 1001,
    so_refs: null,
    eta_date: "2026-09-10",
    placed_at: "2026-08-01T00:00:00Z",
    version: 1,
    promises: p.promises ?? [],
    purchase_order_lines: p.lines,
  } as unknown as operationPoListRow;
}

/** A stored Receiving Session as the register lists it. */
function receipt(over: Record<string, unknown>) {
  return {
    id: "r-x",
    po_id: "PO-2001",
    warehouse_id: "wh-klang",
    warehouse_name: "Carres Klang",
    supplier_name: "Nice Future",
    do_number: "DO-5512",
    do_file_path: "dos/PO-2001/do.pdf",
    note: null,
    lines: [
      {
        id: "lr1",
        sku: "MS01",
        received_now: 2,
        damaged_qty: 0,
        wrong_item_qty: 0,
        wrong_item_claim_type: null,
      },
    ],
    status: "posted",
    submitted_by_name: null,
    submitted_at: "2026-09-01T02:00:00Z",
    reviewed_by_name: null,
    reviewed_at: null,
    return_reason: null,
    summary: "2 good",
    opens_claims: false,
    grn_no: "GRN-20260901-1234",
    goods_received_at: "2026-09-01",
    submitted_from: "office",
    posted_at: "2026-09-01T03:00:00Z",
    posted_by_name: "Shasha",
    /* Server-resolved through the ONE shared ladder — the rail only counts. */
    categories: ["Mattress"],
    /* Server-resolved: the linked PO's governed Supplier Delivery Date, the
       GRN Date (the posting's stamp in MYT), the source kind, the counted
       line count and the goods' FULL names by line key (2026-09-13). */
    supplier_delivery_date: "2026-09-08",
    grn_date: "2026-09-01",
    source_kind: "PO",
    items: 1,
    line_labels: { lr1: { name: "Dream · Queen", source: "snapshot", config: [] } },
    /* [] = the evidence store answered: verified none. */
    line_evidence_counts: [],
    ...over,
  };
}

const REGISTER_ROWS = [
  receipt({ id: "r-posted" }),
  /* A submitted count is WORK, not a GRN — the boundary says it never
     becomes a Register row. It stays in the fixture to prove exclusion. */
  receipt({
    id: "r-submitted",
    status: "submitted",
    grn_no: null,
    supplier_name: "Ohana",
    po_id: "PO-2002",
    posted_at: null,
    posted_by_name: null,
    submitted_from: "warehouse",
    submitted_by_name: "KLG Clerk",
    categories: ["Sofa"],
  }),
  receipt({
    id: "r-voided",
    status: "voided",
    grn_no: "GRN-20260830-7777",
    void_at: "2026-09-02T00:00:00Z",
    void_by_name: "Jess",
    void_reason: "Duplicate entry",
    supplier_name: "Ohana",
    categories: ["Sofa"],
    supplier_delivery_date: "2026-09-12",
    grn_date: "2026-08-30",
    /* One damaged piece with one recorded photo — the Exceptions column's
       fixture: `1 damaged` and the Photos / Videos doors. */
    lines: [
      {
        id: "lr1",
        sku: "SF99",
        received_now: 1,
        damaged_qty: 1,
        wrong_item_qty: 0,
        wrong_item_claim_type: null,
        damaged_photos: ["PO-2001/a-claim.jpg"],
      },
    ],
    line_labels: { lr1: { name: "Cloud Sofa · 3-seater", source: "catalog", config: ["Fabric BF-01"] } },
    line_evidence_counts: [{ exception_type: "damaged", line_key: "lr1", media_kind: "photo", count: 1 }],
  }),
];

/** Column heads in DOCUMENT order — the default order is the law. */
function headerOrder(): string[] {
  return screen
    .getAllByRole("columnheader")
    .map((th) => th.textContent?.trim() ?? "")
    .filter((t) => t.length > 0);
}

const FIND_POS = [
  po({
    id: "PO-2001",
    supplier_id: "sup-nf",
    promises: [supplierReply("2026-09-08")],
    lines: [
      { id: "l-ms01", sku: "MS01", qty: 3, received_qty: 0 },
      { id: "l-bf01", sku: "BF01", qty: 2, received_qty: 0 },
    ],
  }),
  po({
    id: "PO-2002",
    supplier_id: "sup-oh",
    promises: [supplierReply("2026-09-08")],
    lines: [{ id: "l-sf02", sku: "SF02", qty: 4, received_qty: 1 }],
  }),
  // Fully received — owes nothing, so it never reaches Find PO or CO, and
  // its supplier date stops being an EXPECTED arrival on the Calendar.
  po({
    id: "PO-2003",
    supplier_id: "sup-nf",
    promises: [supplierReply("2026-09-15")],
    lines: [{ id: "l-bf02", sku: "BF02", qty: 3, received_qty: 3 }],
  }),
];

/** One posted GRN as the record reads it (`useReceivingSessionDetail`). */
function postedDetail(over?: {
  receipt?: Record<string, unknown>;
  lines?: unknown[];
}) {
  return {
    receipt: receipt({
      id: "r-posted",
      actual_site_name: null,
      posted_duty_holder_name: "Shasha",
      posted_duty_cover_name: null,
      posted_authority: "grn_duty",
      lines: over?.lines ?? [
        {
          id: "lr1",
          sku: "MS01",
          received_now: 2,
          damaged_qty: 1,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ],
      unit_results: [
        {
          stock_item_id: "si1",
          unit_code: "U-0001",
          outcome: "received",
          issue_kind: null,
          note: null,
        },
        {
          stock_item_id: "si2",
          unit_code: "U-0002",
          outcome: "received_with_issue",
          issue_kind: "damaged",
          note: null,
        },
      ],
      ...(over?.receipt ?? {}),
    }),
    po: {
      id: "PO-2001",
      supplier_id: "sup-nf",
      warehouse_id: "wh-klang",
      purchase_order_lines: [
        {
          id: "l-ms01",
          sku: "MS01",
          qty: 3,
          received_qty: 2,
          damaged_qty: 1,
          wrong_item_qty: 0,
        },
      ],
    },
    events: [],
  };
}

/* ── Render helpers ────────────────────────────────────────────────────────── */

function renderWithProviders(ui: React.ReactElement, entry = "/operation?tab=receiving") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const renderPage = (entry?: string) =>
  renderWithProviders(<OperationReceiving />, entry);

/** The Session is owned by the page in production; here a two-line harness
 *  supplies the `receiving` state so Start Receiving genuinely flips it. */
function WorkspaceHarness({
  poRow,
  dutyAllowed = true,
  receivingAtStart = false,
}: {
  poRow: operationPoListRow;
  dutyAllowed?: boolean;
  receivingAtStart?: boolean;
}) {
  const [receiving, setReceiving] = useState(receivingAtStart);
  return (
    <ReceivingWorkspace
      po={poRow}
      supplier={SUPPLIERS.find((s) => s.id === poRow.supplier_id)}
      warehouseName="Carres Klang"
      warehouses={WAREHOUSES}
      dutyAllowed={dutyAllowed}
      receiving={receiving}
      onReceiving={setReceiving}
    />
  );
}

beforeEach(() => {
  // A fixed BUSINESS clock (only Date is faked — waitFor keeps real timers):
  // the Calendar must open on September 2026, the fixtures' own month, on
  // any machine in any timezone.
  vi.useFakeTimers({ now: new Date("2026-09-06T12:00:00+08:00"), toFake: ["Date"] });
  h.dutyAllowed = true;
  h.receipts = [...REGISTER_ROWS];
  h.waiting = 0;
  h.receiptsError = false;
  h.pageLimit = 50;
  h.registerAsks.length = 0;
  h.pos = [...FIND_POS];
  h.poReceiving = { sessions: [], events: [], expected_units: [] };
  h.sessionDetail = null;
  h.officeReceive.length = 0;
  h.amend.length = 0;
  h.voided.length = 0;
  h.review.length = 0;
  apiFetchMock.mockClear();
  apiFetchMock.mockImplementation(() => Promise.resolve({}));
  // The DataGrid persists sort/filter under its storageKey — a leak from one
  // test's clicks would silently reorder the next test's rows.
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ═══ THE REGISTER ═════════════════════════════════════════════════════════ */

describe("OperationReceiving — the formal GRN Register", () => {
  it("draws the 240px rail — the two-month expected-arrival display, then only the facets that can narrow; no Clear filters anywhere", () => {
    renderPage();
    const rail = screen.getByTestId("receiving-rail");
    expect(rail.className).toContain("w-[240px]");
    const inRail = within(rail);
    // The calendar scrolls WITH the filters (no fixed block), so two full
    // months never push the filters out of reach.
    expect(inRail.queryByTestId("receiving-rail-fixed")).not.toBeInTheDocument();
    expect(inRail.getByTestId("receiving-calendar")).toBeInTheDocument();
    expect(inRail.getByText("EXPECTED ARRIVALS")).toBeInTheDocument();
    // Only the governed categories PRESENT in the result set render.
    expect(inRail.getByTestId("rail-category-Mattress")).toBeInTheDocument();
    expect(inRail.getByTestId("rail-category-Sofa")).toBeInTheDocument();
    for (const absent of ["Bedframe", "Pillow", "Mattress protector"]) {
      expect(inRail.queryByTestId(`rail-category-${absent}`)).not.toBeInTheDocument();
    }
    for (const banned of ["Accessory", "Topper", "Footrest", "Service", "Any"]) {
      expect(inRail.queryByTestId(`rail-category-${banned}`)).not.toBeInTheDocument();
      expect(inRail.queryByText(banned)).not.toBeInTheDocument();
    }
    expect(inRail.getByText("SUPPLIER")).toBeInTheDocument();
    // Every GRN arrived at Carres Klang — that facet cannot narrow, so it is
    // not drawn (owner instruction 2026-09-13 §4).
    expect(inRail.queryByText("GOODS ARRIVED AT")).not.toBeInTheDocument();
    // NO `Clear filters` — rail, toolbar, footer or empty state.
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rail-clear-filters")).not.toBeInTheDocument();
    // The rail's own Hide control, and the old state rail is gone.
    expect(inRail.getByRole("button", { name: "Hide filters" })).toBeInTheDocument();
    for (const gone of [
      "All receiving",
      "All suppliers",
      "Count waiting for check",
      "Sent back to recount",
      "Posted",
      "Voided",
      "Received date",
    ]) {
      expect(inRail.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it("Hide filters removes the rail and the toolbar gains Show filters; reopening keeps the selection", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() => expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("receiving-rail")).not.toBeInTheDocument();
    // The listing keeps its narrowing while the rail is hidden.
    expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("receiving-show-filters"));
    expect(screen.getByTestId("receiving-rail")).toBeInTheDocument();
    expect(screen.getByTestId("rail-category-Sofa")).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("carres.receiving.rail.v1")).toBe("1");
  });

  it("between 768 and 1129px the rail opens CLOSED unless the browser remembers otherwise", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("1129"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { unmount } = renderPage();
      expect(screen.queryByTestId("receiving-rail")).not.toBeInTheDocument();
      expect(screen.getByTestId("receiving-show-filters")).toBeInTheDocument();
      unmount();
      localStorage.setItem("carres.receiving.rail.v1", "1");
      renderPage();
      expect(screen.getByTestId("receiving-rail").className).toContain("w-[240px]");
    } finally {
      window.matchMedia = original;
    }
  });

  it("lists ONLY GRNs — a submitted count is Work, never a Register row", () => {
    renderPage();
    // Valid GRN: the formal stored number, never re-derived.
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    // Cancelled GRN: history is never deleted; the record keeps its number.
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
    // The submitted count does NOT appear — no row, no `No GRN yet` cell.
    expect(screen.queryByText("No GRN yet")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2002")).not.toBeInTheDocument();
  });

  it("speaks document status words — Confirmed / Cancelled, mapped onto the existing states; never Posted / Voided / Valid", () => {
    renderPage();
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
    expect(screen.queryByText("Voided")).not.toBeInTheDocument();
    expect(screen.queryByText("Valid")).not.toBeInTheDocument();
  });

  it("prints the DEFAULT columns exactly, in the ruled order, and keeps the secondary facts optional", () => {
    renderPage();
    expect(headerOrder()).toEqual([
      "GRN No",
      "GRN Date",
      "Supplier DO No",
      "Supplier",
      "PO No",
      "Items",
      "Received Qty",
      "Exceptions",
      "GRN Status",
    ]);
    // The secondary facts are governed OPTIONAL columns — off by default.
    for (const optional of [
      "Goods received on",
      "Supplier Delivery Date",
      "Deliver To",
      "Goods arrived at",
      "Damaged Qty",
      "Wrong Item Qty",
      "Extra Qty",
      "Product",
      "PO/CO No",
    ]) {
      expect(screen.queryByRole("columnheader", { name: optional })).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Actual Site")).not.toBeInTheDocument();
    expect(screen.queryByText("Goods Received At")).not.toBeInTheDocument();
    // GRN Date is the posting's own date — the fixture's 30 Aug posting
    // prints 30 Aug, whatever its number says.
    const voidedRow = screen.getByTestId("grn-row-r-voided");
    expect(voidedRow).toHaveTextContent("Sun, 30 Aug");
    expect(voidedRow).toHaveTextContent("Cancelled");
    expect(voidedRow).toHaveTextContent("1 damaged");
    const postedRow = screen.getByTestId("grn-row-r-posted");
    expect(postedRow).toHaveTextContent("No exceptions");
    expect(within(postedRow).queryByRole("button", { name: /Photos/ })).not.toBeInTheDocument();
  });

  it("a category pick narrows the listing; picking it again clears; a supplier pick clears the same way — there is no Clear filters", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();

    // Re-clicking the active row clears that section.
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByTestId("rail-supplier-Nice Future"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("rail-supplier-Nice Future"));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("▸ expands to THIS receipt's own lines — Item · Received · Damaged · Wrong Item · Extra, the full name, no SKU column", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("expand-r-voided"));
    const box = await screen.findByTestId("row-expansion-r-voided");
    const heads = within(box).getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(heads).toEqual(["Item", "Received", "Damaged", "Wrong Item", "Extra"]);
    expect(within(box).getByText("Cloud Sofa · 3-seater")).toBeInTheDocument();
    // The catalog fallback says so; the SKU is never a column of its own.
    expect(within(box).getByText(/name from the current catalog/)).toBeInTheDocument();
    /* …and the line beneath the name carries THAT caveat and nothing else —
       no PO configuration code repeating an identity already given
       (owner correction 2026-09-14). */
    expect(box).not.toHaveTextContent("Fabric BF-01");
    expect(within(box).queryByText("SF99")).not.toBeInTheDocument();
    expect(within(box).queryByText("Receiving Result")).not.toBeInTheDocument();
    // A positive exception carries its Photos / Videos doors with VERIFIED counts.
    expect(within(box).getByTestId("line-evidence-lr1-damaged-photo")).toHaveTextContent("Photos 1");
    expect(within(box).getByTestId("line-evidence-lr1-damaged-video")).toHaveTextContent("Videos 0");
    expect(within(box).queryByTestId("line-evidence-lr1-wrong_item-photo")).not.toBeInTheDocument();
  });

  it("the Exceptions doors open ONE viewer scoped to the GRN, the exception, the kind and the named line", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("row-evidence-r-voided-damaged-photo"));
    const viewer = await screen.findByTestId("exception-evidence-viewer");
    expect(screen.getByRole("dialog")).toHaveTextContent("Damaged Photos · GRN-20260830-7777");
    /* ⭐ OWNER CORRECTION 2026-09-14 — the goods are named ONCE, by their
       resolved name. The PO line's configuration words used to be joined to it
       here and printed again beneath the name in the expansion; the reviewer
       read that repeated code as a second identity. The configuration belongs
       to the Purchase Order and prints on the PO paper. */
    expect(within(viewer).getByTestId("exception-evidence-lines")).toHaveTextContent("Cloud Sofa · 3-seater (1 damaged)");
    expect(within(viewer).getByTestId("exception-evidence-lines")).not.toHaveTextContent("Fabric BF-01");
  });

  it("a row whose evidence counts are not verified says so on the door — never a reassuring 0", () => {
    h.receipts = [receipt({ id: "r-unverified", grn_no: "GRN-20260902-0001", line_evidence_counts: undefined, lines: [
      { id: "lr1", sku: "MS01", received_now: 1, damaged_qty: 1, wrong_item_qty: 0, wrong_item_claim_type: null },
    ] })];
    renderPage();
    expect(screen.getByTestId("row-evidence-r-unverified-damaged-photo")).toHaveTextContent("Photos · Not verified");
  });

  it("shows real counts from the COMPLETE GRN result set", () => {
    renderPage();
    // One Mattress GRN, one Sofa GRN — the submitted Sofa count is NOT a
    // record and must not inflate the number. Counts come from the server's
    // facets over the whole filtered set, never the loaded page.
    expect(
      screen.getByTestId("rail-category-Mattress").textContent,
    ).toContain("1");
    expect(screen.getByTestId("rail-category-Sofa").textContent).toContain("1");
    // A governed category with no receiving shows NO row (never a `0` row).
    expect(
      screen.queryByTestId("rail-category-Pillow"),
    ).not.toBeInTheDocument();
  });

  it("Start Receiving opens Find PO or CO, and typing narrows the candidates", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("start-receiving-door"));
    await screen.findByTestId("receiving-find-po");
    // Only POs still owing goods are candidates — the fully received PO-2003
    // never appears.
    expect(screen.getByTestId("receiving-find-PO-2001")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-find-PO-2002")).toBeInTheDocument();
    expect(screen.queryByTestId("receiving-find-PO-2003")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("receiving-find-input"), {
      target: { value: "ohana" },
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId("receiving-find-PO-2001"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("receiving-find-PO-2002")).toBeInTheDocument();
  });

  it("with no owing PO the Find view says no delivery is ready — the governed sentence", async () => {
    h.pos = [];
    renderPage();
    fireEvent.click(screen.getByTestId("start-receiving-door"));
    const empty = await screen.findByTestId("receiving-find-empty");
    expect(empty).toHaveTextContent("No supplier delivery is ready to receive.");
  });

  it("a row opens the record, and the register stays MOUNTED but invisible", async () => {
    h.sessionDetail = postedDetail();
    renderPage();
    fireEvent.click(screen.getAllByText("GRN-20260901-1234")[0]);
    await screen.findByTestId("receiving-record");
    // Never display:none — `invisible` keeps rail filters, search, sort and
    // scroll alive for Back (the Manual Purchase / SO object law).
    const register = screen.getByTestId("receiving-register");
    expect(register).toBeInTheDocument();
    expect(register.className).toContain("invisible");
  });

  it("the status footer is information only — the complete count, no pager while one page holds everything", () => {
    renderPage();
    // Two GRNs (Confirmed + Cancelled); the submitted count is Work, not a record.
    expect(screen.getByTestId("grn-footer-summary")).toHaveTextContent("2 GRNs");
    expect(screen.queryByTestId("grn-pager")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("grid-footer")).queryAllByRole("button")).toHaveLength(0);
  });

  it("a failed listing says what broke and offers Try again", () => {
    h.receiptsError = true;
    renderPage();
    expect(
      screen.getByText("Receiving could not be opened"),
    ).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("an empty register says the RECORD is empty, never that goods have not come", () => {
    h.receipts = [];
    renderPage();
    expect(screen.getByText("No receiving activity yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing received/i)).not.toBeInTheDocument();
  });

  it("identifies a consignment source as a CO on its row — never silently a PO", () => {
    h.receipts = [receipt({ id: "r-co", grn_no: "GRN-20260903-0002", po_id: "CO-3001", source_kind: "CO" })];
    renderPage();
    expect(screen.getByTestId("source-co")).toHaveTextContent("CO");
    expect(screen.getByTestId("grn-row-r-co")).toHaveTextContent("CO-3001");
  });
});

/* ═══ THE RAIL CALENDAR · ONE DESTINATION · SERVER PAGINATION ═════════════ */

describe("OperationReceiving — the rail Calendar and the paged register", () => {
  it("is ONE destination — no Calendar/Register view switch, no Receiving Monitor", async () => {
    renderPage();
    // The month Calendar and the complete GRN Register render TOGETHER —
    // there is nothing to switch.
    expect(screen.getByTestId("receiving-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-register")).toBeInTheDocument();
    for (const banned of [
      "Calendar View",
      "GRN Register View",
      "Receiving Monitor",
    ]) {
      expect(screen.queryByText(banned)).not.toBeInTheDocument();
    }
    // The portal rail holds exactly ONE Receiving destination.
    const { PORTAL_NAV } = await import("../portal/portal-nav");
    const receivingRows = PORTAL_NAV.flatMap((g) => g.items).filter((i) =>
      i.label.toLowerCase().includes("receiving"),
    );
    expect(receivingRows.map((i) => i.label)).toEqual(["Receiving"]);
  });

  it("shows TWO complete months — the operator's and the next — with Sunday visible but muted and today a thin outline", () => {
    renderPage();
    const cal = screen.getByTestId("receiving-calendar");
    expect(within(cal).getByText("SEPTEMBER 2026")).toBeInTheDocument();
    expect(within(cal).getByText("OCTOBER 2026")).toBeInTheDocument();
    expect(cal).toHaveAttribute("data-months", "2");
    // Today (the fixture clock's 6 Sep) wears a thin OUTLINE, never a fill.
    const today = within(cal).getByTestId("month-day-2026-09-06");
    expect(today.closest("td")?.className ?? "").toContain("ring-1");
    expect(today.className).not.toContain("bg-kit-blue-9");
    expect(within(cal).getAllByText(/^Su/i).length).toBeGreaterThan(0);
    // 2026-09-06 is a Sunday — a non-working day wears the muted state; the
    // working calendar is Monday–Saturday.
    const sunday = within(cal).getByTestId("month-day-2026-09-06");
    expect(sunday.closest("td")?.className ?? "").toContain("kit-slate-9");
    const monday = within(cal).getByTestId("month-day-2026-09-07");
    expect(monday.closest("td")?.className ?? "").not.toContain("kit-slate-9");
  });

  it("the month arrows move exactly one month, and two complete months stay on screen", async () => {
    renderPage();
    const cal = screen.getByTestId("receiving-calendar");
    fireEvent.click(
      within(cal).getByRole("button", { name: /next month/i }),
    );
    await within(cal).findByText("NOVEMBER 2026");
    expect(within(cal).getByText("OCTOBER 2026")).toBeInTheDocument();
    expect(within(cal).queryByText("SEPTEMBER 2026")).not.toBeInTheDocument();
    fireEvent.click(
      within(cal).getByRole("button", { name: /previous month/i }),
    );
    await within(cal).findByText("SEPTEMBER 2026");
    expect(within(cal).getByText("OCTOBER 2026")).toBeInTheDocument();
  });

  it("marks expected supplier arrivals with an accessible COUNT — never colour alone", () => {
    renderPage();
    const cal = screen.getByTestId("receiving-calendar");
    // Two open, still-owing POs answered 8 Sep — the marker is the number 2
    // and the day button says it in words.
    const day = within(cal).getByTestId("month-day-2026-09-08");
    expect(day).toHaveAccessibleName(
      "2026-09-08 — 2 expected supplier arrivals",
    );
    expect(day.textContent).toContain("2");
    // The fully received PO-2003 stops being expected — 15 Sep is unmarked.
    const done = within(cal).getByTestId("month-day-2026-09-15");
    expect(done).toHaveAccessibleName("2026-09-15");
    // A month expecting nothing says so in words under its grid (13 Sep
    // review refinement — shown for owner acceptance).
    expect(screen.getByTestId("receiving-calendar-empty-2026-10")).toHaveTextContent(
      "No supplier arrivals expected in October 2026",
    );
    expect(screen.queryByTestId("receiving-calendar-empty-2026-09")).not.toBeInTheDocument();
  });

  it("an expected arrival already behind today is marked overdue — in words and ink, from the supplier's own confirmed date", () => {
    h.pos = [
      ...FIND_POS,
      po({
        id: "PO-2004",
        supplier_id: "sup-oh",
        promises: [supplierReply("2026-09-01")],
        lines: [{ id: "l-late", sku: "SF03", qty: 1, received_qty: 0 }],
      }),
    ];
    renderPage();
    const cal = screen.getByTestId("receiving-calendar");
    const late = within(cal).getByTestId("month-day-2026-09-01");
    expect(late).toHaveAccessibleName("2026-09-01 — 1 expected supplier arrival, overdue");
    expect(late).toHaveAttribute("data-overdue", "true");
    const onTime = within(cal).getByTestId("month-day-2026-09-08");
    expect(onTime).not.toHaveAttribute("data-overdue");
  });

  it("the calendar is a DISPLAY — a day filters nothing, hides no historical GRN and carries no work cards", async () => {
    renderPage();
    const cal = screen.getByTestId("receiving-calendar");
    fireEvent.click(within(cal).getByTestId("month-day-2026-09-08"));
    // Both GRNs stay; the register was never asked for a date.
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    await waitFor(() => expect(h.registerAsks.every((a) => a.expected === null)).toBe(true));
    expect(within(cal).getByTestId("month-day-2026-09-08")).not.toHaveAttribute("aria-pressed", "true");
    expect(within(cal).queryByRole("button", { name: /Start receiving/ })).not.toBeInTheDocument();
    // The right side stays the Register — never a weekly calendar.
    expect(screen.getByTestId("receiving-register-column")).toBeInTheDocument();
  });

  it("paginates on the SERVER — the pager sits in the top control area only when there is more than one page", async () => {
    h.pageLimit = 1;
    renderPage();
    // The pager is in the WORK TOOLBAR, never the footer.
    expect(within(screen.getByTestId("work-toolbar")).getByTestId("grn-pager")).toBeInTheDocument();
    expect(within(screen.getByTestId("grid-footer")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
      "1–1 of 2",
    );
    // Page 1 holds only the newest record; the second is NOT rendered.
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument();
    expect(screen.getByTestId("grn-page-previous")).toBeDisabled();

    fireEvent.click(screen.getByTestId("grn-page-next"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "2–2 of 2",
      ),
    );
    expect(
      h.registerAsks.some((a) => a.offset === 1),
    ).toBe(true);
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
    expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument();
    expect(screen.getByTestId("grn-page-next")).toBeDisabled();

    fireEvent.click(screen.getByTestId("grn-page-previous"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "1–1 of 2",
      ),
    );
  });

  it("a changed filter returns the register to page 1, and the footer says narrowed-versus-total", async () => {
    h.pageLimit = 1;
    renderPage();
    fireEvent.click(screen.getByTestId("grn-page-next"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "2–2 of 2",
      ),
    );
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    // One page again → the pager withdraws; the footer carries the whole truth.
    await waitFor(() =>
      expect(screen.getByTestId("grn-footer-summary")).toHaveTextContent(
        "1 GRN · 1 of 2 match the filters",
      ),
    );
    expect(screen.queryByTestId("grn-pager")).not.toBeInTheDocument();
    expect(h.registerAsks[h.registerAsks.length - 1]?.offset).toBe(0);
  });
});

/* ═══ THE SESSION (ReceivingWorkspace) ═════════════════════════════════════ */

describe("ReceivingWorkspace — the pre-start object", () => {
  const PRE_START = po({
    id: "PO-2001",
    supplier_id: "sup-nf",
    lines: [
      {
        id: "l-ms01",
        sku: "MS01",
        qty: 3,
        received_qty: 1,
        damaged_qty: 1,
        wrong_item_qty: 0,
      },
      { id: "l-bf01", sku: "BF01", qty: 2, received_qty: 0 },
    ],
  });

  it("prints the five governed quantity words — the operator never subtracts", () => {
    renderWithProviders(<WorkspaceHarness poRow={PRE_START} />);
    expect(screen.getByTestId("summary-order-qty")).toHaveTextContent("5");
    expect(screen.getByTestId("summary-received-qty")).toHaveTextContent("1");
    expect(screen.getByTestId("summary-damaged-qty")).toHaveTextContent("1");
    expect(screen.getByTestId("summary-wrong-qty")).toHaveTextContent("0");
    expect(screen.getByTestId("summary-pending-qty")).toHaveTextContent("4");
    // The governed spelling — `Deliver To`, never `Delivery To`.
    expect(screen.getByText("Deliver To")).toBeInTheDocument();
    expect(screen.queryByText("Delivery To")).not.toBeInTheDocument();
  });

  it("Start Receiving leads while goods are owed, and genuinely opens the Session", async () => {
    renderWithProviders(<WorkspaceHarness poRow={PRE_START} />);
    fireEvent.click(screen.getByTestId("start-receiving"));
    expect(await screen.findByTestId("receiving-mode")).toBeInTheDocument();
  });

  it("without GRN duty the button is replaced by the refusal sentence", () => {
    renderWithProviders(
      <WorkspaceHarness poRow={PRE_START} dutyAllowed={false} />,
    );
    expect(screen.queryByTestId("start-receiving")).not.toBeInTheDocument();
    expect(screen.getByTestId("receiving-duty-refusal")).toHaveTextContent(
      "Only GRN duty may save a receiving.",
    );
  });

  it("offers no Start Receiving on a PO that owes nothing", () => {
    const done = po({
      id: "PO-2003",
      supplier_id: "sup-nf",
      lines: [{ id: "l-bf02", sku: "BF02", qty: 3, received_qty: 3 }],
    });
    renderWithProviders(<WorkspaceHarness poRow={done} />);
    expect(screen.getByTestId("summary-pending-qty")).toHaveTextContent("0");
    // A button that could only refuse is not an action.
    expect(screen.queryByTestId("start-receiving")).not.toBeInTheDocument();
  });
});

describe("ReceivingWorkspace — the active Session", () => {
  const SESSION_PO = po({
    id: "PO-2001",
    supplier_id: "sup-nf",
    lines: [
      { id: "l-ms01", sku: "MS01", qty: 3, received_qty: 0 },
      { id: "l-bf01", sku: "BF01", qty: 2, received_qty: 0 },
    ],
  });

  const startSession = () =>
    renderWithProviders(<WorkspaceHarness poRow={SESSION_PO} receivingAtStart />);

  const UNITS = [
    { id: "u1", unit_code: "U-0001", sku: "MS01", status: "incoming" },
    { id: "u2", unit_code: "U-0002", sku: "MS01", status: "incoming" },
    { id: "u3", unit_code: "U-0003", sku: "MS01", status: "incoming" },
  ];

  it("never invents the supplier's DO number, and Save names the first missing fact", () => {
    startSession();
    expect(screen.getByTestId("do-number")).toHaveValue("");
    const save = screen.getByTestId("receiving-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Save — add a DO number");

    fireEvent.change(screen.getByTestId("do-number"), {
      target: { value: "DO-5512" },
    });
    expect(save).toHaveTextContent("Save — upload signed DO");
    expect(save).toBeDisabled();
  });

  it("prints the live Pending Delivery Qty after save beside the button", () => {
    startSession();
    // Every line is prefilled at its remaining count, so a full delivery
    // leaves nothing pending.
    expect(screen.getByTestId("pending-after-save")).toHaveTextContent(
      "Pending Delivery Qty after save: 0",
    );
    // Count 1 of MS01's 3 instead — this SAVE leaves 2 behind.
    fireEvent.change(screen.getByTestId("receive-now-l-ms01"), {
      target: { value: "1" },
    });
    expect(screen.getByTestId("pending-after-save")).toHaveTextContent(
      "Pending Delivery Qty after save: 2",
    );
  });

  it("Actual Site defaults to the PO's own booked warehouse", () => {
    startSession();
    expect(screen.getByTestId("actual-site")).toHaveValue("wh-klang");
  });

  it("renders one outcome row per governed Unit, quantities DERIVED from them", async () => {
    h.poReceiving.expected_units = UNITS;
    startSession();
    // Each expected Unit gets its own row and its three-outcome select.
    const outcome = screen.getByTestId("unit-outcome-U-0001");
    expect(screen.getByTestId("unit-U-0001")).toBeInTheDocument();
    for (const label of Object.values(RECEIVING_UNIT_OUTCOME_LABEL)) {
      expect(
        within(outcome).getByRole("option", { name: label }),
      ).toBeInTheDocument();
    }
    // Prefilled `received` up to the line's remaining count.
    expect(screen.getByTestId("derived-l-ms01")).toHaveTextContent("3 received");
    // Flip one Unit to `Not received` — the line's number FOLLOWS the
    // outcomes; the two can never disagree.
    fireEvent.change(screen.getByTestId("unit-outcome-U-0003"), {
      target: { value: "not_received" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("derived-l-ms01")).toHaveTextContent(
        "2 received",
      ),
    );
  });

  it("`+ Add line` records extra goods on their own row", () => {
    startSession();
    expect(screen.queryByTestId("extra-line-0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-extra-line"));
    expect(screen.getByTestId("extra-line-0")).toBeInTheDocument();
  });

  it("the save payload carries the saveKey, the per-Unit outcomes and the extra lines", async () => {
    h.poReceiving.expected_units = UNITS;
    startSession();

    fireEvent.change(screen.getByTestId("do-number"), {
      target: { value: "DO-5512" },
    });
    fireEvent.click(screen.getByTestId("mock-do-upload"));
    await waitFor(() =>
      expect(screen.getByTestId("receiving-save")).toHaveTextContent(
        "Save Receiving",
      ),
    );

    fireEvent.click(screen.getByTestId("add-extra-line"));
    fireEvent.change(screen.getByLabelText("Extra goods SKU 1"), {
      target: { value: "SF99" },
    });

    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.officeReceive).toHaveLength(1);
    const [poId, body] = h.officeReceive[0];
    expect(poId).toBe("PO-2001");
    expect(body.doNumber).toBe("DO-5512");
    expect(body.doFilePath).toBe("dos/PO-2001/do.pdf");
    // ONE key per Session entry — the idempotency contract (0426).
    expect(body.saveKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // 0493 — the extra line carries the identity the client minted, so its
    // evidence can be attached before Save; none here, so no paths ride.
    expect(body.extraLines).toMatchObject([
      { sku: "SF99", qty: 1, note: undefined, photos: undefined, videos: undefined },
    ]);
    expect((body.extraLines as Array<{ id: string }>)[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    const lines = body.lines as Array<{
      id: string;
      receivedNow: number;
      units?: Array<{ unitCode: string; outcome: string }>;
    }>;
    const ms = lines.find((l) => l.id === "l-ms01")!;
    expect(ms.receivedNow).toBe(3);
    expect(ms.units?.map((u) => u.unitCode).sort()).toEqual([
      "U-0001",
      "U-0002",
      "U-0003",
    ]);
    expect(ms.units?.every((u) => u.outcome === "received")).toBe(true);
    // The no-Unit line keeps its lawful quantity and carries no units array.
    const bf = lines.find((l) => l.id === "l-bf01")!;
    expect(bf.receivedNow).toBe(2);
    expect(bf.units).toBeUndefined();
  });

  it("says what saving will do — Inventory in, extra goods never available stock", () => {
    startSession();
    const consequences = screen.getByTestId("posting-consequences");
    expect(consequences).toHaveTextContent(
      "Valid received Units enter Inventory at Carres Klang",
    );
    expect(consequences).toHaveTextContent(
      "extra goods never become available stock",
    );
  });
});

/* ═══ THE RECORD (ReceivingRecord) ═════════════════════════════════════════ */

describe("ReceivingRecord — the posted GRN, the review, the two doors", () => {
  const renderRecord = () =>
    renderWithProviders(
      <ReceivingRecord sessionId="r-posted" onBack={() => {}} />,
    );

  it("a Confirmed GRN shows the stored number, the three location/date facts, the duty trio and Unit results", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    expect(
      screen.getByRole("heading", { name: "GRN-20260901-1234" }),
    ).toBeInTheDocument();
    // The document status word — never `Posted`, never `Valid`.
    expect(screen.getByTestId("receiving-record-state")).toHaveTextContent(
      "Confirmed",
    );
    // The three facts, corrected words: `Deliver To` · `Goods arrived at`
    // (no override = the instructed warehouse itself) · `Goods received on`.
    expect(screen.getByText("Deliver To")).toBeInTheDocument();
    expect(screen.getByText("Goods arrived at")).toBeInTheDocument();
    expect(screen.getByText("Goods received on")).toBeInTheDocument();
    expect(screen.queryByText("Actual Site")).not.toBeInTheDocument();
    expect(screen.queryByText("Goods Received At")).not.toBeInTheDocument();
    // The duty-evidence trio — never one overwritten name.
    expect(screen.getByTestId("duty-trio")).toHaveTextContent(
      "Shasha · GRN Duty",
    );
    expect(screen.getByTestId("unit-result-U-0001")).toHaveTextContent(
      RECEIVING_UNIT_OUTCOME_LABEL.received,
    );
    expect(screen.getByTestId("unit-result-U-0002")).toHaveTextContent(
      "damaged",
    );
    // A recorded issue with no linked Claim row says exactly that — never an
    // invented claim, never the Claims homepage as a substitute.
    expect(screen.getByTestId("followup-no-claim")).toHaveTextContent("No Claim is linked to this receiving.");
    // The six sections, separated: this receipt · current balance · related ·
    // follow-up · inventory · evidence and history.
    for (const title of ["This receipt", "Current PO balance", "Related receipts", "Exception follow-up", "Inventory Result", "Evidence and audit history"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByText(/What this saving did/i)).not.toBeInTheDocument();
    // The balance is labelled CURRENT and reads the PO as it stands now.
    expect(screen.getByTestId("record-balance")).toHaveTextContent("Ordered 3");
    expect(screen.getByTestId("record-balance")).toHaveTextContent("Received (all receipts) 2");
    expect(screen.getByTestId("record-balance")).toHaveTextContent("Outstanding 1");
    expect(screen.getByTestId("record-totals")).toHaveTextContent("Received Qty 2");
    expect(screen.getByTestId("record-totals")).toHaveTextContent("Damaged Qty 1");
  });

  it("the PO-2054 example — two receipts, one claim: this receipt's own numbers, the CURRENT balance, the exact claim", () => {
    h.sessionDetail = {
      ...postedDetail({
        receipt: {
          /* Production's own row id — the pre-0426 display number is derived
             from it, and prints GRN-050826-0883 exactly as the instruction
             names it. */
          id: "eab42aec-b53f-4cc2-bc99-d87fd0ce3db8",
          grn_no: null,
          po_id: "PO-2054",
          do_number: "DO-P5-0001",
          goods_received_at: "2026-08-05",
          submitted_at: "2026-08-05T08:20:04Z",
          posted_at: "2026-08-05T08:20:04Z",
          grn_date: "2026-08-05",
          supplier_name: "Ohana",
          lines: [
            { id: "f7fa", sku: "JAGER-SS", received_now: 1, damaged_qty: 1, wrong_item_qty: 0, wrong_item_claim_type: null, damaged_photos: ["receiving/p5/damaged-1.jpg"] },
          ],
          unit_results: [],
        },
      }),
      po: {
        id: "PO-2054",
        supplier_id: "sup-oh",
        warehouse_id: "wh-klang",
        purchase_order_lines: [{ id: "f7fa", sku: "JAGER-SS", qty: 3, received_qty: 3, damaged_qty: 1, wrong_item_qty: 0 }],
      },
      line_info: { "JAGER-SS": { description: "Super Single", label: "Jager · Super Single", category: "Bedframe" } },
      claims: [{ id: "c-1014", claim_no: "SC-1014", status: "closed", claim_type: "damaged", sku: "JAGER-SS", qty: 1, po_line_id: "f7fa", requested_action: "replace", supplier_response: "replacement" }],
      related_receipts: [{ id: "r-3948", grn_no: "GRN-050826-3948", do_number: "DO-P5-0002", status: "posted", goods_received_at: "2026-08-05", grn_date: "2026-08-05", received_qty: 2, damaged_qty: 0, wrong_item_qty: 0, extra_qty: 0 }],
      line_evidence: [{ id: "e1", exception_type: "damaged", line_key: "f7fa", media_kind: "photo", path: "receiving/p5/damaged-1.jpg", source: "projection", added_at: "2026-08-05T08:20:04Z", added_by_name: "Shasha" }],
    };
    renderRecord();
    // The historical number is derived for a pre-0426 posting.
    expect(screen.getByRole("heading", { name: "GRN-050826-0883" })).toBeInTheDocument();
    // THIS receipt: Received 1 · Damaged 1 — under the goods' FULL name.
    expect(screen.getByTestId("record-totals")).toHaveTextContent("Received Qty 1");
    expect(screen.getByTestId("record-totals")).toHaveTextContent("Damaged Qty 1");
    // The name appears on the line AND in the claim row — never the variant alone.
    expect(screen.getAllByText("Jager · Super Single").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Super Single$/)).not.toBeInTheDocument();
    // The CURRENT balance: Ordered 3 · Received 3 · Outstanding 0 — labelled as now.
    const balance = screen.getByTestId("record-balance");
    expect(balance).toHaveTextContent("Ordered 3");
    expect(balance).toHaveTextContent("Received (all receipts) 3");
    expect(balance).toHaveTextContent("Outstanding 0");
    expect(screen.getByText(/not the balance at the time of this receipt/)).toBeInTheDocument();
    // The other receipt on the source: GRN-050826-3948 · Received 2.
    expect(screen.getByTestId("related-receipts")).toHaveTextContent("GRN-050826-3948");
    expect(screen.getByTestId("related-receipts")).toHaveTextContent("Received 2");
    // The EXACT claim, by number and its own state — outstanding 0 rules nothing here.
    expect(screen.getByTestId("claim-link-c-1014")).toHaveAttribute("href", "/operation?tab=claims&claim=c-1014");
    expect(screen.getByTestId("followup-claims")).toHaveTextContent("SC-1014");
    expect(screen.getByTestId("followup-claims")).toHaveTextContent("Closed");
    expect(screen.getByText(/A closed source balance does not close a Claim/)).toBeInTheDocument();
    // Inventory Result: no Unit outcomes on this pre-Unit-tracking receipt — said, not invented.
    expect(screen.getByTestId("inventory-counted")).toHaveTextContent("1 received piece posted as counted stock at Carres Klang.");
    expect(screen.getByTestId("inventory-counted")).toHaveTextContent("Unit outcomes were not recorded");
    // The evidence door carries the verified count.
    expect(screen.getByTestId("record-summary-evidence-damaged-photo")).toHaveTextContent("Photos 1");
    expect(screen.getByTestId("record-summary-evidence-damaged-video")).toHaveTextContent("Videos 0");
  });

  it("a Valid GRN is 50/50 — Receiving Record left, the OFFICIAL preview with Print and Download PDF right, one header only", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    const record = screen.getByTestId("grn-record-pane");
    const preview = screen.getByTestId("grn-preview-pane");
    // Half-and-half at the governed desktop breakpoint; stacked below it.
    expect(record.className).toContain("lg:w-1/2");
    expect(preview.className).toContain("lg:w-1/2");
    // The preview is the REAL renderer's pane plus the two document acts.
    expect(within(preview).getByTestId("grn-pdf-pane")).toBeInTheDocument();
    expect(within(preview).getByTestId("grn-print")).toHaveTextContent("Print");
    expect(within(preview).getByTestId("grn-download")).toHaveTextContent(
      "Download PDF",
    );
    // ONE Object Header — the preview pane repeats no title.
    expect(screen.getAllByRole("heading", { name: "GRN-20260901-1234" })).toHaveLength(1);
  });

  it("a submitted count under review is full width — no GRN, no document pane", () => {
    h.sessionDetail = postedDetail({
      receipt: { status: "submitted", grn_no: null, posted_at: null },
    });
    renderRecord();
    expect(screen.queryByTestId("grn-preview-pane")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grn-print")).not.toBeInTheDocument();
  });

  it("a CLEAN posting offers no Claims door — nothing to open", () => {
    h.sessionDetail = postedDetail({
      lines: [
        {
          id: "lr1",
          sku: "MS01",
          received_now: 2,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ],
    });
    renderRecord();
    expect(screen.queryByTestId("record-open-claims")).not.toBeInTheDocument();
  });

  it("a submitted count offers Save Receiving and Return count, and the review posts the move", () => {
    h.sessionDetail = postedDetail({
      receipt: { status: "submitted", grn_no: null, posted_at: null },
    });
    renderRecord();
    expect(screen.getByTestId("save-receiving-review")).toHaveTextContent(
      "Save Receiving",
    );
    expect(screen.getByTestId("return-count-door")).toHaveTextContent(
      "Return count to Carres Klang",
    );
    fireEvent.click(screen.getByTestId("save-receiving-review"));
    expect(h.review).toEqual([["check-in", { receiptId: "r-posted" }]]);
  });

  it("Return count demands the reason, then sends it back with it", () => {
    h.sessionDetail = postedDetail({
      receipt: { status: "submitted", grn_no: null, posted_at: null },
    });
    renderRecord();
    fireEvent.click(screen.getByTestId("return-count-door"));
    const confirm = screen.getByTestId("confirm-return-count");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("return-reason"), {
      target: { value: "Recount the mattresses" },
    });
    fireEvent.click(confirm);
    expect(h.review).toEqual([
      ["send-back", { receiptId: "r-posted", reason: "Recount the mattresses" }],
    ]);
  });

  it("without GRN duty the review offers the refusal sentence instead of buttons", () => {
    h.dutyAllowed = false;
    h.sessionDetail = postedDetail({
      receipt: { status: "submitted", grn_no: null, posted_at: null },
    });
    renderRecord();
    expect(
      screen.queryByTestId("save-receiving-review"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("return-count-door")).not.toBeInTheDocument();
    expect(screen.getByTestId("review-duty-refusal")).toHaveTextContent(
      "Only GRN duty may save a receiving.",
    );
  });

  it("Amend takes the left half — reason → Original → Corrected → Save Amendment — while the live preview stays", async () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    fireEvent.click(screen.getByTestId("amend-receiving-door"));

    // The RIGHT half remains the live preview, watermarked UNSAVED.
    expect(screen.getByTestId("grn-preview-pane")).toBeInTheDocument();
    expect(screen.getByTestId("unsaved-watermark")).toBeInTheDocument();
    // The correction form owns the amendable facts — including the physical
    // arrival location — and states what CANNOT be amended.
    expect(screen.getByTestId("amend-arrived-at")).toBeInTheDocument();
    expect(
      screen.getByText(/GRN number, the source PO\/CO and the supplier cannot be amended/),
    ).toBeInTheDocument();

    const save = screen.getByTestId("amend-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Save — add a correction reason");

    fireEvent.change(screen.getByTestId("amend-reason"), {
      target: { value: "Miscount fixed" },
    });
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Save — nothing changed yet");

    fireEvent.change(screen.getByTestId("amend-line-lr1"), {
      target: { value: "3" },
    });
    await waitFor(() => expect(save).toBeEnabled());
    expect(save).toHaveTextContent("Save Amendment");
    fireEvent.click(save);

    expect(h.amend).toHaveLength(1);
    const [id, body] = h.amend[0];
    expect(id).toBe("r-posted");
    expect(body.reason).toBe("Miscount fixed");
    expect(body.saveKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.lines).toEqual([{ id: "lr1", receivedNow: 3 }]);
    // Unchanged header facts stay OUT of the correction.
    expect(body.doNumber).toBeUndefined();
    expect(body.goodsReceivedAt).toBeUndefined();
    expect(body.actualSiteId).toBeUndefined();
  });

  it("an amended arrival location and a corrected DO file join the correction payload", async () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    fireEvent.click(screen.getByTestId("amend-receiving-door"));
    fireEvent.change(screen.getByTestId("amend-reason"), {
      target: { value: "Goods landed at Setia" },
    });
    fireEvent.change(screen.getByTestId("amend-arrived-at"), {
      target: { value: "wh-setia" },
    });
    fireEvent.click(screen.getByTestId("mock-do-upload"));
    const save = screen.getByTestId("amend-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    const [, body] = h.amend[0];
    expect(body.actualSiteId).toBe("wh-setia");
    expect(body.doFilePath).toBe("dos/PO-2001/do.pdf");
  });

  it("Void Receiving hides in More ▾ — not a normal primary action — and walks impact → reason → void", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    // No direct Void button on the object.
    expect(screen.queryByTestId("void-receiving-door")).not.toBeInTheDocument();
    expect(screen.queryByTestId("void-impact")).not.toBeInTheDocument();
    // Radix opens on Enter in jsdom (the kit suite's own recipe).
    fireEvent.keyDown(screen.getByTestId("grn-more-menu"), { key: "Enter" });
    fireEvent.click(screen.getByText("Void Receiving"));
    // The impact review, BEFORE the act.
    expect(screen.getByTestId("void-impact")).toHaveTextContent(
      "2 received unit(s) go back to Incoming",
    );
    const save = screen.getByTestId("void-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Void — add a reason");
    fireEvent.change(screen.getByTestId("void-reason"), {
      target: { value: "Wrong PO entirely" },
    });
    expect(save).toHaveTextContent("Void Receiving");
    fireEvent.click(save);
    expect(h.voided).toEqual([["r-posted", { reason: "Wrong PO entirely" }]]);
  });

  it("a Cancelled GRN keeps its banner and number, loses the doors, and says Cancelled — never Voided", () => {
    h.sessionDetail = postedDetail({
      receipt: {
        status: "voided",
        void_at: "2026-09-02T00:00:00Z",
        void_by_name: "Jess",
        void_reason: "Duplicate entry",
      },
    });
    renderRecord();
    expect(screen.getByTestId("receiving-record-state")).toHaveTextContent(
      "Cancelled",
    );
    const banner = screen.getByTestId("void-banner");
    expect(banner).toHaveTextContent("Cancelled");
    expect(banner).toHaveTextContent("Jess");
    expect(banner).toHaveTextContent("Duplicate entry");
    expect(banner).toHaveTextContent("preserved");
    // The document itself is still there to print — history never deletes.
    expect(screen.getByTestId("grn-preview-pane")).toBeInTheDocument();
    expect(
      screen.queryByTestId("amend-receiving-door"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("grn-more-menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Voided")).not.toBeInTheDocument();
  });
});

/* ═══ THE RETIRED WORDS — a source scan across every Receiving surface ═════ */

import { visibleStrings } from "../../test/banned-words";

/**
 * Owner correction 2026-09-06 §3: `Actual Site`, `Delivery Location` and
 * `Goods Received At` are retired from every Receiving surface — the
 * corrected words are `Deliver To` · `Goods arrived at` · `Goods received
 * on`. (`Delivery Location` stays reserved for the CUSTOMER's delivery
 * address, which no Receiving file may claim.) A render test only sees the
 * branches its fixture reaches; the source scan sees every branch — the C12
 * lesson.
 */
describe("Receiving speaks the corrected location/date words — source scan", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const FILES = [
    join(HERE, "OperationReceiving.tsx"),
    join(HERE, "OperationReceivingReport.tsx"),
    join(HERE, "components", "ReceivingRecord.tsx"),
    join(HERE, "components", "ReceivingWorkspace.tsx"),
    join(HERE, "components", "grn-template-data.ts"),
    join(HERE, "..", "..", "lib", "pdf", "grn-template.tsx"),
  ];
  const RETIRED: Array<[RegExp, string]> = [
    [/Actual Site/, "Actual Site → Goods arrived at"],
    [/Goods Received At/, "Goods Received At → Goods received on"],
    [/Delivery Location/, "reserved for the customer's delivery address"],
  ];

  for (const file of FILES) {
    const name = file.split(/[\\/]/).pop();
    it(`${name} carries none of the retired words`, () => {
      const strings = visibleStrings(readFileSync(file, "utf8"));
      // Non-vacuity: the scan must actually be reading strings (the pure
      // builder carries only a handful; the pages carry dozens).
      expect(strings.length).toBeGreaterThan(2);
      for (const [re, why] of RETIRED) {
        expect(
          strings.filter((s) => re.test(s)),
          `${name} may not say ${re.source} — ${why}`,
        ).toEqual([]);
      }
    });
  }
});
