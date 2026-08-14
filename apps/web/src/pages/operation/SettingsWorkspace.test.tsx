import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SettingsWorkspace from "./SettingsWorkspace";

vi.mock("./SalesOrderSettings", () => ({ default: () => <div>Sales settings</div> }));
vi.mock("./OperationPurchasingSettings", () => ({ default: () => <div>Purchasing settings</div> }));

describe("SettingsWorkspace", () => {
  it("keeps central module destinations stable from a module settings route", () => {
    render(
      <MemoryRouter initialEntries={["/operation/settings/sales-orders"]}>
        <Routes>
          <Route path="/operation/settings/*" element={<SettingsWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Sales Orders" })).toHaveAttribute(
      "href",
      "/operation/settings/sales-orders",
    );
    expect(screen.getByRole("link", { name: "Purchasing" })).toHaveAttribute(
      "href",
      "/operation/settings/purchasing",
    );
  });
});
