import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { poReceivingProgress } from "@carres/shared";
import OperationReceiving from "./OperationReceiving";

/**
 * OperationReceiving — the check-in station. Mocks apiFetch so the three
 * underlying hooks (pos / suppliers / warehouse) return fixtures; asserts the
 * facet rail, the counts, R1's progress words and — new with ⑦ P2 — the UI-KIT
 * §8.2 interaction law on this tab: a pick filters, the same pick again clears,
 * two picks are two ✕-able chips, a ROW opens the drawer, and closing the
 * drawer gives the list back.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const SUPPLIERS = [
  { id: "sup-nf", name: "Nice Future", kind: "factory_pickup" },
  { id: "sup-oh", name: "Ohana", kind: "factory_pickup" },
];
const WAREHOUSES = [{ id: "wh-klang", name: "Carres Klang", address: "Klang" }];

function po(p: {
  id: string;
  supplier_id: string;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  // R1 (0284): the two inspection counters are optional on the fixture, the
  // same way they are optional on the wire — a PO with a clean delivery
  // history simply omits them.
  lines: {
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    damaged_qty?: number;
    wrong_item_qty?: number;
  }[];
  warehouse_id?: string;
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    warehouse_id: p.warehouse_id ?? "wh-klang",
    status: p.status,
    sup_status: p.sup_status,
    so: 1001,
    so_refs: null,
    eta_date: "2026-06-20",
    placed_at: "2026-06-01T00:00:00Z",
    purchase_order_lines: p.lines,
  };
}

const POS = [
  po({ id: "PO-2001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", lines: [{ id: "l1", sku: "MS01", qty: 5, received_qty: 0 }] }),
  po({ id: "PO-2002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", lines: [{ id: "l2", sku: "SF02", qty: 2, received_qty: 0 }] }),
  po({ id: "PO-2003", supplier_id: "sup-nf", status: "received", sup_status: "delivered", lines: [{ id: "l3", sku: "BF01", qty: 3, received_qty: 3 }] }),
  po({ id: "PO-2004", supplier_id: "sup-oh", status: "cancelled", sup_status: "cancelled", lines: [{ id: "l4", sku: "SF03", qty: 1, received_qty: 0 }] }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The page renders the shared PurchasingTabs bar (uses router hooks), so it
  // must mount inside a Router.
  return render(
    <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The rail's three queue rows, in the order they render. */
const CHECK_IN = "facet-queue-check-in";
const ISSUE = "facet-queue-receiving-issue";
const FULLY = "facet-queue-fully-received";

function chips() {
  return screen.queryByTestId("listshell-active-chips");
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: SUPPLIERS });
    if (typeof path === "string" && path.includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: WAREHOUSES });
    if (typeof path === "string" && path.includes("/api/operation/pos"))
      return Promise.resolve({ pos: POS });
    return Promise.resolve({});
  });
});

describe("OperationReceiving", () => {
  it("renders the three queue rows with counts (cancelled excluded)", async () => {
    wrap(<OperationReceiving />);
    // Check in = 2 not-fully-received · Receiving issue = 0 · Fully received =
    // 1. The cancelled PO-2004 is in none of them.
    await waitFor(() =>
      expect(screen.getByTestId(CHECK_IN)).toHaveTextContent("2"),
    );
    expect(screen.getByTestId(ISSUE)).toHaveTextContent("0");
    expect(screen.getByTestId(FULLY)).toHaveTextContent("1");
  });

  it("a zero queue keeps its row — a named 0 says watched and fine", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByTestId(ISSUE)).toBeInTheDocument());
  });

  it("the two state rows are spelt by the shared module, never retyped", async () => {
    wrap(<OperationReceiving />);
    const issueLabel = poReceivingProgress([
      { qty: 1, received_qty: 0, damaged_qty: 1 },
    ]).label;
    const fullyLabel = poReceivingProgress([{ qty: 1, received_qty: 1 }]).label;
    await waitFor(() =>
      expect(screen.getByTestId(ISSUE)).toHaveTextContent(issueLabel),
    );
    expect(screen.getByTestId(FULLY)).toHaveTextContent(fullyLabel);
    // And the row's own Progress column reads the same words.
    expect(screen.getByTestId(CHECK_IN)).toHaveTextContent("Check in");
  });

  it("opens on Check in — the received PO is out, and the chip says why", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
    expect(screen.queryByText("PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2004")).not.toBeInTheDocument();
    expect(within(chips()!).getByText("Check in")).toBeInTheDocument();
  });

  it("§8.2 — clicking the picked queue again clears it and every row comes back", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(CHECK_IN));
    await waitFor(() => expect(screen.getByText("PO-2003")).toBeInTheDocument());
    expect(screen.getByText("PO-2001")).toBeInTheDocument();
    // Cleared means "everything live", never "everything ever": a cancelled PO
    // is still not part of a receive queue.
    expect(screen.queryByText("PO-2004")).not.toBeInTheDocument();
    expect(chips()).not.toBeInTheDocument();
  });

  it("§8.2 — two picks are two chips, and each ✕ clears only its own", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2002")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("facet-supplier-sup-oh"));
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    const row = chips()!;
    expect(within(row).getByText("Check in")).toBeInTheDocument();
    expect(within(row).getByText("Supplier: Ohana")).toBeInTheDocument();
    // ✕ the supplier chip — the queue pick survives.
    fireEvent.click(within(row).getByText("Supplier: Ohana"));
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    expect(within(chips()!).getByText("Check in")).toBeInTheDocument();
    expect(screen.queryByText("PO-2003")).not.toBeInTheDocument();
  });

  it("§8.2 — clicking the same supplier again clears the supplier filter", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2002")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("facet-supplier-sup-oh"));
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("facet-supplier-sup-oh"));
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
  });

  it("the Fully received row shows the settled PO with no Receive affordance", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByTestId(FULLY)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(CHECK_IN)); // clear the default pick
    fireEvent.click(screen.getByTestId(FULLY));
    await waitFor(() => expect(screen.getByText("PO-2003")).toBeInTheDocument());
    expect(screen.queryByTestId("receive-PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2001")).not.toBeInTheDocument();
  });

  it("§8.2 — clicking the ROW opens the drawer, not only the button", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    fireEvent.click(screen.getByText("PO-2001"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute(
      "aria-label",
      expect.stringContaining("PO-2001"),
    );
  });

  it("§8.2 — closing the drawer gives the filters and the search back", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2002")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("facet-supplier-sup-oh"));
    fireEvent.change(screen.getByPlaceholderText("PO number or supplier…"), {
      target: { value: "2002" },
    });
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("receive-PO-2002"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByLabelText("Close modal"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    // The list is exactly as it was left: same two chips, same search text,
    // same one visible row.
    const row = chips()!;
    expect(within(row).getByText("Check in")).toBeInTheDocument();
    expect(within(row).getByText("Supplier: Ohana")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("PO number or supplier…")).toHaveValue(
      "2002",
    );
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
    expect(screen.queryByText("PO-2001")).not.toBeInTheDocument();
  });

  it("§8.3 — a module-tab page renders no page title of its own", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Receiving" })).toBeNull();
    expect(screen.queryByText("HQ · Operations")).toBeNull();
  });

  it("search filters by PO id", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("PO number or supplier…"), {
      target: { value: "2002" },
    });
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
  });

  it("shows the supplier name resolved from the suppliers list", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => {
      expect(screen.getAllByText("Nice Future").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Ohana").length).toBeGreaterThan(0);
  });

  it("P4 — excludes POs bound for an LP-owned warehouse once one exists (GRN = own WH only)", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({
          warehouses: [
            { id: "wh-klang", name: "Carres Klang", address: "Klang", owning_partner_id: null },
            { id: "wh-balakong", name: "HOUZS Balakong", address: "Balakong", owning_partner_id: "lp-houzs" },
          ],
        });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({
          pos: [
            po({ id: "PO-3001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", warehouse_id: "wh-klang", lines: [{ id: "k1", sku: "MS01", qty: 2, received_qty: 0 }] }),
            po({ id: "PO-3002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", warehouse_id: "wh-balakong", lines: [{ id: "k2", sku: "SF02", qty: 1, received_qty: 0 }] }),
          ],
        });
      return Promise.resolve({});
    });
    wrap(<OperationReceiving />);
    // PO-3001 → Carres Klang (own WH) shows; PO-3002 → HOUZS Balakong (LP) excluded.
    await waitFor(() => expect(screen.getByText("PO-3001")).toBeInTheDocument());
    expect(screen.queryByText("PO-3002")).not.toBeInTheDocument();
  });
});

/**
 * R1 — the row says where the delivery is, in words.
 *
 * The card's own done-when: "还有 2 张没到" must be readable from this list
 * without opening anything.
 */
describe("OperationReceiving — R1 progress state", () => {
  const R1_POS = [
    po({ id: "PO-4001", supplier_id: "sup-nf", status: "open", sup_status: "in_production", lines: [{ id: "a1", sku: "MS01", qty: 10, received_qty: 0 }] }),
    po({ id: "PO-4002", supplier_id: "sup-nf", status: "open", sup_status: "partially_shipped", lines: [{ id: "a2", sku: "MS02", qty: 10, received_qty: 8 }] }),
    po({ id: "PO-4003", supplier_id: "sup-oh", status: "open", sup_status: "partially_shipped", lines: [{ id: "a3", sku: "SF01", qty: 6, received_qty: 3, damaged_qty: 2, wrong_item_qty: 1 }] }),
    po({ id: "PO-4004", supplier_id: "sup-oh", status: "received", sup_status: "delivered", lines: [{ id: "a4", sku: "BF01", qty: 4, received_qty: 4 }] }),
  ];

  beforeEach(() => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({ warehouses: WAREHOUSES });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({ pos: R1_POS });
      return Promise.resolve({});
    });
  });

  it("reads In transit / Partially received (8/10) / Receiving issue off the list", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByTestId("receiving-progress-PO-4001")).toHaveTextContent(
        "In transit",
      ),
    );
    expect(screen.getByTestId("receiving-progress-PO-4002")).toHaveTextContent(
      "Partially received (8/10)",
    );
    expect(screen.getByTestId("receiving-progress-PO-4003")).toHaveTextContent(
      "Receiving issue",
    );
  });

  it("states what is still coming — 2 units pending delivery, never 'missing'", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByText("2 units pending delivery")).toBeInTheDocument(),
    );
    expect(screen.getByText("10 units pending delivery")).toBeInTheDocument();
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument();
  });

  it("names the problem on a PO with a receiving issue", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByText("2 damaged · 1 wrong item")).toBeInTheDocument(),
    );
  });

  it("the Receiving issue queue holds exactly the PO a human must act on", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByTestId(ISSUE)).toHaveTextContent("1"));
    fireEvent.click(screen.getByTestId(CHECK_IN)); // clear the default pick
    fireEvent.click(screen.getByTestId(ISSUE));
    await waitFor(() => expect(screen.getByText("PO-4003")).toBeInTheDocument());
    expect(screen.queryByText("PO-4001")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-4002")).not.toBeInTheDocument();
  });

  it("a settled PO reads Fully received with nothing outstanding", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByTestId(FULLY)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(CHECK_IN)); // clear the default pick
    fireEvent.click(screen.getByTestId(FULLY));
    await waitFor(() =>
      expect(screen.getByTestId("receiving-progress-PO-4004")).toHaveTextContent(
        "Fully received",
      ),
    );
  });
});
