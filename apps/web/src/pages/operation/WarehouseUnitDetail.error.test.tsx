import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
      screen.getByText("Try again. If it still fails, ask the system owner to check the Stock Register."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stock_unit_register_v|site_name|column/i)).not.toBeInTheDocument();
  });
});
