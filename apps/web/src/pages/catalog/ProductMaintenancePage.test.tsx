import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

/**
 * ProductMaintenancePage — the `?section=` URL tab contract (2026-07-24).
 * The active tab is URL-driven so the PortalSidebar's catalog section links
 * can deep-link one; pill clicks write the same param back. The tab BODIES
 * are stubbed — each pulls half the catalog editor, and this file pins only
 * the switch contract.
 */

vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: "principal" }),
}));
vi.mock("@/lib/queries", () => ({
  useCatalog: () => ({ data: { skus: [] }, isLoading: false, isError: false }),
}));
vi.mock("./tabs/SkuMasterTab", () => ({ default: () => <div>SKU-TAB-BODY</div> }));
vi.mock("./modular/ModularTab", () => ({ default: () => <div>MODULAR-TAB-BODY</div> }));
vi.mock("./tabs/MaintenanceTab", () => ({ default: () => <div>MAINT-TAB-BODY</div> }));
vi.mock("./tabs/SofaCombosTab", () => ({ default: () => <div>COMBOS-TAB-BODY</div> }));
vi.mock("./tabs/SpecialAddonsTab", () => ({ default: () => <div>SPECIAL-TAB-BODY</div> }));
vi.mock("./tabs/FabricsTab", () => ({ default: () => <div>FABRICS-TAB-BODY</div> }));
vi.mock("./tabs/DeliveryTab", () => ({ default: () => <div>DELIVERY-TAB-BODY</div> }));
vi.mock("./tabs/PromoTab", () => ({ default: () => <div>PROMO-TAB-BODY</div> }));

import ProductMaintenancePage from "./ProductMaintenancePage";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductMaintenancePage isPrincipal />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("ProductMaintenancePage — ?section= tab contract", () => {
  afterEach(cleanup);

  it("defaults to SKU Master without ?section=", () => {
    renderAt("/operation?tab=catalog");
    expect(screen.getByText("SKU-TAB-BODY")).toBeInTheDocument();
  });

  it("mounts the tab named by ?section=", () => {
    renderAt("/operation?tab=catalog&section=promo");
    expect(screen.getByText("PROMO-TAB-BODY")).toBeInTheDocument();
    expect(screen.queryByText("SKU-TAB-BODY")).not.toBeInTheDocument();
  });

  it("falls back to SKU Master on an unknown ?section=", () => {
    renderAt("/operation?tab=catalog&section=nope");
    expect(screen.getByText("SKU-TAB-BODY")).toBeInTheDocument();
  });

  it("pill click writes ?section= (keeping ?tab=catalog) and swaps the body", () => {
    renderAt("/operation?tab=catalog");
    fireEvent.click(screen.getByTestId("pm-tab-modular"));
    expect(screen.getByText("MODULAR-TAB-BODY")).toBeInTheDocument();
    const search = screen.getByTestId("loc").textContent ?? "";
    expect(search).toContain("tab=catalog");
    expect(search).toContain("section=modular");
  });
});
