import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WarehouseInbound from "./WarehouseInbound";
import { fmtDate } from "@/lib/fmt-date";
import {
  buildInboundRegisterView,
  inboundArrivals,
  type InboundInput,
} from "@carres/shared";

const h = vi.hoisted(() => ({
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(),
  duty: { allowed: true, loading: false },
}));

vi.mock("./components/ModuleHeader", () => ({
  default: () => <h1>Inbound</h1>,
}));

/** The hosted receiving stage. Its own behaviour is `ReceivingWorkspace`'s and
 *  is tested there; what matters HERE is that Inbound hosts it in place, keeps
 *  the Register mounted and comes back to exactly the same list. */
vi.mock("./components/PoReceivingView", () => ({
  default: ({
    poId,
    backLabel,
    onBack,
    dutyAllowed,
  }: {
    poId: string;
    backLabel: string;
    onBack: () => void;
    dutyAllowed: boolean;
  }) => (
    <div data-testid="stage">
      <span>Receiving {poId}</span>
      <span data-testid="stage-duty">{String(dutyAllowed)}</span>
      <button onClick={onBack}>‹ {backLabel}</button>
    </div>
  ),
}));
vi.mock("./ArrivalSourceWorkspace", () => ({
  default: ({ sourceId }: { sourceId?: string }) => (
    <div data-testid="arrival-stage">Arrival {sourceId}</div>
  ),
}));

vi.mock("@/lib/queries", () => ({
  useReceivingDuty: () => ({
    data: { allowed: h.duty.allowed },
    isLoading: h.duty.loading,
  }),
  useOperationPos: () => ({ data: { pos: [] }, isLoading: false }),
  useOperationSuppliers: () => ({ data: { suppliers: [] }, isLoading: false }),
  useOperationWarehouse: () => ({ data: { warehouses: [] }, isLoading: false }),
}));

vi.mock("./useWarehouseInbound", () => ({
  useWarehouseInbound: (params: URLSearchParams, offset: number) => {
    const view = buildInboundRegisterView(rows, params, offset, 50);
    return {
      data: {
        arrivals: view.rows,
        sites: [
          { id: "w", name: "Carres Klang Warehouse" },
          { id: "w2", name: "HOUZS" },
        ],
        unmappedDestinations: [{ id: "d-direct", name: "Ohana", arrivals: 1 }],
        page: { offset, limit: 50, total: view.total },
        facets: view.facets,
      },
      isLoading: h.loading,
      error: h.error,
      refetch: h.refetch,
    };
  },
}));

/** PO-1 · Order Qty 10 — six correct, two damaged, two never sent.
 *  PO-2 · the same goods bound for a destination with NO Site linked. */
const base: InboundInput = {
  pos: [
    {
      id: "PO-1",
      supplier_id: "s",
      warehouse_id: "w",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: null,
      placed_at: "2026-08-01",
      so: 1,
    },
    {
      id: "PO-2",
      supplier_id: "s",
      warehouse_id: "w",
      destination_id: "d-direct",
      status: "open",
      official_delivery_date: "2026-09-03",
      eta_date: null,
      placed_at: "2026-08-02",
      so: 2,
    },
  ],
  sites: [
    { id: "w", name: "Carres Klang Warehouse" },
    { id: "w2", name: "HOUZS" },
  ],
  suppliers: [{ id: "s", name: "Factory" }],
  destinations: [{ id: "d-direct", warehouse_id: null, name: "Ohana" }],
  skuNames: [{ sku: "MAT-Q", name: "Cloud Mattress Queen" }],
  lines: [
    {
      po_id: "PO-1",
      qty: 10,
      destination_id: null,
      sku: "MAT-Q",
      identity_mode: "exact_unit",
      received_qty: 6,
      damaged_qty: 2,
      wrong_item_qty: 0,
    },
    {
      po_id: "PO-2",
      qty: 1,
      destination_id: null,
      sku: "MAT-Q",
      identity_mode: "exact_unit",
      received_qty: 0,
    },
  ],
  units: [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `u${i + 1}`,
      unit_code: `U1-000-00${i + 1}`,
      po_no: "PO-1",
      qty: 1,
      sku: "MAT-Q",
    })),
    { id: "u-d", unit_code: "U1-000-099", po_no: "PO-2", qty: 1, sku: "MAT-Q" },
  ],
  receipts: [
    {
      id: "r1",
      po_id: "PO-1",
      status: "posted",
      posted_at: "2026-09-01T09:00:00Z",
      grn_no: "GRN-010926-0001",
      do_number: "DO-8821",
      goods_received_at: "2026-09-01",
    },
    {
      id: "r2",
      po_id: "PO-1",
      status: "posted",
      posted_at: "2026-09-04T09:00:00Z",
      grn_no: "GRN-040926-0002",
      do_number: "DO-8930",
      goods_received_at: "2026-09-04",
    },
  ],
  results: Array.from({ length: 8 }, (_, i) => ({
    receipt_id: i < 6 ? "r1" : "r2",
    stock_item_id: `u${i + 1}`,
    outcome: i < 6 ? "received" : "received_with_issue",
    issue_kind: i < 6 ? null : "damaged",
  })),
};
let rows = inboundArrivals(base);

function mount(query = "") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter
        initialEntries={["/operation?tab=warehouse-inbound" + query]}
      >
        <WarehouseInbound />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rows = inboundArrivals(base);
  h.loading = false;
  h.error = null;
  h.duty = { allowed: true, loading: false };
});

describe("Inbound · the Site strip", () => {
  it("opens on Carres Klang Warehouse and lists the governed Sites", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("inbound-site-w")).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    /* Names come from the server's Site list — never typed into the page. */
    expect(screen.getByTestId("inbound-site-w2")).toHaveTextContent("HOUZS");
    expect(screen.getByTestId("inbound-site-w2")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("a Site's own list never shows goods bound somewhere else", async () => {
    mount("&site=w");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "PO-1" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: "PO-2" })).toBeNull();
  });

  it("an unlinked destination gets its own tab, named and counted", async () => {
    mount("&site=unmapped");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "PO-2" })).toBeInTheDocument(),
    );
    expect(screen.getByTestId("inbound-site-unmapped")).toHaveTextContent(
      "Destinations without a Site",
    );
    /* Never a silent "no incoming goods" — the gap is stated by name. */
    expect(screen.getByTestId("inbound-unmapped-note")).toHaveTextContent(
      "Ohana (1)",
    );
    expect(screen.getByText("Ohana — no Site linked")).toBeInTheDocument();
  });

  it("offers no receipt door where Carres never takes the goods in", async () => {
    mount("&site=unmapped");
    await screen.findByRole("link", { name: "PO-2" });
    expect(screen.queryByTestId("inbound-receive-PO-2")).toBeNull();
    expect(screen.getByText("No Site linked")).toBeInTheDocument();
  });
});

describe("Inbound · the three filters", () => {
  it("offers exactly Not finished, Received and All arrivals", async () => {
    mount("&site=w");
    await screen.findByTestId("inbound-status-open");
    expect(screen.getByTestId("inbound-status-open")).toHaveTextContent(
      "Not finished",
    );
    expect(screen.getByTestId("inbound-status-received")).toBeInTheDocument();
    expect(screen.getByTestId("inbound-status-all")).toBeInTheDocument();
    for (const retired of ["expected", "part-received", "with-issue"])
      expect(screen.queryByTestId(`inbound-status-${retired}`)).toBeNull();
  });

  it("FULLY ARRIVED IS NOT FULLY FULFILLED — damage keeps it unfinished", async () => {
    mount("&site=w&status=received");
    await waitFor(() =>
      expect(screen.getByText(/No arrivals match/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("inbound-status-open"));
    expect(screen.getByRole("link", { name: "PO-1" })).toBeInTheDocument();
  });
});

describe("Inbound · the governed quantities", () => {
  it("prints Order, Received and Pending Delivery separately", async () => {
    mount("&site=w");
    const row = await screen.findByTestId("inbound-row-PO-1");
    const cells = within(row);
    /* Order 10 · Received 6 · Pending 4 — the operator never subtracts, and
       the two damaged pieces never settled the supplier's debt. */
    expect(cells.getByText("10")).toBeInTheDocument();
    expect(cells.getByText("6")).toBeInTheDocument();
    expect(cells.getByText("4")).toBeInTheDocument();
    expect(cells.getByText("Damaged Qty 2")).toBeInTheDocument();
    expect(cells.getByText("Part received")).toBeInTheDocument();
  });

  it("an unreadable receipt reads Not recorded, never zero", async () => {
    rows = inboundArrivals({ ...base, results: [] });
    mount("&site=w");
    const row = await screen.findByTestId("inbound-row-PO-1");
    expect(within(row).getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(within(row).getByText("Records incomplete")).toBeInTheDocument();
  });
});

describe("Inbound · the row's own facts", () => {
  it("the Document number opens the document, with PO Issued beneath", async () => {
    mount("&site=w");
    await waitFor(() =>
      expect(screen.getByTestId("inbound-document-PO-1")).toHaveAttribute(
        "href",
        "/operation/procurement?po=PO-1",
      ),
    );
    expect(
      screen.getByText(`PO Issued ${fmtDate("2026-08-01")}`),
    ).toBeInTheDocument();
  });

  it("keeps PO Delivery Date, Supplier Delivery Date and receipt dates apart", async () => {
    mount("&site=w");
    const row = await screen.findByTestId("inbound-row-PO-1");
    /* The PO's own official date — not the supplier's answer, which has
       never been given. */
    expect(within(row).getByText(fmtDate("2026-09-01"))).toBeInTheDocument();
    /* No evidenced supplier reply exists, so the supplier column says so
       rather than repeating Carres's own plan back as a promise. */
    expect(within(row).getByText("Not confirmed")).toBeInTheDocument();
  });

  it("each delivery note links to its own receipt and actual date", async () => {
    mount("&site=w");
    await screen.findByTestId("inbound-row-PO-1");
    expect(screen.getByTestId("inbound-receipt-r1")).toHaveTextContent(
      "DO-8821",
    );
    expect(screen.getByTestId("inbound-receipt-r2")).toHaveTextContent(
      "DO-8930",
    );
    expect(screen.getByTestId("inbound-receipt-r1")).toHaveAttribute(
      "href",
      "/operation?tab=receiving&session=r1",
    );
  });

  it("the expansion has one job — the full product detail", async () => {
    mount("&site=w");
    await screen.findByTestId("inbound-row-PO-1");
    fireEvent.click(screen.getByTestId("inbound-expand-PO-1"));
    expect(screen.getByRole("link", { name: "U1-000-001" })).toHaveAttribute(
      "href",
      "/operation/stock/unit/U1-000-001",
    );
    expect(screen.getByText("Supplier DO No DO-8821")).toBeInTheDocument();
    /* The link-away door is gone — receiving happens on this page. */
    expect(
      screen.queryByRole("link", { name: "Open Receiving Session" }),
    ).toBeNull();
  });
});

describe("Inbound · receiving happens here", () => {
  it("the row's own button opens the stage full width and comes back whole", async () => {
    mount("&site=w&q=PO-1&status=all");
    const scroll = await screen.findByTestId("grid-scroll");
    Object.defineProperties(scroll, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    scroll.scrollTop = 150;
    fireEvent.scroll(scroll);

    fireEvent.click(screen.getByTestId("inbound-receive-PO-1"));
    expect(screen.getByTestId("stage")).toHaveTextContent("Receiving PO-1");
    /* The resolved permission is PASSED IN, never recomputed in the stage. */
    expect(screen.getByTestId("stage-duty")).toHaveTextContent("true");
    /* The Register stays MOUNTED underneath — that is what preserves the
       list position, not a re-fetch that guesses at it. */
    expect(screen.getByTestId("grid-scroll")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "‹ Inbound" }));
    expect(screen.queryByTestId("stage")).toBeNull();
    expect(screen.getByTestId("inbound-site-w")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByDisplayValue("PO-1")).toBeInTheDocument();
    expect(screen.getByTestId("inbound-status-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(screen.getByTestId("grid-scroll").scrollTop).toBe(150),
    );
  });

  it("says nothing about permission until the resolver has answered", async () => {
    h.duty = { allowed: false, loading: true };
    mount("&site=w");
    await screen.findByTestId("inbound-row-PO-1");
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.queryByTestId("inbound-receive-PO-1")).toBeNull();
    expect(screen.queryByTestId("inbound-receive-denied-PO-1")).toBeNull();
  });

  it("refuses the door to an operator whose duty it is not", async () => {
    h.duty = { allowed: false, loading: false };
    mount("&site=w");
    await screen.findByTestId("inbound-row-PO-1");
    expect(screen.getByTestId("inbound-receive-denied-PO-1")).toHaveTextContent(
      "Not your duty today",
    );
    expect(screen.queryByTestId("inbound-receive-PO-1")).toBeNull();
  });
});

describe("Inbound · the list itself", () => {
  it("accepts Monitor's `po` deep link as the exact document scope", async () => {
    mount("&site=w&po=PO-1&date=2026-09-01");
    await waitFor(() =>
      expect(screen.getByTestId("inbound-document-PO-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("inbound-source-context")).toHaveTextContent(
      "Document: PO-1",
    );
  });

  it("applies the date filter and keeps the paging summary honest", async () => {
    mount("&site=w&status=all");
    await waitFor(() =>
      expect(screen.getByTestId("inbound-page-range")).toHaveTextContent(
        "Showing 1–1 of 1 arrangements",
      ),
    );
    fireEvent.change(screen.getByLabelText("Arrival from"), {
      target: { value: "2026-09-03" },
    });
    expect(screen.getByText(/No arrivals match/)).toBeInTheDocument();
  });

  it("keeps the Register headers while loading and hides production rows", async () => {
    h.loading = true;
    mount("&site=w");
    expect(
      await screen.findByRole("button", { name: "Pending Delivery Qty" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PO-1" })).toBeNull();
  });

  it("shows failure and retries without fake rows", async () => {
    h.error = new Error("Access denied");
    mount("&site=w");
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.refetch).toHaveBeenCalled();
  });
});
