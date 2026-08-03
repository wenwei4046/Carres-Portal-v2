import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PO_DELAY_REASONS } from "@carres/shared";
import OperationPurchaseOrders from "./OperationPurchaseOrders";

const PO_DELAY_REASONS_FOR_TEST: readonly string[] = PO_DELAY_REASONS;

/**
 * Purchase Orders — the Register's Step-1 freeze (Jess, 2026-08-02):
 *
 *   · eight columns, her order: PO Issued · Supplier · PO No. · Items ·
 *     Customer Delivery · Goods Arrival · Received · Current Action;
 *   · default order = PO Issued OLDEST first (business priority, never the
 *     document number);
 *   · Items speaks MODEL off the wire (`model_name`), `×N` only when N ≥ 2;
 *   · compact keeps PO Issued · Supplier · PO No. · Items · Current Action,
 *     with the HONESTY GUARD (an actively filtered/sorted column never hides);
 *   · Search finds across PO / Supplier / SKU / Model / SO / Customer;
 *   · a cancelled PO greys out; a revised arriving date says `(revised)`.
 */

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

const OHANA = "11111111-1111-1111-1111-111111111111";
const NF = "33333333-3333-3333-3333-333333333333";
const WH = "44444444-4444-4444-4444-444444444444";
const KLANG = "55555555-5555-5555-5555-555555555555";
const AL = "66666666-6666-6666-6666-666666666666";
const DESTINATIONS = [
  { id: KLANG, name: "Carres Klang", is_default: true },
  { id: AL, name: "AL Sungai Buloh", is_default: false },
];

/** Today in MYT — PO-9003 arrives today, so the engine opens its
 *  tomorrow's-delivery call (the Open Actions fixture). */
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
}).format(new Date());

function line(
  id: string,
  sku: string,
  qty: number,
  model: string | null,
  size: string | null,
  so_rows?: { so: number | null; qty: number; remark: string | null }[],
) {
  return {
    id,
    sku,
    qty,
    received_qty: 0,
    model_name: model,
    size,
    attrs: null,
    so_rows: so_rows ?? [{ so: null, qty, remark: null }],
  };
}

/** Issued dates deliberately OUT of PO-number order, so the default sort can
 *  only pass by reading the date. Far-future arriving dates keep the engine's
 *  calls quiet — this suite is about the register, not the call ladder. */
const POS = [
  {
    id: "PO-9003",
    supplier_id: OHANA,
    warehouse_id: WH,
    destination_id: KLANG,
    status: "open",
    sup_status: "confirmed",
    so: 1300,
    so_refs: null,
    eta_date: TODAY,
    placed_at: "2026-03-01T08:00:00Z",
    customer_delivery: "2099-08-20",
    eta_revised: false,
    orders: [{ so: 1300, customer_name: "Ah Hock", delivery_date: "2099-08-20" }],
    purchase_order_lines: [
      // ONE line covering TWO sales orders → the grid must show TWO rows.
      line("a1", "SKU-CODY-Q", 2, "Cody", "Queen", [
        { so: 1300, qty: 1, remark: "No drilling" },
        { so: 1301, qty: 1, remark: null },
      ]),
      line("a2", "SKU-SONIC-K", 1, "Sonic", "King"),
      line("a3", "SKU-ONYX-L", 1, "Onyx", null),
    ],
  },
  {
    id: "PO-9001",
    supplier_id: NF,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1200,
    so_refs: null,
    eta_date: "2099-12-30",
    placed_at: "2026-01-05T08:00:00Z",
    // 8 days AFTER what we promised the customer — and this PO also carries
    // `(revised)`, so it is the crowded case: date + gap + marker on one line.
    customer_delivery: "2099-12-22",
    eta_revised: true,
    orders: [{ so: 1200, customer_name: "Mei Ling", delivery_date: "2099-12-22" }],
    promises: [
      {
        kind: "tomorrow_delivery",
        answer: "delayed",
        about_date: "2099-12-20",
        previous_date: "2099-12-20",
        new_date: "2099-12-30",
        reason: "Production Delay",
        recorded_at: "2026-08-01T02:00:00Z",
      },
    ],
    purchase_order_lines: [line("b1", "SKU-SONIC-K", 3, "Sonic", "King")],
  },
  {
    // Three answers from the supplier → 1st / 2nd / 3rd, slip 11 days.
    id: "PO-9005",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1500,
    so_refs: null,
    eta_date: "2099-11-11",
    placed_at: "2026-04-01T08:00:00Z",
    // The goods land on the customer's own day — no room for one hiccup.
    customer_delivery: "2099-11-11",
    eta_revised: true,
    orders: [],
    promises: [
      { kind: "tomorrow_delivery", answer: "shipping", about_date: "2099-10-31", previous_date: null, new_date: null, reason: null, recorded_at: "2026-04-02T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-10-31", previous_date: "2099-10-31", new_date: "2099-11-05", reason: "Production Delay", recorded_at: "2026-04-09T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-11-05", previous_date: "2099-11-05", new_date: "2099-11-11", reason: "Transport Delay", recorded_at: "2026-04-16T02:00:00Z" },
    ],
    sends: [
      {
        channel: "whatsapp",
        note: null,
        sent_at: "2026-04-16T03:00:00Z",
        po_revisions: { rev_no: 2 },
      },
      {
        channel: "whatsapp",
        note: null,
        sent_at: "2026-04-16T05:00:00Z",
        po_revisions: { rev_no: 2 },
      },
    ],
    purchase_order_lines: [line("e1", "SKU-SONIC-K", 1, "Sonic", "King")],
  },
  {
    // The date PASSED and nothing arrived → Overdue, action Contact Supplier.
    id: "PO-9004",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1400,
    so_refs: null,
    eta_date: "2026-01-20",
    placed_at: "2026-01-10T08:00:00Z",
    customer_delivery: null,
    eta_revised: false,
    orders: [],
    purchase_order_lines: [line("d1", "SKU-CODY-Q", 1, "Cody", "Queen")],
  },
  {
    id: "PO-9002",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "cancelled",
    sup_status: "cancelled",
    so: null,
    so_refs: null,
    eta_date: null,
    placed_at: "2026-02-01T08:00:00Z",
    customer_delivery: null,
    eta_revised: false,
    orders: [],
    purchase_order_lines: [line("c1", "RAW-UNKNOWN-1", 1, null, null)],
  },
  {
    // FULLY RECEIVED → the work is over. Its goods landed 10 days after the
    // customer's date, and it must stay SILENT: a closed PO's gap is history,
    // not work, and a register that shouts about the past teaches nobody.
    id: "PO-9006",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1600,
    so_refs: null,
    eta_date: "2026-05-20",
    placed_at: "2026-05-01T08:00:00Z",
    customer_delivery: "2026-05-10",
    eta_revised: false,
    orders: [],
    purchase_order_lines: [
      {
        id: "f1",
        sku: "SKU-CODY-Q",
        qty: 2,
        received_qty: 2,
        model_name: "Cody",
        size: "Queen",
        attrs: null,
        so_rows: [{ so: 1600, qty: 2, remark: null }],
      },
    ],
  },
];

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url.includes("/units")) return Promise.resolve({ units: [] });
    if (url.startsWith("/api/operation/pos"))
      return Promise.resolve({
        pos: POS,
        destinations: DESTINATIONS,
        messageTemplate: null,
      });
    if (url === "/api/operation/suppliers")
      return Promise.resolve({
        suppliers: [
          { id: OHANA, name: "Ohana", contact: null, whatsapp_group_url: null },
          {
            id: NF,
            name: "Nice Future",
            contact: "0123456789",
            contact_email: "sales@nicefuture.example",
            whatsapp_group_url: null,
          },
        ],
      });
    if (url === "/api/operation/warehouse")
      return Promise.resolve({ warehouses: [] });
    if (url.startsWith("/api/catalog"))
      return Promise.resolve({ skus: [], models: [] });
    if (url.startsWith("/api/operation/purchasing/settings"))
      return Promise.resolve({ productionDays: [], suppliers: [] });
    return Promise.resolve({});
  });
});

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/procurement"]}>
        <OperationPurchaseOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function mountLoaded() {
  const r = mount();
  await waitFor(() => expect(screen.getByText("PO-9001")).toBeInTheDocument());
  // The workspace mounts only after the first row AUTO-selects (?po= effect).
  await waitFor(() =>
    expect(screen.getByTestId("po-working-header")).toBeInTheDocument(),
  );
  return r;
}

const headerTexts = () =>
  within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .map((th) => th.textContent ?? "");

/** The WORKSPACE prints the selected PO's number too (document head + the
 *  WhatsApp draft), so every row assertion scopes to the LISTING's table. */
const listing = () => within(screen.getByRole("table"));
const hasRow = (id: string) => listing().queryAllByText(id).length > 0;

describe("the eight frozen columns", () => {
  it("compact mode (workspace open) keeps exactly Jess's five", async () => {
    await mountLoaded();
    expect(headerTexts()).toEqual([
      "PO Issued",
      "Supplier",
      "PO No.",
      "Items",
      "Current Action",
    ]);
  });

  it("collapsing the workspace shows all eight, in her order", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    expect(headerTexts()).toEqual([
      "PO Issued",
      "Supplier",
      "PO No.",
      "Items",
      "Customer Delivery",
      "Goods Arrival",
      "Received",
      "Current Action",
    ]);
  });

  it("Customer Delivery's header says it is the EARLIEST date on a merged PO", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    const th = screen.getByRole("columnheader", { name: /Customer Delivery/ });
    expect(th.getAttribute("title")).toMatch(/Earliest customer delivery/);
  });

  it("HONESTY GUARD — a sorted column stays visible in compact mode", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    fireEvent.click(screen.getByTestId("table-sort-arriving"));
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    expect(headerTexts()).toContain("Goods Arrival");
  });
});

describe("the default order — PO Issued, oldest first", () => {
  it("sorts by the issued date, never the PO number", async () => {
    await mountLoaded();
    const cells = listing()
      .getAllByText(/^PO-9\d{3}$/)
      .map((el) => el.textContent);
    // 10 Jan (9004) → 5 Jan… wait: issued dates are 9004 10-Jan, 9001 5-Jan,
    // 9002 1-Feb, 9003 1-Mar → oldest first, never the PO number.
    expect(cells).toEqual([
      "PO-9001",
      "PO-9004",
      "PO-9002",
      "PO-9003",
      "PO-9005",
      "PO-9006",
    ]);
  });
});

describe("the Items words", () => {
  it("speaks MODEL from the wire, first line + how many more", async () => {
    await mountLoaded();
    expect(listing().getByText("Cody Q ×2 · +2")).toBeInTheDocument();
  });

  it("shows ×N only when N ≥ 2 — never ×1", async () => {
    await mountLoaded();
    expect(screen.getByText("Sonic K ×3")).toBeInTheDocument();
    expect(screen.queryByText(/×1\b/)).not.toBeInTheDocument();
  });

  it("an older Worker without model_name degrades to the SKU code", async () => {
    await mountLoaded();
    expect(screen.getByText("RAW-UNKNOWN-1")).toBeInTheDocument();
  });
});

describe("what the row states", () => {
  it("a cancelled PO greys out (data-muted)", async () => {
    await mountLoaded();
    const cell = screen.getByText("PO-9002");
    const row = cell.closest("tr");
    expect(row?.getAttribute("data-muted")).toBe("true");
  });

  it("a revised arriving date says (revised)", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    // Two POs now carry a revised date (9001, 9005) — the marker is per row.
    expect(listing().getAllByText("(revised)").length).toBe(2);
  });
});

/** Jess, 2026-08-03 — the register put Customer Delivery and Goods Arrival
 *  side by side and left the subtraction to the operator's head. Measured on
 *  live prod: 8 of 19 POs were already landing after the customer's date. */
describe("the gap against the customer's date", () => {
  /** Scoped to the LISTING on purpose: a collapsed workspace is `hidden`, not
   *  unmounted, so its own gap is still in the document. */
  const gaps = () =>
    listing()
      .queryAllByTestId("po-arrival-gap")
      .map((el) => el.textContent?.trim());

  it("a PO landing after the promise says how many days late", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    const row = listing().getByText("PO-9001").closest("tr")!;
    expect(
      within(row as HTMLElement).getByTestId("po-arrival-gap"),
    ).toHaveTextContent("8d late");
  });

  it("landing ON the customer's own day is not fine — it says same day", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    const row = listing().getByText("PO-9005").closest("tr")!;
    expect(
      within(row as HTMLElement).getByTestId("po-arrival-gap"),
    ).toHaveTextContent("same day");
  });

  it("room to spare says NOTHING — silence has to mean fine", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    // PO-9003 arrives today against a 2099 promise: acres of room.
    const row = listing().getByText("PO-9003").closest("tr")!;
    expect(
      within(row as HTMLElement).queryByTestId("po-arrival-gap"),
    ).toBeNull();
  });

  it("a finished PO stays silent — its gap is history, not work", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    // PO-9006 landed 10 days after the promise and is fully received.
    const row = listing().getByText("PO-9006").closest("tr")!;
    expect(
      within(row as HTMLElement).queryByTestId("po-arrival-gap"),
    ).toBeNull();
    // …and exactly the two live ones speak, nobody else.
    expect(gaps()).toEqual(["8d late", "same day"]);
  });

  it("the gap survives beside (revised) — the warning is never the thing cut", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-workspace-toggle"));
    const row = listing().getByText("PO-9001").closest("tr")!;
    const cell = within(row as HTMLElement);
    expect(cell.getByTestId("po-arrival-gap")).toBeInTheDocument();
    expect(cell.getByText("(revised)")).toBeInTheDocument();
  });

  it("the workspace prints the customer's date and the gap where the delay is RECORDED", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9001"));
    expect(screen.getByTestId("po-customer-delivery")).toBeInTheDocument();
    const header = screen.getByTestId("po-document");
    expect(
      within(header).getAllByTestId("po-arrival-gap").length,
    ).toBeGreaterThan(0);
  });
});

/** Jess, 2026-08-03 — v7 took the Current Action hero out because the
 *  register's column carries it; with the workspace open that column was
 *  being CLIPPED, so the action lived nowhere. The fix is the WIDTH, and the
 *  workspace stays out of it: `Next — Waiting for Goods` was a status wearing
 *  an action's label, and the same slot would have carried a real call on the
 *  next PO. One label cannot be true of both. */
describe("Current Action survives the workspace being open", () => {
  it("the workspace does NOT repeat the action — the column owns it", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9004"));
    expect(screen.queryByTestId("po-next-action")).toBeNull();
    // …and the word it would have carried is nowhere in the document either.
    const doc = within(screen.getByTestId("po-document"));
    expect(doc.queryByText("Contact Supplier")).toBeNull();
    expect(doc.queryByText("Next")).toBeNull();
  });

  it("compact mode fits the longest action word without cutting it", async () => {
    await mountLoaded();
    // Compact is the default. The word must be present ENTIRE — the bug was a
    // silent `clip`, so a partial match would have passed all along.
    expect(listing().getAllByText("Waiting for Goods").length).toBeGreaterThan(0);
    const cell = listing().getAllByText("Waiting for Goods")[0];
    expect(cell.getAttribute("title")).toBe("Waiting for Goods");
  });
});

/** Jess, 2026-08-03 — the list said `Cody Q` and the document said
 *  `SKU-CODY-Q`: two languages for one PO. A buyer knows Booqit · Cody ·
 *  Jager, never 5539-1B(LHF). */
describe("one product, one name", () => {
  it("the document's DESCRIPTION speaks the same words as the register", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    const doc = within(screen.getByTestId("po-document"));
    expect(doc.getAllByText("Cody Q").length).toBeGreaterThan(0);
    expect(doc.queryByText("SKU-CODY-Q")).toBeNull();
    // The listing spells it identically — same function, so it cannot drift.
    expect(listing().getByText("Cody Q ×2 · +2")).toBeInTheDocument();
  });

  it("the CODE is still reachable — hover, and the row's own surface", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    const doc = within(screen.getByTestId("po-document"));
    expect(doc.getAllByText("Cody Q")[0].getAttribute("title")).toBe(
      "SKU-CODY-Q",
    );
    fireEvent.click(screen.getByTestId("po-item-menu-1"));
    const sku = within(screen.getByTestId("po-item-sku"));
    expect(sku.getByText("Item ID")).toBeInTheDocument();
    expect(sku.getByText("SKU-CODY-Q")).toBeInTheDocument();
  });

  it("the variant is not printed twice — the name already carries it", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    const doc = within(screen.getByTestId("po-document"));
    // `Cody Q` holds the size; a bare `Queen` sub-line underneath said it again.
    expect(doc.queryByText("Queen")).toBeNull();
  });
});

describe("the cross-field Search", () => {
  it("finds a PO by its CUSTOMER's name", async () => {
    await mountLoaded();
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "ah hock" },
    });
    expect(hasRow("PO-9003")).toBe(true);
    expect(hasRow("PO-9001")).toBe(false);
  });

  it("finds a PO by MODEL", async () => {
    await mountLoaded();
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "cody" },
    });
    expect(hasRow("PO-9003")).toBe(true);
    expect(hasRow("PO-9001")).toBe(false);
  });
});

describe("the PO Issued ▼ — Excel's date menu", () => {
  it("offers the presets, the data's month buckets, and Custom Date Range", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    for (const label of ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Last Month"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Month buckets come from the DATA (Jan/Feb/Mar 2026 fixtures).
    expect(screen.getByText("Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Custom Date Range…")).toBeInTheDocument();
  });

  it("a custom range narrows the register to the pair, inclusive", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    fireEvent.change(screen.getByTestId("table-filter-range-from-issued"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("table-filter-range-to-issued"), {
      target: { value: "2026-02-28" },
    });
    fireEvent.click(screen.getByTestId("table-filter-range-apply-issued"));
    await waitFor(() => expect(hasRow("PO-9003")).toBe(false));
    expect(hasRow("PO-9001")).toBe(true);
    expect(hasRow("PO-9002")).toBe(true);
  });

  it("a month bucket narrows to its month", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    fireEvent.click(screen.getByText("Feb 2026"));
    await waitFor(() => expect(hasRow("PO-9001")).toBe(false));
    expect(hasRow("PO-9002")).toBe(true);
  });
});

describe("the Supplier Workspace (Jess's v7 freeze, 2026-08-02)", () => {
  it("the fixed header: labels left, PO number right, no letterhead, no badge", async () => {
    await mountLoaded();
    expect(document.querySelector('img[alt="Carres"]')).toBeNull();
    const header = within(screen.getByTestId("po-working-header"));
    expect(header.getByText("PO Issued")).toBeInTheDocument();
    expect(header.getByText("Delivery To")).toBeInTheDocument();
    expect(header.getByText("Supplier")).toBeInTheDocument();
    expect(header.getByText("PO-9001")).toBeInTheDocument();
    // Progress belongs to the rail — the header never repeats it.
    expect(screen.queryByTestId("po-work-state")).not.toBeInTheDocument();
  });

  it("the supplier-date row opens IN PLACE and carries the field's own history", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-date-extend")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-date-row"));
    const ext = within(screen.getByTestId("po-date-extend"));
    // PO-9001's ledger holds ONE answer → one dated line, no ordinal yet.
    expect(ext.getByText(/Production Delay/)).toBeInTheDocument();
  });

  it("OVERDUE is printed beside the date, never a second bucket", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9004"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9004"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("po-overdue").textContent).toMatch(/Overdue by \d+ day/);
    // The rail still has five buckets — Contact Supplier is an ACTION.
    expect(screen.queryByTestId("po-rail-state-overdue")).not.toBeInTheDocument();
  });

  it("ITEMS is an Excel grid: one row per SO × SKU, with the SO's remark", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    const items = within(screen.getByTestId("po-doc-items"));
    // Line a1 covers TWO sales orders → two rows, never one stacked cell.
    expect(items.getByText("SO-1300")).toBeInTheDocument();
    expect(items.getByText("SO-1301")).toBeInTheDocument();
    // The salesperson's remark flows over, read-only, LABELLED as theirs —
    // purchasing's own note is a separate line marked Ops.
    expect(items.getByText("Sales: No drilling")).toBeInTheDocument();
    expect(items.getByText("Recv")).toBeInTheDocument();
    expect(items.getByText("Total")).toBeInTheDocument();
  });

  it("the row's ⋮ opens its actions IN PLACE — no drill-in, no modal", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-item-extend")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-item-menu-1"));
    const ext = within(screen.getByTestId("po-item-extend"));
    expect(ext.getByText("Destination")).toBeInTheDocument();
    expect(ext.getByText("Ops remark")).toBeInTheDocument();
    // QUIET by default (Jess, "it always show like that?"): values are TEXT,
    // no control and no Save button until something is clicked.
    expect(ext.queryByTestId("po-line-destination")).not.toBeInTheDocument();
    expect(ext.queryByRole("textbox")).not.toBeInTheDocument();
    expect(ext.getByText("Add a note…")).toBeInTheDocument();
  });

  it("quantities live on the rows — no Receiving panel AND no door", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-receiving-summary")).not.toBeInTheDocument();
    // The warehouse checks in over there and Recv moves by itself (Jess,
    // 2026-08-02) — purchasing never navigates to do it.
    expect(screen.queryByTestId("po-open-receiving")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("po-doc-items")).getByText("Recv")).toBeInTheDocument();
  });

  // Jess, 2026-08-03: three CONCERNS, three bands — Document · Communication ·
  // Communication History. `Download PDF`, `Supplier Portal`, Teams or WeCom
  // each join an existing band later without the structure moving. `ACTIVITY`
  // is retired (her 2026-08-02 word), and `History` is deliberately NOT taken:
  // the PO's real history will later carry revisions, ETA changes, Goods
  // Arrival changes, notes and claims.
  it("the desk is three bands — Document · Communication · Communication History", async () => {
    await mountLoaded();
    const activity = within(screen.getByTestId("po-activity"));
    expect(activity.getByText("Document")).toBeInTheDocument();
    expect(activity.getByText("Communication")).toBeInTheDocument();
    expect(activity.getByText("Communication History")).toBeInTheDocument();
    expect(activity.queryByText("Activity")).not.toBeInTheDocument();
    expect(activity.getByTestId("po-print-pdf")).toBeInTheDocument();
    expect(activity.getByTestId("po-copy-message")).toBeInTheDocument();
    // `PO issued` was deleted: the header already states it (Jess).
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
  });

  // PRINT ≠ ISSUE (Jess, 2026-08-03), and it is four separate promises:
  // printing writes no history, moves no status, mints no revision, and has no
  // limit. The button is therefore never disabled by a send, and pressing it
  // can never put a row in the Communication History.
  it("Print PDF records nothing — no history row, and it is always available", async () => {
    await mountLoaded();
    const btn = screen.getByTestId("po-print-pdf");
    expect(btn).toHaveTextContent("Print PDF");
    expect(btn).not.toBeDisabled();
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
    expect(screen.queryByTestId("po-history-row")).not.toBeInTheDocument();
  });

  it("the WhatsApp draft is ONE line until opened — Copy works either way", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-wa-message")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-copy-message")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    expect(screen.getByTestId("po-wa-message")).toBeInTheDocument();
  });
});

describe("the ONE Current Action source (Law 7)", () => {
  it("the register's column reads the shared engine — no dashes on live work", async () => {
    await mountLoaded();
    expect(listing().getAllByText("Waiting for Goods").length).toBeGreaterThan(0);
    const cancelled = listing().getByText("PO-9002").closest("tr")!;
    expect(within(cancelled as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("an overdue PO's column says Contact Supplier, never Confirm again", async () => {
    await mountLoaded();
    expect(listing().getByText("Contact Supplier")).toBeInTheDocument();
  });
});

describe("the supplier-date door (Jess's cycle, one form)", () => {
  it("a PO with NO date takes its FIRST date — no reason asked", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9002"));
    // PO-9002 is cancelled; use the one with no date instead.
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const form = within(screen.getByTestId("po-date-form"));
    expect(form.getByTestId("po-date-input")).toBeInTheDocument();
    // No date held → nothing to delay → the reason picker stays away.
    expect(form.queryByTestId("po-date-reason")).not.toBeInTheDocument();
  });

  it("keying a DIFFERENT date asks for a reason and posts a delay", async () => {
    await mountLoaded();
    // PO-9001 holds a supplier-confirmed date (its ledger says so).
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input");
    fireEvent.change(input, { target: { value: "2099-12-31" } });
    expect(screen.getByTestId("po-date-reason")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-date-remarks-open"));
    fireEvent.change(screen.getByTestId("po-date-remarks"), {
      target: { value: "factory said Tuesday" },
    });
    fireEvent.click(screen.getByTestId("po-date-save"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(
          (c) =>
            String(c[0]).includes("/tomorrow-delivery") &&
            String((c[1] as { body?: string })?.body).includes('"delayed"'),
        ),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) =>
      String(c[0]).includes("/tomorrow-delivery"),
    )!;
    const body = JSON.parse(String((call[1] as { body: string }).body));
    expect(body).toMatchObject({
      answer: "delayed",
      newDate: "2099-12-31",
      remarks: "factory said Tuesday",
    });
    // The reason is the countable CATEGORY, never free text.
    expect(PO_DELAY_REASONS_FOR_TEST).toContain(body.reason);
  });
});

describe("the supplier's date history, numbered (SAP's shape)", () => {
  it("counts the dates and prints the slip once there is more than one", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9005"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9005"),
      ).toBeInTheDocument(),
    );
    // The header carries NO history summary (Jess, 2026-08-03): `3rd date ·
    // 11 days later` was history squeezed into a header, and the history is
    // one click away saying it properly.
    expect(screen.queryByTestId("po-date-nth")).toBeNull();
    expect(
      within(screen.getByTestId("po-date-row")).queryByText(/days later/),
    ).toBeNull();
    fireEvent.click(screen.getByTestId("po-date-row"));
    const h = within(screen.getByTestId("po-date-history"));
    // No "told" column — two answers keyed the same day printed the same
    // date twice and read as a second delivery date.
    expect(h.queryByText(/told/)).not.toBeInTheDocument();
    expect(h.getByText("1st")).toBeInTheDocument();
    expect(h.getByText("2nd")).toBeInTheDocument();
    expect(h.getByText("3rd")).toBeInTheDocument();
  });

  it("the extend is QUIET — no form until you ask to record something", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-date-row"));
    // History and a quiet trigger; no date box, no Remarks box standing open.
    expect(screen.queryByTestId("po-date-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("po-date-remarks")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input") as HTMLInputElement;
    // A date already given can never be edited — you record the NEXT one.
    expect(input.value).toBe("");
    expect(screen.queryByTestId("po-date-effect")).not.toBeInTheDocument();
    // A multi-field form gets a real Save (Jess: "i cant save?"); Remarks is
    // the exception and stays folded until asked for.
    expect(screen.getByTestId("po-date-save")).toBeDisabled();
    expect(screen.queryByTestId("po-date-remarks")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-date-remarks-open")).toBeInTheDocument();
  });

  it("Esc closes the date form and records nothing", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    fireEvent.change(screen.getByTestId("po-date-input"), {
      target: { value: "2099-12-31" },
    });
    fireEvent.keyDown(screen.getByTestId("po-date-input"), { key: "Escape" });
    expect(screen.queryByTestId("po-date-form")).not.toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("/tomorrow-delivery")),
    ).toBe(false);
  });

  it("once a date is keyed it says exactly what Save will record", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input");
    fireEvent.change(input, { target: { value: "2099-12-31" } });
    expect(screen.getByTestId("po-date-effect").textContent).toMatch(/^Delay \d+ day/);
    // The same date is a confirmation, not a delay — and asks no reason.
    fireEvent.change(input, { target: { value: "2099-12-30" } });
    expect(screen.getByTestId("po-date-effect").textContent).toMatch(/Same date/);
    expect(screen.queryByTestId("po-date-reason")).not.toBeInTheDocument();
  });
});

describe("where each line goes (0311, Jess 2026-08-02)", () => {
  it("changing the destination for the WHOLE line posts /destination", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    // Row 3 is a qty-1 line, so there is nothing to split.
    fireEvent.click(screen.getByTestId("po-item-menu-3"));
    fireEvent.click(screen.getByTestId("po-line-destination-open"));
    fireEvent.change(screen.getByTestId("po-line-destination"), {
      target: { value: AL },
    });
    expect(screen.getByTestId("po-line-effect").textContent).toMatch(/All 1 move/);
    // A picker changed with the MOUSE needs a button (Jess: "i cant save for
    // AL") — Enter is a keyboard gesture nobody reaches for here.
    fireEvent.click(screen.getByTestId("po-line-destination-save"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/destination")),
      ).toBe(true),
    );
  });

  it("moving PART of a line SPLITS it — the PO stays one document", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9001"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9001"),
      ).toBeInTheDocument(),
    );
    // PO-9001's only line is qty 3 → Move appears.
    fireEvent.click(screen.getByTestId("po-item-menu-1"));
    fireEvent.click(screen.getByTestId("po-line-destination-open"));
    fireEvent.change(screen.getByTestId("po-line-destination"), {
      target: { value: AL },
    });
    fireEvent.change(screen.getByTestId("po-line-move-qty"), {
      target: { value: "1" },
    });
    expect(screen.getByTestId("po-line-effect").textContent).toMatch(
      /1 of 3 move; 2 stay/,
    );
    expect(screen.getByTestId("po-line-destination-save").textContent).toBe("Split");
    fireEvent.click(screen.getByTestId("po-line-destination-save"));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/split"))).toBe(
        true,
      ),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/split"))!;
    expect(JSON.parse(String((call[1] as { body: string }).body))).toMatchObject({
      moveQty: 1,
      destinationId: AL,
    });
  });

  it("the ops remark is purchasing's own — internal, and it says so", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-item-menu-1"));
    fireEvent.click(screen.getByTestId("po-line-ops-open"));
    const input = screen.getByTestId("po-line-ops-remark") as HTMLInputElement;
    expect(input.placeholder).toMatch(/never printed/i);
    fireEvent.change(input, { target: { value: "AL collects Friday" } });
    fireEvent.click(screen.getByTestId("po-line-ops-save"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/ops-remark")),
      ).toBe(true),
    );
  });
});

describe("inline edit — Esc puts it back", () => {
  it("opening, changing and pressing Esc records nothing", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-item-menu-1"));
    fireEvent.click(screen.getByTestId("po-line-destination-open"));
    fireEvent.change(screen.getByTestId("po-line-destination"), {
      target: { value: AL },
    });
    fireEvent.keyDown(screen.getByTestId("po-line-destination"), { key: "Escape" });
    // Back to plain text, and nothing was posted.
    expect(screen.queryByTestId("po-line-destination")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-line-destination-open")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("/lines/")),
    ).toBe(false);
  });
});

describe("what we sent the supplier (0312)", () => {
  it("the draft is EDITABLE, and Save as template puts the placeholders back", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    const box = screen.getByTestId("po-wa-message") as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.value).toContain("PO-9001");
    fireEvent.change(box, { target: { value: "Hi Nice Future,\n\nPO-9001 please rush" } });
    fireEvent.click(screen.getByTestId("po-save-template"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/message-template")),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) =>
      String(c[0]).endsWith("/message-template"),
    )!;
    const body = JSON.parse(String((call[1] as { body: string }).body));
    // The PO's own number and the supplier's name go back to placeholders, or
    // the next PO would inherit this one's.
    expect(body.text).toContain("{po}");
    expect(body.text).toContain("{supplier}");
    expect(body.text).not.toContain("PO-9001");
  });

  it("Email is a mailto: — the portal has no sender, and says so when there is no address", async () => {
    await mountLoaded();
    // PO-9001 is Nice Future, which has an address on file.
    const mail = screen.getByTestId("po-open-email") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toMatch(/^mailto:sales%40nicefuture\.example\?subject=/);
    // Ohana has none — the panel states the absence instead of a dead button.
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("po-open-email")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-no-email").textContent).toMatch(/No email on file/);
  });

  it("the ACT records itself — no I've sent button to remember afterwards", async () => {
    await mountLoaded();
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
    expect(screen.queryByTestId("po-sent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-open-email"));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/sends"))).toBe(
        true,
      ),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/sends"))!;
    // The channel is the one actually used, not a guess.
    expect(JSON.parse(String((call[1] as { body: string }).body))).toMatchObject({
      channel: "email",
    });
  });

  it("COPY does not record — copying words is not sending them", async () => {
    // jsdom has no clipboard; the assertion is that copying posts NOTHING,
    // which holds whether the write resolves or is refused.
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-copy-message"));
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/sends"))).toBe(
      false,
    );
  });

  it("a PO that HAS been sent shows the channel and the revision it carried", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9005"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9005"),
      ).toBeInTheDocument(),
    );
    const h = within(screen.getByTestId("po-history"));
    // The row names the DOOR the Portal observed being opened — never a send,
    // never a receipt (Jess, 2026-08-03). `sent` is banned from this band.
    expect(h.getByText(/WhatsApp opened/)).toBeInTheDocument();
    expect(h.getByText(/Revision 2/)).toBeInTheDocument();
    expect(h.queryByText(/sent/i)).not.toBeInTheDocument();
    // Opening WhatsApp twice on one morning is ONE event that happened twice.
    expect(h.getByTestId("po-history-count")).toHaveTextContent("×2");
    expect(h.getAllByTestId("po-history-row").length).toBe(1);
    // THE FIRST PRESS, NEVER THE LATEST (Jess, 2026-08-03): a row is an EVENT,
    // not a latest state. The fixture's two presses are 03:00Z and 05:00Z on
    // one day — 11:00 and 13:00 in the app's zone. The row must read 11:00:
    // the moment this revision left the Portal never moved, and the second
    // press is what `×2` already says.
    expect(h.getByText(/11:00/)).toBeInTheDocument();
    expect(h.queryByText(/13:00/)).not.toBeInTheDocument();
  });
});
