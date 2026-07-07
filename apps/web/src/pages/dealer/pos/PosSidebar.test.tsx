import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import PosSidebar, { type RailEntry } from "./PosSidebar";

const ENTRIES: RailEntry[] = [
  { key: "all", label: "All open", count: 3 },
  { key: "mattress", label: "Mattresses", count: 1 },
  { key: "bedframe", label: "Bed frames", count: 1 },
  { key: "sofa", label: "Sofas", count: 1, locked: true },
  { key: "addons", label: "Add-ons", count: 2 },
];

function renderSidebar() {
  return render(
    <MemoryRouter>
      <PosSidebar entries={ENTRIES} active="all" onSelect={() => {}} onResetFilters={() => {}} />
    </MemoryRouter>,
  );
}

describe("PosSidebar", () => {
  beforeEach(() => {
    useAuth.setState({ role: null });
  });
  afterEach(() => {
    cleanup();
    useAuth.setState({ role: null });
  });

  it("renders category entries with counts; locked entry is disabled", () => {
    renderSidebar();
    expect(screen.getByTestId("pos-rail-all").textContent).toContain("All open");
    expect(screen.getByTestId("pos-rail-all").textContent).toContain("3");
    expect((screen.getByTestId("pos-rail-sofa") as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides the MAINTAIN section for dealer-side roles", () => {
    useAuth.setState({ role: "dealer" });
    renderSidebar();
    expect(screen.queryByTestId("pos-maintain")).toBeNull();
  });

  it("shows the MAINTAIN section (New Order / Products / SO Maintenance / Sales analysis) for the principal only", () => {
    useAuth.setState({ role: "principal" });
    renderSidebar();
    expect(screen.getByTestId("pos-maintain")).toBeTruthy();
    expect(screen.getByTestId("pos-maintain-new-order")).toBeTruthy();
    expect(screen.getByTestId("pos-maintain-products").getAttribute("href")).toContain(
      "/principal?tab=catalog",
    );
    expect(screen.getByTestId("pos-maintain-so-maintenance").getAttribute("href")).toContain(
      "sales-order-maintenance",
    );
    expect(screen.getByTestId("pos-maintain-sales-analysis")).toBeTruthy();
  });
});
