/**
 * ModulePaletteItem — Phase-3 Task-2 palette card tests.
 *  - shows the resolved price (priceOverride ?? pool defaultPrice)
 *  - fires onAdd(code) on click
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SofaCompartmentDto, ModelSofaCompartmentDto } from "@carres/shared";
import ModulePaletteItem from "./ModulePaletteItem";

const POOL: SofaCompartmentDto = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "1A(LHF)",
  description: "1A · Left hand facing",
  seatCount: 1,
  armConfig: "LHF",
  iconUrl: null,
  defaultPrice: 1200,
  sortOrder: 0,
  active: true,
};

describe("ModulePaletteItem", () => {
  it("shows the pool default price when no override + fires onAdd(code)", () => {
    const onAdd = vi.fn();
    render(<ModulePaletteItem compartment={POOL} offered={null} onAdd={onAdd} />);
    expect(screen.getByText("RM 1,200.00")).toBeInTheDocument();
    expect(screen.getByText("1A(LHF)")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("module-palette-item-1A(LHF)"));
    expect(onAdd).toHaveBeenCalledWith("1A(LHF)");
  });

  it("shows the per-model priceOverride when set", () => {
    const offered: ModelSofaCompartmentDto = {
      modelId: "22222222-2222-2222-2222-222222222222",
      compartmentId: POOL.id,
      priceOverride: 1500,
      sortOrder: 0,
    };
    render(<ModulePaletteItem compartment={POOL} offered={offered} onAdd={vi.fn()} />);
    expect(screen.getByText("RM 1,500.00")).toBeInTheDocument();
  });
});
