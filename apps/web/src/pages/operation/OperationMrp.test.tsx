import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MrpLine } from "@carres/shared";
import OperationMrp from "./OperationMrp";

const mrpQuery = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useMrp: () => mrpQuery() };
});
vi.mock("./PurchasingTabs", () => ({
  default: ({ right }: { right?: React.ReactNode }) => <div data-testid="tabs">{right}</div>,
}));

const line = (over: Partial<MrpLine>): MrpLine => ({
  lineId: "L1", orderId: "O1", so: 101, customer: "TEST", sku: "SKU-A", model: "Haven", variant: "King",
  category: "mattress", supplierName: "Test Supplier", delivery: "2026-11-20",
  needed: 5, inStock: 1, onPo: 2, shortage: 2, ...over,
});

const show = (lines: MrpLine[]) => {
  mrpQuery.mockReturnValue({ data: { lines, freeStockBySku: { "SKU-A": 7 } }, isLoading: false, isError: false });
  render(<MemoryRouter><OperationMrp /></MemoryRouter>);
};

describe("OperationMrp", () => {
  it("prints the four numbers and Free Stock for an item", () => {
    show([line({})]);
    const row = screen.getAllByRole("row").find((r) => r.textContent?.includes("SKU-A"))!;
    expect(row.textContent).toContain("Haven King");
    for (const n of ["5", "1", "2", "7"]) expect(row.textContent).toContain(n);
  });

  it("Shortages hides an item that is covered", () => {
    show([line({}), line({ lineId: "L2", sku: "SKU-B", shortage: 0, onPo: 4 })]);
    expect(screen.getByText("SKU-B")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mrp-show-shortages"));
    expect(screen.queryByText("SKU-B")).toBeNull();
    expect(screen.getByText("SKU-A")).toBeTruthy();
  });

  it("says a failed read failed, not that nothing is needed", () => {
    mrpQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(<MemoryRouter><OperationMrp /></MemoryRouter>);
    expect(screen.getByText("Could not be loaded")).toBeTruthy();
    expect(screen.queryByText("Nothing is needed for these filters.")).toBeNull();
  });
});
