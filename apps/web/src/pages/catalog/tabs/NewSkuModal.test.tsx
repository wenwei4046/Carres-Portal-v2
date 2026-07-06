/**
 * NewSkuModal — sofa compartment picker (Loo 2026-07-06).
 *
 * A new SOFA model is a COMBINATION of pool compartments: picking category
 * Sofa surfaces the compartment pool as chips (default all selected), and
 * creating offers each ticked compartment — the server mints one
 * `{MODEL_KEY}-{code}` SKU per offer. Covers:
 *  - chips render (active pool only) + default ALL selected + count button
 *  - classic single-SKU fields hidden while ≥1 compartment is selected
 *  - None → falls back to the classic flat-SKU flow
 *  - submit: createModel(sofaMode 'custom') + offers in pool order, NO createSku
 *  - partial failure: modal stays open, only failed chips stay selected,
 *    retry re-offers just those without re-creating the model
 *  - non-principal + non-sofa + empty pool: no compartment path
 *
 * Mocking strategy mirrors SkuMasterTab.test.tsx (module-level queries mock).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProductModelDto, SofaCompartmentDto } from "@carres/shared";
import NewSkuModal from "./NewSkuModal";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let mockRole: string | null = "principal";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: mockRole }),
}));

const mockCreateModelMutateAsync = vi.fn();
const mockCreateSkuMutateAsync = vi.fn();
const mockOfferMutateAsync = vi.fn();

vi.mock("@/lib/queries", () => ({
  useCreateCatalogModel: () => ({
    mutate: vi.fn(),
    mutateAsync: mockCreateModelMutateAsync,
    isPending: false,
  }),
  useCreateCatalogSku: () => ({
    mutate: vi.fn(),
    mutateAsync: mockCreateSkuMutateAsync,
    isPending: false,
  }),
  useOfferModelCompartments: () => ({
    mutate: vi.fn(),
    mutateAsync: mockOfferMutateAsync,
    isPending: false,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MODELS: ProductModelDto[] = [];

function comp(
  id: string,
  code: string,
  sortOrder: number,
  active = true,
): SofaCompartmentDto {
  return {
    id,
    code,
    description: `desc ${code}`,
    seatCount: 1,
    armConfig: null,
    iconUrl: null,
    defaultPrice: 0,
    sortOrder,
    active,
  };
}

// Pool order = sortOrder; the inactive one must never render.
const POOL: SofaCompartmentDto[] = [
  comp("c1", "1A(LHF)", 1),
  comp("c2", "1NA", 2),
  comp("c-off", "RETIRED", 3, false),
];

function openSofa() {
  fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "sofa" } });
}

beforeEach(() => {
  mockRole = "principal";
  mockCreateModelMutateAsync.mockReset().mockResolvedValue({ model: { id: "m-new" } });
  mockCreateSkuMutateAsync.mockReset().mockResolvedValue({});
  mockOfferMutateAsync.mockReset().mockResolvedValue({ offered: 2, failed: [] });
});

describe("NewSkuModal — sofa compartment picker", () => {
  it("category Sofa surfaces the ACTIVE pool as chips, all selected by default", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();

    expect(screen.getByTestId("new-sku-compartments")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-comp-1A(LHF)")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("new-sku-comp-1NA")).toHaveAttribute("aria-pressed", "true");
    // Inactive pool rows never render.
    expect(screen.queryByTestId("new-sku-comp-RETIRED")).not.toBeInTheDocument();

    // Classic single-SKU fields are hidden while compartments are selected.
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-cost")).not.toBeInTheDocument();

    expect(screen.getByText("Create model + 2 SKUs")).toBeInTheDocument();
  });

  it("None deselects everything and falls back to the classic flat-SKU flow", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();

    fireEvent.click(screen.getByTestId("new-sku-comps-none"));
    expect(screen.getByTestId("new-sku-comp-1A(LHF)")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Create product + SKU")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("new-sku-comps-all"));
    expect(screen.getByText("Create model + 2 SKUs")).toBeInTheDocument();
  });

  it("submit creates the model (sofa_mode 'custom') then offers each ticked compartment — no single-SKU insert", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.click(screen.getByText("Create model + 2 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).toHaveBeenCalledWith({
      category: "sofa",
      modelKey: "angsa",
      name: "Angsa",
      sofaMode: "custom",
    });
    // Offers ride ONE batched mutation in pool order — the server mints
    // ANGSA-1A(LHF) / ANGSA-1NA (description "Sofa Angsa {code}") per offer.
    expect(mockOfferMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      compartmentIds: ["c1", "c2"],
    });
    expect(mockCreateSkuMutateAsync).not.toHaveBeenCalled();
  });

  it("unticking a chip excludes it from the offers", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.click(screen.getByTestId("new-sku-comp-1NA")); // untick c2
    mockOfferMutateAsync.mockResolvedValue({ offered: 1, failed: [] });
    fireEvent.click(screen.getByText("Create model + 1 SKU"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockOfferMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      compartmentIds: ["c1"],
    });
  });

  it("partial failure keeps the modal open with ONLY the failed chips selected; retry re-offers just those without re-creating the model", async () => {
    const onClose = vi.fn();
    mockOfferMutateAsync
      .mockResolvedValueOnce({
        offered: 1,
        failed: [{ compartmentId: "c2", message: "sku collision" }],
      })
      .mockResolvedValueOnce({ offered: 1, failed: [] });
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.click(screen.getByText("Create model + 2 SKUs"));

    // Failure: stays open, model identity locked, only c2 still selected.
    await waitFor(() =>
      expect(screen.getByTestId("new-sku-model-created-notice")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("new-sku-comp-1A(LHF)")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("new-sku-comp-1NA")).toHaveAttribute("aria-pressed", "true");
    // Name + category are locked once the model exists.
    expect(screen.getByTestId("new-sku-name")).toBeDisabled();
    expect(screen.getByTestId("new-sku-category")).toBeDisabled();

    // Retry: NO second model insert; offers only the failed compartment.
    fireEvent.click(screen.getByText("Create model + 1 SKU"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockOfferMutateAsync).toHaveBeenLastCalledWith({
      modelId: "m-new",
      compartmentIds: ["c2"],
    });
  });

  it("non-principal never sees the compartment picker (the offer PUT is principal-only)", () => {
    mockRole = "operation";
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();
    expect(screen.queryByTestId("new-sku-compartments")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Create product + SKU")).toBeInTheDocument();
  });

  it("non-sofa categories keep the classic flow untouched", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    // default category = mattress
    expect(screen.queryByTestId("new-sku-compartments")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
  });

  it("empty pool: hint shown, classic flat-SKU flow still works", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={[]} onClose={vi.fn()} />);
    openSofa();
    expect(screen.getByTestId("new-sku-compartments")).toBeInTheDocument();
    expect(screen.getByText(/No compartments in the pool yet/)).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Create product + SKU")).toBeInTheDocument();
  });
});
