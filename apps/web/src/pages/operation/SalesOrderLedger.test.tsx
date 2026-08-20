import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SalesOrderLedger, { historyWords } from "./SalesOrderLedger";

const revisions = [{
  revision: 1,
  snapshot: { header: { customer_name: "Kimmy" }, lines: [], addons: [] },
  created_at: "2026-08-10T01:00:00Z",
  created_by: null,
  change_type: null,
  note: null,
}];
const history = [{ text: "Amendment rejected - price not agreed", occurred_at: "2026-08-10T02:00:00Z" }];

describe("Sales Order Revisions and History are different records", () => {
  it("shows complete versions without mixing in event history", () => {
    render(<SalesOrderLedger revisions={revisions} history={history} currentRevision={1} viewedRevision={null} onViewRevision={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Revisions" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Original — the agreement/)).toBeTruthy();
    expect(screen.queryByText(/Amendment rejected/)).toBeNull();
  });

  it("shows the append-only event ledger separately", () => {
    render(<SalesOrderLedger revisions={revisions} history={history} currentRevision={1} viewedRevision={null} onViewRevision={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Amendment rejected/)).toBeTruthy();
    expect(screen.queryByText(/Original — the agreement/)).toBeNull();
  });

  it("turns rollback into a new governed proposal instead of rewriting history", () => {
    const onProposeRevision = vi.fn();
    const rows = [...revisions, { ...revisions[0], revision: 2, created_at: "2026-08-11T01:00:00Z" }];
    render(<SalesOrderLedger revisions={rows} history={history} currentRevision={2} viewedRevision={null} onViewRevision={vi.fn()} onProposeRevision={onProposeRevision} />);
    fireEvent.click(screen.getByRole("button", { name: "Propose this version again" }));
    expect(onProposeRevision).toHaveBeenCalledWith(rows[0]);
  });

  it("translates stored field keys into the same plain words as the object page", () => {
    expect(historyWords("Staff correction - Rev 2 - customer_name")).toBe(
      "Staff correction · Rev 2 · Customer name",
    );
    expect(historyWords("Changed delivery_date and delivery_has_lift")).toBe(
      "Changed Customer Delivery and Lift available",
    );
  });
});
