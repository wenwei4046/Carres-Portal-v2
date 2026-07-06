/**
 * SkuMasterTab — price/margin rendering tests.
 *
 * The COST column was removed from the list 2026-07-06 (Loo: not needed for
 * now) — cost survives only in the Edit modal + import. Covers:
 *  - the list renders NO cost cell / header / inline cost input
 *  - margin muted when cost is null; RM amount + pct when cost is set
 *  - inline edit-mode price input still works
 *  - Edit modal: cost field renders + round-trips through usePatchCatalogSku
 *
 * Mocking strategy:
 *  - @/lib/queries: mock usePatchCatalogSku + useDeleteCatalogSku at module level.
 *  - sonner: suppress toast noise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import SkuMasterTab from "./SkuMasterTab";
import NewSkuModal from "./NewSkuModal";
import type { ProductSkuDto, ProductModelDto } from "@carres/shared";

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Auth mock — 0175 price/cost lock reads the current role. Default to
// "principal" (Master Admin) so the Task-1 cost/margin edit tests keep
// exercising the editable path; flip `mockRole` per-test for the lock cases.
// useAuth is a Zustand selector hook: useAuth((s) => s.role).
// ---------------------------------------------------------------------------
let mockRole: string | null = "principal";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: mockRole }),
}));

// ---------------------------------------------------------------------------
// Mutation stubs — replaced per-test in beforeEach
// ---------------------------------------------------------------------------
const mockPatchMutate = vi.fn();
const mockPatchMutateAsync = vi.fn();
const mockPatchModelMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockCreateSkuMutateAsync = vi.fn();
const mockImportMutateAsync = vi.fn();
// vi.hoisted so the const exists before the (hoisted) vi.mock factory runs.
const mockDownloadCsv = vi.hoisted(() => vi.fn());

// Keep the real export builder; spy only the DOM download (jsdom has no
// URL.createObjectURL).
vi.mock("@/lib/sku-csv", async (orig) => {
  const actual = await orig<typeof import("@/lib/sku-csv")>();
  return { ...actual, downloadCsv: mockDownloadCsv };
});

vi.mock("@/lib/queries", () => ({
  usePatchCatalogSku: () => ({
    mutate: mockPatchMutate,
    mutateAsync: mockPatchMutateAsync,
    isPending: false,
  }),
  useDeleteCatalogSku: () => ({
    mutate: mockDeleteMutate,
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePatchCatalogModel: () => ({
    mutate: mockPatchModelMutate,
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useCreateCatalogModel: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ model: { id: "m-new" } }),
    isPending: false,
  }),
  useCreateCatalogSku: () => ({
    mutate: vi.fn(),
    mutateAsync: mockCreateSkuMutateAsync,
    isPending: false,
  }),
  // Sofa compartment path (Loo 2026-07-06) — NewSkuModal calls this hook
  // unconditionally; the compartment-flow behaviour itself is covered in
  // NewSkuModal.test.tsx.
  useOfferModelCompartments: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ offered: 0, failed: [] }),
    isPending: false,
  }),
  // Mattress/bedframe size path (Loo 2026-07-06) — NewSkuModal calls this hook
  // unconditionally; the size-flow behaviour is covered in NewSkuModal.test.tsx.
  useGenerateSkus: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ ok: true, generated: 0, skipped: 0 }),
    isPending: false,
  }),
  useImportSkus: () => ({
    mutate: vi.fn(),
    mutateAsync: mockImportMutateAsync,
    isPending: false,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MODEL_MAT: ProductModelDto = {
  id: "m-mat",
  category: "mattress",
  modelKey: "cloud",
  name: "Carres Cloud",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
};

const MODEL_SOFA: ProductModelDto = {
  id: "m-sofa",
  category: "sofa",
  modelKey: "luna",
  name: "Luna Sofa",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "preset",
};

// Second mattress model — the model-filter tests need two models inside ONE
// category so a model pill pick filters within the category scope.
const MODEL_MAT2: ProductModelDto = {
  id: "m-mat2",
  category: "mattress",
  modelKey: "dream",
  name: "Carres Dream",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
};

const SKU_COST_NULL: ProductSkuDto = {
  id: "s1",
  modelId: "m-mat",
  sku: "CLOUD-QUEEN",
  variant: "Queen",
  variantKind: "size",
  price: 2890,
  cost: null,
  supplierId: null,
};

const SKU_COST_SET: ProductSkuDto = {
  id: "s2",
  modelId: "m-mat",
  sku: "CLOUD-KING",
  variant: "King",
  variantKind: "size",
  price: 3500,
  cost: 2100,
  supplierId: null,
};

const SKU_SOFA: ProductSkuDto = {
  id: "s3",
  modelId: "m-sofa",
  sku: "LUNA-3S",
  variant: "3-seater",
  variantKind: "preset",
  price: 4200,
  cost: 2800,
  supplierId: null,
};

const SKU_MAT2: ProductSkuDto = {
  id: "s4",
  modelId: "m-mat2",
  sku: "DREAM-QUEEN",
  variant: "Queen",
  variantKind: "size",
  price: 1990,
  cost: null,
  supplierId: null,
};

// 0204 — a compartment sofa SKU (compartmentId set) with a partial per-size map.
const SKU_SOFA_COMP: ProductSkuDto = {
  id: "s5",
  modelId: "m-sofa",
  sku: "LUNA-1A(LHF)",
  variant: "1A(LHF)",
  variantKind: "part",
  price: 1490,
  cost: null,
  supplierId: null,
  compartmentId: "comp-1",
  pricesBySize: { "24": 900, "99": 555 }, // "99" = orphaned key (not in the pool)
};

/** The sofa_size pool (Special Add-ons → SOFA → Sizes) — drives the size columns. */
const SOFA_SIZE_POOLS = [
  { id: "p1", pool: "sofa_size" as const, value: "24", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
  { id: "p2", pool: "sofa_size" as const, value: "32", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 2 },
  { id: "p3", pool: "sofa_size" as const, value: "Flat", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 3 },
  { id: "p4", pool: "sofa_size" as const, value: "RETIRED", label: null, dimensions: null, surcharge: null, active: false, sortOrder: 4 },
];

function makeCatalog(
  skus: ProductSkuDto[],
  models: ProductModelDto[] = [MODEL_MAT, MODEL_SOFA],
  optionPools?: CatalogResponse["optionPools"],
): CatalogResponse {
  return {
    models,
    skus,
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    ...(optionPools ? { optionPools } : {}),
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockPatchMutate.mockReset();
  mockPatchMutateAsync.mockReset();
  mockPatchModelMutate.mockReset();
  mockCreateSkuMutateAsync.mockReset();
  mockCreateSkuMutateAsync.mockResolvedValue({ sku: { id: "s-new" } });
  mockImportMutateAsync.mockReset();
  mockImportMutateAsync.mockResolvedValue({ upserted: 0, createdModels: 0, failed: 0, failures: [] });
  mockDownloadCsv.mockReset();
  // Default every test to the Master Admin (principal) — the price/cost lock
  // tests below override this to a non-principal role.
  mockRole = "principal";
});

describe("SkuMasterTab — cost column removed (Loo 2026-07-06), margin kept", () => {
  it("renders NO cost cell and no Cost header (cost edits live in Import/API only)", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    expect(screen.queryByTestId("sku-cost-CLOUD-KING")).not.toBeInTheDocument();
    expect(screen.queryByText("Cost")).not.toBeInTheDocument();
    // The row itself still renders (column removal, not row removal).
    expect(screen.getByTestId("sku-row-CLOUD-KING")).toBeInTheDocument();
  });

  it("shows muted '—' in margin column when cost is null", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_NULL])} />));
    const marginCell = screen.getByTestId("sku-margin-CLOUD-QUEEN");
    // muted dash; no RM value
    expect(marginCell.textContent).toContain("—");
    expect(marginCell.textContent).not.toMatch(/RM \d/);
  });

  it("shows RM amount + pct when cost is set (plan margin)", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    const marginCell = screen.getByTestId("sku-margin-CLOUD-KING");
    // price=3500 cost=2100 → margin=1400 (40%)
    expect(marginCell.textContent).toContain("1,400");
    expect(marginCell.textContent).toContain("40.0%");
  });

  it("uses 'base margin' tooltip text for sofa rows", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_SOFA])} />));
    const marginCell = screen.getByTestId("sku-margin-LUNA-3S");
    // The title attribute carries the label
    const span = marginCell.querySelector("[title]");
    expect(span?.getAttribute("title")).toBe("base margin");
  });

  it("uses 'plan margin' tooltip text for non-sofa rows", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    const marginCell = screen.getByTestId("sku-margin-CLOUD-KING");
    const span = marginCell.querySelector("[title]");
    expect(span?.getAttribute("title")).toBe("plan margin");
  });
});

describe("SkuMasterTab — Edit Prices mode (price only; cost input removed)", () => {
  it("shows the price input but NO cost input in Edit Prices mode", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    expect(screen.getByLabelText("CLOUD-KING price")).toBeInTheDocument();
    expect(screen.queryByLabelText("CLOUD-KING cost")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loo 2026-07-06 — STATUS column removed (ON/OFF lives in the Modular tab;
// pos_active data itself untouched) + the row Edit button is INLINE editing
// (code via variant re-derive / description / category), no modal.
// ---------------------------------------------------------------------------
describe("SkuMasterTab — no STATUS column", () => {
  it("renders no Status header and no ON/OFF pill", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET, SKU_SOFA])} />));
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("ON")).not.toBeInTheDocument();
    expect(screen.queryByText("OFF")).not.toBeInTheDocument();
  });
});

describe("SkuMasterTab — inline row editing (no modal)", () => {
  it("Edit flips the row to inline inputs (code / description / category); Done flips back", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    // No dialog — inline inputs instead.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("CLOUD-KING code")).toBeInTheDocument();
    expect(screen.getByLabelText("CLOUD-KING description")).toBeInTheDocument();
    expect(screen.getByTestId("sku-category-select-CLOUD-KING")).toBeInTheDocument();
    expect(screen.getByTestId("sku-edit-CLOUD-KING")).toHaveTextContent("Done");
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    expect(screen.queryByLabelText("CLOUD-KING code")).not.toBeInTheDocument();
  });

  it("code edit commits the VARIANT segment on blur (server re-derives the code)", async () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    const code = screen.getByLabelText("CLOUD-KING code");
    fireEvent.change(code, { target: { value: "KING-XL" } });
    fireEvent.blur(code);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    const call = mockPatchMutate.mock.calls[0][0];
    expect(call.id).toBe("s2");
    expect(call.patch).toEqual({ variant: "KING-XL" });
  });

  it("description edit commits on blur; blank clears to null", async () => {
    const withDesc = { ...SKU_COST_SET, description: "old text" };
    render(wrap(<SkuMasterTab catalog={makeCatalog([withDesc])} />));
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    const desc = screen.getByLabelText("CLOUD-KING description");
    fireEvent.change(desc, { target: { value: "  " } });
    fireEvent.blur(desc);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    expect(mockPatchMutate.mock.calls[0][0].patch).toEqual({ description: null });
  });

  it("category change PATCHes the MODEL (moves all its SKUs)", async () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    fireEvent.change(screen.getByTestId("sku-category-select-CLOUD-KING"), {
      target: { value: "accessory" },
    });
    await waitFor(() => expect(mockPatchModelMutate).toHaveBeenCalledOnce());
    const call = mockPatchModelMutate.mock.calls[0][0];
    expect(call.id).toBe("m-mat");
    expect(call.patch).toEqual({ category: "accessory" });
  });

  it("unchanged blur is a no-op (no PATCH)", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-CLOUD-KING"));
    fireEvent.blur(screen.getByLabelText("CLOUD-KING code"));
    fireEvent.blur(screen.getByLabelText("CLOUD-KING description"));
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 0175 — Master-Admin price/cost lock. Non-principal internal users see
// price + cost READ-ONLY (no inline editor, no modal fields); principal keeps
// full edit (Task-1 behaviour above).
// ---------------------------------------------------------------------------
describe("0175 — price/cost lock (non-principal read-only)", () => {
  it("principal sees the 'Edit Prices' button", () => {
    mockRole = "principal";
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    expect(screen.getByTestId("sku-edit-prices")).toBeInTheDocument();
    expect(screen.queryByTestId("sku-price-lock-hint")).not.toBeInTheDocument();
  });

  it("operation (non-principal) sees NO 'Edit Prices' button, shows the lock hint", () => {
    mockRole = "operation";
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    expect(screen.queryByTestId("sku-edit-prices")).not.toBeInTheDocument();
    expect(screen.getByTestId("sku-price-lock-hint")).toBeInTheDocument();
    // The row renders read-only (no inline inputs anywhere).
    const row = screen.getByTestId("sku-row-CLOUD-KING");
    expect(row.querySelector('input[type="number"]')).toBeNull();
  });

  it("NewSkuModal: non-principal sees NO price/cost inputs (shows lock hint)", () => {
    mockRole = "operation";
    render(wrap(<NewSkuModal models={[MODEL_MAT, MODEL_SOFA]} onClose={() => {}} />));
    expect(screen.queryByTestId("new-sku-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-sku-cost")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-sku-price-lock-hint")).toBeInTheDocument();
  });

  it("NewSkuModal: non-principal creates an UNPRICED sku (price 0 / cost null)", async () => {
    mockRole = "operation";
    render(wrap(<NewSkuModal models={[MODEL_MAT, MODEL_SOFA]} onClose={vi.fn()} />));
    // New product: fill name + variant; price/cost fields are absent.
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lite Foam" } });
    fireEvent.change(screen.getByTestId("new-sku-variant"), { target: { value: "Queen" } });
    fireEvent.click(screen.getByText("Create product + SKU"));
    await waitFor(() => expect(mockCreateSkuMutateAsync).toHaveBeenCalledOnce());
    const args = mockCreateSkuMutateAsync.mock.calls[0][0];
    expect(args.price).toBe(0);
    expect(args.cost).toBeNull();
  });

  it("NewSkuModal: principal can seed price + cost", async () => {
    mockRole = "principal";
    render(wrap(<NewSkuModal models={[MODEL_MAT, MODEL_SOFA]} onClose={vi.fn()} />));
    expect(screen.getByTestId("new-sku-price")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-sku-name"), { target: { value: "Lux Foam" } });
    fireEvent.change(screen.getByTestId("new-sku-variant"), { target: { value: "King" } });
    fireEvent.change(screen.getByTestId("new-sku-price"), { target: { value: "2990" } });
    fireEvent.change(screen.getByTestId("new-sku-cost"), { target: { value: "1800" } });
    fireEvent.click(screen.getByText("Create product + SKU"));
    await waitFor(() => expect(mockCreateSkuMutateAsync).toHaveBeenCalledOnce());
    const args = mockCreateSkuMutateAsync.mock.calls[0][0];
    expect(args.price).toBe(2990);
    expect(args.cost).toBe(1800);
  });
});

// ---------------------------------------------------------------------------
// 2990s Products parity Phase 1 — Export / Import toolbar buttons.
// ---------------------------------------------------------------------------
describe("SkuMasterTab — Export / Import buttons", () => {
  it("renders Export + Import buttons", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    expect(screen.getByTestId("sku-export")).toBeInTheDocument();
    expect(screen.getByTestId("sku-import")).toBeInTheDocument();
  });

  it("Export builds a CSV of the filtered rows and triggers a download", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET, SKU_SOFA])} />));
    fireEvent.click(screen.getByTestId("sku-export"));
    expect(mockDownloadCsv).toHaveBeenCalledOnce();
    const [filename, csv] = mockDownloadCsv.mock.calls[0];
    expect(filename).toMatch(/^carres-skus-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv).toContain("CLOUD-KING");
    expect(csv).toContain("LUNA-3S");
  });

  it("Export stamps the active category into the filename", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET, SKU_SOFA])} />));
    fireEvent.click(screen.getByRole("button", { name: "Sofa" })); // category chip
    fireEvent.click(screen.getByTestId("sku-export"));
    const [filename, csv] = mockDownloadCsv.mock.calls[0];
    expect(filename).toMatch(/^carres-skus-sofa-/);
    expect(csv).toContain("LUNA-3S");
    expect(csv).not.toContain("CLOUD-KING"); // mattress filtered out
  });

  it("Import button opens the dialog", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-import"));
    expect(screen.getByTestId("import-pick-file")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 0204 — sofa-size grid: one price column per `sofa_size` pool value when the
// Sofa category is filtered (Loo 2026-07-06).
// ---------------------------------------------------------------------------
describe("SkuMasterTab — per-size sofa pricing grid (0204)", () => {
  const sofaCatalog = () =>
    makeCatalog([SKU_SOFA_COMP, SKU_SOFA], [MODEL_MAT, MODEL_SOFA], SOFA_SIZE_POOLS);

  function openSofa() {
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
  }

  it("Sofa filter + pool → one column per ACTIVE size; compartment cells show explicit vs inherited", () => {
    render(wrap(<SkuMasterTab catalog={sofaCatalog()} />));
    openSofa();
    // Columns follow the pool (active only, pool order).
    expect(screen.getByTestId("sku-size-col-24")).toBeInTheDocument();
    expect(screen.getByTestId("sku-size-col-32")).toBeInTheDocument();
    expect(screen.getByTestId("sku-size-col-Flat")).toBeInTheDocument();
    expect(screen.queryByTestId("sku-size-col-RETIRED")).not.toBeInTheDocument();
    // Compartment row: explicit 900 at 24; 32 inherits the base 1,490 (muted parens).
    expect(screen.getByTestId("sku-size-LUNA-1A(LHF)-24").textContent).toContain("900");
    expect(screen.getByTestId("sku-size-LUNA-1A(LHF)-32").textContent).toContain("(RM 1,490.00)");
    // Flat (non-compartment) sofa SKU keeps ONE price spanning the size tracks.
    expect(screen.getByTestId("sku-flat-price-LUNA-3S").textContent).toContain("4,200");
    expect(screen.getByTestId("sofa-size-mode-hint")).toBeInTheDocument();
  });

  it("non-sofa categories keep the normal grid even when the pool exists", () => {
    render(wrap(<SkuMasterTab catalog={sofaCatalog()} />));
    expect(screen.queryByTestId("sku-size-col-24")).not.toBeInTheDocument(); // "All"
    fireEvent.click(screen.getByRole("button", { name: "Mattress" }));
    expect(screen.queryByTestId("sku-size-col-24")).not.toBeInTheDocument();
  });

  it("Sofa filter WITHOUT a pool keeps the normal grid", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_SOFA_COMP, SKU_SOFA])} />));
    openSofa();
    expect(screen.queryByTestId("sku-size-col-24")).not.toBeInTheDocument();
    expect(screen.getByTestId("sku-row-LUNA-1A(LHF)")).toBeInTheDocument();
  });

  it("Edit Prices: a size-cell blur PATCHes the FULL map — composed edits + ORPHANED keys preserved", async () => {
    render(wrap(<SkuMasterTab catalog={sofaCatalog()} />));
    openSofa();
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const input32 = screen.getByLabelText("LUNA-1A(LHF) price at 32");
    fireEvent.change(input32, { target: { value: "1200" } });
    fireEvent.blur(input32);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    const call = mockPatchMutate.mock.calls[0][0];
    expect(call.id).toBe("s5");
    // Full map: existing 24 kept, new 32 added, orphan "99" (not in the pool)
    // preserved — a cell edit never erases an orphaned size price.
    expect(call.patch.pricesBySize).toEqual({ "24": 900, "32": 1200, "99": 555 });
  });

  it("Edit Prices: blanking a size removes its key (falls back to the base price)", async () => {
    render(wrap(<SkuMasterTab catalog={sofaCatalog()} />));
    openSofa();
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const input24 = screen.getByLabelText("LUNA-1A(LHF) price at 24");
    fireEvent.change(input24, { target: { value: "" } });
    fireEvent.blur(input24);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    const call = mockPatchMutate.mock.calls[0][0];
    expect(call.patch.pricesBySize).toEqual({ "99": 555 });
  });

  it("Edit Prices: blur without a change is a no-op (no PATCH)", () => {
    render(wrap(<SkuMasterTab catalog={sofaCatalog()} />));
    openSofa();
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    fireEvent.blur(screen.getByLabelText("LUNA-1A(LHF) price at 24"));
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2990s Products parity Phase 2 — model filter in SKU Master.
// ---------------------------------------------------------------------------
describe("SkuMasterTab — model filter", () => {
  const CATALOG_3 = () =>
    makeCatalog([SKU_COST_SET, SKU_MAT2, SKU_SOFA], [MODEL_MAT, MODEL_MAT2, MODEL_SOFA]);

  it("shows model pills once a category is picked — even a single model — and filters by model", () => {
    render(wrap(<SkuMasterTab catalog={CATALOG_3()} />));
    // "All" category → no model row
    expect(screen.queryByTestId("sku-model-filter")).not.toBeInTheDocument();
    // Sofa has a single model — the row still shows it (the Booqit case)
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
    expect(screen.getByTestId("sku-model-filter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Luna Sofa" })).toBeInTheDocument();
    // Mattress has two models — picking one keeps only its SKU
    fireEvent.click(screen.getByRole("button", { name: "Mattress" }));
    expect(screen.getByTestId("sku-row-CLOUD-KING")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Carres Dream" }));
    expect(screen.getByTestId("sku-row-DREAM-QUEEN")).toBeInTheDocument();
    expect(screen.queryByTestId("sku-row-CLOUD-KING")).not.toBeInTheDocument();
  });

  it("resets the model pick when the category changes", () => {
    render(wrap(<SkuMasterTab catalog={CATALOG_3()} />));
    fireEvent.click(screen.getByRole("button", { name: "Mattress" }));
    fireEvent.click(screen.getByRole("button", { name: "Carres Dream" }));
    expect(screen.queryByTestId("sku-row-CLOUD-KING")).not.toBeInTheDocument();
    // leave and come back — the model pick must not survive the category switch
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
    fireEvent.click(screen.getByRole("button", { name: "Mattress" }));
    expect(screen.getByTestId("sku-row-CLOUD-KING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Mattress" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
