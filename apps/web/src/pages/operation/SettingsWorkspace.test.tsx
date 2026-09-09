import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsWorkspace from "./SettingsWorkspace";

vi.mock("./SalesOrderSettings", () => ({ default: () => <div>Sales settings</div> }));
vi.mock("./OperationPurchasingSettings", () => ({ default: () => <div>Purchasing settings</div> }));
vi.mock("./IssueTrackerSettings", () => ({ default: () => <div>Issue settings</div> }));
vi.mock("./PaymentSettings", () => ({ default: () => <div>Payment settings</div> }));

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
    expect(screen.getByText("Sales Orders", { selector: "[data-settings-group]" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sales Order Settings" })).toHaveAttribute("aria-current", "page");
  });
});

/* The rail is the governed Carres rail (owner correction, 2026-09-09) — not a
   floating 280px card with a near-black active pill. */
describe("SettingsWorkspace rail — the governed shell", () => {
  const renderAt = (path = "/operation/settings/purchasing") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/operation/settings/*" element={<SettingsWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    localStorage.clear();
  });

  it("is 240px, flush left, divided by one straight border — no card, no radius, no shadow", () => {
    renderAt();
    const rail = screen.getByTestId("settings-rail");
    expect(rail.className).toContain("w-[240px]");
    expect(rail.className).toContain("border-r");
    // The retired floating-card grammar must not come back.
    expect(rail.className).not.toContain("rounded-card");
    expect(rail.className).not.toContain("shadow");
    expect(rail.className).not.toContain("m-5");
    expect(rail.className).not.toContain("w-[280px]");
  });

  it("marks the active page with the pale-blue wash and a 2px blue left line", () => {
    renderAt();
    const active = screen.getByTestId("settings-section-purchasing");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-kit-blue-3");
    // The near-black pill is retired.
    expect(active.className).not.toContain("bg-base-900");
    const line = active.querySelector("span[aria-hidden]");
    expect(line?.className).toContain("w-0.5");
    expect(line?.className).toContain("bg-kit-blue-9");

    // An inactive row carries neither the wash nor a line.
    const inactive = screen.getByTestId("settings-section-payment");
    expect(inactive.className).not.toContain("bg-kit-blue-3");
    expect(inactive.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("hides completely and leaves NO second 60px icon strip; the content offers Show settings", () => {
    renderAt();

    fireEvent.click(screen.getByRole("button", { name: "Hide settings" }));

    expect(screen.queryByTestId("settings-rail")).toBeNull();
    // Not collapsed to icons — gone. No nav element survives.
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Purchasing Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show settings" }));
    expect(screen.getByTestId("settings-rail")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show settings" })).toBeNull();
  });

  it("remembers the hidden choice for this browser", () => {
    const first = renderAt();
    fireEvent.click(screen.getByRole("button", { name: "Hide settings" }));
    expect(localStorage.getItem("ops-settings-rail")).toBe("0");
    first.unmount();

    renderAt();
    expect(screen.queryByTestId("settings-rail")).toBeNull();
    expect(screen.getByRole("button", { name: "Show settings" })).toBeInTheDocument();
  });

  it("survives a browser that refuses storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderAt();
    expect(screen.getByTestId("settings-rail")).toBeInTheDocument();
    spy.mockRestore();
  });
});
