import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationWorkItem } from "@carres/shared";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useOperationSuppliers: () => ({
    isLoading: false,
    data: { suppliers: [
      { id: "ohana", name: "Ohana", whatsapp_group_url: "https://chat.whatsapp.com/ohana" },
      { id: "hookka", name: "Hookka", contact_email: "po@hookka.test" },
    ] },
  }),
}));

const { default: PoWindowPanel } = await import("./PoWindowPanel");

const KEY = "2026-09-25T11:30";
const item = { id: `purchasing:${KEY}:purchasing.po_window`, object: { kind: "po_window", id: KEY, label: "11:30 AM PO window" } } as unknown as OperationWorkItem;
const row = (id: string, orderId: string, supplierId: string, supplier: string, toBuy: number) => ({
  id, state: "safety_days_full", lineIds: [], orderId, so: 1, customer: null, customerDelivery: null, item: "M", variant: null,
  category: "mattress", skus: [], supplierId, supplier, qtyNeeded: toBuy, readyStock: 0, takenFromStock: 0, onPo: 0,
  poNumbers: [], toBuy, goodsMustArrive: null, issueRef: { proposalKey: "p", buildKey: "b" }, action: null, parts: [],
  supplierKind: "own_logistics", ownerName: null, ownerDuty: null, poWindow: KEY,
});
const po = (poId: string, supplierId: string, supplierName: string, sent: boolean) => ({
  poId, status: "open", supplierId, supplierName, destinationId: null, officialDeliveryDate: null, sentCurrentVersion: sent, version: 1, poWindow: KEY,
});
const read = (rows: unknown[], pos: unknown[]) => ({
  today: "2026-09-25", rows, registerRows: [{ orderId: "o", so: 1, customer: null, status: "ordered", proceededAt: null, requestedDeliveryDate: null, deliveryCity: null, deliveryState: null, pos, lines: [], outstandingSuppliers: [] }],
  destinations: [], defaultDestinationId: null, currentPoDuty: null, actingPoDuty: null, poDutyNameUnavailable: false,
  poDutyUnavailable: false, mayIssue: true, procurementPartners: [], safetyDays: 14,
});

function mount(body: unknown) {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/operation/purchase/demands")) return body;
    if (path.includes("poId=")) return { pos: [{ id: "PO250925-4828", supplier_id: "hookka", version: 1, destination_id: null, sends: [] }], destinations: [], messageTemplate: null };
    throw new Error(`unexpected ${path}`);
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PoWindowPanel item={item} /></QueryClientProvider>);
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("the PO window mission", () => {
  it("while demand is left: To buy by supplier, and every PO card starts closed", async () => {
    mount(read([row("r1", "o1", "ohana", "Ohana", 2), row("r2", "o2", "ohana", "Ohana", 1), row("r3", "o3", "hookka", "Hookka", 1)], [po("PO250925-4827", "ohana", "Ohana", false)]));
    await waitFor(() => expect(screen.getByTestId("po-window-demand")).toBeInTheDocument());
    expect(screen.getByTestId("po-window-supplier-ohana")).toHaveTextContent("3 items · 2 Sales Orders");
    expect(screen.getByTestId("po-window-supplier-hookka")).toHaveTextContent("1 item · 1 Sales Order");
    expect(screen.getByTestId("po-window-po-PO250925-4827-toggle")).toHaveAttribute("aria-expanded", "false");
  });

  it("once bought: the first unsent PO opens on its send line and the ONE shared send area", async () => {
    mount(read([], [po("PO250925-4827", "ohana", "Ohana", true), po("PO250925-4828", "hookka", "Hookka", false)]));
    await waitFor(() => expect(screen.getByTestId("po-window-act-PO250925-4828")).toHaveTextContent("Click Email, send PO250925-4828(1) to Hookka"));
    expect(screen.queryByTestId("po-window-demand")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-window-po-PO250925-4827-status")).toHaveTextContent("Sent");
    await waitFor(() => expect(screen.getByTestId("so-batch-evidence-confirm")).toBeInTheDocument());
    // Unsent first: the card order puts the owed PO on top.
    const cards = screen.getAllByTestId(/^po-window-po-PO\d+-\d+$/).map((el) => el.getAttribute("data-testid"));
    expect(cards).toEqual(["po-window-po-PO250925-4828", "po-window-po-PO250925-4827"]);
  });

  it("an unreadable read says so instead of drawing an empty window", async () => {
    mount({ ...read([], []), poWindowsUnavailable: true });
    await waitFor(() => expect(screen.getByTestId("po-window-failed")).toBeInTheDocument());
  });
});
