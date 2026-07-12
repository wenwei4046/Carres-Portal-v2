import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { defaultSoGridConfig, type SoGridResponse } from "@carres/shared";

vi.mock("@/lib/queries", () => ({
  useSalesOrderGrid: vi.fn(),
  useUpdateSoGridConfig: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useSalesOrderGrid, useUpdateSoGridConfig } from "@/lib/queries";
import SalesOrderMaintenancePage from "./SalesOrderMaintenancePage";

const RESPONSE: SoGridResponse = {
  rows: [
    {
      rowId: "00000000-0000-0000-0000-0000000000d1:l1",
      orderId: "00000000-0000-0000-0000-0000000000d1",
      lineId: "l1",
      so: "SO-1001",
      customer_name: "Tan Ah Kow",
      sku: "SKU-A",
      product_name: "Cozy 910",
      item_group: "bedframe",
      qty: 2,
      unit_price: 100,
      line_total: 200,
    },
  ],
  config: defaultSoGridConfig(),
  generatedAt: "2026-06-16T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(useSalesOrderGrid).mockReturnValue({
    data: RESPONSE,
    isLoading: false,
    isError: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(useUpdateSoGridConfig).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("SalesOrderMaintenancePage", () => {
  it("renders the header + grid rows from the query", () => {
    render(<SalesOrderMaintenancePage />);
    expect(screen.getByText("Sales Order Maintenance")).toBeInTheDocument();
    expect(screen.getByText("SO-1001")).toBeInTheDocument();
    expect(screen.getByText("Tan Ah Kow")).toBeInTheDocument();
    expect(screen.getAllByTestId("dg-row")).toHaveLength(1);
  });

  it("Columns button opens the show/hide picker", () => {
    render(<SalesOrderMaintenancePage />);
    fireEvent.click(screen.getByRole("button", { name: /Columns/i }));
    expect(screen.getByText("Show columns")).toBeInTheDocument();
  });

  it("no longer offers the Order Entry gateway (moved to the POS Maintain section)", () => {
    render(<SalesOrderMaintenancePage />);
    expect(screen.queryByRole("button", { name: /Order Entry/i })).not.toBeInTheDocument();
  });

  it("Column Settings button opens the settings modal", () => {
    render(<SalesOrderMaintenancePage />);
    fireEvent.click(screen.getByRole("button", { name: /Column Settings/i }));
    // modal heading
    expect(
      screen.getByText("Reorder, rename, show/hide columns, and maintain the option lists.", { exact: false }),
    ).toBeInTheDocument();
  });
});
