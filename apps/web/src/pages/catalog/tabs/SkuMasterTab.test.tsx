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
import EditSkuModal from "./EditSkuModal";
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
    mutate: vi.fn(),
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

function makeCatalog(skus: ProductSkuDto[], models: ProductModelDto[] = [MODEL_MAT, MODEL_SOFA]): CatalogResponse {
  return {
    models,
    skus,
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
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
  it("renders NO cost cell and no Cost header — cost lives only in the Edit modal now", () => {
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

describe("EditSkuModal — cost field + margin round-trip", () => {
  it("renders cost field pre-filled with existing cost", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_SET}
          model={MODEL_MAT}
          onClose={() => {}}
        />,
      ),
    );
    const costInput = screen.getByTestId("edit-sku-cost") as HTMLInputElement;
    expect(costInput.value).toBe("2100");
  });

  it("renders cost field blank when cost is null", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_NULL}
          model={MODEL_MAT}
          onClose={() => {}}
        />,
      ),
    );
    const costInput = screen.getByTestId("edit-sku-cost") as HTMLInputElement;
    expect(costInput.value).toBe("");
  });

  it("shows live plan margin when price + cost are set", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_SET}
          model={MODEL_MAT}
          onClose={() => {}}
        />,
      ),
    );
    // price=3500 cost=2100 → margin=1400 (40%)
    const marginEl = screen.getByTestId("edit-sku-margin");
    expect(marginEl.textContent).toContain("1,400");
    expect(marginEl.textContent).toContain("40.0%");
  });

  it("shows 'set cost to compute' hint when cost is null", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_NULL}
          model={MODEL_MAT}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/set cost to compute/)).toBeInTheDocument();
  });

  it("uses 'base margin' label for sofa model", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_SOFA}
          model={MODEL_SOFA}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText("base margin")).toBeInTheDocument();
  });

  it("uses 'plan margin' label for non-sofa model", () => {
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_SET}
          model={MODEL_MAT}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText("plan margin")).toBeInTheDocument();
  });

  it("sends cost: null when cost field is cleared and Save is clicked", async () => {
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_SET });
    const onClose = vi.fn();
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_SET}
          model={MODEL_MAT}
          onClose={onClose}
        />,
      ),
    );
    // Clear the cost field
    fireEvent.change(screen.getByTestId("edit-sku-cost"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch.cost).toBeNull();
  });

  it("sends cost: number when cost field is changed and Save is clicked", async () => {
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_NULL });
    const onClose = vi.fn();
    render(
      wrap(
        <EditSkuModal
          sku={SKU_COST_NULL}
          model={MODEL_MAT}
          onClose={onClose}
        />,
      ),
    );
    fireEvent.change(screen.getByTestId("edit-sku-cost"), { target: { value: "1800" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch.cost).toBe(1800);
  });

  // 0186 — PWP reward price round-trip, same gate/shape as cost.
  it("renders the PWP price field for a principal (blank when unset)", () => {
    mockRole = "principal";
    render(wrap(<EditSkuModal sku={SKU_COST_NULL} model={MODEL_MAT} onClose={() => {}} />));
    const pwpInput = screen.getByTestId("edit-sku-pwp-price") as HTMLInputElement;
    expect(pwpInput).toBeInTheDocument();
    expect(pwpInput.value).toBe("");
  });

  it("sends pwpPrice: number when the PWP price field is set and Save is clicked", async () => {
    mockRole = "principal";
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_NULL });
    render(wrap(<EditSkuModal sku={SKU_COST_NULL} model={MODEL_MAT} onClose={vi.fn()} />));
    fireEvent.change(screen.getByTestId("edit-sku-pwp-price"), { target: { value: "999" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch.pwpPrice).toBe(999);
  });

  it("does NOT send pwpPrice when it is left unchanged", async () => {
    mockRole = "principal";
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_NULL });
    render(wrap(<EditSkuModal sku={SKU_COST_NULL} model={MODEL_MAT} onClose={vi.fn()} />));
    // change only the description; pwpPrice untouched (was null → stays unset)
    fireEvent.change(screen.getByTestId("edit-sku-description"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch).not.toHaveProperty("pwpPrice");
  });

  it("non-principal gets a read-only PWP price (no input) + never sends it", async () => {
    mockRole = "operation";
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_SET });
    const skuWithPwp: ProductSkuDto = { ...SKU_COST_SET, pwpPrice: 1500 };
    render(wrap(<EditSkuModal sku={skuWithPwp} model={MODEL_MAT} onClose={vi.fn()} />));
    expect(screen.queryByTestId("edit-sku-pwp-price")).not.toBeInTheDocument();
    expect(screen.getByTestId("edit-sku-pwp-price-readonly").textContent).toContain("1,500");
    fireEvent.change(screen.getByTestId("edit-sku-description"), { target: { value: "y" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch).not.toHaveProperty("pwpPrice");
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

  it("EditSkuModal: non-principal gets read-only price/cost, no input fields", () => {
    mockRole = "operation";
    render(wrap(<EditSkuModal sku={SKU_COST_SET} model={MODEL_MAT} onClose={() => {}} />));
    expect(screen.queryByTestId("edit-sku-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-sku-cost")).not.toBeInTheDocument();
    expect(screen.getByTestId("edit-sku-price-readonly").textContent).toContain("3,500");
    expect(screen.getByTestId("edit-sku-cost-readonly").textContent).toContain("2,100");
    // Name is still editable for internal users.
    expect(screen.getByTestId("edit-sku-name")).toBeInTheDocument();
  });

  it("EditSkuModal: non-principal Save never sends price/cost (only description/name)", async () => {
    mockRole = "operation";
    mockPatchMutateAsync.mockResolvedValue({ sku: SKU_COST_SET });
    render(wrap(<EditSkuModal sku={SKU_COST_SET} model={MODEL_MAT} onClose={vi.fn()} />));
    fireEvent.change(screen.getByTestId("edit-sku-description"), {
      target: { value: "new desc" },
    });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockPatchMutateAsync).toHaveBeenCalledOnce());
    const args = mockPatchMutateAsync.mock.calls[0][0];
    expect(args.patch.description).toBe("new desc");
    expect(args.patch).not.toHaveProperty("price");
    expect(args.patch).not.toHaveProperty("cost");
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
