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
 *  - The SKU picker is now a SEARCHABLE combobox (not a native <select>):
 *    click the row trigger to open, type to filter by code/description, then
 *    click the matching option. `pickSku` below drives that flow; a focused
 *    test asserts the query narrows the option list.
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
  // 0183 — cost benchmark; 2100 of 2800 sell → 25.0% margin in the row.
  cost: 2100,
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

/**
 * Drive the searchable SKU picker for component row `i`: open it, type the SKU
 * code to filter, then pick the matching option. Replaces the old native
 * `<select>` `fireEvent.change(..., { value })` calls.
 */
function pickSku(i: number, code: string) {
  // The collapsed trigger and the open search input share the same test id.
  fireEvent.click(screen.getByTestId(`combo-comp-sku-${i}`));
  fireEvent.change(screen.getByTestId(`combo-comp-sku-${i}`), {
    target: { value: code },
  });
  // mousedown (not click) drives the pick — that's what the picker listens for.
  fireEvent.mouseDown(screen.getByTestId(`combo-comp-sku-${i}-opt-${code}`));
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

  it("non-principal: editor modal cannot be opened (no controls to set editing)", () => {
    render(
      wrap(
        <CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={false} />,
      ),
    );
    // The editor is gated by `isPrincipal && editing !== null`; with no Add/Edit
    // control rendered, a non-principal has no way to set `editing`, so none of
    // the editor's form fields are ever mounted.
    expect(screen.queryByTestId("combo-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combo-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combo-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combo-comp-sku-0")).not.toBeInTheDocument();
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
    pickSku(0, "SOFA-A");
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
// Searchable SKU picker
// ---------------------------------------------------------------------------
describe("CombosTab — searchable SKU picker", () => {
  it("typing a query narrows the rendered SKU options (search works)", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));

    // open row 0's picker — all 4 fixture SKUs are options initially
    fireEvent.click(screen.getByTestId("combo-comp-sku-0"));
    const list = screen.getByTestId("combo-comp-sku-0-list");
    expect(within(list).getByTestId("combo-comp-sku-0-opt-SOFA-A")).toBeInTheDocument();
    expect(within(list).getByTestId("combo-comp-sku-0-opt-MATT-A")).toBeInTheDocument();

    // type "sofa" → only SOFA-A survives the code/description filter
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "sofa" } });
    expect(screen.queryByTestId("combo-comp-sku-0-opt-SOFA-A")).toBeInTheDocument();
    expect(screen.queryByTestId("combo-comp-sku-0-opt-MATT-A")).not.toBeInTheDocument();
    expect(screen.queryByTestId("combo-comp-sku-0-opt-BF-A")).not.toBeInTheDocument();
  });

  it("filters by description as well as code", () => {
    // give one SKU a distinctive description, then search for that word
    const catalog = makeCatalog();
    catalog.skus = catalog.skus.map((s) =>
      s.sku === "MATT-A" ? { ...s, description: "Orthopedic plush topper" } : s,
    );
    render(wrap(<CombosTab catalog={catalog} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    fireEvent.click(screen.getByTestId("combo-comp-sku-0"));
    fireEvent.change(screen.getByTestId("combo-comp-sku-0"), { target: { value: "orthopedic" } });
    // matched purely on description
    expect(screen.queryByTestId("combo-comp-sku-0-opt-MATT-A")).toBeInTheDocument();
    expect(screen.queryByTestId("combo-comp-sku-0-opt-SOFA-A")).not.toBeInTheDocument();
  });

  it("clearing a picked SKU resets the row", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    expect(screen.getByTestId("combo-comp-sku-0").textContent).toContain("SOFA-A");
    fireEvent.click(screen.getByTestId("combo-comp-sku-0-clear"));
    expect(screen.getByTestId("combo-comp-sku-0").textContent).not.toContain("SOFA-A");
  });
});

// ---------------------------------------------------------------------------
// Sofa-mutex author warning
// ---------------------------------------------------------------------------
describe("CombosTab — sofa-mutex warning", () => {
  it("sofa + mattress components → warning banner shown", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    fireEvent.click(screen.getByTestId("combo-add-row"));
    pickSku(1, "MATT-A");
    expect(screen.getByTestId("combo-mutex-warning")).toBeInTheDocument();
  });

  it("sofa + bedframe components → warning banner shown", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    fireEvent.click(screen.getByTestId("combo-add-row"));
    pickSku(1, "BF-A");
    expect(screen.getByTestId("combo-mutex-warning")).toBeInTheDocument();
  });

  it("sofa-only → NO warning", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    expect(screen.queryByTestId("combo-mutex-warning")).not.toBeInTheDocument();
  });

  it("mattress-only → NO warning", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "MATT-A");
    expect(screen.queryByTestId("combo-mutex-warning")).not.toBeInTheDocument();
  });

  it("sofa + accessory → NO warning (accessory doesn't trigger the mutex)", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    fireEvent.click(screen.getByTestId("combo-add-row"));
    pickSku(1, "ACC-A");
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
    pickSku(0, "SOFA-A");
    fireEvent.click(screen.getByTestId("combo-add-row"));
    pickSku(1, "MATT-A");
    fireEvent.change(screen.getByTestId("combo-comp-qty-1"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "4000" } });

    const readout = screen.getByTestId("combo-discount-readout");
    // components total 4,400.00 · combo 4,000.00 · saves 400.00
    expect(readout.textContent).toContain("4,400.00");
    expect(readout.textContent).toContain("4,000.00");
    expect(readout.textContent).toContain("400.00");
  });

  it("combo price ABOVE component total → renders the 'Marked up' branch (not 'Saves')", () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    // SOFA-A (2000) ×1 = 2,000 components total
    pickSku(0, "SOFA-A");
    // combo priced ABOVE the component total → negative "saves" → markup branch
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "2500" } });

    const readout = screen.getByTestId("combo-discount-readout");
    expect(readout.textContent).toContain("Marked up");
    expect(readout.textContent).not.toContain("Saves");
    // markup amount = 2,500 − 2,000 = 500.00
    expect(readout.textContent).toContain("500.00");
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
    // two component rows pre-filled — the collapsed picker trigger shows the
    // picked SKU code as its label.
    expect(screen.getByTestId("combo-comp-sku-0").textContent).toContain("SOFA-A");
    expect(screen.getByTestId("combo-comp-sku-1").textContent).toContain("MATT-A");

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

  it("reactivate: edit an inactive combo, toggle Active ON, Save → patch carries active:true", async () => {
    render(
      wrap(
        <CombosTab
          catalog={makeCatalog({ combos: [{ ...sampleCombo, active: false }] })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("combo-edit-combo-1"));

    const activeToggle = screen.getByTestId("combo-active") as HTMLInputElement;
    expect(activeToggle.checked).toBe(false); // pre-filled from the inactive combo
    fireEvent.click(activeToggle); // toggle ON
    expect(activeToggle.checked).toBe(true);

    fireEvent.click(screen.getByTestId("combo-save"));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledOnce());
    const arg = mockUpdateMutateAsync.mock.calls[0][0];
    expect(arg.id).toBe("combo-1");
    expect(arg.patch.active).toBe(true);
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
// Cost / margin (0183) — principal-only benchmark, display-only margin
// ---------------------------------------------------------------------------
describe("CombosTab — cost / margin", () => {
  it("row shows the computed margin% when cost is set (2100 of 2800 → 25.0%)", () => {
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />),
    );
    const cell = screen.getByTestId("combo-margin-combo-1");
    expect(cell.textContent).toContain("25.0%");
    // and the cost benchmark surfaces under the combo price
    const row = screen.getByTestId("combo-row-combo-1");
    expect(row.textContent).toContain("2,100.00");
  });

  it("row shows an em-dash margin when cost is null", () => {
    render(
      wrap(
        <CombosTab
          catalog={makeCatalog({ combos: [{ ...sampleCombo, cost: null }] })}
          isPrincipal={true}
        />,
      ),
    );
    expect(screen.getByTestId("combo-margin-combo-1").textContent).toBe("—");
  });

  it("editor: typing a cost reaches the create payload + the margin readout computes", async () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));

    fireEvent.change(screen.getByTestId("combo-name"), { target: { value: "Cost Combo" } });
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "2500" } });
    pickSku(0, "SOFA-A");
    // type a cost benchmark
    fireEvent.change(screen.getByTestId("combo-cost"), { target: { value: "1500" } });

    // margin readout = (2500 − 1500) / 2500 = 40.0%
    expect(screen.getByTestId("combo-margin-readout").textContent).toContain("40.0%");

    fireEvent.click(screen.getByTestId("combo-save"));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    expect(mockCreateMutateAsync.mock.calls[0][0].cost).toBe(1500);
  });

  it("editor: omitting the cost sends cost:null (unset) and the readout shows no cost set", async () => {
    render(wrap(<CombosTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));

    fireEvent.change(screen.getByTestId("combo-name"), { target: { value: "No Cost Combo" } });
    fireEvent.change(screen.getByTestId("combo-price"), { target: { value: "2500" } });
    pickSku(0, "SOFA-A");

    expect(screen.getByTestId("combo-margin-readout").textContent).toContain("no cost set");

    fireEvent.click(screen.getByTestId("combo-save"));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    expect(mockCreateMutateAsync.mock.calls[0][0].cost).toBeNull();
  });

  it("editor: the Σ component cost hint sums component product_skus.cost × qty", () => {
    // give SOFA-A a catalog cost so the hint reflects it
    const catalog = makeCatalog();
    catalog.skus = catalog.skus.map((s) => (s.sku === "SOFA-A" ? { ...s, cost: 1200 } : s));
    render(wrap(<CombosTab catalog={catalog} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("combos-add"));
    pickSku(0, "SOFA-A");
    fireEvent.change(screen.getByTestId("combo-comp-qty-0"), { target: { value: "2" } });
    // 1200 × 2 = 2,400.00
    expect(screen.getByTestId("combo-cost-hint").textContent).toContain("2,400.00");
  });

  it("editor: edit pre-fills the cost field from the existing combo", () => {
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={true} />),
    );
    fireEvent.click(screen.getByTestId("combo-edit-combo-1"));
    expect((screen.getByTestId("combo-cost") as HTMLInputElement).value).toBe("2100");
  });

  it("non-principal: cost input is never mounted (read-only)", () => {
    render(
      wrap(<CombosTab catalog={makeCatalog({ combos: [sampleCombo] })} isPrincipal={false} />),
    );
    expect(screen.queryByTestId("combo-cost")).not.toBeInTheDocument();
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
