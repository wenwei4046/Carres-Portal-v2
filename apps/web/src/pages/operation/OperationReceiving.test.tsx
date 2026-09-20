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
  /** The GRN document's own item words and governed categories, per SKU. */
  lineInfo: {} as Record<string, { description: string | null; category: string }>,
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
      receivedWith: "damaged" | "wrong_item" | "extra" | null;
      from: string | null;
      to: string | null;
      cancelled: boolean;
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
          /* `GRN date` is the CREATION stamp — the posting — read here
             exactly as the Worker reads it. */
          grnDateIso: ((r.posted_at as string | null) ?? "").slice(0, 10) || null,
          damaged: (r.lines as Array<{ damaged_qty: number }>).some(
            (l) => l.damaged_qty > 0,
          ),
          wrongItem: (r.lines as Array<{ wrong_item_qty: number }>).some(
            (l) => l.wrong_item_qty > 0,
          ),
          extra: ((r.extra_lines as unknown[] | undefined) ?? []).length > 0,
          cancelled: r.status === "voided",
          searchText: [r.grn_no, r.po_id, r.do_number, r.supplier_name]
            .filter(Boolean)
            .join(" "),
        })),
        { ...filters, cancelled: filters.cancelled ? true : null },
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
          },
          facets: view.facets,
          line_info: h.lineInfo,
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
    /* Server-resolved: the linked PO's governed Supplier Delivery Date and
       the GRN paper's own product words. */
    supplier_delivery_date: "2026-09-08",
    product_labels: ["Dream Queen"],
    ...over,
  };
}

const REGISTER_ROWS = [
  /* Created Tue 1 Sep (Kuala Lumpur). It carries BOTH a damaged unit and
     extra goods, which is how the rail's overlapping counts are proved. */
  receipt({
    id: "r-posted",
    lines: [
      {
        id: "lr1",
        sku: "MS01",
        received_now: 2,
        damaged_qty: 1,
        wrong_item_qty: 0,
        wrong_item_claim_type: null,
      },
    ],
    extra_lines: [{ sku: "MS02", qty: 2 }],
    source_refs: ["SO-1303", "MPR-20260904-8935"],
    unit_ids_by_line: { lr1: ["id-abc000001", "id-abc000002"] },
  }),
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
    /* Created on a SUNDAY, in the week and the month before the other one —
       a GRN can be created on a Sunday and the rail must list that day. */
    posted_at: "2026-08-30T03:00:00Z",
    void_at: "2026-09-02T00:00:00Z",
    void_by_name: "Jess",
    void_reason: "Duplicate entry",
    supplier_name: "Ohana",
    categories: ["Sofa"],
    supplier_delivery_date: "2026-09-12",
    product_labels: ["Cloud Sofa 3-seater"],
    extra_lines: [],
    /* A consignment return: no purchase order at all, and no number is
       invented to fill the column. */
    source_refs: [],
    unit_ids_by_line: {},
  }),
];

/** The GRN paper's own item words and governed categories, server-resolved. */
const LINE_INFO = {
  MS01: { description: "Dream Queen", category: "Mattress" },
  MS02: { description: "Dream King", category: "Mattress" },
};

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
  h.lineInfo = { ...LINE_INFO };
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
  it("draws the 240px rail — the six approved groups, no month Calendar, no Clear filters button", () => {
    renderPage();
    const rail = screen.getByTestId("receiving-rail");
    expect(rail.className).toContain("w-[240px]");
    const inRail = within(rail);
    // The six groups the owner ruled, in order (§9.4, 2026-09-17).
    for (const heading of [
      "GRN date",
      "Received with",
      "Category",
      "Goods arrived at",
      "Supplier",
      "Cancelled GRNs",
    ]) {
      expect(inRail.getByText(heading)).toBeInTheDocument();
    }
    // The month Calendar is RETIRED — the expected-arrival view lives in
    // Warehouse Arrival Schedule.
    expect(inRail.queryByTestId("receiving-calendar")).not.toBeInTheDocument();
    // And the rail has NO permanent Clear filters button (owner correction
    // 2026-09-18); the toolbar's active conditions clear what is on.
    expect(inRail.queryByTestId("rail-clear-filters")).not.toBeInTheDocument();
    expect(inRail.queryByText("Clear filters")).not.toBeInTheDocument();

    expect(
      inRail.getByTestId("rail-category-Mattress"),
    ).toBeInTheDocument();
    // Only the governed categories PRESENT in the result set render — the
    // fixtures hold Mattress and Sofa GRNs, so Bedframe/Pillow/Mattress
    // protector rows do not appear (owner correction 2026-09-06).
    expect(inRail.getByTestId("rail-category-Sofa")).toBeInTheDocument();
    for (const absent of ["Bedframe", "Pillow", "Mattress protector"]) {
      expect(
        inRail.queryByTestId(`rail-category-${absent}`),
      ).not.toBeInTheDocument();
    }
    // No invented category ever renders a row.
    for (const banned of ["Accessory", "Topper", "Footrest", "Service", "Any"]) {
      expect(
        inRail.queryByTestId(`rail-category-${banned}`),
      ).not.toBeInTheDocument();
      expect(inRail.queryByText(banned)).not.toBeInTheDocument();
    }
    // The old Receiving state rail is retired — no `All …`, no state rows.
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

  it("opens on every permitted GRN — no date has to be chosen to see records", () => {
    renderPage();
    // The listing is complete before any rail choice (owner ruling
    // 2026-09-18): the page never opens on an empty date-picker.
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
      "Showing 1–2 of 2",
    );
    const first = h.registerAsks[0]!;
    expect(first.from).toBeNull();
    expect(first.to).toBeNull();
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

  it("gives a normal GRN no status word, and says Cancelled under the cancelled one's number", () => {
    renderPage();
    // There is no Status COLUMN at all, and no `Valid` anywhere.
    expect(
      within(screen.getByTestId("grid-header")).queryByText("Status"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Valid")).not.toBeInTheDocument();
    // `Cancelled` appears exactly where the person reading the number is
    // already looking — under the GRN No of the cancelled record.
    const mark = screen.getByTestId("grn-cancelled-r-voided");
    expect(mark).toHaveTextContent("Cancelled");
    // Database words never reach this screen.
    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
    expect(screen.queryByText("Voided")).not.toBeInTheDocument();
    // Partial/completed receipt progress belongs to the purchase order — a
    // GRN is a document, and a document is not half saved.
    for (const banned of ["Partial", "Partly received", "Completed"]) {
      expect(screen.queryByText(banned)).not.toBeInTheDocument();
    }
  });

  it("speaks the approved column words, and none of the retired ones", () => {
    renderPage();
    const headerEl = screen.getByTestId("grid-header");
    const header = within(headerEl);
    /* A two-line header is one label broken by a `<br>`, so the words are
       read off the header's own text rather than as separate elements. */
    const headerText = (headerEl.textContent ?? "").replace(/\s+/g, " ");
    for (const word of [
      "GRN Date",
      "GRN No",
      // The four-way source reference, on its two approved lines.
      "SO No / MPR No",
      "CO No / RO No",
      "PO No",
      "Supplier",
      "Supplier Deliver To",
      "Goods arrived at",
      "Supplier Confirmed Delivery Date",
      "Goods Received Date",
      // `No` takes NO full stop (owner ruling 2026-09-18).
      "Supplier DO No",
      "Items",
      "Received Qty",
      "Damaged Qty",
      "Wrong Item Qty",
      "Extra Qty",
    ]) {
      expect(headerText).toContain(word);
    }
    // Every retired word this register printed until today.
    for (const retired of [
      "Supplier Delivery Date",
      "Goods received on",
      "Product",
      "PO/CO No",
      "Actual Site",
      "Goods Received At",
      "Delivery Location",
    ]) {
      expect(header.queryByText(retired)).not.toBeInTheDocument();
    }
  });

  it("prints the genuine linked documents, and invents none for a receipt without them", () => {
    renderPage();
    expect(screen.getByText("SO-1303")).toBeInTheDocument();
    expect(screen.getByText("MPR-20260904-8935")).toBeInTheDocument();
    // The cancelled GRN has no linked source and no purchase order of its
    // own in the fixture — the cells stay empty rather than borrowing one.
    expect(screen.queryByText("SO-0000")).not.toBeInTheDocument();
  });

  it("a category pick narrows the listing; picking it again clears; the toolbar chip clears the rest", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);

    // Re-clicking the active row clears that section.
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0),
    );

    // The rail lost its Clear filters button; the toolbar's active
    // conditions name what is on and clear it (owner correction 2026-09-18).
    fireEvent.click(screen.getByTestId("rail-category-Mattress"));
    fireEvent.click(screen.getByTestId("rail-supplier-Nice Future"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Category: Mattress")).toBeInTheDocument();
    expect(screen.getByText("Supplier: Nice Future")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0),
    );
  });

  it("the GRN date group lists weeks, months and Choose dates — and a week's arrow only OPENS it", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    // Two weeks, each counting the GRNs CREATED in it — 31 Aug – 6 Sep holds
    // the Tuesday record, 24 – 30 Aug holds the SUNDAY one.
    const week = rail.getByTestId("rail-grn-week-2026-08-31");
    expect(week).toHaveTextContent("31 Aug – 6 Sep");
    expect(week).toHaveTextContent("1");
    expect(rail.getByTestId("rail-grn-week-2026-08-24")).toHaveTextContent(
      "24 – 30 Aug",
    );
    // Months and Choose dates… are the coarser and the free choice.
    expect(rail.getByTestId("rail-grn-month-2026-09")).toHaveTextContent("Sep 2026");
    expect(rail.getByTestId("rail-grn-month-2026-08")).toHaveTextContent("Aug 2026");
    expect(rail.getByTestId("rail-grn-choose")).toHaveTextContent("Choose dates…");

    // THE ARROW FILTERS NOTHING — it only reveals the week's days, Sunday
    // included, and days with no GRN are never listed.
    expect(rail.queryByTestId("rail-grn-day-2026-08-30")).not.toBeVisible();
    fireEvent.click(rail.getByTestId("rail-grn-week-2026-08-24-expand"));
    await waitFor(() =>
      expect(rail.getByTestId("rail-grn-day-2026-08-30")).toBeVisible(),
    );
    expect(rail.getByTestId("rail-grn-day-2026-08-30")).toHaveTextContent("30 Aug");
    expect(rail.queryByTestId("rail-grn-day-2026-08-29")).not.toBeInTheDocument();
    // Opening it changed no filter.
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent("of 2");

    // Pressing the WEEK is what filters, as one inclusive range.
    fireEvent.click(rail.getByTestId("rail-grn-week-2026-08-24"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument(),
    );
    const ask = h.registerAsks[h.registerAsks.length - 1]!;
    expect(ask.from).toBe("2026-08-24");
    expect(ask.to).toBe("2026-08-30");
    // Pressing it again clears the choice.
    fireEvent.click(rail.getByTestId("rail-grn-week-2026-08-24"));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0),
    );
  });

  it("a day inside a week filters that one day", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    fireEvent.click(rail.getByTestId("rail-grn-week-2026-08-31-expand"));
    fireEvent.click(await rail.findByTestId("rail-grn-day-2026-09-01"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument(),
    );
    const ask = h.registerAsks[h.registerAsks.length - 1]!;
    expect(ask.from).toBe("2026-09-01");
    expect(ask.to).toBe("2026-09-01");
  });

  it("Choose dates… opens two labelled fields and asks the server for that range", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    fireEvent.click(rail.getByTestId("rail-grn-choose"));
    await rail.findByTestId("rail-grn-range");
    /* The shared `DateField` — day-first whatever the machine's locale, so
       the rail cannot show one spelling of a date and the table another. */
    const from = rail.getByLabelText("GRN date from");
    fireEvent.change(from, { target: { value: "01/08/2026" } });
    fireEvent.change(rail.getByLabelText("GRN date to"), {
      target: { value: "31/08/2026" },
    });
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument(),
    );
    const ask = h.registerAsks[h.registerAsks.length - 1]!;
    expect(ask.from).toBe("2026-08-01");
    expect(ask.to).toBe("2026-08-31");
  });

  it("`Received with` counts GRN RECORDS, overlapping — never a total", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    // ONE GRN carries both a damaged unit and extra goods, so it is counted
    // in two rows. 1 + 0 + 1 describes one record, which is exactly why the
    // three numbers are never added together.
    expect(rail.getByTestId("rail-received-damaged")).toHaveTextContent("1");
    expect(rail.getByTestId("rail-received-wrong_item")).toHaveTextContent("0");
    expect(rail.getByTestId("rail-received-extra")).toHaveTextContent("1");
    expect(rail.getByText("Damaged goods")).toBeInTheDocument();
    expect(rail.getByText("Wrong items")).toBeInTheDocument();
    expect(rail.getByText("Extra goods")).toBeInTheDocument();

    fireEvent.click(rail.getByTestId("rail-received-damaged"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Received with: Damaged goods")).toBeInTheDocument();
    // Selected facets toggle off.
    fireEvent.click(rail.getByTestId("rail-received-damaged"));
    await waitFor(() =>
      expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0),
    );
  });

  it("Cancelled GRNs is the last ROW, and the default listing holds valid and cancelled alike", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    expect(rail.getByTestId("rail-cancelled")).toHaveTextContent("1");
    // Both are listed before anything is chosen.
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
    fireEvent.click(rail.getByTestId("rail-cancelled"));
    await waitFor(() =>
      expect(screen.queryByText("GRN-20260901-1234")).not.toBeInTheDocument(),
    );
    // The rail row AND the toolbar's active condition both say it.
    expect(screen.getAllByText("Cancelled GRNs").length).toBe(2);
  });

  it("the read-only goods expansion carries the receipt's own line facts — and buys nothing", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("grn-expand-r-posted"));
    const goods = within(await screen.findByTestId("grn-goods-r-posted"));
    // The approved order: Category · Supplier · Supplier Deliver To ·
    // PO No / Ref No (+ Unit ID) · Items · the four quantity words.
    const headers = goods
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Category",
      "Supplier",
      "Supplier Deliver To",
      "PO No / Ref No",
      "Items",
      "Received Qty",
      "Damaged Qty",
      "Wrong Item Qty",
      "Extra Qty",
    ]);
    // The source number leads; its line-bound Unit IDs follow beneath it.
    expect(goods.getByText("PO-2001")).toBeInTheDocument();
    expect(goods.getByText("id-abc000001")).toBeInTheDocument();
    expect(goods.getByText("id-abc000002")).toBeInTheDocument();
    // The GRN paper's own item word, with the SKU on its second line.
    expect(goods.getByText("Dream Queen")).toBeInTheDocument();
    expect(goods.getAllByText("MS01").length).toBeGreaterThan(0);
    // Extra goods keep their OWN row — never folded into a received line.
    expect(goods.getByText("Dream King")).toBeInTheDocument();
    expect(goods.getByText("Extra goods")).toBeInTheDocument();
    // It selects nothing and buys nothing.
    expect(goods.queryAllByRole("checkbox")).toHaveLength(0);
    for (const banned of ["Ready Stock", "To buy", "Ordered Qty"]) {
      expect(goods.queryByText(banned)).not.toBeInTheDocument();
    }
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

  it("the status footer speaks the server page — Showing 1–2 of 2", () => {
    renderPage();
    // Two GRNs (Valid + Cancelled); the submitted count is Work, not a record.
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
      "Showing 1–2 of 2",
    );
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

  it("leads with GRN Date then GRN No — the pinned pair the engine guarantees", () => {
    renderPage();
    const headerCells = within(screen.getByTestId("grid-header"))
      .getAllByRole("columnheader")
      .map((th) => (th.textContent ?? "").replace(/\s+/g, " ").trim());
    /* The engine owns the pin (`leadingColumns`): the two lead in this order
       whatever a saved layout says, neither can be hidden, and below a 768px
       canvas the identity pins alone. The disclosure gutter comes first. */
    const named = headerCells.filter((t) => t.length > 0);
    expect(named[0]).toContain("GRN Date");
    expect(named[1]).toContain("GRN No");
  });

  it("keeps a long four-way reference whole — every number, none dropped", () => {
    h.receipts = [
      receipt({
        id: "r-long",
        source_refs: [
          "SO-1303",
          "SO-1477",
          "MPR-20260904-8935",
          "RO-20260916-0042",
        ],
        po_id: "PO-20260901-4827",
        supplier_name: "Dorsettloft Manufacturing Sdn Bhd",
        warehouse_name: "AL Sungai Buloh Distribution Centre",
      }),
    ];
    renderPage();
    // A reference list is not truncated to the first one, and not summarised
    // into `+3 more`: each document the receipt genuinely carries is readable.
    for (const ref of [
      "SO-1303",
      "SO-1477",
      "MPR-20260904-8935",
      "RO-20260916-0042",
      "PO-20260901-4827",
    ]) {
      expect(screen.getByText(ref)).toBeInTheDocument();
    }
    // The long supplier name reads in the row and in the rail alike.
    expect(
      screen.getAllByText("Dorsettloft Manufacturing Sdn Bhd").length,
    ).toBeGreaterThan(0);
  });

  it("is reachable by keyboard — the arrow opens a week with Enter and still filters nothing", async () => {
    renderPage();
    const rail = within(screen.getByTestId("receiving-rail"));
    const arrow = rail.getByTestId("rail-grn-week-2026-08-24-expand");
    // A real button with a stated expanded state, and an accessible name that
    // says what it does — not a decorative caret.
    expect(arrow.tagName).toBe("BUTTON");
    expect(arrow).toHaveAttribute("aria-expanded", "false");
    expect(arrow).toHaveAccessibleName("Show the days in 24 – 30 Aug");
    arrow.focus();
    expect(document.activeElement).toBe(arrow);
    fireEvent.keyDown(arrow, { key: "Enter" });
    fireEvent.click(arrow);
    await waitFor(() => expect(arrow).toHaveAttribute("aria-expanded", "true"));
    // Opening it narrowed nothing — both GRNs are still listed.
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
      "Showing 1–2 of 2",
    );
    const ask = h.registerAsks[h.registerAsks.length - 1]!;
    expect(ask.from).toBeNull();
    expect(ask.to).toBeNull();
  });

  it("the cells speak the server-resolved facts, in the governed words", () => {
    renderPage();
    // The GRN paper's own item words, and the governed supplier answer.
    expect(screen.getAllByText("Dream Queen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cloud Sofa 3-seater").length).toBeGreaterThan(0);
    // Both fixtures carry an evidenced supplier answer, so nothing reads
    // `Not confirmed` — the absence word is never printed over a real date.
    expect(screen.queryAllByText("Not confirmed")).toHaveLength(0);
  });
});

/* ═══ ONE DESTINATION · SERVER PAGINATION ════════════════════════════════ */

describe("OperationReceiving — one destination and the paged register", () => {
  it("is ONE destination — no Calendar/Register view switch, no Receiving Monitor", async () => {
    renderPage();
    // The rail and the complete GRN Register render TOGETHER — there is
    // nothing to switch, and the month Calendar is retired from this page.
    expect(screen.queryByTestId("receiving-calendar")).not.toBeInTheDocument();
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

  it("paginates on the SERVER — Showing 1–1 of 2, Next asks for the next offset", async () => {
    h.pageLimit = 1;
    renderPage();
    expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
      "Showing 1–1 of 2",
    );
    // Page 1 holds only the newest record; the second is NOT rendered.
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument();
    expect(screen.getByTestId("grn-page-previous")).toBeDisabled();

    fireEvent.click(screen.getByTestId("grn-page-next"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "Showing 2–2 of 2",
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
        "Showing 1–1 of 2",
      ),
    );
  });

  it("a changed filter returns the register to page 1", async () => {
    h.pageLimit = 1;
    renderPage();
    fireEvent.click(screen.getByTestId("grn-page-next"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "Showing 2–2 of 2",
      ),
    );
    fireEvent.click(screen.getByTestId("rail-category-Sofa"));
    await waitFor(() =>
      expect(screen.getByTestId("grn-page-range")).toHaveTextContent(
        "Showing 1–1 of 1",
      ),
    );
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
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
    await waitFor(() =>
      expect(screen.getByTestId("receiving-save")).toHaveTextContent(
        "Save Receiving",
      ),
    );

    fireEvent.click(screen.getByTestId("add-extra-line"));
    fireEvent.change(screen.getByLabelText("Extra goods SKU 1"), {
      target: { value: "SF99" },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
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
    expect(body.extraLines).toEqual([
      { sku: "SF99", qty: 1, note: undefined },
    ]);
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

  it("a Valid GRN shows the stored number, the three location/date facts, the duty trio and Unit results", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    expect(
      screen.getByRole("heading", { name: "GRN-20260901-1234" }),
    ).toBeInTheDocument();
    // The document status word — never `Posted`.
    expect(screen.getByTestId("receiving-record-state")).toHaveTextContent(
      "Valid",
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
    // A recorded issue opens the door to its claims.
    expect(screen.getByTestId("record-open-claims")).toBeInTheDocument();
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

/* ─────────────────────────────────────────────────────────────────────────
   THE PINNED PAIR ONLY PINS IF THE GRID CAN SHRINK — measured 2026-09-19.

   `leadingColumns` was correct and the widths were correct, yet on the live
   page GRN Date and GRN No did not pin at all: scrolling right drove GRN Date
   to left −1022, clean off the screen. The cause was not in the engine. The
   register column is a flex child beside the rail, and a flex item defaults to
   `min-width:auto`, so without `min-w-0` it refused to shrink below the
   sixteen columns' 2234px. The grid's own scroller therefore never engaged,
   an ancestor scrolled instead, and sticky offsets computed against a
   viewport that never moved. The same miss also disabled the ≥768px canvas
   rule, because the grid measured 2234px even on a 390px phone.

   Every sibling rail+grid register (Purchase Orders, SO Batch, Supplier
   Claims, Manual Purchase) already carries it. jsdom has no layout, so this
   asserts the class contract rather than the pixels the walk measured.
   ───────────────────────────────────────────────────────────────────────── */
describe("the register column can shrink below its content", () => {
  it("carries min-w-0 beside the rail, or nothing pins", () => {
    renderPage();
    const column = screen.getByTestId("receiving-register-column");
    expect(
      column.className,
      "without min-w-0 the grid cannot shrink, its scroller never engages, " +
        "and the pinned pair scrolls away with everything else",
    ).toContain("min-w-0");
  });
});
