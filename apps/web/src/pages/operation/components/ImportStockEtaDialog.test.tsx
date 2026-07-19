/**
 * ImportStockEtaDialog — pins the Master-append reconcile section (Option A,
 * 2026-07-18): after commit, the dry-run scan's candidates render as a
 * tick-list (clean = pre-ticked, un-clean = unticked + the portal's
 * unaccounted line shown), and Append sends ONLY the ticked rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  importOrders: vi.fn(async () => ({ ordersTotal: 1, created: 1, updated: 0, skippedLocked: 0, errored: 0, results: [] })),
  importEta: vi.fn(async (_input: { dryRun?: boolean }) => ({
    matched: 1,
    unmatched: 0,
    orders: 1,
    written: _input.dryRun ? 0 : 1,
    storageOrders: 0,
    storageWritten: 0,
    storageUnmatched: 0,
    balanceOrders: 0,
    balanceWritten: 0,
    balanceUnmatched: 0,
    sampleUnmatched: [],
    dryRun: _input.dryRun ?? false,
  })),
  appendLines: vi.fn(async (input: { dryRun?: boolean }) =>
    input.dryRun
      ? { candidates: h.candidates, appended: 0, orders: 0, dryRun: true }
      : { candidates: [], appended: 1, orders: 1, dryRun: false },
  ),
  candidates: [] as unknown[],
}));

vi.mock("@/lib/queries", () => ({
  useImportOrders: () => ({ mutateAsync: h.importOrders, isPending: false }),
  useImportStockEta: () => ({ mutateAsync: h.importEta, isPending: false }),
  useAppendMissingLines: () => ({ mutateAsync: h.appendLines, isPending: false }),
}));

// The dialog reads the sheet via a dynamic import("xlsx") — feed it one Ops
// sheet with two order rows for TCF0544 (the real missing-line case).
vi.mock("xlsx", () => ({
  read: () => ({ SheetNames: ["Ops"], Sheets: { Ops: {} } }),
  utils: {
    sheet_to_json: () => [
      ["Ref", "Item Group", "Qty", "Item Detail", "Customer", "PO", "Stock Status"],
      ["TCF0544", "Sofa", 1, 'DSL9038/30"(3 Seater)', "TEO WEE SIONG", "PO/2606-099", "Received"],
      ["TCF0544", "Sofa", 1, 'SF03-HK5535/30"(3 Seater)', "TEO WEE SIONG", "PO/2606-111", "Received"],
    ],
  },
}));

import ImportStockEtaDialog from "./ImportStockEtaDialog";

const CLEAN = {
  orderId: "o1138",
  so: 1138,
  ref: "TCF0544",
  detail: 'DSL9038/30"(3 Seater)',
  itemGroup: "Sofa",
  qty: 1,
  po: "PO/2606-099",
  clean: true,
  portalUnaccounted: [],
};
const DIRTY = {
  orderId: "o1140",
  so: 1140,
  ref: "TCF0545",
  detail: 'DSL9055/28"(2 Seater + Lshape)',
  itemGroup: "Sofa",
  qty: 1,
  po: "PO/2606-101",
  clean: false,
  portalUnaccounted: [{ sku: 'HK5531/28"(2 Seater + Lshape)', sourcePo: "PO/2606-113" }],
};

async function driveToResult() {
  render(<ImportStockEtaDialog onClose={() => {}} />);
  const file = new File(["x"], "Master.xlsx");
  file.arrayBuffer = async () => new ArrayBuffer(1);
  fireEvent.change(screen.getByTestId("eta-import-file"), { target: { files: [file] } });
  await screen.findByTestId("eta-import-confirm");
  fireEvent.click(screen.getByTestId("eta-import-confirm"));
  await screen.findByTestId("eta-import-result");
}

beforeEach(() => {
  h.importOrders.mockClear();
  h.importEta.mockClear();
  h.appendLines.mockClear();
  h.candidates = [];
});

describe("ImportStockEtaDialog — Master append section", () => {
  it("hides the section when the scan finds nothing", async () => {
    await driveToResult();
    await waitFor(() =>
      expect(h.appendLines).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      ),
    );
    expect(screen.queryByTestId("append-missing-section")).toBeNull();
  });

  it("renders candidates: clean pre-ticked, un-clean unticked with the portal line shown", async () => {
    h.candidates = [CLEAN, DIRTY];
    await driveToResult();
    const section = await screen.findByTestId("append-missing-section");
    expect(section.textContent).toContain("SO-1138");
    expect(section.textContent).toContain("SO-1140");
    expect(section.textContent).toContain("order already has:");
    expect(section.textContent).toContain('HK5531/28"(2 Seater + Lshape) · PO/2606-113');
    expect((screen.getByTestId("append-tick-1138") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("append-tick-1140") as HTMLInputElement).checked).toBe(false);
  });

  it("Append sends ONLY the ticked rows, then shows the done note", async () => {
    h.candidates = [CLEAN, DIRTY];
    await driveToResult();
    await screen.findByTestId("append-missing-section");
    fireEvent.click(screen.getByTestId("append-missing-confirm"));
    await screen.findByTestId("append-missing-done");
    const commit = h.appendLines.mock.calls.find(
      (call) => !(call[0] as { dryRun?: boolean }).dryRun,
    );
    expect(commit?.[0]).toEqual({
      rows: [
        {
          ref: "TCF0544",
          itemGroup: "Sofa",
          qty: 1,
          detail: 'DSL9038/30"(3 Seater)',
          po: "PO/2606-099",
        },
      ],
    });
  });
});
