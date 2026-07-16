/**
 * OperationFabricCostTab (0226) — the Operation Catalog fabric costing list.
 * Covers:
 *  - renders code / series / description / supplier + cost add-on column
 *    ("not set" when null); NO tier pills (tiers stay in Product & Maintenance)
 *  - search filter + count line
 *  - Edit Costs → inline input commits { id, cost } via useSetCatalogFabricCost;
 *    blank clears to null; unchanged blur is a no-op
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogFabricDto, CatalogResponse } from "@carres/shared";
import OperationFabricCostTab from "./OperationFabricCostTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockSetCostMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  useSetCatalogFabricCost: () => ({ mutate: mockSetCostMutate, isPending: false }),
}));

const FABRIC_WITH_COST: CatalogFabricDto = {
  id: "f1",
  fabricCode: "BF-01",
  series: null,
  description: "BF-01",
  supplierCode: "PC151-01",
  sofaTier: "PRICE_2",
  bedframeTier: "PRICE_2",
  active: true,
  sortOrder: 1,
  cost: 120.5,
};

const FABRIC_NO_COST: CatalogFabricDto = {
  id: "f2",
  fabricCode: "CG-001",
  series: "KOONA VELVET H2O",
  description: "CG-001 Pearl",
  supplierCode: "KN390-1",
  sofaTier: "PRICE_1",
  bedframeTier: "PRICE_3",
  active: true,
  sortOrder: 2,
  cost: null,
};

function makeCatalog(fabrics: CatalogFabricDto[]): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    fabrics,
  };
}

beforeEach(() => {
  mockSetCostMutate.mockReset();
});

describe("OperationFabricCostTab", () => {
  it("renders fabric rows with the cost add-on; null cost → not set; no tier pills", () => {
    render(<OperationFabricCostTab catalog={makeCatalog([FABRIC_WITH_COST, FABRIC_NO_COST])} />);
    expect(screen.getByTestId("opcost-fabric-row-BF-01")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-fabric-cost-BF-01").textContent).toContain("120.50");
    expect(screen.getByTestId("opcost-fabric-cost-CG-001").textContent).toContain("not set");
    expect(screen.getByText("KOONA VELVET H2O")).toBeInTheDocument();
    // Tiers deliberately absent from the costing view.
    expect(screen.queryByText("Price 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Price 2")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 2 fabrics")).toBeInTheDocument();
  });

  it("search filters by code / description / series / supplier", () => {
    render(<OperationFabricCostTab catalog={makeCatalog([FABRIC_WITH_COST, FABRIC_NO_COST])} />);
    fireEvent.change(screen.getByTestId("opcost-fabric-search"), { target: { value: "koona" } });
    expect(screen.queryByTestId("opcost-fabric-row-BF-01")).not.toBeInTheDocument();
    expect(screen.getByTestId("opcost-fabric-row-CG-001")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 fabrics")).toBeInTheDocument();
  });

  it("Edit Costs → inline input commits { id, cost }", () => {
    render(<OperationFabricCostTab catalog={makeCatalog([FABRIC_WITH_COST])} />);
    fireEvent.click(screen.getByTestId("opcost-fabric-edit"));
    const input = screen.getByLabelText("BF-01 cost add-on");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.blur(input);
    expect(mockSetCostMutate).toHaveBeenCalledTimes(1);
    expect(mockSetCostMutate.mock.calls[0][0]).toEqual({ id: "f1", cost: 150 });
  });

  it("blank input clears the cost to null", () => {
    render(<OperationFabricCostTab catalog={makeCatalog([FABRIC_WITH_COST])} />);
    fireEvent.click(screen.getByTestId("opcost-fabric-edit"));
    const input = screen.getByLabelText("BF-01 cost add-on");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(mockSetCostMutate).toHaveBeenCalledTimes(1);
    expect(mockSetCostMutate.mock.calls[0][0]).toEqual({ id: "f1", cost: null });
  });

  it("unchanged value on blur → no mutation", () => {
    render(<OperationFabricCostTab catalog={makeCatalog([FABRIC_WITH_COST])} />);
    fireEvent.click(screen.getByTestId("opcost-fabric-edit"));
    fireEvent.blur(screen.getByLabelText("BF-01 cost add-on"));
    expect(mockSetCostMutate).not.toHaveBeenCalled();
  });
});
