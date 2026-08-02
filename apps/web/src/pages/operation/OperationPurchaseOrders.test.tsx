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
 *     Customer Delivery · Goods Arriving At · Received · Current Action;
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
    customer_delivery: null,
    eta_revised: true,
    orders: [{ so: 1200, customer_name: "Mei Ling", delivery_date: null }],
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
    customer_delivery: null,
    eta_revised: true,
    orders: [],
    promises: [
      { kind: "tomorrow_delivery", answer: "shipping", about_date: "2099-10-31", previous_date: null, new_date: null, reason: null, recorded_at: "2026-04-02T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-10-31", previous_date: "2099-10-31", new_date: "2099-11-05", reason: "Production Delay", recorded_at: "2026-04-09T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-11-05", previous_date: "2099-11-05", new_date: "2099-11-11", reason: "Transport Delay", recorded_at: "2026-04-16T02:00:00Z" },
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
];

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url.includes("/units")) return Promise.resolve({ units: [] });
    if (url.startsWith("/api/operation/pos"))
      return Promise.resolve({ pos: POS, destinations: DESTINATIONS });
    if (url === "/api/operation/suppliers")
      return Promise.resolve({
        suppliers: [
          { id: OHANA, name: "Ohana", contact: null, whatsapp_group_url: null },
          { id: NF, name: "Nice Future", contact: "0123456789", whatsapp_group_url: null },
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
      "Goods Arriving At",
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
    expect(headerTexts()).toContain("Goods Arriving At");
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
    expect(cells).toEqual(["PO-9001", "PO-9004", "PO-9002", "PO-9003", "PO-9005"]);
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

  it("a row extends IN PLACE — no drill-in, no modal", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-item-extend")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-item-row-1"));
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

  it("Activity holds the tools and the business timeline", async () => {
    await mountLoaded();
    const activity = within(screen.getByTestId("po-activity"));
    expect(activity.getByText("Activity")).toBeInTheDocument();
    expect(activity.getByTestId("po-copy-message")).toBeInTheDocument();
    // `PO issued` was deleted: the header already states it (Jess).
    expect(screen.getByTestId("po-history").textContent).toBe("Nothing sent yet.");
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
    const form = within(screen.getByTestId("po-date-form"));
    expect(form.getByTestId("po-date-input")).toBeInTheDocument();
    // No date held → nothing to delay → the reason picker stays away.
    expect(form.queryByTestId("po-date-reason")).not.toBeInTheDocument();
  });

  it("keying a DIFFERENT date asks for a reason and posts a delay", async () => {
    await mountLoaded();
    // PO-9001 holds a supplier-confirmed date (its ledger says so).
    fireEvent.click(screen.getByTestId("po-date-row"));
    const input = screen.getByTestId("po-date-input");
    fireEvent.change(input, { target: { value: "2099-12-31" } });
    expect(screen.getByTestId("po-date-reason")).toBeInTheDocument();
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
    // Three answers → `3rd date · 11 days later` beside the date.
    expect(screen.getByTestId("po-date-nth").textContent).toMatch(/3rd date/);
    expect(screen.getByTestId("po-date-nth").textContent).toMatch(/11 days later/);
    fireEvent.click(screen.getByTestId("po-date-row"));
    const h = within(screen.getByTestId("po-date-history"));
    expect(h.getByText("1st")).toBeInTheDocument();
    expect(h.getByText("2nd")).toBeInTheDocument();
    expect(h.getByText("3rd")).toBeInTheDocument();
  });

  it("the field starts EMPTY — a date already given can never be edited", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-date-row"));
    const input = screen.getByTestId("po-date-input") as HTMLInputElement;
    expect(input.value).toBe("");
    // Nothing keyed = nothing to record = no sentence about it.
    expect(screen.queryByTestId("po-date-effect")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-date-save")).toBeDisabled();
  });

  it("once a date is keyed it says exactly what Save will record", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-date-row"));
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
    fireEvent.click(screen.getByTestId("po-item-row-3"));
    fireEvent.click(screen.getByTestId("po-line-destination-open"));
    fireEvent.change(screen.getByTestId("po-line-destination"), {
      target: { value: AL },
    });
    expect(screen.getByTestId("po-line-effect").textContent).toMatch(/All 1 move/);
    // Enter saves — there is no Save button anywhere.
    expect(screen.queryByTestId("po-line-destination-save")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("po-line-destination"), { key: "Enter" });
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
    fireEvent.click(screen.getByTestId("po-item-row-1"));
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
    fireEvent.keyDown(screen.getByTestId("po-line-move-qty"), { key: "Enter" });
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
    fireEvent.click(screen.getByTestId("po-item-row-1"));
    fireEvent.click(screen.getByTestId("po-line-ops-open"));
    const input = screen.getByTestId("po-line-ops-remark") as HTMLInputElement;
    expect(input.placeholder).toMatch(/never printed/i);
    fireEvent.change(input, { target: { value: "AL collects Friday" } });
    fireEvent.keyDown(input, { key: "Enter" });
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
    fireEvent.click(screen.getByTestId("po-item-row-1"));
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
