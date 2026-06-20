/**
 * SkuMasterTab — cost + margin rendering tests.
 *
 * Covers the Task-1 requirements:
 *  - cost === null renders "not set" (never as "0" or empty)
 *  - cost set renders the RM value
 *  - margin muted when cost is null
 *  - margin shows RM amount + pct when cost is set
 *  - inline edit-mode cost input: blank → null patch, numeric → numeric patch
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
  // Default every test to the Master Admin (principal) — the price/cost lock
  // tests below override this to a non-principal role.
  mockRole = "principal";
});

describe("SkuMasterTab — cost column", () => {
  it("shows 'not set' (muted) when cost is null — never '0' or blank", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_NULL])} />));
    const costCell = screen.getByTestId("sku-cost-CLOUD-QUEEN");
    expect(costCell.textContent).toContain("not set");
    expect(costCell.textContent).not.toContain("RM 0");
    expect(costCell.textContent).not.toBe("");
  });

  it("shows the RM cost value when cost is set", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    const costCell = screen.getByTestId("sku-cost-CLOUD-KING");
    expect(costCell.textContent).toContain("2,100");
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

describe("SkuMasterTab — Edit Prices mode (inline cost editing)", () => {
  it("shows cost input in Edit Prices mode with defaultValue from sku.cost", () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const costInput = screen.getByLabelText("CLOUD-KING cost") as HTMLInputElement;
    expect(costInput).toBeTruthy();
    expect(costInput.value).toBe("2100");
  });

  it("blank cost input on blur dispatches patch with cost: null", async () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const costInput = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.change(costInput, { target: { value: "" } });
    fireEvent.blur(costInput);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    const call = mockPatchMutate.mock.calls[0][0];
    expect(call.id).toBe("s2");
    expect(call.patch.cost).toBeNull();
  });

  it("numeric cost input on blur dispatches patch with cost: number", async () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_NULL])} />));
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const costInput = screen.getByLabelText("CLOUD-QUEEN cost");
    fireEvent.change(costInput, { target: { value: "1500" } });
    fireEvent.blur(costInput);
    await waitFor(() => expect(mockPatchMutate).toHaveBeenCalledOnce());
    const call = mockPatchMutate.mock.calls[0][0];
    expect(call.id).toBe("s1");
    expect(call.patch.cost).toBe(1500);
  });

  it("same cost value on blur does not dispatch patch (no-op)", async () => {
    render(wrap(<SkuMasterTab catalog={makeCatalog([SKU_COST_SET])} />));
    fireEvent.click(screen.getByTestId("sku-edit-prices"));
    const costInput = screen.getByLabelText("CLOUD-KING cost");
    // Do NOT change; blur with same value
    fireEvent.blur(costInput);
    // no patch dispatch
    expect(mockPatchMutate).not.toHaveBeenCalled();
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
    // The cost cell still shows the value read-only (no input).
    const costCell = screen.getByTestId("sku-cost-CLOUD-KING");
    expect(costCell.textContent).toContain("2,100");
    expect(costCell.querySelector("input")).toBeNull();
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
