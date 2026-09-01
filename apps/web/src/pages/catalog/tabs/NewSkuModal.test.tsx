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
let mockSuppliers: { id: string; name: string; slug?: string }[] = [];
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: mockRole }),
}));

const mockCreateModelMutateAsync = vi.fn();
const mockCreateSupplierMutateAsync = vi.fn();
const mockCreateSkuMutateAsync = vi.fn();
const mockOfferMutateAsync = vi.fn();
const mockGenerateSkusMutateAsync = vi.fn();
const mockCreateGuaranteeMutateAsync = vi.fn();

vi.mock("@/lib/queries", () => ({
  /* 2026-08-24 - the supplier picker/filter/column reads the roster through
   * this hook; one named supplier is enough to pin the render path. */
  useOperationSuppliers: () => ({
    /* A MUTABLE roster, because the real hook is invalidated by the create
       mutation and refetches. A frozen list would make the picker look broken
       in a test while working in production. */
    data: { suppliers: mockSuppliers },
    isLoading: false,
  }),
  /* 2026-08-24 - the FIRST supplier-creation door the portal has ever had.
   * Principal-only, so the panel simply does not render for anyone the
   * `suppliers_principal_write` policy (0002) would refuse. */
  useCreateSupplier: () => ({
    mutate: vi.fn(),
    mutateAsync: mockCreateSupplierMutateAsync,
    isPending: false,
  }),
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
  mockSuppliers = [
    { id: "00000000-0000-4000-8000-0000000000a1", name: "Hookka" },
    /* The RENAMED row — production's Ohana still carries the `hookka`-family
       slug from 0032 while wearing a name that derives a different one. */
    { id: "sup-ohana", name: "Ohana", slug: "hookka-manufacturing" },
  ];
  mockCreateSupplierMutateAsync.mockReset().mockImplementation(async () => {
    const supplier = { id: "sup-new", name: "Hookka Two" };
    mockSuppliers = [...mockSuppliers, supplier];
    return { supplier };
  });
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

    expect(screen.getByText("Create Sofa model + 2 SKUs")).toBeInTheDocument();
  });

  it("None deselects everything and falls back to the classic flat-SKU flow", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();

    fireEvent.click(screen.getByTestId("new-sku-comps-none"));
    expect(screen.getByTestId("new-sku-comp-1A(LHF)")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("new-sku-variant")).toBeInTheDocument();
    expect(screen.getByText("Create Sofa product + SKU")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("new-sku-comps-all"));
    expect(screen.getByText("Create Sofa model + 2 SKUs")).toBeInTheDocument();
  });

  it("submit creates the model (sofa_mode 'custom') then offers each ticked compartment — no single-SKU insert", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.click(screen.getByText("Create Sofa model + 2 SKUs"));

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
    fireEvent.click(screen.getByText("Create Sofa model + 1 SKU"));

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
    fireEvent.click(screen.getByText("Create Sofa model + 2 SKUs"));

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
    fireEvent.click(screen.getByText("Create Sofa model + 1 SKU"));
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
    expect(screen.getByText("Create Sofa product + SKU")).toBeInTheDocument();
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
    expect(screen.getByText("Create Sofa product + SKU")).toBeInTheDocument();
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
    expect(screen.getByText("Create Mattress model + 3 SKUs")).toBeInTheDocument();
  });

  it("bedframe reads the bedframe_size pool; category switch re-defaults the selection", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-sizes-none"));
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "bedframe" } });
    expect(screen.getByTestId("new-sku-size-K")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("new-sku-size-S")).not.toBeInTheDocument(); // mattress-only value
    expect(screen.getByText("Create Bedframe model + 1 SKU")).toBeInTheDocument();
  });

  it("submit creates the model (sizes seed allowed_options) + generate-skus with the ticked sizes + price", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.click(screen.getByTestId("new-sku-size-Q")); // untick Q → S + K remain
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "1990" } });
    fireEvent.click(screen.getByText("Create Mattress model + 2 SKUs"));

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
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));
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
    expect(screen.getByText("Create Mattress product + SKU")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Create Accessory product + SKU"));

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
      /* 2026-08-24 — the picker default is Auto: supplierId null keeps the
         route's category-based resolution, byte-identical to pre-picker. */
      supplierId: null,
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
    fireEvent.click(screen.getByText("Create Accessory product + SKU"));

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

// ---------------------------------------------------------------------------
// THE SUPPLIER OVERRIDE ON BULK-GENERATE (2026-08-24).
//
// generate-skus and offer-compartments both auto-resolve a supplier server-
// side (whichever supplier's cat_covered[] names the category first) — a real
// blind spot when two suppliers cover the same category, since a keyer had no
// way to say "this batch is Hookka's". The picker rendered in the classic
// single-SKU flow only; these tests pin it in the two bulk flows too, and pin
// that leaving it on Auto keeps the payload byte-identical to before.
// ---------------------------------------------------------------------------
describe("NewSkuModal — supplier override on bulk-generate flows", () => {
  const HOOKKA_ID = "00000000-0000-4000-8000-0000000000a1";

  it("size flow: the picker renders, and picking Hookka sends supplierId to generate-skus", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    expect(screen.getByTestId("new-sku-supplier")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-sku-supplier"), { target: { value: HOOKKA_ID } });
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockGenerateSkusMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ supplierId: HOOKKA_ID }),
      }),
    );
  });

  it("size flow: Auto (the default) omits supplierId — byte-identical to before the picker existed", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = mockGenerateSkusMutateAsync.mock.calls[0][0];
    expect(call.input.supplierId).toBeUndefined();
  });

  it("compartment flow: the picker renders, and picking Hookka sends supplierId to offer-compartments", async () => {
    const onClose = vi.fn();
    render(
      <NewSkuModal
        models={MODELS}
        sofaCompartments={[comp("c1", "1A(LHF)", 1), comp("c2", "2A(LHF)", 2)]}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Booqit" } });
    expect(screen.getByTestId("new-sku-supplier")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-sku-supplier"), { target: { value: HOOKKA_ID } });
    fireEvent.click(screen.getByText("Create Sofa model + 2 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockOfferMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: HOOKKA_ID }),
    );
  });

  it("compartment flow: Auto omits supplierId from the offer call", async () => {
    const onClose = vi.fn();
    render(
      <NewSkuModal models={MODELS} sofaCompartments={[comp("c1", "1A(LHF)", 1)]} onClose={onClose} />,
    );
    fireEvent.change(screen.getByTestId("new-sku-category"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Booqit" } });
    fireEvent.click(screen.getByText("Create Sofa model + 1 SKU"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = mockOfferMutateAsync.mock.calls[0][0];
    expect(call.supplierId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TWO MODELS CAN SHARE A NAME (2026-08-24).
//
// The real identity is (category, model_key), not name — two suppliers each
// pitching a "Booqit" land as two models the moment either model_key differs.
// The "Add to existing model" list rendered `{Category} {Name}` only, so two
// same-named rows in one category were LITERALLY IDENTICAL TEXT: a keyer had
// no way to tell them apart and could add a SKU to the wrong one.
// ---------------------------------------------------------------------------
describe("NewSkuModal — same-name models are disambiguated in the picker", () => {
  const DUPES: ProductModelDto[] = [
    exModel({ id: "m-hk", category: "sofa", modelKey: "booqit-hookka", name: "Booqit" }),
    exModel({ id: "m-other", category: "sofa", modelKey: "booqit-nicefuture", name: "Booqit" }),
    exModel({ id: "m-solo", category: "mattress", modelKey: "forte", name: "Forte" }),
  ];

  it("⭐ a real name collision shows the model_key alongside each option", () => {
    render(<NewSkuModal models={DUPES} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-mode-existing"));
    const select = screen.getByTestId("new-sku-model") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Sofa Booqit (booqit-hookka)");
    expect(labels).toContain("Sofa Booqit (booqit-nicefuture)");
  });

  it("NEGATIVE CONTROL: a model with no name collision renders WITHOUT its key — no visual noise for the common case", () => {
    render(<NewSkuModal models={DUPES} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-mode-existing"));
    const select = screen.getByTestId("new-sku-model") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Mattress Forte");
    expect(labels).not.toContain("Mattress Forte (forte)");
  });

  it("the SAME name in DIFFERENT categories is not a collision — sofa Booqit vs a hypothetical accessory Booqit", () => {
    const crossCategory: ProductModelDto[] = [
      exModel({ id: "m1", category: "sofa", modelKey: "booqit", name: "Booqit" }),
      exModel({ id: "m2", category: "accessory", modelKey: "booqit-pillow", name: "Booqit" }),
    ];
    render(<NewSkuModal models={crossCategory} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-mode-existing"));
    const select = screen.getByTestId("new-sku-model") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    // Neither collides WITHIN its own category, so neither is suffixed.
    expect(labels).toContain("Sofa Booqit");
    expect(labels).toContain("Accessory Booqit");
  });
});

/**
 * ⭐ THE SUPPLIER'S OWN CODE ON A BULK BATCH (2026-08-24).
 *
 * A quotation names the SUPPLIER's code and never Carres' SKU — it is the only
 * string a keyer can match a factory's paperwork against. The classic
 * single-SKU flow has had a code box since 0375; the two BULK flows had the
 * supplier PICKER but no code, so a batch of sofa compartments or mattress
 * sizes could name its factory and not one of its part numbers.
 *
 * One box defaults the batch, any piece overrides it. The override is keyed by
 * what the SUBMIT sends — compartmentId for the compartment lane, the canonical
 * size NAME for the size lane — because a key the server cannot recognise would
 * drop the code silently rather than loudly.
 */
describe("NewSkuModal — the supplier's own code on a bulk batch", () => {
  it("gives the compartment flow a batch box and one box per ticked piece", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();
    expect(screen.getByTestId("new-sku-supplier-code-batch")).toBeInTheDocument();
    // Both live compartments start ticked; the retired one is not offered.
    expect(screen.getByTestId("new-sku-supplier-code-piece-c1")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-supplier-code-piece-c2")).toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-supplier-code-piece-c-off")).not.toBeInTheDocument();
  });

  it("drops a piece's box the moment that piece is unticked", () => {
    /* A code typed against a compartment then unticked must not travel — the
       submit builds its map from the SELECTED ids, and the box disappearing is
       what tells the keyer that. */
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-supplier-code-piece-c2"), {
      target: { value: "HK-1NA" },
    });
    fireEvent.click(screen.getByTestId("new-sku-comp-1NA"));
    expect(screen.queryByTestId("new-sku-supplier-code-piece-c2")).not.toBeInTheDocument();
  });

  it("⭐ sends the batch code to every compartment, and the override to just one", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.change(screen.getByTestId("new-sku-supplier-code"), {
      target: { value: "  HK-390  " },
    });
    fireEvent.change(screen.getByTestId("new-sku-supplier-code-piece-c2"), {
      target: { value: "HK-390-1NA" },
    });
    fireEvent.click(screen.getByText("Create Sofa model + 2 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    /* The compartment lane sends ONE code per request, so the batch default is
       resolved HERE — each PUT carries the single code that piece ends up with,
       trimmed. */
    expect(mockOfferMutateAsync).toHaveBeenCalledWith({
      modelId: "m-new",
      compartmentIds: ["c1", "c2"],
      supplierCodes: { c1: "HK-390", c2: "HK-390-1NA" },
    });
  });

  it("sends NOTHING extra when no code was typed", async () => {
    /* The payload stays byte-identical to what it sent before this field
       existed — an empty map is a key the server would have to interpret. */
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={onClose} />);
    openSofa();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Angsa" } });
    fireEvent.click(screen.getByText("Create Sofa model + 2 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const payload = mockOfferMutateAsync.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("supplierCodes");
  });

  it("⭐ keys the size flow's override by the CANONICAL NAME the submit sends", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.change(screen.getByTestId("new-sku-supplier-code"), { target: { value: "LM-100" } });
    /* The pool VALUE is `K`; the variant sent is `King`. The box is keyed by
       the name for exactly that reason — a map keyed `K` would never match. */
    fireEvent.change(screen.getByTestId("new-sku-supplier-code-piece-King"), {
      target: { value: "LM-100-K" },
    });
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = mockGenerateSkusMutateAsync.mock.calls[0]?.[0] as {
      input: { supplierCode?: string; supplierCodes?: Record<string, string> };
    };
    // Batch default and the one override both ride the SAME request; the
    // server resolves per-variant → batch → NULL.
    expect(call.input.supplierCode).toBe("LM-100");
    expect(call.input.supplierCodes).toEqual({ King: "LM-100-K" });
  });
});

/**
 * ⭐ MEETING A NEW SUPPLIER MID-CATALOG (2026-08-24).
 *
 * The portal had NO supplier-creation door anywhere — no route, no screen — so
 * a keyer who reached a factory nobody had entered yet had to stop, open the
 * SQL editor (or find someone who could) and come back to a modal they had
 * already lost. The point of putting the door HERE is that the half-written SKU
 * survives being interrupted by a supplier.
 *
 * Purchasing still owns the record. This is a door, not a second home for it.
 */
describe("NewSkuModal — adding a supplier without losing the SKU", () => {
  it("offers the door, and pre-ticks the category being keyed", () => {
    render(<NewSkuModal models={MODELS} sofaCompartments={POOL} onClose={vi.fn()} />);
    openSofa();
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    /* The category is the one fact this modal already knows and the answer nine
       times out of ten — asking it again would be asking the keyer to repeat
       themselves. */
    expect(screen.getByTestId("new-sku-supplier-add-cat-sofa")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("new-sku-supplier-add-cat-mattress")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("⭐ never shows the door to a role the policy would refuse", () => {
    /* `suppliers_principal_write` (0002) is principal-only and the route
       enforces it. A button that always refuses teaches the operator to ignore
       refusals, so it simply is not drawn. */
    mockRole = "operation";
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    expect(screen.queryByTestId("new-sku-supplier-add-open")).not.toBeInTheDocument();
  });

  it("refuses to submit a name too short to be a name", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    const save = screen.getByTestId("new-sku-supplier-add-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), { target: { value: "H" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "Hookka Two" },
    });
    expect(save.disabled).toBe(false);
  });

  it("⭐ selects the new supplier the moment it exists, and closes the panel", async () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "  Hookka Two  " },
    });
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-save"));

    await waitFor(() =>
      expect(mockCreateSupplierMutateAsync).toHaveBeenCalledWith({
        name: "Hookka Two",
        kind: "factory_pickup",
        catCovered: ["mattress"],
      }),
    );
    /* The keyer asked for this supplier BECAUSE they are writing its SKU right
       now — making them find it in the list again would be the modal forgetting
       what it was just told. */
    await waitFor(() =>
      expect((screen.getByTestId("new-sku-supplier") as HTMLSelectElement).value).toBe("sup-new"),
    );
    expect(screen.queryByTestId("new-sku-supplier-add")).not.toBeInTheDocument();
  });

  it("keeps the panel open when the server refuses, so the typing is not lost", async () => {
    mockCreateSupplierMutateAsync.mockRejectedValueOnce(new Error("already a supplier"));
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "Hookka Two" },
    });
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-save"));

    await waitFor(() => expect(mockCreateSupplierMutateAsync).toHaveBeenCalled());
    // Still open, still holding what was typed — a refusal is not a reason to
    // throw the keyer's work away.
    expect(screen.getByTestId("new-sku-supplier-add")).toBeInTheDocument();
    expect((screen.getByTestId("new-sku-supplier-add-name") as HTMLInputElement).value).toBe(
      "Hookka Two",
    );
  });
});

/**
 * ⭐ THE DUPLICATE-SUPPLIER DEAD END (2026-08-25).
 *
 * Reported from production: adding a supplier for a Cody bedframe produced
 * "Ohana is already a supplier — pick it from the list instead of adding it
 * twice." The server was RIGHT; the door was wrong, in two ways.
 *
 * 1. Cancelling the panel left the previous name in the box, so reopening it
 *    later submitted a supplier the keyer had not typed and could not see.
 * 2. The refusal arrived as a red toast after a round-trip and left the form
 *    to be dismantled by hand — correct, and a dead end.
 */
describe("NewSkuModal — a duplicate supplier is caught early and is not a dead end", () => {
  it("⭐ forgets the last name when the panel is reopened", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "Ohana" },
    });
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-cancel"));

    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    expect((screen.getByTestId("new-sku-supplier-add-name") as HTMLInputElement).value).toBe("");
  });

  it("⭐ names the existing supplier while typing, and refuses to submit", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    /* A DIFFERENT spelling of a supplier already in the roster. The match is on
       the derived slug — the same function the server derives it with — so it
       collides here exactly as it would collide in the database. */
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "hookka" },
    });
    expect(screen.getByTestId("new-sku-supplier-add-duplicate").textContent).toContain(
      "Hookka is already a supplier",
    );
    expect((screen.getByTestId("new-sku-supplier-add-save") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(mockCreateSupplierMutateAsync).not.toHaveBeenCalled();
  });

  it("⭐ finishes what the keyer meant — one click selects the existing supplier", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "HoOKkA" },
    });
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-use-existing"));

    /* Refusing without doing the obvious next thing is what made the server's
       message a dead end: the supplier they wanted is now simply chosen. */
    expect((screen.getByTestId("new-sku-supplier") as HTMLSelectElement).value).toBe(
      "00000000-0000-4000-8000-0000000000a1",
    );
    expect(screen.queryByTestId("new-sku-supplier-add")).not.toBeInTheDocument();
  });

  it("⭐ catches a RENAMED supplier by its stored slug, not its name's", () => {
    /* Reproduced in production: typing "Hookka Manufacturing" while the row is
       NAMED Ohana. Deriving from names says no match; the server refuses on the
       stored slug — the inline check must agree with the server or the dead
       end returns. */
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "Hookka Manufacturing" },
    });
    expect(screen.getByTestId("new-sku-supplier-add-duplicate").textContent).toContain(
      "Ohana is already a supplier",
    );
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-use-existing"));
    expect((screen.getByTestId("new-sku-supplier") as HTMLSelectElement).value).toBe("sup-ohana");
  });

  it("still allows a genuinely new name through", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("new-sku-supplier-add-open"));
    fireEvent.change(screen.getByTestId("new-sku-supplier-add-name"), {
      target: { value: "Cody Furniture" },
    });
    expect(screen.queryByTestId("new-sku-supplier-add-duplicate")).not.toBeInTheDocument();
    expect((screen.getByTestId("new-sku-supplier-add-save") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

/**
 * ⭐ A QUOTATION PRICES EACH SIZE DIFFERENTLY (2026-08-25).
 *
 * The measured case is Hookka's Cody bedframe — K 550 · Q 425 · S 395 ·
 * SS 407.50, with a PWP-style Price 1 on only some rows. One batch price box
 * generated every SKU wrong-or-zero, to be re-keyed by hand in SKU Master.
 * One price + PWP box per ticked size, principal only, keyed by the canonical
 * size NAME the submit sends (the supplierCodes contract).
 */
describe("NewSkuModal — per-size price and PWP on the generate flow", () => {
  it("shows one price + PWP box per ticked size for the principal", () => {
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    expect(screen.getByTestId("new-sku-size-price-Single")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-size-pwp-Queen")).toBeInTheDocument();
    expect(screen.getByTestId("new-sku-size-price-King")).toBeInTheDocument();
  });

  it("⭐ never shows the boxes to a role the price lock would refuse", () => {
    /* 0175/0186: price and pwp_price are principal-only writes. A box that
       always fails teaches the operator to ignore failures. */
    mockRole = "operation";
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={vi.fn()} />);
    expect(screen.queryByTestId("new-sku-size-prices")).not.toBeInTheDocument();
  });

  it("⭐ sends the per-size maps keyed by the canonical name the variants use", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Cody" } });
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "550" } });
    fireEvent.change(screen.getByTestId("new-sku-size-price-Queen"), {
      target: { value: "425" },
    });
    fireEvent.change(screen.getByTestId("new-sku-size-pwp-Queen"), { target: { value: "305" } });
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = mockGenerateSkusMutateAsync.mock.calls[0]?.[0] as {
      input: { price?: number; prices?: Record<string, number>; pwpPrices?: Record<string, number> };
    };
    expect(call.input.price).toBe(550);
    // Only the overridden size travels — the rest inherit the batch price
    // server-side, so an untouched box adds nothing to the payload.
    expect(call.input.prices).toEqual({ Queen: 425 });
    expect(call.input.pwpPrices).toEqual({ Queen: 305 });
  });

  it("sends neither map when no box was touched — byte-identical to before", async () => {
    const onClose = vi.fn();
    render(<NewSkuModal models={MODELS} optionPools={SIZE_POOLS} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Cody" } });
    fireEvent.click(screen.getByText("Create Mattress model + 3 SKUs"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = mockGenerateSkusMutateAsync.mock.calls[0]?.[0] as {
      input: Record<string, unknown>;
    };
    expect(call.input).not.toHaveProperty("prices");
    expect(call.input).not.toHaveProperty("pwpPrices");
  });
});
