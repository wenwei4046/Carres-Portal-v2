import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import WarehouseUnitDetail from "./WarehouseUnitDetail";

vi.mock("@/lib/queries", () => ({
  useStockUnit: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error("column stock_unit_register_v.site_name does not exist"),
  }),
}));
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word }: { word: string }) => <div>{word}</div>,
}));

describe("Unit Detail authority failure", () => {
  it("shows governed problem/action copy and never exposes database text", () => {
    render(
      <MemoryRouter initialEntries={["/operation/stock/unit/id-abc123456"]}>
        <Routes>
          <Route path="/operation/stock/unit/:unitCode" element={<WarehouseUnitDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("This Unit could not be loaded.")).toBeInTheDocument();
    expect(
      screen.getByText("Try again. If it still fails, ask the system owner to check Inventory."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stock_unit_register_v|site_name|column/i)).not.toBeInTheDocument();
  });

  it("returns to the real Inventory address", () => {
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="location-probe">{location.pathname}{location.search}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/operation/stock/unit/id-abc123456"]}>
        <Routes>
          <Route path="*" element={<><WarehouseUnitDetail /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "← Inventory" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/operation?tab=stock-onhand");
  });
});
