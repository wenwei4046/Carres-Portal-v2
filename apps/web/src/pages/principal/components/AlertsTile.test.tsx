import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertsTile from "./AlertsTile";

describe("AlertsTile", () => {
  it("renders 'All systems normal.' when both signals are clear", () => {
    render(
      <AlertsTile
        alerts={{ suspended_dealers: 0, low_stock: [] }}
        setTab={() => {}}
      />,
    );
    expect(screen.getByText("All systems normal.")).toBeInTheDocument();
  });

  it("renders suspended-dealer count and routes to /dealers on click", () => {
    const setTab = vi.fn();
    render(
      <AlertsTile
        alerts={{ suspended_dealers: 2, low_stock: [] }}
        setTab={setTab}
      />,
    );
    const row = screen.getByText("2 dealers suspended");
    expect(row).toBeInTheDocument();
    (row.closest("button") as HTMLButtonElement).click();
    expect(setTab).toHaveBeenCalledWith("dealers");
  });

  it("uses singular form when only one dealer is suspended", () => {
    render(
      <AlertsTile
        alerts={{ suspended_dealers: 1, low_stock: [] }}
        setTab={() => {}}
      />,
    );
    expect(screen.getByText("1 dealer suspended")).toBeInTheDocument();
  });

  it("renders low-stock SKU rows alongside the suspended row", () => {
    render(
      <AlertsTile
        alerts={{
          suspended_dealers: 1,
          low_stock: [
            { sku: "SKU-1", name: "Cloud Mattress · Queen", available: 1, incoming: 4 },
          ],
        }}
        setTab={() => {}}
      />,
    );
    expect(screen.getByText("Cloud Mattress · Queen")).toBeInTheDocument();
    expect(screen.getByText("1 left · 4 incoming")).toBeInTheDocument();
  });
});
