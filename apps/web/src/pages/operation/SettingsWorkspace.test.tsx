import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SettingsWorkspace from "./SettingsWorkspace";

vi.mock("./SalesOrderSettings", () => ({ default: () => <div>Sales Order Settings</div> }));
vi.mock("./OperationPurchasingSettings", () => ({ default: () => <div>Purchasing Settings</div> }));

describe("SettingsWorkspace navigation", () => {
  it("uses central absolute routes instead of nesting the next section under the current one", () => {
    render(
      <MemoryRouter initialEntries={["/operation/settings/sales-orders"]}>
        <SettingsWorkspace />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("settings-section-sales-orders")).toHaveAttribute(
      "href",
      "/operation/settings/sales-orders",
    );
    expect(screen.getByTestId("settings-section-purchasing")).toHaveAttribute(
      "href",
      "/operation/settings/purchasing",
    );
  });
});
