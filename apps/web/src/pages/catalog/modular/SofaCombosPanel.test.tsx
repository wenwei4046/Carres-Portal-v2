/**
 * SofaCombosPanel — Task-5 (Phase 2) sofa-combo maintenance tests.
 *
 * Covers the brief's matrix:
 *  - Principal: Add control present; author slots (OR-sets) + prices-by-height
 *    + tier + Save calls useCreateSofaCombo with the right payload.
 *  - Non-principal: NO Add/Edit/Delete; combo list renders read-only.
 *  - Slots round-trip: edit pre-fills a combo's OR-sets; the picker reflects
 *    them; adding/removing codes mutates the slot.
 *  - Prices-by-height round-trip: blank ↔ null, RM ↔ number; only filled
 *    heights ride the payload's pricesByHeight; blanks become null.
 *  - zod gate: an invalid combo (no slots filled / no price) keeps Save disabled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
} from "@carres/shared";
import SofaCombosPanel from "./SofaCombosPanel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockCreateMutateAsync = vi.fn().mockResolvedValue({ sofaCombo: {} });
const mockUpdateMutateAsync = vi.fn().mockResolvedValue({ sofaCombo: {} });
const mockDeleteMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useCreateSofaCombo: () => ({ mutate: vi.fn(), mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateSofaCombo: () => ({ mutate: vi.fn(), mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteSofaCombo: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures — a model offering three compartments (2A LHF/RHF + L LHF).
// ---------------------------------------------------------------------------
const MODEL = "11111111-1111-1111-1111-111111111111";
const C_2A_LHF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C_2A_RHF = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C_L_LHF = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const pool: SofaCompartmentDto[] = [
  { id: C_2A_LHF, code: "2A(LHF)", description: "2-seat left", seatCount: 2, armConfig: null, iconUrl: null, defaultPrice: 1000, sortOrder: 0, active: true },
  { id: C_2A_RHF, code: "2A(RHF)", description: "2-seat right", seatCount: 2, armConfig: null, iconUrl: null, defaultPrice: 1000, sortOrder: 1, active: true },
  { id: C_L_LHF, code: "L(LHF)", description: "lounger left", seatCount: 1, armConfig: null, iconUrl: null, defaultPrice: 1500, sortOrder: 2, active: true },
];

const offered: ModelSofaCompartmentDto[] = [
  { modelId: MODEL, compartmentId: C_2A_LHF, priceOverride: null, sortOrder: 0 },
  { modelId: MODEL, compartmentId: C_2A_RHF, priceOverride: null, sortOrder: 1 },
  { modelId: MODEL, compartmentId: C_L_LHF, priceOverride: 1200, sortOrder: 2 },
];

const sampleCombo: SofaComboDto = {
  id: "sc-1",
  modelId: MODEL,
  slots: [["2A(LHF)", "2A(RHF)"], ["L(LHF)"]],
  tier: "PRICE_1",
  pricesByHeight: { "28": 2640, "32": 2800 },
  // 0183 — cost benchmark at 28 only: 1980 of 2640 sell → 25.0% margin.
  costByHeight: { "28": 1980 },
  // 0186 — PWP reward price per height (DORMANT; no combo-as-reward consumer).
  pwpPricesByHeight: null,
  label: "Corner Set",
  effectiveFrom: "2026-06-21",
  active: true,
  discontinuedAt: null,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function renderPanel(opts?: { isPrincipal?: boolean; combos?: SofaComboDto[] }) {
  return render(
    wrap(
      <SofaCombosPanel
        modelId={MODEL}
        pool={pool}
        offered={offered}
        combos={opts?.combos ?? []}
        isPrincipal={opts?.isPrincipal ?? true}
      />,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMutateAsync.mockResolvedValue({ sofaCombo: {} });
  mockUpdateMutateAsync.mockResolvedValue({ sofaCombo: {} });
});

// ---------------------------------------------------------------------------
// Principal-gating
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — principal-gating", () => {
  it("principal: shows the New sofa combo (Add) control", () => {
    renderPanel({ isPrincipal: true });
    expect(screen.getByTestId("sofa-combo-add")).toBeInTheDocument();
  });

  it("non-principal: NO Add control; list renders read-only (no Edit/Delete)", () => {
    renderPanel({ isPrincipal: false, combos: [sampleCombo] });
    expect(screen.queryByTestId("sofa-combo-add")).not.toBeInTheDocument();
    expect(screen.getByText("Corner Set")).toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combo-edit-sc-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combo-delete-sc-1")).not.toBeInTheDocument();
  });

  it("non-principal: editor cannot be opened (no form fields mounted)", () => {
    renderPanel({ isPrincipal: false, combos: [sampleCombo] });
    expect(screen.queryByTestId("sofa-combo-save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combo-label")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combo-price-28")).not.toBeInTheDocument();
  });

  it("principal: list shows Edit + Delete per row", () => {
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    expect(screen.getByTestId("sofa-combo-edit-sc-1")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combo-delete-sc-1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Create flow — slots + prices-by-height round-trip
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — create", () => {
  it("author OR-set slot + prices-by-height + Save calls useCreateSofaCombo with the right payload", async () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));

    // Slot 1 (OR-set): tick 2A(LHF) + 2A(RHF)
    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(RHF)"));
    // Add a second slot, tick L(LHF)
    fireEvent.click(screen.getByTestId("sofa-combo-add-slot"));
    fireEvent.click(screen.getByTestId("sofa-combo-slot-1-opt-L(LHF)"));

    // price at height 28 only (others stay blank → null)
    fireEvent.change(screen.getByTestId("sofa-combo-price-28"), { target: { value: "2640" } });

    fireEvent.click(screen.getByTestId("sofa-combo-save"));

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    const payload = mockCreateMutateAsync.mock.calls[0][0];
    expect(payload.modelId).toBe(MODEL);
    expect(payload.slots).toEqual([["2A(LHF)", "2A(RHF)"], ["L(LHF)"]]);
    // blank heights become null; the filled one is the number
    expect(payload.pricesByHeight["28"]).toBe(2640);
    expect(payload.pricesByHeight["24"]).toBeNull();
    expect(payload.pricesByHeight["32"]).toBeNull();
    expect(payload.tier).toBeNull(); // "Any tier" default
  });

  it("zod gate: empty slots + no price keeps Save disabled", () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));
    const save = screen.getByTestId("sofa-combo-save") as HTMLButtonElement;
    // fresh editor: one empty slot, no prices → invalid → disabled
    expect(save).toBeDisabled();
  });

  it("zod gate: a slot filled but ALL prices blank still saves (pricesByHeight optional, all-null)", async () => {
    // pricesByHeight is optional in the create schema; a combo with slots but no
    // height price is structurally valid (it simply never applies). Assert the
    // gate opens once a slot is non-empty.
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));
    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    const save = screen.getByTestId("sofa-combo-save") as HTMLButtonElement;
    expect(save).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Slot picker round-trip
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — slot picker", () => {
  it("ticking a code adds a chip; ticking again removes it", () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));

    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    expect(screen.getByTestId("sofa-combo-slot-0-chip-2A(LHF)")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    expect(screen.queryByTestId("sofa-combo-slot-0-chip-2A(LHF)")).not.toBeInTheDocument();
  });

  it("only the model's offered codes are offered as slot options", () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));
    expect(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combo-slot-0-opt-2A(RHF)")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combo-slot-0-opt-L(LHF)")).toBeInTheDocument();
    // a code not offered by this model is absent
    expect(screen.queryByTestId("sofa-combo-slot-0-opt-CNR")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit flow — slots + prices round-trip from an existing combo
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — edit", () => {
  it("Edit pre-fills slots (OR-sets) + prices-by-height; Save sends the replacement", async () => {
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-edit-sc-1"));

    // label pre-filled
    expect((screen.getByTestId("sofa-combo-label") as HTMLInputElement).value).toBe("Corner Set");
    // slot 0 = OR-set {2A(LHF), 2A(RHF)} → both chips present
    const slot0 = screen.getByTestId("sofa-combo-slot-0-selected");
    expect(within(slot0).getByTestId("sofa-combo-slot-0-chip-2A(LHF)")).toBeInTheDocument();
    expect(within(slot0).getByTestId("sofa-combo-slot-0-chip-2A(RHF)")).toBeInTheDocument();
    // slot 1 = {L(LHF)}
    const slot1 = screen.getByTestId("sofa-combo-slot-1-selected");
    expect(within(slot1).getByTestId("sofa-combo-slot-1-chip-L(LHF)")).toBeInTheDocument();
    // prices pre-filled: 28=2640, 32=2800, others blank
    expect((screen.getByTestId("sofa-combo-price-28") as HTMLInputElement).value).toBe("2640");
    expect((screen.getByTestId("sofa-combo-price-32") as HTMLInputElement).value).toBe("2800");
    expect((screen.getByTestId("sofa-combo-price-24") as HTMLInputElement).value).toBe("");

    // bump the 28 price and save
    fireEvent.change(screen.getByTestId("sofa-combo-price-28"), { target: { value: "2700" } });
    fireEvent.click(screen.getByTestId("sofa-combo-save"));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledOnce());
    const arg = mockUpdateMutateAsync.mock.calls[0][0];
    expect(arg.id).toBe("sc-1");
    expect(arg.patch.slots).toEqual([["2A(LHF)", "2A(RHF)"], ["L(LHF)"]]);
    expect(arg.patch.pricesByHeight["28"]).toBe(2700);
    expect(arg.patch.pricesByHeight["32"]).toBe(2800);
    expect(arg.patch.pricesByHeight["24"]).toBeNull();
    expect(arg.patch.tier).toBe("PRICE_1");
  });

  it("clearing a price field round-trips to null in the payload", async () => {
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-edit-sc-1"));
    // clear the 32 price (was 2800)
    fireEvent.change(screen.getByTestId("sofa-combo-price-32"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("sofa-combo-save"));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledOnce());
    const arg = mockUpdateMutateAsync.mock.calls[0][0];
    expect(arg.patch.pricesByHeight["32"]).toBeNull();
    expect(arg.patch.pricesByHeight["28"]).toBe(2640);
  });

  it("implied-discount readout shows per-height saving vs baseline", () => {
    // baseline = first code of each slot: 2A(LHF)=1000 + L(LHF)=1200 (override) = 2200
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-edit-sc-1"));
    // height 28 priced 2640 → markup of 440 vs 2200 baseline
    const implied28 = screen.getByTestId("sofa-combo-implied-28");
    expect(implied28.textContent).toContain("440.00");
  });
});

// ---------------------------------------------------------------------------
// Cost-by-height (0183) — principal-only benchmark, display-only margin
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — cost / margin", () => {
  it("create: a per-height cost rides costByHeight (blanks null) + margin renders", async () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));

    // a filled slot so the zod gate opens
    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    // price + cost at height 28
    fireEvent.change(screen.getByTestId("sofa-combo-price-28"), { target: { value: "2640" } });
    fireEvent.change(screen.getByTestId("sofa-combo-cost-28"), { target: { value: "1980" } });

    // margin = (2640 − 1980) / 2640 = 25.0%
    expect(screen.getByTestId("sofa-combo-margin-28").textContent).toContain("25.0%");
    // a height with no price/cost shows an em-dash margin
    expect(screen.getByTestId("sofa-combo-margin-24").textContent).toBe("—");

    fireEvent.click(screen.getByTestId("sofa-combo-save"));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    const payload = mockCreateMutateAsync.mock.calls[0][0];
    expect(payload.costByHeight).not.toBeNull();
    expect(payload.costByHeight["28"]).toBe(1980);
    expect(payload.costByHeight["24"]).toBeNull();
    expect(payload.costByHeight["32"]).toBeNull();
  });

  it("create: NO cost at any height → costByHeight is null (unset)", async () => {
    renderPanel({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("sofa-combo-add"));
    fireEvent.click(screen.getByTestId("sofa-combo-slot-0-opt-2A(LHF)"));
    fireEvent.change(screen.getByTestId("sofa-combo-price-28"), { target: { value: "2640" } });

    fireEvent.click(screen.getByTestId("sofa-combo-save"));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledOnce());
    expect(mockCreateMutateAsync.mock.calls[0][0].costByHeight).toBeNull();
  });

  it("edit: cost pre-fills from costByHeight + margin renders vs the height price", () => {
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-edit-sc-1"));
    expect((screen.getByTestId("sofa-combo-cost-28") as HTMLInputElement).value).toBe("1980");
    expect((screen.getByTestId("sofa-combo-cost-32") as HTMLInputElement).value).toBe("");
    // 28: (2640 − 1980)/2640 = 25.0%; 32 has price but no cost → em-dash
    expect(screen.getByTestId("sofa-combo-margin-28").textContent).toContain("25.0%");
    expect(screen.getByTestId("sofa-combo-margin-32").textContent).toBe("—");
  });

  it("edit: clearing the only cost → costByHeight null in the payload", async () => {
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-edit-sc-1"));
    fireEvent.change(screen.getByTestId("sofa-combo-cost-28"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("sofa-combo-save"));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledOnce());
    expect(mockUpdateMutateAsync.mock.calls[0][0].patch.costByHeight).toBeNull();
  });

  it("non-principal: cost inputs are never mounted (read-only)", () => {
    renderPanel({ isPrincipal: false, combos: [sampleCombo] });
    expect(screen.queryByTestId("sofa-combo-cost-28")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete flow
// ---------------------------------------------------------------------------
describe("SofaCombosPanel — delete", () => {
  it("Delete confirms then calls useDeleteSofaCombo with the id", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-delete-sc-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteMutate).toHaveBeenCalledWith("sc-1", expect.anything());
    confirmSpy.mockRestore();
  });

  it("Delete cancelled (confirm false) does NOT call the hook", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel({ isPrincipal: true, combos: [sampleCombo] });
    fireEvent.click(screen.getByTestId("sofa-combo-delete-sc-1"));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
