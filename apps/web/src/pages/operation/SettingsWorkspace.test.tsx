import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SettingsWorkspace from "./SettingsWorkspace";

vi.mock("./SalesOrderSettings", () => ({ default: () => <div>Sales settings</div> }));
vi.mock("./OperationPurchasingSettings", () => ({ default: () => <div>Purchasing settings</div> }));
vi.mock("./IssueTrackerSettings", () => ({ default: () => <div>Issue settings</div> }));
vi.mock("./StockSettings", () => ({ default: () => <div>Stock settings</div> }));

describe("SettingsWorkspace navigation", () => {
  it("uses canonical central module routes from a nested settings destination", () => {
    render(
      <MemoryRouter initialEntries={["/operation/settings/sales-orders"]}>
        <Routes>
          <Route path="/operation/settings/*" element={<SettingsWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Sales Order Settings" })).toHaveAttribute(
      "href",
      "/operation/settings/sales-orders",
    );
    expect(screen.getByRole("link", { name: "Purchasing Settings" })).toHaveAttribute(
      "href",
      "/operation/settings/purchasing",
    );
    expect(screen.getByRole("link", { name: "Issue Tracker Settings" })).toHaveAttribute("href", "/operation/settings/issue-tracker");
    expect(screen.getByRole("link", { name: "Stock Settings" })).toHaveAttribute(
      "href",
      "/operation/settings/stock",
    );
    expect(screen.getByText("Sales Orders", { selector: "[data-settings-group]" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sales Order Settings" })).toHaveAttribute("aria-current", "page");
  });
});
