/**
 * CombosTab — Task-5 (Phase 4) combos maintenance tab tests.
 *
 * Covers the brief's matrix:
 *  - Principal: editor present; fill name + price + ≥1 component row + Save
 *    calls useCreateCombo with the right payload.
 *  - Non-principal: NO Add/Edit/Delete controls; combo list renders read-only.
 *  - Sofa-mutex warning: sofa SKU + mattress SKU shows the warning banner;
 *    sofa-only (or mattress-only) does NOT.
 *  - Implied-discount readout computes Σ(component price × qty) − combo price.
 *  - Edit pre-fills an existing combo + components; Save calls useUpdateCombo
 *    with the replacement set.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, ComboDto } from "@carres/shared";
import CombosTab from "./CombosTab";

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Mutation stubs
// ---------------------------------------------------------------------------
const mockCreateMutateAsync = vi.fn().mockResolvedValue({ combo: {} });
const mockUpdateMutateAsync = vi.fn().mockResolvedValue({ combo: {} });
const mockDeleteMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useCreateCombo: () => ({ mutate: vi.fn(), mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateCombo: () => ({ mutate: vi.fn(), mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteCombo: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures — a sofa SKU, a mattress SKU, a bedframe SKU, an accessory SKU.
// ---------------------------------------------------------------------------
const SOFA_MODEL = "11111111-1111-1111-1111-111111111111";
const MATTRESS_MODEL = "22222222-2222-2222-2222-222222222222";
const BEDFRAME_MODEL = "33333333-3333-3333-3333-333333333333";
const ACCESSORY_MODEL = "44444444-4444-4444-4444-444444444444";

function sku(over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string }) {
  return {
    id: `id-${over.sku}`,
    variant: "S",
    variantKind: "size" as const,
    price: 1000,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    ...over,
  };
}

function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: SOFA_MODEL, category: "sofa", modelKey: "sofa-x", name: "Sofa X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: MATTRESS_MODEL, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: BEDFRAME_MODEL, category: "bedframe", modelKey: "bf-x", name: "BF X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: ACCESSORY_MODEL, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      sku({ sku: "SOFA-A", modelId: SOFA_MODEL, price: 2000 }),
      sku({ sku: "MATT-A", modelId: MATTRESS_MODEL, price: 1200 }),
      sku({ sku: "BF-A", modelId: BEDFRAME_MODEL, price: 800 }),
      sku({ sku: "ACC-A", modelId: ACCESSORY_MODEL, price: 100 }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    combos: [],
    ...overrides,
  };
}

const sampleCombo: ComboDto = {
  id: "combo-1",
  comboKey: "starter-set",
  name: "Starter Set",
  comboPrice: 2800,
  active: true,
  effectiveFrom: "2026-06-20",
  components: [
    { sku: "SOFA-A", qty: 1, sortOrder: 0 },
    { sku: "MATT-A", qty: 1, sortOrder: 1 },
  ],
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMutateAsync.mockResolvedValue({ combo: {} });
  mockUpdateMutateAsync.mockResolvedValue({ combo: {} });
});

// ---------------------------------------------------------------------------
// Principal-gating
// ---------------------------------------------------------------------------
describe("CombosTab — principal-gating", () => {
  it("principal: shows the New combo (Add) control", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByTestId("combos-add")).toBeInTheDocument();
  });

  it("non-principal: NO Add control, combo list is read-only (no Edit/Delete)", () => {
    render(
      wrap(
        <CombosTab
          catalog={makeCatalog({ combos: [sampleCombo] })}
          isPrincipal={false}
        />,
      ),
    );
    expect(screen.queryByTestId("combos-add")).not.toBeInTheDocument();
    // The list still renders the combo
    expect(screen.getByText("Starter Set")).toBeInTheDocument();
    // ...but no per-row Edit / Delete buttons
    expect(screen.queryByTestId("combo-edit-combo-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combo-delete-combo-1")).not.toBeInTheDocument();
  });

  it("principal: list shows Edit + Delete per row", () => {
    render(
      wrap(
        <CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />,
      ),
    );
    expect(screen.getByTestId("combo-edit-combo-1")).toBeInTheDocument();
    expect(screen.getByTestId("combo-delete-combo-1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Create flow
// ---------------------------------------------------------------------------
describe("CombosTab — create", () => {
  it("principal: fill name + price + a component row + Save calls useCreateCombo with the right payload", async () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));

    fireEvent.change(screen.getByTestId("combo-name"), { target: { value: "My Combo" } });
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "2500" } });

    // first component row exists; pick the sofa SKU + qty 2
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    fireEvent.change(screen.getByTestId("combo-comp-qty-0"), { target: { value: "2" } });

    fireEvent.click(screen.getByTestId("combo-save"));

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    const payload = mockCreateMutateAsync.mock.calls[0][0];
    expect(payload.name).toBe("My Combo");
    expect(payload.comboPrice).toBe(2500);
    expect(payload.components).toEqual([{ sku: "SOFA-A", qty: 2, sortOrder: 0 }]);
  });

  it("Save is disabled until name + price + ≥1 component are valid", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    const save = screen.getByTestId("combo-save") as HTMLButtonElement;
    expect(save).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Sofa-mutex author warning
// ---------------------------------------------------------------------------
describe("CombosTab — sofa-mutex warning", () => {
  it("sofa + mattress components → warning banner shown", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    fireEvent.click(screen.getByTestId("combo-add-row"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-1"), { target: { value: "MATT-A" } });
    expect(screen.getByTestId("combo-mutex-warning")).toBeInTheDocument();
  });

  it("sofa + bedframe components → warning banner shown", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    fireEvent.click(screen.getByTestId("combo-add-row"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-1"), { target: { value: "BF-A" } });
    expect(screen.getByTestId("combo-mutex-warning")).toBeInTheDocument();
  });

  it("sofa-only → NO warning", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    expect(screen.queryByTestId("combo-mutex-warning")).not.toBeInTheDocument();
  });

  it("mattress-only → NO warning", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "MATT-A" } });
    expect(screen.queryByTestId("combo-mutex-warning")).not.toBeInTheDocument();
  });

  it("sofa + accessory → NO warning (accessory doesn't trigger the mutex)", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    fireEvent.click(screen.getByTestId("combo-add-row"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-1"), { target: { value: "ACC-A" } });
    expect(screen.queryByTestId("combo-mutex-warning")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Implied-discount readout
// ---------------------------------------------------------------------------
describe("CombosTab — implied discount", () => {
  it("computes Σ(component price × qty) − combo price correctly", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    // SOFA-A (2000) ×1 + MATT-A (1200) ×2 = 4400 components total
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "SOFA-A" } });
    fireEvent.click(screen.getByTestId("combo-add-row"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-1"), { target: { value: "MATT-A" } });
    fireEvent.change(screen.getByTestId("combo-comp-qty-1"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "4000" } });

    const readout = screen.getByTestId("combo-discount-readout");
    // components total 4,400.00 · combo 4,000.00 · saves 400.00
    expect(readout.textContent).toContain("4,400.00");
    expect(readout.textContent).toContain("4,000.00");
    expect(readout.textContent).toContain("400.00");
  });
});

// ---------------------------------------------------------------------------
// Edit flow
// ---------------------------------------------------------------------------
describe("CombosTab — edit", () => {
  it("Edit pre-fills the combo + components; Save calls useUpdateCombo with the replacement set", async () => {
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />),
    );
    fireEvent.click(screen.getByTestId("combo-edit-combo-1"));

    const name = screen.getByTestId("combo-name") as HTMLInputElement;
    expect(name.value).toBe("Starter Set");
    const price = screen.getByTestId("combo-price") as HTMLInputElement;
    expect(price.value).toBe("2800");
    // two component rows pre-filled
    expect((screen.getByTestId("combo-comp-sku-0") as HTMLSelectElement).value).toBe("SOFA-A");
    expect((screen.getByTestId("combo-comp-sku-1") as HTMLSelectElement).value).toBe("MATT-A");

    // change price + save
    fireEvent.change(price, { target: { value: "2600" } });
    fireEvent.click(screen.getByTestId("combo-save"));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledOnce());
    const arg = mockUpdateMutateAsync.mock.calls[0][0];
    expect(arg.id).toBe("combo-1");
    expect(arg.patch.comboPrice).toBe(2600);
    expect(arg.patch.components).toEqual([
      { sku: "SOFA-A", qty: 1, sortOrder: 0 },
      { sku: "MATT-A", qty: 1, sortOrder: 1 },
    ]);
  });

  it("inactive combos render faded in the list", () => {
    render(
      wrap(
        <CombosTab
          catalog={makeCatalog({ combos: [{ ...sampleCombo, active: false }] })}
          isPrincipal={true}
        />,
      ),
    );
    const row = screen.getByTestId("combo-row-combo-1");
    expect(row.className).toContain("opacity");
    // inactive badge
    expect(within(row).getByText(/inactive/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete flow
// ---------------------------------------------------------------------------
describe("CombosTab — delete", () => {
  it("Delete confirms then calls useDeleteCombo with the id", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />),
    );
    fireEvent.click(screen.getByTestId("combo-delete-combo-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteMutate).toHaveBeenCalledWith("combo-1", expect.anything());
    confirmSpy.mockRestore();
  });

  it("Delete cancelled (confirm false) does NOT call the hook", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />),
    );
    fireEvent.click(screen.getByTestId("combo-delete-combo-1"));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
