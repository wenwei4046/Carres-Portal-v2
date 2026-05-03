import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiStrip from "./KpiStrip";

const baseKpis = {
  total_gmv: 1234500,
  active_orders: 12,
  active_dealers: 4,
  total_dealers: 5,
  pending_approvals: 0,
  low_stock_skus: 2,
};

describe("KpiStrip", () => {
  it("formats GMV in 'RM Xk' shorthand", () => {
    render(<KpiStrip kpis={baseKpis} setTab={() => {}} />);
    expect(screen.getByText("RM 1234.5k")).toBeInTheDocument();
  });

  it("renders Active dealers as 'active/total'", () => {
    render(<KpiStrip kpis={baseKpis} setTab={() => {}} />);
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("renders Pending approvals as a non-clickable card when count is 0", () => {
    render(<KpiStrip kpis={baseKpis} setTab={() => {}} />);
    // No button should exist with the 'Pending approvals' label when count = 0.
    const pendingLabel = screen.getByText("Pending approvals");
    const tile = pendingLabel.parentElement!;
    expect(tile.tagName).toBe("DIV");
  });

  it("renders Pending approvals as a clickable button + accent when > 0", () => {
    const setTab = vi.fn();
    const kpisWithPending = { ...baseKpis, pending_approvals: 3 };
    render(<KpiStrip kpis={kpisWithPending} setTab={setTab} />);
    const pendingLabel = screen.getByText("Pending approvals");
    const tile = pendingLabel.parentElement! as HTMLElement;
    expect(tile.tagName).toBe("BUTTON");
    expect(tile.className).toContain("bg-primary/5");
    tile.click();
    expect(setTab).toHaveBeenCalledWith("approvals");
  });
});
