/**
 * RentalTab — the rent & buy offer config (0248/0249 + 0264). Mirrors the
 * PromoTab test style with mocked query/mutation hooks.
 *
 * Covers:
 *  - Both sections render with their dormancy-explaining empty states.
 *  - Principal vs non-principal gating (+ New offer / + New package present or
 *    absent; offer rows read-only for non-principal).
 *  - An offer row summarises its lanes, fee range and Stripe sync count.
 *  - The model picker creates the offer (one per model — taken models hidden).
 *  - A service package previews its auto SKU (SVC-{CAT}-{TYPE}-{n}Y{visits})
 *    and sends `category` in the create payload.
 *  - The editor: the rent matrix rows come from the model's live SKUs, a typed
 *    fee creates the rent line with the offer id + line kind, an option price
 *    lands in the overlay PATCH, and a fabric colour can be ticked one by one.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RentalTab from "./RentalTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// --- queries hooks -----------------------------------------------------------

interface ConfigData {
  servicePackages: unknown[];
  rentalPlans: unknown[];
  rentalOffers: unknown[];
  buyPrices: unknown[];
  offerServices: unknown[];
}
interface ConfigState {
  data: ConfigData | undefined;
  isPending: boolean;
  error: unknown;
}
let configState: ConfigState;
let catalogState: { data: unknown; isPending: boolean; error: unknown };

const mockCreatePkg = vi.fn();
const mockPatchPkg = vi.fn();
const mockDeletePkg = vi.fn();
const mockCreatePlan = vi.fn();
const mockPatchPlan = vi.fn();
const mockDeletePlan = vi.fn();
const mockSyncPlan = vi.fn();
const mockCreateOffer = vi.fn();
const mockPatchOffer = vi.fn();
const mockDeleteOffer = vi.fn();
const mockCreateBuy = vi.fn();
const mockPatchBuy = vi.fn();
const mockDeleteBuy = vi.fn();
const mockCreateSvc = vi.fn();
const mockPatchSvc = vi.fn();
const mockDeleteSvc = vi.fn();

vi.mock("@/lib/queries", () => {
  /** Mutation hook whose mutateAsync records the payload (the editor awaits).
   *  The spy is read at HOOK-CALL time — vi.mock is hoisted above the `const`
   *  spy declarations, so touching them in the factory body would throw. */
  const asyncHook = (spy: () => ReturnType<typeof vi.fn>) => () => ({
    mutate: (vars: unknown) => spy()(vars),
    mutateAsync: async (vars: unknown) => {
      spy()(vars);
      return { ok: true };
    },
    isPending: false,
  });
  return {
  useRentalConfig: () => configState,
  useCatalog: () => catalogState,
  useCreateServicePackage: () => ({ mutate: mockCreatePkg, mutateAsync: vi.fn(), isPending: false }),
  usePatchServicePackage: () => ({ mutate: mockPatchPkg, mutateAsync: vi.fn(), isPending: false }),
  useDeleteServicePackage: () => ({ mutate: mockDeletePkg, mutateAsync: vi.fn(), isPending: false }),
  useCreateRentalPlan: asyncHook(() => mockCreatePlan),
  usePatchRentalPlan: asyncHook(() => mockPatchPlan),
  useDeleteRentalPlan: asyncHook(() => mockDeletePlan),
  useSyncRentalPlanStripe: () => ({ mutate: mockSyncPlan, mutateAsync: vi.fn(), isPending: false }),
  useCreateRentalOffer: () => ({
    mutate: (vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) => {
      mockCreateOffer(vars);
      opts?.onSuccess?.({ offer: { id: "offer-1" } });
    },
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePatchRentalOffer: asyncHook(() => mockPatchOffer),
  useDeleteRentalOffer: asyncHook(() => mockDeleteOffer),
  useCreateRentalBuyPrice: asyncHook(() => mockCreateBuy),
  usePatchRentalBuyPrice: asyncHook(() => mockPatchBuy),
  useDeleteRentalBuyPrice: asyncHook(() => mockDeleteBuy),
  useCreateRentalOfferService: asyncHook(() => mockCreateSvc),
  usePatchRentalOfferService: asyncHook(() => mockPatchSvc),
  useDeleteRentalOfferService: asyncHook(() => mockDeleteSvc),
  };
});

// --- fixtures ---------------------------------------------------------------

const MODEL_ID = "model-1";
const OFFER_ID = "offer-1";

function makePackage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pkg-1",
    name: "Mattress Care Plan",
    serviceType: "cleaning",
    durationMonths: 24,
    visitsPerYear: 2,
    price: 399,
    sku: "SVC-MAT-CLEAN-2Y2",
    active: true,
    sortOrder: 0,
    category: "mattress",
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    updatedBy: null,
    ...over,
  };
}

function makeOffer(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: OFFER_ID,
    modelId: MODEL_ID,
    pricingMode: "variant",
    rentEnabled: true,
    buyEnabled: true,
    termsMonths: [60, 84],
    optionPrices: {},
    surcharges: [],
    supplierRatePct: 49,
    commissionBasePct: 20,
    active: true,
    notes: null,
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    updatedBy: null,
    ...over,
  };
}

function makePlan(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "plan-1",
    sku: "CLOUD-K",
    termMonths: 84,
    monthlyFee: 59,
    supplierRatePct: 49,
    commissionBasePct: 20,
    includedPackageId: null,
    active: true,
    stripeProductId: "prod_X",
    stripePriceId: "price_X",
    offerId: OFFER_ID,
    comboId: null,
    lineKind: "unit",
    gifts: [],
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    updatedBy: null,
    ...over,
  };
}

/** Bed frame model: one size SKU, a leg pool, one fabric series (the colour
 *  axis lives INSIDE the fabric — a frame has no separate colour choice). */
function makeCatalog(category = "bedframe") {
  return {
    models: [
      {
        id: MODEL_ID,
        category,
        modelKey: "KAYU",
        name: "Kayu Bed Frame",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
        discontinuedAt: null,
        photoUrl: null,
        allowedOptions: {},
      },
    ],
    skus: [
      {
        id: "sku-q",
        modelId: MODEL_ID,
        sku: "KAYU-Q",
        variant: "Queen",
        variantKind: "size",
        price: 1890,
        supplierId: null,
        cost: null,
        discontinuedAt: null,
        posActive: true,
        description: null,
        compartmentId: null,
        pwpPrice: null,
        pricesBySize: null,
      },
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: {},
    optionPools: [
      {
        id: "p1",
        pool: "bedframe_leg_height",
        value: '2"',
        label: null,
        dimensions: null,
        surcharge: 0,
        active: true,
        sortOrder: 1,
      },
      {
        id: "p2",
        pool: "bedframe_leg_height",
        value: '5"',
        label: null,
        dimensions: null,
        surcharge: 120,
        active: true,
        sortOrder: 2,
      },
    ],
    fabrics: [
      {
        id: "f1",
        fabricCode: "CG-001",
        series: "CG",
        description: "CG-001 Pearl",
        supplierCode: null,
        sofaTier: "PRICE_1",
        bedframeTier: "PRICE_1",
        active: true,
        sortOrder: 1,
      },
      {
        id: "f2",
        fabricCode: "CG-008",
        series: "CG",
        description: "CG-008 Charcoal",
        supplierCode: null,
        sofaTier: "PRICE_1",
        bedframeTier: "PRICE_1",
        active: true,
        sortOrder: 2,
      },
    ],
    specialAddons: [],
    sofaCombos: [],
    sofaCompartments: [],
    modelSofaCompartments: [],
  };
}

function setConfig(over: Partial<ConfigData> = {}) {
  configState = {
    data: {
      servicePackages: [],
      rentalPlans: [],
      rentalOffers: [],
      buyPrices: [],
      offerServices: [],
      ...over,
    },
    isPending: false,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setConfig();
  catalogState = { data: makeCatalog(), isPending: false, error: null };
});

// ---------------------------------------------------------------------------
// Sections + empty states
// ---------------------------------------------------------------------------
describe("RentalTab — sections + empty states", () => {
  it("renders both section headings and the empty states", () => {
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText("Service packages")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();
    expect(screen.getByTestId("packages-empty")).toBeInTheDocument();
    expect(screen.getByTestId("offers-empty")).toHaveTextContent(
      "No offers yet — pick a model to author the first rent-to-own or outright offer.",
    );
  });

  it("shows the loading state while the config is pending", () => {
    configState = { data: undefined, isPending: true, error: null };
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText(/Loading rental config/)).toBeInTheDocument();
  });

  it("shows the error state when the config fails", () => {
    configState = { data: undefined, isPending: false, error: new Error("boom") };
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText(/Failed to load the rental config/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------
describe("RentalTab — gating", () => {
  it("principal: shows + New offer and + New service package", () => {
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByTestId("package-add")).toBeInTheDocument();
    expect(screen.getByTestId("offer-add")).toBeInTheDocument();
  });

  it("non-principal: no add buttons, offer row read-only (View, no delete/toggle)", () => {
    setConfig({
      servicePackages: [makePackage()],
      rentalOffers: [makeOffer()],
      rentalPlans: [makePlan()],
    });
    render(<RentalTab isPrincipal={false} />);
    expect(screen.queryByTestId("package-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offer-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`offer-delete-${OFFER_ID}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`offer-active-${OFFER_ID}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`offer-edit-${OFFER_ID}`)).toHaveTextContent("View");
  });
});

// ---------------------------------------------------------------------------
// Offer row summary
// ---------------------------------------------------------------------------
describe("RentalTab — offer rows", () => {
  it("summarises the model, the monthly range and the Stripe sync count", () => {
    setConfig({
      rentalOffers: [makeOffer()],
      rentalPlans: [
        makePlan(),
        makePlan({ id: "plan-2", termMonths: 60, monthlyFee: 69, stripePriceId: null }),
      ],
      buyPrices: [
        {
          id: "b1",
          offerId: OFFER_ID,
          sku: "KAYU-Q",
          comboId: null,
          price: 1690,
          gifts: [],
          active: true,
          createdAt: "",
          updatedAt: "",
          updatedBy: null,
        },
      ],
    });
    render(<RentalTab isPrincipal={true} />);
    const row = screen.getByTestId(`offer-row-${OFFER_ID}`);
    expect(row).toHaveTextContent("Kayu Bed Frame");
    expect(row).toHaveTextContent("59");
    expect(row).toHaveTextContent("69");
    expect(row).toHaveTextContent("Buy 1 target");
    expect(screen.getByTestId(`offer-stripe-${OFFER_ID}`)).toHaveTextContent("1 of 2 synced");
  });

  it("the On sale toggle patches the offer", () => {
    setConfig({ rentalOffers: [makeOffer()] });
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId(`offer-active-${OFFER_ID}`));
    expect(mockPatchOffer).toHaveBeenCalledWith({ id: OFFER_ID, patch: { active: false } });
  });

  it("the Sync button re-projects every unsynced rent line", () => {
    setConfig({ rentalOffers: [makeOffer()], rentalPlans: [makePlan({ stripePriceId: null })] });
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId(`offer-sync-${OFFER_ID}`));
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
    expect(mockSyncPlan.mock.calls[0][0]).toBe("plan-1");
  });
});

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------
describe("RentalTab — model picker", () => {
  it("creates the offer off a PICKED model (never a typed SKU code)", () => {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("offer-add"));
    fireEvent.click(screen.getByTestId("offer-model-KAYU"));
    expect(mockCreateOffer).toHaveBeenCalledTimes(1);
    expect(mockCreateOffer.mock.calls[0][0]).toMatchObject({
      modelId: MODEL_ID,
      pricingMode: "variant",
      rentEnabled: true,
      buyEnabled: true,
    });
  });

  it("a model that already has an offer is not offered again (UNIQUE model_id)", () => {
    setConfig({ rentalOffers: [makeOffer()] });
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("offer-add"));
    expect(screen.queryByTestId("offer-model-KAYU")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-model-empty")).toBeInTheDocument();
  });

  it("a sofa offer starts in both-modes (compartment build AND combo)", () => {
    catalogState = { data: makeCatalog("sofa"), isPending: false, error: null };
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("offer-add"));
    fireEvent.click(screen.getByTestId("offer-model-KAYU"));
    expect(mockCreateOffer.mock.calls[0][0]).toMatchObject({ pricingMode: "both" });
  });
});

// ---------------------------------------------------------------------------
// Service packages — the plan IS a SKU
// ---------------------------------------------------------------------------
describe("RentalTab — service packages", () => {
  it("previews the auto SKU and sends the category in the create payload", () => {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("package-add"));
    fireEvent.change(screen.getByTestId("pkg-name"), { target: { value: "Sofa Care — 3 years" } });
    fireEvent.click(screen.getByTestId("pkg-category-sofa"));
    fireEvent.click(screen.getByTestId("pkg-duration-36"));
    fireEvent.change(screen.getByTestId("pkg-visits"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("pkg-price"), { target: { value: "499" } });

    expect(screen.getByTestId("pkg-sku-preview")).toHaveTextContent("SVC-SOFA-CLEAN-3Y3");

    fireEvent.click(screen.getByText("Create package"));
    expect(mockCreatePkg.mock.calls[0][0]).toMatchObject({
      name: "Sofa Care — 3 years",
      category: "sofa",
      serviceType: "cleaning",
      durationMonths: 36,
      visitsPerYear: 3,
      price: 499,
      active: true,
    });
  });

  it("the row shows the family it serves and its minted SKU", () => {
    setConfig({ servicePackages: [makePackage()] });
    render(<RentalTab isPrincipal={true} />);
    const row = screen.getByTestId("pkg-row-pkg-1");
    expect(row).toHaveTextContent("mattress");
    expect(row).toHaveTextContent("SVC-MAT-CLEAN-2Y2");
    expect(row).toHaveTextContent("2 / yr · 4 total");
  });
});

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------
describe("RentalOfferEditor — via the tab", () => {
  function openEditor() {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId(`offer-edit-${OFFER_ID}`));
  }

  it("the rent matrix rows come from the model's live SKUs, one column per term", () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    expect(screen.getByTestId("rent-row-sku:KAYU-Q")).toHaveTextContent("Queen");
    expect(screen.getByTestId("rent-fee-sku:KAYU-Q-60")).toBeInTheDocument();
    expect(screen.getByTestId("rent-fee-sku:KAYU-Q-84")).toBeInTheDocument();
  });

  it("a typed fee creates the rent line with the offer id, target and line kind", async () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.change(screen.getByTestId("rent-fee-sku:KAYU-Q-84"), { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockCreatePlan).toHaveBeenCalled());
    expect(mockCreatePlan.mock.calls[0][0]).toMatchObject({
      sku: "KAYU-Q",
      lineKind: "unit",
      termMonths: 84,
      monthlyFee: 45,
      offerId: OFFER_ID,
    });
  });

  it("an option price lands in the overlay PATCH (once vs every month)", async () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.click(screen.getByTestId('option-on-leg_heights-5"'));
    fireEvent.change(screen.getByTestId('option-monthly-leg_heights-5"'), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockPatchOffer).toHaveBeenCalled());
    const call = mockPatchOffer.mock.calls[0][0] as {
      patch: {
        optionPrices: Record<
          string,
          { values: Record<string, { on: boolean; monthly: number | null }> }
        >;
      };
    };
    expect(call.patch.optionPrices.leg_heights!.values['5"']).toMatchObject({
      on: true,
      monthly: 5,
    });
  });

  it("fabric drills down to individual colours — a tick per colour", async () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.click(screen.getByTestId("fabric-toggle-CG"));
    fireEvent.click(screen.getByTestId("fabric-color-on-CG-008"));
    fireEvent.change(screen.getByTestId("fabric-color-monthly-CG-008"), { target: { value: "4" } });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockPatchOffer).toHaveBeenCalled());
    const call = mockPatchOffer.mock.calls[0][0] as {
      patch: {
        optionPrices: {
          fabrics?: {
            series: Record<string, { colors: Record<string, { on: boolean; monthly: number | null }> }>;
          };
        };
      };
    };
    expect(call.patch.optionPrices.fabrics!.series.CG!.colors["CG-008"]).toMatchObject({
      on: true,
      monthly: 4,
    });
  });

  it("a surcharge slot is added by hand and saved with the offer", async () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.click(screen.getByTestId("surcharge-add"));
    fireEvent.change(screen.getByTestId("surcharge-label-0"), { target: { value: "Delivery" } });
    fireEvent.change(screen.getByTestId("surcharge-once-0"), { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("surcharge-required-0"));
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockPatchOffer).toHaveBeenCalled());
    const call = mockPatchOffer.mock.calls[0][0] as {
      patch: { surcharges: Array<{ label: string; oneTime: number; required: boolean }> };
    };
    expect(call.patch.surcharges[0]).toMatchObject({
      label: "Delivery",
      oneTime: 150,
      required: true,
    });
  });

  it("refuses a split that pays out more than it collects", () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.change(screen.getByTestId("offer-supplier-pct"), { target: { value: "70" } });
    fireEvent.change(screen.getByTestId("offer-commission-pct"), { target: { value: "40" } });
    expect(screen.getByTestId("offer-split-error")).toBeInTheDocument();
    expect(screen.getByTestId("offer-save")).toBeDisabled();
  });

  it("a ticked buy target creates its outright price row", async () => {
    setConfig({ rentalOffers: [makeOffer()] });
    openEditor();
    fireEvent.click(screen.getByTestId("buy-on-sku:KAYU-Q"));
    fireEvent.change(screen.getByTestId("buy-price-sku:KAYU-Q"), { target: { value: "1690" } });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockCreateBuy).toHaveBeenCalled());
    expect(mockCreateBuy.mock.calls[0][0]).toMatchObject({
      offerId: OFFER_ID,
      input: { sku: "KAYU-Q", price: 1690 },
    });
  });

  it("attaching a service package free on the rent lane sends the visit count", async () => {
    setConfig({
      rentalOffers: [makeOffer()],
      servicePackages: [makePackage({ category: "bedframe" })],
    });
    openEditor();
    fireEvent.click(screen.getByTestId("offer-service-on-pkg-1"));
    fireEvent.change(screen.getByTestId("offer-service-lane-pkg-1"), { target: { value: "rent" } });
    fireEvent.change(screen.getByTestId("offer-service-visits-pkg-1"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("offer-save"));
    await waitFor(() => expect(mockCreateSvc).toHaveBeenCalled());
    expect(mockCreateSvc.mock.calls[0][0]).toMatchObject({
      offerId: OFFER_ID,
      input: { packageId: "pkg-1", freeLane: "rent", freeVisits: 2 },
    });
  });

  it("a mattress plan never shows on a bed-frame offer (the category token filters)", () => {
    setConfig({
      rentalOffers: [makeOffer()],
      servicePackages: [makePackage({ category: "mattress" })],
    });
    openEditor();
    expect(screen.queryByTestId("offer-service-on-pkg-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-services-empty")).toBeInTheDocument();
  });
});
