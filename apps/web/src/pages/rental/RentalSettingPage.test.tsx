/**
 * RentalSettingPage — the rent & buy offer config (0248/0249 + 0264). Mirrors the
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
import { MemoryRouter } from "react-router-dom";
import RentalSettingPage from "./RentalSettingPage";

/** The page reads `?section=` — mount it inside a router at the family under test. */
function renderPage(props: { isPrincipal: boolean }, section = "bedframe") {
  return render(
    <MemoryRouter initialEntries={[`/principal?tab=rental-setting&section=${section}`]}>
      <RentalSettingPage {...props} />
    </MemoryRouter>,
  );
}

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// --- queries hooks -----------------------------------------------------------

interface ConfigData {
  servicePackages: unknown[];
  rentalPlans: unknown[];
  rentalOffers: unknown[];
  buyPrices: unknown[];
  offerServices: unknown[];
  agreementTemplates: unknown[];
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
const mockCreateTemplate = vi.fn();
const mockPatchTemplate = vi.fn();

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
  useCreateAgreementTemplate: () => ({
    mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
      mockCreateTemplate(vars);
      opts?.onSuccess?.();
    },
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  usePatchAgreementTemplate: () => ({
    mutate: mockPatchTemplate,
    mutateAsync: vi.fn(),
    isPending: false,
  }),
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
      agreementTemplates: [],
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
describe("RentalSettingPage — sections + empty states", () => {
  it("opens on a product family and shows that family's empty state", () => {
    renderPage({ isPrincipal: true });
    expect(screen.getByRole("heading", { name: "Rental" })).toBeInTheDocument();
    expect(screen.getByText("Bed frame offers")).toBeInTheDocument();
    expect(screen.getByTestId("offers-empty")).toHaveTextContent("No bed frame offer yet");
    // The care plans live on their own tab, not underneath the offers.
    expect(screen.queryByTestId("packages-empty")).not.toBeInTheDocument();
  });

  it("the service-package tab holds the care plans", () => {
    setConfig({ servicePackages: [makePackage()] });
    renderPage({ isPrincipal: true }, "service");
    expect(screen.getByText("Service packages")).toBeInTheDocument();
    expect(screen.getByTestId("pkg-row-pkg-1")).toBeInTheDocument();
    // No offer list — and no "+ New offer" (a care plan is not an offer).
    expect(screen.queryByTestId("offers-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offer-add")).not.toBeInTheDocument();
  });

  it("each family tab counts what it holds", () => {
    setConfig({ rentalOffers: [makeOffer()], servicePackages: [makePackage()] });
    renderPage({ isPrincipal: true });
    expect(screen.getByTestId("pm-tab-bedframe")).toHaveTextContent("Bed frame (1)");
    expect(screen.getByTestId("pm-tab-mattress")).toHaveTextContent("Mattress (0)");
    expect(screen.getByTestId("pm-tab-service")).toHaveTextContent("Service package (1)");
  });

  it("shows the loading state while the config is pending", () => {
    configState = { data: undefined, isPending: true, error: null };
    renderPage({ isPrincipal: true });
    expect(screen.getByText(/Loading rental config/)).toBeInTheDocument();
  });

  it("shows the error state when the config fails", () => {
    configState = { data: undefined, isPending: false, error: new Error("boom") };
    renderPage({ isPrincipal: true });
    expect(screen.getByText(/Failed to load the rental config/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------
describe("RentalSettingPage — gating", () => {
  it("principal: shows + New offer and + New service package", () => {
    renderPage({ isPrincipal: true });
    expect(screen.getByTestId("package-add")).toBeInTheDocument();
    expect(screen.getByTestId("offer-add")).toBeInTheDocument();
  });

  it("non-principal: no add buttons, offer row read-only (View, no delete/toggle)", () => {
    setConfig({
      servicePackages: [makePackage()],
      rentalOffers: [makeOffer()],
      rentalPlans: [makePlan()],
    });
    renderPage({ isPrincipal: false });
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
describe("RentalSettingPage — offer rows", () => {
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
    renderPage({ isPrincipal: true });
    const row = screen.getByTestId(`offer-row-${OFFER_ID}`);
    expect(row).toHaveTextContent("Kayu Bed Frame");
    expect(row).toHaveTextContent("59");
    expect(row).toHaveTextContent("69");
    expect(row).toHaveTextContent("Buy 1 target");
    expect(screen.getByTestId(`offer-stripe-${OFFER_ID}`)).toHaveTextContent("1 of 2 synced");
  });

  it("the On sale toggle patches the offer", () => {
    setConfig({ rentalOffers: [makeOffer()] });
    renderPage({ isPrincipal: true });
    fireEvent.click(screen.getByTestId(`offer-active-${OFFER_ID}`));
    expect(mockPatchOffer).toHaveBeenCalledWith({ id: OFFER_ID, patch: { active: false } });
  });

  it("the Sync button re-projects every unsynced rent line", () => {
    setConfig({ rentalOffers: [makeOffer()], rentalPlans: [makePlan({ stripePriceId: null })] });
    renderPage({ isPrincipal: true });
    fireEvent.click(screen.getByTestId(`offer-sync-${OFFER_ID}`));
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
    expect(mockSyncPlan.mock.calls[0][0]).toBe("plan-1");
  });
});

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------
describe("RentalSettingPage — model picker", () => {
  it("creates the offer off a PICKED model (never a typed SKU code)", () => {
    renderPage({ isPrincipal: true });
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
    renderPage({ isPrincipal: true });
    fireEvent.click(screen.getByTestId("offer-add"));
    expect(screen.queryByTestId("offer-model-KAYU")).not.toBeInTheDocument();
    expect(screen.getByTestId("offer-model-empty")).toBeInTheDocument();
  });

  it("a sofa offer starts in both-modes (compartment build AND combo)", () => {
    catalogState = { data: makeCatalog("sofa"), isPending: false, error: null };
    renderPage({ isPrincipal: true }, "sofa");
    fireEvent.click(screen.getByTestId("offer-add"));
    fireEvent.click(screen.getByTestId("offer-model-KAYU"));
    expect(mockCreateOffer.mock.calls[0][0]).toMatchObject({ pricingMode: "both" });
  });
});

// ---------------------------------------------------------------------------
// Service packages — the plan IS a SKU
// ---------------------------------------------------------------------------
describe("RentalSettingPage — service packages", () => {
  it("previews the auto SKU and sends the category in the create payload", () => {
    renderPage({ isPrincipal: true }, "service");
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
    renderPage({ isPrincipal: true }, "service");
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
    renderPage({ isPrincipal: true });
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


// ---------------------------------------------------------------------------
// Agreements — the wording (0267)
// ---------------------------------------------------------------------------

function makeTemplate(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tpl-1",
    docKey: "rent_to_own",
    name: "Rental Agreement — Terms and Conditions (v5)",
    bindsTo: ["mattress", "bedframe", "sofa"],
    version: 1,
    body: [
      { kind: "title", text: "RENTAL AGREEMENT" },
      { kind: "p", text: "Between Carress Sdn. Bhd. and {{customer.name}}." },
    ],
    fields: ["customer.name"],
    effectiveFrom: "2026-07-06",
    active: true,
    createdAt: "2026-07-26T00:00:00Z",
    updatedAt: "2026-07-26T00:00:00Z",
    updatedBy: null,
    ...over,
  };
}

describe("RentalSettingPage — agreements", () => {
  it("offers to load the supplied wording when nothing is saved yet", () => {
    renderPage({ isPrincipal: true }, "agreements");
    expect(screen.getByTestId("agreements-empty")).toBeInTheDocument();
    expect(screen.getByTestId("agreement-load-supplied")).toBeInTheDocument();
  });

  it("saving the supplied wording sends it VERBATIM with its bindings", () => {
    renderPage({ isPrincipal: true }, "agreements");
    fireEvent.click(screen.getByTestId("agreement-load-supplied"));
    // The paste box is pre-filled with the customer's own words.
    const box = screen.getByTestId("agreement-text") as HTMLTextAreaElement;
    expect(box.value).toContain("RENTAL AGREEMENT");
    expect(box.value).toContain("Carress Sdn. Bhd.");
    // …and NOT with anything we invented.
    expect(box.value).not.toContain("ownership transfers");
    expect(box.value.toLowerCase()).not.toContain("free service package");

    fireEvent.click(screen.getByText("Save as new version"));
    expect(mockCreateTemplate).toHaveBeenCalledTimes(1);
    const sent = mockCreateTemplate.mock.calls[0][0] as {
      docKey: string;
      bindsTo: string[];
      body: Array<{ kind: string; text: string }>;
    };
    expect(sent.docKey).toBe("rent_to_own");
    expect(sent.bindsTo).toEqual(["mattress", "bedframe", "sofa"]);
    expect(sent.body[0]).toMatchObject({ kind: "title", text: "RENTAL AGREEMENT" });
    expect(sent.body.length).toBeGreaterThan(30);
  });

  it("a saved document lists its version and previews the wording", () => {
    setConfig({ agreementTemplates: [makeTemplate()] });
    renderPage({ isPrincipal: true }, "agreements");
    expect(screen.getByTestId("agreement-doc-rent_to_own")).toBeInTheDocument();
    expect(screen.getByTestId("agreement-version-tpl-1")).toHaveTextContent("v1");
    fireEvent.click(screen.getByTestId("agreement-preview-tpl-1"));
    expect(screen.getByTestId("agreement-body")).toHaveTextContent("RENTAL AGREEMENT");
  });

  it("only the newest version offers a new version, and the load button disappears once saved", () => {
    setConfig({ agreementTemplates: [makeTemplate(), makeTemplate({ id: "tpl-2", version: 2 })] });
    renderPage({ isPrincipal: true }, "agreements");
    expect(screen.getByTestId("agreement-new-version-tpl-2")).toBeInTheDocument();
    expect(screen.queryByTestId("agreement-new-version-tpl-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agreement-load-supplied")).not.toBeInTheDocument();
  });

  it("non-principal sees the wording but cannot author it", () => {
    setConfig({ agreementTemplates: [makeTemplate()] });
    renderPage({ isPrincipal: false }, "agreements");
    expect(screen.getByTestId("agreement-preview-tpl-1")).toBeInTheDocument();
    expect(screen.queryByTestId("agreement-new-version-tpl-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agreement-load-supplied")).not.toBeInTheDocument();
  });
});
