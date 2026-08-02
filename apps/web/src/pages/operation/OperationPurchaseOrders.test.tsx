import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationPurchaseOrders from "./OperationPurchaseOrders";

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
) {
  return {
    id,
    sku,
    qty,
    received_qty: 0,
    model_name: model,
    size,
    attrs: null,
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
      line("a1", "SKU-CODY-Q", 1, "Cody", "Queen"),
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
    purchase_order_lines: [line("b1", "SKU-SONIC-K", 3, "Sonic", "King")],
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
    if (url.startsWith("/api/operation/pos")) return Promise.resolve({ pos: POS });
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
    // Jan (9001) → Feb (9002) → Mar (9003), though 9003 > 9002 > 9001 by number.
    expect(cells).toEqual(["PO-9001", "PO-9002", "PO-9003"]);
  });
});

describe("the Items words", () => {
  it("speaks MODEL from the wire, first line + how many more", async () => {
    await mountLoaded();
    expect(screen.getByText("Cody Q · +2")).toBeInTheDocument();
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
    expect(screen.getByText("(revised)")).toBeInTheDocument();
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

describe("the Supplier Workspace v2 (Jess, 2026-08-02)", () => {
  const workspace = () => within(screen.getByTestId("po-document"));

  it("dense working header — no logo, no letterhead, state pill + facts", async () => {
    await mountLoaded();
    expect(document.querySelector('img[alt="Carres"]')).toBeNull();
    expect(screen.queryByTestId("po-doc-delivery-by")).not.toBeInTheDocument();
    const header = within(screen.getByTestId("po-working-header"));
    expect(header.getByText("PO-9001")).toBeInTheDocument();
    // PO-9001 has a supplier date on file → Waiting Goods.
    expect(header.getByText("Waiting Goods")).toBeInTheDocument();
    expect(workspace().getByText("PO Issued")).toBeInTheDocument();
  });

  it("Reference Layer answers only WHAT IS THIS PO — no Item ID, no phone", async () => {
    await mountLoaded();
    expect(workspace().queryByText("Item ID")).not.toBeInTheDocument();
    expect(workspace().queryByText("0123456789")).not.toBeInTheDocument();
    const items = within(screen.getByTestId("po-doc-items"));
    expect(items.getByText("SO No.")).toBeInTheDocument();
    expect(items.getByText("Description")).toBeInTheDocument();
    expect(items.getByText("Qty")).toBeInTheDocument();
  });

  it("the engine's calls sit under Open Actions inside SUPPLIER", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    const supplier = within(screen.getByTestId("po-supplier"));
    expect(supplier.getByText("Supplier")).toBeInTheDocument();
    expect(supplier.getByText("Open Actions")).toBeInTheDocument();
    expect(screen.getByTestId("po-open-calls")).toBeInTheDocument();
  });

  it("RECEIVING is one read-only line with Remaining and the door", async () => {
    await mountLoaded();
    const recv = within(screen.getByTestId("po-receiving-summary"));
    expect(recv.getByText("Receiving")).toBeInTheDocument();
    expect(recv.getByText("Remaining")).toBeInTheDocument();
    expect(recv.getByTestId("po-open-receiving")).toBeInTheDocument();
    expect(recv.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Activity holds the tools and the business timeline", async () => {
    await mountLoaded();
    const activity = within(screen.getByTestId("po-activity"));
    expect(activity.getByText("Activity")).toBeInTheDocument();
    expect(activity.getByTestId("po-copy-message")).toBeInTheDocument();
    const history = within(screen.getByTestId("po-history"));
    expect(history.getByText("PO issued")).toBeInTheDocument();
  });

  it("the WhatsApp draft is ONE line until opened — Copy works either way", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-wa-message")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-copy-message")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    expect(screen.getByTestId("po-wa-message")).toBeInTheDocument();
  });

  it("the section order is Jess's four categories", async () => {
    await mountLoaded();
    const doc = screen.getByTestId("po-document");
    const order = ["po-reference", "po-supplier", "po-activity", "po-receiving-summary"]
      .map((id) => Array.from(doc.querySelectorAll("section")).findIndex(
        (el) => el.getAttribute("data-testid") === id,
      ));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });
});

describe("the ONE Current Action source (Law 7)", () => {
  it("the header hero speaks the state word when the engine is quiet", async () => {
    await mountLoaded();
    // PO-9001 auto-selects: future date, nothing received → Waiting for Goods.
    const hero = within(screen.getByTestId("po-current-action"));
    expect(hero.getByText("Current Action")).toBeInTheDocument();
    expect(hero.getByText("Waiting for Goods")).toBeInTheDocument();
  });

  it("the listing's Current Action column reads the SAME source — no more dashes on live work", async () => {
    await mountLoaded();
    // PO-9001 (waiting) and PO-9002 (cancelled → the only honest dash).
    expect(listing().getByText("Waiting for Goods")).toBeInTheDocument();
    const cancelled = listing().getByText("PO-9002").closest("tr")!;
    expect(within(cancelled as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("an open engine call BEATS the state word in the hero", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-working-header")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    const hero = within(screen.getByTestId("po-current-action"));
    // Arriving today → the tomorrow's-delivery call leads, not "Open Receiving".
    expect(hero.getByText(/tomorrow/i)).toBeInTheDocument();
  });
});
