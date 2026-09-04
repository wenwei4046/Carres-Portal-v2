import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
 * OperationReceiving — the Receiving REGISTER and its object surfaces
 * (owner instruction 2026-09-04).
 *
 * The page this suite covered before was a three-pane workspace with an
 * auto-selecting queue; the rebuild replaced it with the register grammar:
 *
 *   240px Filter Rail · full-width sessions DataGrid · status footer
 *   [Start Receiving] → Find PO or CO → pre-start object → Session
 *   a submitted row  → the count review (Save Receiving / Return count)
 *   a posted row     → the read-only GRN record (Amend / Void doors)
 *
 * The laws held as assertions:
 *   · the GRN number is the STORED `grn_no` — a submitted row honestly says
 *     `No GRN yet`, and a voided record still appears (history never deletes),
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
  return {
    ...actual,
    useReceivingDuty: () => ({
      data: { allowed: h.dutyAllowed },
      isLoading: false,
      isError: false,
    }),
    useOperationWarehouseReceipts: () => ({
      data: h.receiptsError
        ? undefined
        : { receipts: h.receipts, counts: { waiting: h.waiting } },
      isLoading: false,
      isError: h.receiptsError,
      refetch: () => Promise.resolve(),
    }),
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
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

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

function po(p: {
  id: string;
  supplier_id: string;
  status?: string;
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
    ...over,
  };
}

const REGISTER_ROWS = [
  receipt({ id: "r-posted" }),
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
  }),
  receipt({
    id: "r-voided",
    status: "voided",
    grn_no: "GRN-20260830-7777",
    void_at: "2026-09-02T00:00:00Z",
    void_by_name: "Jess",
    void_reason: "Duplicate entry",
  }),
];

const FIND_POS = [
  po({
    id: "PO-2001",
    supplier_id: "sup-nf",
    lines: [
      { id: "l-ms01", sku: "MS01", qty: 3, received_qty: 0 },
      { id: "l-bf01", sku: "BF01", qty: 2, received_qty: 0 },
    ],
  }),
  po({
    id: "PO-2002",
    supplier_id: "sup-oh",
    lines: [{ id: "l-sf02", sku: "SF02", qty: 4, received_qty: 1 }],
  }),
  // Fully received — owes nothing, so it never reaches Find PO or CO.
  po({
    id: "PO-2003",
    supplier_id: "sup-nf",
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
  h.dutyAllowed = true;
  h.receipts = [...REGISTER_ROWS];
  h.waiting = 0;
  h.receiptsError = false;
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

/* ═══ THE REGISTER ═════════════════════════════════════════════════════════ */

describe("OperationReceiving — the Receiving Register", () => {
  it("draws the 240px Filter Rail with the RECEIVING and SUPPLIER groups", () => {
    renderPage();
    const rail = screen.getByTestId("receiving-rail");
    expect(rail.className).toContain("w-[240px]");
    const inRail = within(rail);
    expect(inRail.getByTestId("rail-all-receiving")).toHaveTextContent(
      "All receiving",
    );
    expect(inRail.getByTestId("rail-state-submitted")).toHaveTextContent(
      "Count waiting for check",
    );
    expect(inRail.getByTestId("rail-state-returned")).toHaveTextContent(
      "Sent back to recount",
    );
    expect(inRail.getByTestId("rail-state-posted")).toHaveTextContent("Posted");
    expect(inRail.getByTestId("rail-state-voided")).toHaveTextContent("Voided");
    expect(inRail.getByTestId("rail-all-suppliers")).toHaveTextContent(
      "All suppliers",
    );
  });

  it("prints the STORED grn_no, an honest `No GRN yet`, and never deletes a voided row", () => {
    renderPage();
    // Posted: the formal stored number, never re-derived.
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);
    // Submitted: the GRN does not exist yet, and the cell says so — no `—`.
    expect(screen.getAllByText("No GRN yet").length).toBeGreaterThan(0);
    // Voided: history is never deleted; the record keeps its number.
    expect(screen.getAllByText("GRN-20260830-7777").length).toBeGreaterThan(0);
  });

  it("a rail state pick narrows the listing, and picking it again clears", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("rail-state-posted"));
    await waitFor(() =>
      expect(screen.queryByText("No GRN yet")).not.toBeInTheDocument(),
    );
    // The voided session is not posted either.
    expect(screen.queryByText("GRN-20260830-7777")).not.toBeInTheDocument();
    expect(screen.getAllByText("GRN-20260901-1234").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("rail-state-posted"));
    await waitFor(() =>
      expect(screen.getAllByText("No GRN yet").length).toBeGreaterThan(0),
    );
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

  it("the status footer counts receiving records", () => {
    renderPage();
    expect(screen.getByText(/3 receiving records/)).toBeInTheDocument();
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

  it("a posted record shows the stored number, both site facts, the duty trio and Unit results", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    expect(
      screen.getByRole("heading", { name: "GRN-20260901-1234" }),
    ).toBeInTheDocument();
    // Actual Site null = the instruction's own warehouse, said in words.
    expect(screen.getByText("Same as Deliver To")).toBeInTheDocument();
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

  it("Amend walks reason → change → save, and posts only the changed facts", async () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    fireEvent.click(screen.getByTestId("amend-receiving-door"));

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
    expect(save).toHaveTextContent("Save the correction");
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
  });

  it("Void states the impact first, demands the reason, then voids with it", () => {
    h.sessionDetail = postedDetail();
    renderRecord();
    fireEvent.click(screen.getByTestId("void-receiving-door"));
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

  it("a voided record keeps its banner and loses both doors", () => {
    h.sessionDetail = postedDetail({
      receipt: {
        status: "voided",
        void_at: "2026-09-02T00:00:00Z",
        void_by_name: "Jess",
        void_reason: "Duplicate entry",
      },
    });
    renderRecord();
    const banner = screen.getByTestId("void-banner");
    expect(banner).toHaveTextContent("Jess");
    expect(banner).toHaveTextContent("Duplicate entry");
    expect(banner).toHaveTextContent("preserved");
    expect(
      screen.queryByTestId("amend-receiving-door"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("void-receiving-door")).not.toBeInTheDocument();
  });
});
