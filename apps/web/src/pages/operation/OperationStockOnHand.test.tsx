import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationStockOnHand from "./OperationStockOnHand";
import type { OpsStockItem } from "@carres/shared";

/**
 * OperationStockOnHand — the unified per-unit Stock list (Jess redesign step 3).
 *
 * Mocks apiFetch so the single /inventory fetch returns a fixture; OpsStockListView
 * is rendered for real with injected rows (its own fetch is disabled via the
 * `rows` prop), so this also exercises the embedded-mode + unitCode column fix.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function makeUnit(p: Partial<OpsStockItem> & { id: string; unitCode: string }): OpsStockItem {
  return {
    sku: "SKU-1",
    warehouseId: "wh-klang",
    condition: "new",
    status: "free",
    reservedRef: null,
    refHistory: [],
    needsRepair: false,
    supplier: null,
    poNo: null,
    sourceRef: null,
    dateIn: "2026-05-20",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
    ...p,
  };
}

// all=7, ready=3 (u1 new, u2 display, u4 fair-used), reserved=1 (u3), defective=1 (u5 needsRepair)
const UNITS: OpsStockItem[] = [
  makeUnit({ id: "1", unitCode: "id-aaa111", condition: "new", status: "free" }),
  makeUnit({ id: "2", unitCode: "id-bbb222", condition: "exhibition", status: "free" }),
  makeUnit({ id: "3", unitCode: "id-ccc333", condition: "new", status: "reserved", reservedRef: "SO-1142" }),
  makeUnit({ id: "4", unitCode: "id-ddd444", condition: "old", status: "free" }),
  makeUnit({ id: "5", unitCode: "id-eee555", condition: "new", status: "free", needsRepair: true }),
  makeUnit({ id: "6", unitCode: "id-fff666", condition: "new", status: "incoming" }),
  makeUnit({ id: "7", unitCode: "id-ggg777", condition: "new", status: "sold" }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/ops/stock/inventory")) {
      return Promise.resolve({ items: UNITS, total: UNITS.length });
    }
    return Promise.resolve({ items: [], total: 0 });
  });
});

describe("OperationStockOnHand", () => {
  it("renders 4 filter chips with counts derived from the inventory grid", async () => {
    wrap(<OperationStockOnHand />);
    expect(await screen.findAllByRole("tab")).toHaveLength(4);
    // Counts start at 0 during the inventory fetch, then settle — wait for it.
    await waitFor(() => {
      const tabs = screen.getAllByRole("tab");
      expect(within(tabs[0]).getByText("7")).toBeInTheDocument(); // All
    });
    const tabs = screen.getAllByRole("tab");
    expect(within(tabs[1]).getByText("3")).toBeInTheDocument(); // Ready
    expect(within(tabs[2]).getByText("1")).toBeInTheDocument(); // Reserved
    expect(within(tabs[3]).getByText("1")).toBeInTheDocument(); // Defective
  });

  it("defaults to All and lists every unit with its Unit ID", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() =>
      expect(screen.getAllByRole("row").length).toBeGreaterThan(7),
    );
    // Unit ID column shows the minted code, not the SKU.
    expect(screen.getByText("id-aaa111")).toBeInTheDocument();
    expect(screen.getByText("id-ggg777")).toBeInTheDocument();
  });

  it("Ready chip filters to free + sellable-grade + not-flagged units", async () => {
    wrap(<OperationStockOnHand />);
    const chips = await screen.findAllByRole("tab");
    fireEvent.click(chips[1]); // Ready
    await waitFor(() => {
      expect(screen.getByText("id-aaa111")).toBeInTheDocument(); // new
      expect(screen.getByText("id-bbb222")).toBeInTheDocument(); // display
      expect(screen.getByText("id-ddd444")).toBeInTheDocument(); // fair (used) — now sellable
    });
    // reserved / needsRepair / incoming / sold are excluded
    expect(screen.queryByText("id-ccc333")).not.toBeInTheDocument();
    expect(screen.queryByText("id-eee555")).not.toBeInTheDocument();
  });

  it("Defective chip filters to needs-repair OR damaged units", async () => {
    wrap(<OperationStockOnHand />);
    const chips = await screen.findAllByRole("tab");
    fireEvent.click(chips[3]); // Defective
    await waitFor(() => {
      expect(screen.getByText("id-eee555")).toBeInTheDocument(); // needsRepair
    });
    // fair (used) is now sellable, no longer defective
    expect(screen.queryByText("id-ddd444")).not.toBeInTheDocument();
    expect(screen.queryByText("id-aaa111")).not.toBeInTheDocument(); // ready
  });

  it("Reserved chip shows the customer ref", async () => {
    wrap(<OperationStockOnHand />);
    const chips = await screen.findAllByRole("tab");
    fireEvent.click(chips[2]); // Reserved
    await waitFor(() => {
      expect(screen.getByText("id-ccc333")).toBeInTheDocument();
    });
    expect(screen.getByText("SO-1142")).toBeInTheDocument();
    expect(screen.queryByText("id-aaa111")).not.toBeInTheDocument();
  });
});
