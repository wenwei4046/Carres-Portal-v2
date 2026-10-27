/**
 * `Cancel return` on the Purchase Return record (0713, YH 2026-10-26): a
 * claimless return whose Unit was sold before the supplier came. Offered only
 * on a claimless return nothing has left on; asks for the reason; a cancelled
 * return shows who, when and why, and offers no further step.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PurchaseReturnDetail } from "@carres/shared";

const mutate = vi.fn();
const writePaths: string[] = [];
vi.mock("@/lib/queries", () => ({
  usePurchaseReturn: vi.fn(),
  usePurchaseReturnWrite: (path: string) => { writePaths.push(path); return { mutate, isPending: false, error: null }; },
}));
vi.mock("@/lib/deadline-queries", () => ({ useOfficeDays: () => ({ office: undefined }) }));
vi.mock("@/lib/pdf/purchase-return-pdf", () => ({ purchaseReturnPrintData: vi.fn(), usePurchaseReturnPdfUrl: () => ({}) }));
vi.mock("./components/PurchaseReturnUnitsTable", () => ({ default: () => null }));

import { PurchaseReturnPanel } from "./PurchaseReturnRecord";

const pr = (over: Partial<PurchaseReturnDetail> = {}): PurchaseReturnDetail => ({
  id: "pr-1",
  pr_no: "PR-20261026-1001",
  pr_doc_date: "2026-10-26T02:00:00Z",
  supplier_id: "s1",
  supplier_name: "Hookka",
  supplier_claim_id: null,
  claim_no: null,
  grn_no: null,
  sent_at: null,
  confirmed_pickup_date: null,
  sends: [],
  confirmations: [],
  receipts: [],
  units: [{ unit_id: "U-1", stock_item_id: "u1", po_id: "PO-1", category: "Sofa", item: "Kaya", item_spec: null, pickup_location: "Klang", return_to: "Muar", collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [] }],
  ...over,
} as PurchaseReturnDetail);

const show = (row: PurchaseReturnDetail) => render(<MemoryRouter><PurchaseReturnPanel pr={row} today="2026-10-26" /></MemoryRouter>);

describe("Cancel return", () => {
  it("asks for the reason, then calls the cancel door with it", () => {
    show(pr());
    fireEvent.click(screen.getByTestId("purchase-return-cancel"));
    const confirm = screen.getByRole("button", { name: "Cancel return" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Keep return" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  Unit sold to a customer " } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel return" }));
    expect(writePaths).toContain("/api/operation/purchase-returns/pr-1/cancel");
    expect(mutate).toHaveBeenCalledWith({ reason: "Unit sold to a customer" }, expect.anything());
  });

  it("is not offered on a claim return or once the supplier collected a Unit", () => {
    const { unmount } = show(pr({ supplier_claim_id: "c1", claim_no: "SC-1" }));
    expect(screen.queryByTestId("purchase-return-cancel")).toBeNull();
    unmount();
    const row = pr();
    show({ ...row, units: [{ ...row.units[0]!, actual_pickup_date: "2026-10-26T03:00:00Z" }] });
    expect(screen.queryByTestId("purchase-return-cancel")).toBeNull();
  });

  it("a cancelled return shows who and why, and offers no further step", () => {
    show(pr({ cancelled_at: "2026-10-26T04:00:00Z", cancelled_by_name: "Mei", cancel_reason: "Unit sold to a customer" }));
    expect(screen.getByTestId("purchase-return-cancelled").textContent).toContain("Mei · Unit sold to a customer");
    expect(screen.queryByTestId("purchase-return-cancel")).toBeNull();
    expect(screen.queryByTestId("purchase-return-send")).toBeNull();
    expect(screen.queryByTestId("purchase-return-pickup")).toBeNull();
    expect(screen.queryByTestId("purchase-return-current-action")).toBeNull();
  });
});
