import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StockSettings from "./StockSettings";

vi.mock("./components/ReorderStockCard", () => ({
  default: ({ settingsOnly }: { settingsOnly?: boolean }) => (
    <div data-testid="reorder-master-data" data-settings-only={String(settingsOnly)} />
  ),
}));

describe("Stock Settings", () => {
  it("owns reorder points and lead days without presenting buying work", () => {
    render(<StockSettings />);

    expect(screen.getByRole("heading", { name: "Inventory Settings" })).toBeInTheDocument();
    expect(
      screen.getByText("Set the inventory levels and supplier lead time used by Purchasing."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("reorder-master-data")).toHaveAttribute("data-settings-only", "true");
    expect(screen.queryByText(/urgent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/monthly plan/i)).not.toBeInTheDocument();
  });
});
