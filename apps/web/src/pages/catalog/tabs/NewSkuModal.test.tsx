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
import type { ProductModelDto, ProductSkuDto, SofaCompartmentDto } from "@carres/shared";
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
const mockGenerateSkusMutateAsync = vi.fn();
const mockCreateGuaranteeMutateAsync = vi.fn();

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
  useGenerateSkus: () => ({
    mutate: vi.fn(),
    mutateAsync: mockGenerateSkusMutateAsync,
    isPending: false,
  }),
  // 0270 — the Guarantee authoring path. A full mock of this module must stub
  // it or the modal mounts a mutation with no QueryClientProvider.
  useCreateGuaranteeProduct: () => ({
    mutate: vi.fn(),
    mutateAsync: mockCreateGuaranteeMutateAsync,
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
  mockGenerateSkusMutateAsync.mockReset().mockResolvedValue({ ok: true, generated: 2, skipped: 0 });
});

/** Mattress + bedframe size pools (Special Add-ons → Sizes). */
const SIZE_POOLS = [
  { id: "ms1", pool: "mattress_size" as const, value: "S", label: "Single", dimensions: null, surcharge: null, active: true, sortOrder: 1 },
  { id: "ms2", pool: "mattress_size" as const, value: "Q", label: "Queen", dimensions: null, surcharge: null, active: true, sortOrder: 2 },
  { id: "ms3", pool: "mattress_size" as const, value: "K", label: "King", dimensions: null, surcharge: null, active: true, sortOrder: 3 },
  { id: "ms4", pool: "mattress_size" as const, value: "OLD", label: null, dimensions: null, surcharge: null, active: false, sortOrder: 4 },
  { id: "bs1", pool: "bedframe_size" as const, value: "K", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
];

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

// ---------------------------------------------------------------------------
// Loo 2026-07-06 — mattress/bedframe: the size field becomes POOL CHIPS
// (Special Add-ons → Sizes), default all selected; create = model + one SKU
// per ticked size via generate-skus.
// ---------------------------------------------------------------------------
describe("NewSkuModal — mattress/bedframe size chips", () => {
  it("mattress surfaces the ACTIVE mattress_size pool, all selected; classic size field hidden", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    // default category = mattress
    expect(screen.getByTestId("new-sku-sizes")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-size-S")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("new-sku-size-Q")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("new-sku-size-K")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("new-sku-size-OLD")).not.toBeInTheDocument(); // inactive
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-cost")).not.toBeInTheDocument();
    // the one price field that seeds every generated SKU stays (principal)
    expect(screen.getByTestId("new-sku-price")).toBeInTheDocument();
    expect(screen.getByText("Create model + 3 SKUs")).toBeInTheDocument();
  });

  it("bedframe reads the bedframe_size pool; category switch re-defaults the selection", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-sizes-none"));
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "bedframe" } });
    expect(screen.getByTestId("new-sku-size-K")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("new-sku-size-S")).not.toBeInTheDocument(); // mattress-only value
    expect(screen.getByText("Create model + 1 SKU")).toBeInTheDocument();
  });

  it("submit creates the model (sizes seed allowed_options) + generate-skus with the ticked sizes + price", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.click(screen.getByTestId("new-sku-size-Q")); // untick Q → S + K remain
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "1990" } });
    fireEvent.click(screen.getByText("Create model + 2 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).toHaveBeenCalledWith({
      category: "mattress",
      modelKey: "lumi-firmcare",
      name: "Lumi FirmCare",
      // Stored as canonical full names (the SIZE shown), not the pool codes.
      allowedOptions: { sizes: ["Single", "King"] },
    });
    expect(mockGenerateSkusMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      input: { variants: ["Single", "King"], price: 1990 },
    });
    expect(mockCreateSkuMutateAsync).not.toHaveBeenCalled();
  });

  it("non-principal generates UNPRICED (price omitted) with a lock hint", async () => {
    mockRole = "operation";
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    expect(screen.queryByTestId("new-sku-price")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-price-lock-hint")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.click(screen.getByText("Create model + 3 SKUs"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockGenerateSkusMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      input: { variants: ["Single", "Queen", "King"], price: undefined },
    });
  });

  it("None → falls back to the classic single-SKU flow; no pool prop → classic flow", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-sizes-none"));
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Create product + SKU")).toBeInTheDocument();
  });

  it("accessory/service categories never show the size chips", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "accessory" } });
    expect(screen.queryByTestId("new-sku-sizes")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loo 2026-07-20 — auto-generated bed descriptions: a blank description gets
// `{Category} {Model name} {dimensions}` stamped server-side (size-pool
// lookup). The modal previews the exact value; accessory/service stay manual.
// ---------------------------------------------------------------------------
const SIZE_POOLS_DIMS = [
  { id: "d1", pool: "mattress_size" as const, value: "K", label: "6FT", dimensions: "183X190CM", surcharge: null, active: true, sortOrder: 1 },
  { id: "d2", pool: "mattress_size" as const, value: "Q", label: "5FT", dimensions: "152X190CM", surcharge: null, active: true, sortOrder: 2 },
];

describe("NewSkuModal — auto-description preview (bed SKUs)", () => {
  it("size flow hint shows the auto description of the first ticked size", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS_DIMS} onClose={vi.fn()} />);
    // default category = mattress; K sorts first → its desc previews once the
    // model name (part of the format) is typed.
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    expect(screen.getByTestId("new-sku-sizes")).toHaveTextContent(
      "Mattress Lumi FirmCare 183X190CM",
    );
  });

  it("classic path: typing a bed size previews the auto description; typing a description hides it", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS_DIMS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-sizes-none")); // fall back to classic flow
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.change(screen.getByTestId("new-sku-variant"), { target: { value: "Queen" } });
    expect(screen.getByTestId("new-sku-auto-desc")).toHaveTextContent(
      "Mattress Lumi FirmCare 152X190CM",
    );
    // A typed description wins server-side → the auto hint disappears.
    fireEvent.change(screen.getByPlaceholderText("Mattress Lumi FirmCare 152X190CM"), {
      target: { value: "Hand-typed" },
    });
    expect(screen.queryByTestId("new-sku-auto-desc")).not.toBeInTheDocument();
  });

  it("no pool dimensions → no auto-desc preview", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-sizes-none"));
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.change(screen.getByTestId("new-sku-variant"), { target: { value: "King" } });
    expect(screen.queryByTestId("new-sku-auto-desc")).not.toBeInTheDocument();
  });

  it("accessory never previews an auto description (manual field)", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS_DIMS} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "accessory" } });
    expect(screen.queryByTestId("new-sku-auto-desc")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loo 2026-07-11 — accessory/service carry NO size/variant axis (one SKU per
// model): the Size/variant field is hidden, nothing to fill, and the create
// sends an EMPTY variant (the server mints the bare MODEL_KEY as the code).
// ---------------------------------------------------------------------------
describe("NewSkuModal — accessory/service: no variant axis", () => {
  it("accessory hides the Size/variant field and previews the bare model-key code", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "accessory" } });
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();
    // Price / cost / description stay (an accessory still has a price).
    expect(screen.getByTestId("new-sku-price")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-cost")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-sku-name"), {
      target: { value: "Memory Foam Pillow" },
    });
    expect(screen.getByTestId("new-sku-no-variant-hint")).toHaveTextContent(
      "MEMORY-FOAM-PILLOW",
    );
  });

  it("service hides the Size/variant field too", () => {
    render(<NewSkuModal models={MODELS} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "service" } });
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();
  });

  it("creates the accessory with an EMPTY variant — name + price alone are enough", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "accessory" } });
    fireEvent.change(screen.getByTestId("new-sku-name"), {
      target: { value: "Memory Foam Pillow" },
    });
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "99" } });
    fireEvent.click(screen.getByText("Create product + SKU"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).toHaveBeenCalledWith({
      category: "accessory",
      modelKey: "memory-foam-pillow",
      name: "Memory Foam Pillow",
    });
    expect(mockCreateSkuMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      variant: "",
      variantKind: "preset",
      price: 99,
      cost: null,
      description: null,
      /* 0375 — the supplier's own item code rides the payload; untouched here. */
      supplierCode: null,
    });
  });

  it("a size typed under another category never leaks into an accessory create", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} onClose={onClose} />);
    // Sofa (empty compartment pool → classic field) — type a variant…
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByTestId("new-sku-variant"), { target: { value: "3-seater" } });
    // …then flip to accessory and create.
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "accessory" } });
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Bolster" } });
    fireEvent.click(screen.getByText("Create product + SKU"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateSkuMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Loo 2026-07-21 — "Add to existing model" surfaces the SAME option chips as
// "New product", filtered to what the picked model does NOT yet carry:
// custom sofa → unoffered compartments; mattress/bedframe → sizes with no
// live SKU. Default NONE selected (tick just the additions); the free-text
// variant field is gone whenever a chip section owns the flow.
// ---------------------------------------------------------------------------
const exModel = (
  over: Pick<ProductModelDto, "id" | "category" | "modelKey" | "name"> &
    Partial<ProductModelDto>,
): ProductModelDto => ({ blurb: null, colors: null, gaps: null, sofaMode: null, ...over });

const exSku = (
  id: string,
  modelId: string,
  skuCode: string,
  variant: string,
  compartmentId: string | null = null,
  discontinuedAt: string | null = null,
): ProductSkuDto => ({
  id,
  modelId,
  sku: skuCode,
  variant,
  variantKind: compartmentId ? "part" : "size",
  price: 0,
  cost: null,
  supplierId: null,
  discontinuedAt,
  compartmentId,
});

const EXISTING_MODELS: ProductModelDto[] = [
  exModel({ id: "m-sofa", category: "sofa", modelKey: "annsa", name: "Annsa", sofaMode: "custom" }),
  exModel({ id: "m-flat", category: "sofa", modelKey: "oldflat", name: "Old Flat" }),
  exModel({ id: "m-mat", category: "mattress", modelKey: "forte", name: "Forte" }),
];

// Annsa already offers c1; Forte already has Single + Queen.
const EXISTING_SKUS: ProductSkuDto[] = [
  exSku("s1", "m-sofa", "ANNSA-1A(LHF)", "1A(LHF)", "c1"),
  exSku("s2", "m-mat", "FORTE-S", "Single"),
  exSku("s3", "m-mat", "FORTE-Q", "Queen"),
];

function pickExisting(modelId: string) {
  fireEvent.click(screen.getByTestId("new-sku-mode-existing"));
  fireEvent.change(screen.getByTestId("new-sku-model"), { target: { value: modelId } });
}

describe("NewSkuModal — Add to existing model: option chips", () => {
  it("custom sofa model: chips = UNOFFERED compartments only, none selected, no free-text variant", () => {
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={EXISTING_SKUS}
        sofaCompartments={POOL}
        onClose={vi.fn()}
      />,
    );
    pickExisting("m-sofa");
    // c1 is already offered → hidden; c2 shows, unticked.
    expect(screen.queryByTestId("new-sku-comp-1A(LHF)")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-comp-1NA")).toHaveAttribute("aria-pressed", "false");
    // The chip section owns the flow — no free-text fallback fields.
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-cost")).not.toBeInTheDocument();
  });

  it("custom sofa model: submit offers ONLY the ticked additions — never re-creates the model", async () => {
    const onClose = vi.fn();
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={EXISTING_SKUS}
        sofaCompartments={POOL}
        onClose={onClose}
      />,
    );
    pickExisting("m-sofa");
    fireEvent.click(screen.getByTestId("new-sku-comp-1NA"));
    mockOfferMutateAsync.mockResolvedValue({ offered: 1, failed: [] });
    fireEvent.click(screen.getByText("Add 1 SKU"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).not.toHaveBeenCalled();
    expect(mockOfferMutateAsync).toHaveBeenCalledWith({
      modelId: "m-sofa",
      compartmentIds: ["c2"],
    });
    expect(mockCreateSkuMutateAsync).not.toHaveBeenCalled();
  });

  it("a DISCONTINUED compartment sku keeps its chip offerable (re-offer revives it)", () => {
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={[
          ...EXISTING_SKUS,
          exSku("s4", "m-sofa", "ANNSA-1NA", "1NA", "c2", "2026-07-01T00:00:00Z"),
        ]}
        sofaCompartments={POOL}
        onClose={vi.fn()}
      />,
    );
    pickExisting("m-sofa");
    expect(screen.getByTestId("new-sku-comp-1NA")).toBeInTheDocument();
  });

  it("mattress model: chips = sizes WITHOUT a live SKU, none selected; submit generate-skus onto the model", async () => {
    const onClose = vi.fn();
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={EXISTING_SKUS}
        optionPools={SIZE_POOLS}
        onClose={onClose}
      />,
    );
    pickExisting("m-mat");
    // Single + Queen exist → only King left.
    expect(screen.queryByTestId("new-sku-size-S")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-size-Q")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-size-K")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("new-sku-variant")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("new-sku-size-K"));
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "1990" } });
    mockGenerateSkusMutateAsync.mockResolvedValue({ ok: true, generated: 1, skipped: 0 });
    fireEvent.click(screen.getByText("Add 1 SKU"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateModelMutateAsync).not.toHaveBeenCalled();
    expect(mockGenerateSkusMutateAsync).toHaveBeenCalledWith({
      modelId: "m-mat",
      input: { variants: ["King"], price: 1990 },
    });
  });

  it("model already has every pool size → 'nothing left to add' hint", () => {
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={[...EXISTING_SKUS, exSku("s5", "m-mat", "FORTE-K", "King")]}
        optionPools={SIZE_POOLS}
        onClose={vi.fn()}
      />,
    );
    pickExisting("m-mat");
    expect(screen.getByTestId("new-sku-sizes-none-left")).toBeInTheDocument();
  });

  it("FLAT sofa model keeps the classic free-text variant field", () => {
    render(
      <NewSkuModal
        models={EXISTING_MODELS}
        skus={EXISTING_SKUS}
        sofaCompartments={POOL}
        onClose={vi.fn()}
      />,
    );
    pickExisting("m-flat");
    expect(screen.queryByTestId("new-sku-compartments")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Add SKU")).toBeInTheDocument();
  });
});
