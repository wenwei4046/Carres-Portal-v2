import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WarehouseReceiptQueueRow, operationPoListRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import OperationReceivingReport from "./OperationReceivingReport";

/**
 * Reports → Receiving & Inbound (stock MASTER §11).
 *
 * Read-only, computed at read time, every row a door, the draft exclusion
 * stated on screen, and NO money. The fixtures below hold three August
 * records (posted · submitted · voided), one July record, and one draft that
 * must never appear.
 */

const receiptsQuery = vi.fn();
const posQuery = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationWarehouseReceipts: (status: string) => receiptsQuery(status),
    useOperationPos: () => posQuery(),
  };
});

vi.mock("./PurchasingTabs", () => ({
  default: ({ right }: { right?: React.ReactNode }) => <div data-testid="tabs">{right}</div>,
}));

/** The kit Select is Radix, which jsdom cannot open; the shim keeps the SAME
 *  contract (id, label, value, onValueChange, options) as a native select so
 *  the page's narrowing logic is what these tests exercise. */
vi.mock("@/components/kit/Select", () => ({
  default: ({
    id,
    label,
    value,
    onValueChange,
    options,
  }: {
    id: string;
    label?: string;
    value?: string;
    onValueChange: (v: string) => void;
    options: readonly { value: string; label: string }[];
  }) => (
    <label>
      {label}
      <select
        data-testid={id}
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

function receipt(
  p: Partial<WarehouseReceiptQueueRow> & { id: string },
): WarehouseReceiptQueueRow {
  return {
    po_id: "PO-300",
    warehouse_id: "wh-1",
    warehouse_name: "KLG Warehouse",
    supplier_name: "Ohana",
    do_number: "DO-88",
    do_file_path: "path",
    note: null,
    lines: [],
    status: "posted",
    submitted_by_name: "Shasha",
    submitted_at: "2026-08-12T09:00:00Z",
    reviewed_by_name: null,
    reviewed_at: null,
    return_reason: null,
    summary: "",
    opens_claims: false,
    goods_received_at: "2026-08-12",
    ...p,
  };
}

function rline(p: {
  id: string;
  received_now?: number;
  damaged_qty?: number;
  wrong_item_qty?: number;
}) {
  return {
    id: p.id,
    sku: "mattress:M-AAA",
    received_now: p.received_now ?? 0,
    damaged_qty: p.damaged_qty ?? 0,
    wrong_item_qty: p.wrong_item_qty ?? 0,
    wrong_item_claim_type: null,
  };
}

/** Three August records + one July + one draft (never shown). */
function liveReceipts(): WarehouseReceiptQueueRow[] {
  return [
    receipt({
      id: "s1",
      grn_no: "GRN-20260812-4417",
      goods_received_at: "2026-08-12",
      lines: [rline({ id: "l1", received_now: 4, damaged_qty: 1 })],
      extra_lines: [{ sku: "mattress:M-EXTRA", qty: 2 }],
      posted_by_name: "Li Ching",
    }),
    receipt({
      id: "s2",
      status: "submitted",
      po_id: "PO-1",
      supplier_name: "Nice Future",
      goods_received_at: "2026-08-14",
      lines: [rline({ id: "l2", received_now: 2, wrong_item_qty: 1 })],
      posted_by_name: null,
    }),
    receipt({
      id: "s3",
      status: "voided",
      grn_no: "GRN-20260810-9001",
      goods_received_at: "2026-08-10",
      lines: [rline({ id: "l3", received_now: 1 })],
      void_reason: "Typed twice",
    }),
    receipt({
      id: "s4",
      status: "draft",
      goods_received_at: "2026-08-15",
      lines: [rline({ id: "l4", received_now: 9 })],
    }),
    receipt({
      id: "s5",
      grn_no: "GRN-20260705-1111",
      goods_received_at: "2026-07-05",
      lines: [rline({ id: "l5", received_now: 3 })],
    }),
  ];
}

function po(p: Partial<operationPoListRow> & { id: string }): operationPoListRow {
  return {
    supplier_id: "sup-ohana",
    warehouse_id: "wh-1",
    status: "open",
    sup_status: "confirmed",
    so: null,
    so_refs: null,
    eta_date: null,
    placed_at: "2026-08-01T00:00:00Z",
    purchase_order_lines: [],
    ...p,
  };
}

function poLine(q: { qty: number; received_qty: number }) {
  return { id: `pol-${q.qty}-${q.received_qty}`, sku: "mattress:M-AAA", ...q };
}

function livePos(): operationPoListRow[] {
  return [
    // Owes 3 — the largest debt, listed first.
    po({
      id: "PO-1",
      supplier_id: "sup-nice",
      purchase_order_lines: [poLine({ qty: 5, received_qty: 2 })],
    }),
    // Owes 1.
    po({ id: "PO-2", purchase_order_lines: [poLine({ qty: 4, received_qty: 3 })] }),
    // Fully received: owes nothing, never listed.
    po({ id: "PO-3", purchase_order_lines: [poLine({ qty: 2, received_qty: 2 })] }),
    // Closed: not an open PO, never listed however much it "owes".
    po({
      id: "PO-4",
      status: "received",
      purchase_order_lines: [poLine({ qty: 6, received_qty: 0 })],
    }),
  ];
}

function mockData(
  receipts: WarehouseReceiptQueueRow[] = liveReceipts(),
  pos: operationPoListRow[] = livePos(),
) {
  receiptsQuery.mockReturnValue({
    data: { receipts, counts: { waiting: 0 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  posQuery.mockReturnValue({
    data: { pos },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

beforeEach(() => {
  receiptsQuery.mockReset();
  posQuery.mockReset();
});

describe("the receiving records", () => {
  it("asks for EVERY status, prints the stored GRN number, and each row is a door to its session", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    expect(receiptsQuery).toHaveBeenCalledWith("all");
    expect(screen.getByText("GRN-20260812-4417")).toBeTruthy();
    expect(screen.getByTestId("receiving-report-session-s1")).toHaveAttribute(
      "href",
      "/operation?tab=receiving&session=s1",
    );
  });

  it("a session not yet posted says `No GRN yet` — never a number that does not exist", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    const row = screen
      .getByTestId("receiving-report-session-s2")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("No GRN yet")).toBeTruthy();
    expect(within(row).getByText("Waiting Carres check")).toBeTruthy();
  });

  it("a voided session stays on the report, marked Voided", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    const row = screen
      .getByTestId("receiving-report-session-s3")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("Voided")).toBeTruthy();
    // History never deletes — the voided GRN number still prints.
    expect(within(row).getByText("GRN-20260810-9001")).toBeTruthy();
  });

  it("a draft is not a receiving record, and the page says so", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    expect(screen.queryByTestId("receiving-report-session-s4")).toBeNull();
    expect(screen.getByTestId("receiving-report-footer").textContent).toBe(
      "Draft sessions are not receiving records and are excluded.",
    );
  });

  it("`Same as Deliver To` stands in for a null Actual Site", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    const row = screen
      .getByTestId("receiving-report-session-s1")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText("Same as Deliver To")).toBeTruthy();
  });
});

describe("the totals line and the month filter", () => {
  it("adds the month's records through the shared arithmetic, extras included", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    // August (the newest month) is the default: s1 + s2 + s3.
    expect(screen.getByTestId("receiving-report-totals").textContent).toBe(
      "3 receiving records · 7 received · 1 damaged · 1 wrong item · 2 extra",
    );
  });

  it("months come newest first, and picking one narrows the report to it", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    const select = screen.getByTestId("receiving-report-month") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["2026-08", "2026-07"]);
    expect(screen.queryByText("GRN-20260705-1111")).toBeNull();

    fireEvent.change(select, { target: { value: "2026-07" } });
    expect(screen.getByText("GRN-20260705-1111")).toBeTruthy();
    expect(screen.queryByText("GRN-20260812-4417")).toBeNull();
    expect(screen.getByTestId("receiving-report-totals").textContent).toBe(
      "1 receiving record · 3 received · 0 damaged · 0 wrong item · 0 extra",
    );
  });
});

describe("still owed by suppliers", () => {
  it("lists open POs that still owe goods, largest Pending Delivery Qty first, each a door", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    const pending = screen.getByTestId("receiving-report-pending");
    const links = within(pending).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/operation?tab=receiving&po=PO-1",
      "/operation?tab=receiving&po=PO-2",
    ]);
    // PO-1: Order 5 · Received 2 · Pending Delivery 3 — each fact printed,
    // never left for the reader to subtract. Supplier resolved by name.
    const row = within(pending).getByTestId("receiving-report-owed-PO-1");
    expect(
      [...row.querySelectorAll("span")].map((s) => s.textContent),
    ).toEqual(["PO-1", "Nice Future", "5", "2", "3"]);
  });

  it("a fully received PO and a closed PO never appear", () => {
    mockData();
    render(wrap(<OperationReceivingReport />));
    expect(screen.queryByTestId("receiving-report-owed-PO-3")).toBeNull();
    expect(screen.queryByTestId("receiving-report-owed-PO-4")).toBeNull();
  });

  it("with no supplier debt, it says so plainly", () => {
    mockData(liveReceipts(), [
      po({ id: "PO-3", purchase_order_lines: [poLine({ qty: 2, received_qty: 2 })] }),
    ]);
    render(wrap(<OperationReceivingReport />));
    expect(screen.getByText("No supplier delivery is owed.")).toBeTruthy();
  });
});

describe("empty, loading and failure", () => {
  it("no receiving activity is an answer, not a blank table", () => {
    mockData([], []);
    render(wrap(<OperationReceivingReport />));
    expect(screen.getByText("No receiving activity yet.")).toBeTruthy();
    expect(screen.getByText("No supplier delivery is owed.")).toBeTruthy();
  });

  it("a failed read states what broke and hands back Try again", () => {
    const refetchReceipts = vi.fn();
    const refetchPos = vi.fn();
    receiptsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchReceipts,
    });
    posQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: refetchPos,
    });
    render(wrap(<OperationReceivingReport />));
    expect(screen.getByText("This report could not be opened")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    expect(refetchReceipts).toHaveBeenCalled();
    expect(refetchPos).toHaveBeenCalled();
  });
});

describe("the governed spellings", () => {
  it("never prints a bare ISO date — Goods Received At wears the portal's one date spelling", () => {
    mockData();
    const { container } = render(wrap(<OperationReceivingReport />));
    const row = screen
      .getByTestId("receiving-report-session-s1")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText(fmtDate("2026-08-12"))).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("no money anywhere", () => {
    mockData();
    const { container } = render(wrap(<OperationReceivingReport />));
    expect(container.textContent).not.toMatch(/RM|cost|price|amount|MYR|\$/i);
  });
});
