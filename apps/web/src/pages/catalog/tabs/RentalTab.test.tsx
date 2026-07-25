/**
 * RentalTab — Rental + Service Plan config (migrations 0248/0249). Mirrors the
 * PromoTab test style with mocked mutation hooks.
 *
 * Covers:
 *  - Both sections render with their dormancy-explaining empty states.
 *  - Principal vs non-principal gating ("+ New plan" / "+ New package" present
 *    or absent; rows read-only for non-principal).
 *  - Populated tables render the derived columns (serviceVisitsTotal /
 *    rentalContractValue).
 *  - Creating a plan fires useCreateRentalPlan with the camelCase payload
 *    { sku, termMonths: 84, monthlyFee: 59, supplierRatePct: 49,
 *      commissionBasePct: 20, ... } and the live preview math line renders
 *    ("4,956" contract value + "28.91" supplier share).
 *  - The package Active toggle fires usePatchServicePackage({ id, patch }).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RentalTab from "./RentalTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// --- queries hooks -----------------------------------------------------------

interface ConfigState {
  data: { servicePackages: unknown[]; rentalPlans: unknown[] } | undefined;
  isPending: boolean;
  error: unknown;
}
let configState: ConfigState;

const mockCreatePkg = vi.fn();
const mockPatchPkg = vi.fn();
const mockDeletePkg = vi.fn();
const mockCreatePlan = vi.fn();
const mockPatchPlan = vi.fn();
const mockDeletePlan = vi.fn();
const mockSyncPlan = vi.fn();

vi.mock("@/lib/queries", () => ({
  useRentalConfig: () => configState,
  useCreateServicePackage: () => ({ mutate: mockCreatePkg, mutateAsync: vi.fn(), isPending: false }),
  usePatchServicePackage: () => ({ mutate: mockPatchPkg, mutateAsync: vi.fn(), isPending: false }),
  useDeleteServicePackage: () => ({ mutate: mockDeletePkg, mutateAsync: vi.fn(), isPending: false }),
  useCreateRentalPlan: () => ({ mutate: mockCreatePlan, mutateAsync: vi.fn(), isPending: false }),
  usePatchRentalPlan: () => ({ mutate: mockPatchPlan, mutateAsync: vi.fn(), isPending: false }),
  useDeleteRentalPlan: () => ({ mutate: mockDeletePlan, mutateAsync: vi.fn(), isPending: false }),
  useSyncRentalPlanStripe: () => ({ mutate: mockSyncPlan, mutateAsync: vi.fn(), isPending: false }),
}));

// --- fixtures ---------------------------------------------------------------

function makePackage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pkg-1",
    name: "Mattress Care Plan",
    serviceType: "cleaning",
    durationMonths: 24,
    visitsPerYear: 2,
    price: 399,
    sku: "SVC-CLEAN-2Y",
    active: true,
    sortOrder: 0,
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
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
    includedPackageId: "pkg-1",
    active: true,
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
    updatedBy: null,
    ...over,
  };
}

function setConfig(servicePackages: unknown[] = [], rentalPlans: unknown[] = []) {
  configState = { data: { servicePackages, rentalPlans }, isPending: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  setConfig();
});

// ---------------------------------------------------------------------------
// Sections + empty states
// ---------------------------------------------------------------------------
describe("RentalTab — sections + empty states", () => {
  it("renders both section headings and the dormancy-explaining empty states", () => {
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText("Service packages")).toBeInTheDocument();
    expect(screen.getByText("Rental plans (rent-to-own)")).toBeInTheDocument();
    expect(screen.getByTestId("packages-empty")).toBeInTheDocument();
    expect(screen.getByTestId("plans-empty")).toHaveTextContent(
      "No rental plans yet — author one to prepare the POS rental lane (next phase).",
    );
  });

  it("shows the loading state while the config is pending", () => {
    configState = { data: undefined, isPending: true, error: null };
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText(/Loading rental config/)).toBeInTheDocument();
    expect(screen.queryByText("Service packages")).not.toBeInTheDocument();
  });

  it("shows the error state when the config fails", () => {
    configState = { data: undefined, isPending: false, error: new Error("boom") };
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByText(/Failed to load the rental config/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Principal gating
// ---------------------------------------------------------------------------
describe("RentalTab — gating", () => {
  it("principal: shows + New package and + New plan", () => {
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByTestId("package-add")).toBeInTheDocument();
    expect(screen.getByTestId("plan-add")).toBeInTheDocument();
  });

  it("non-principal: no add buttons, rows read-only (no Edit/Delete, pill not checkbox)", () => {
    setConfig([makePackage()], [makePlan()]);
    render(<RentalTab isPrincipal={false} />);
    expect(screen.queryByTestId("package-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pkg-edit-pkg-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-edit-plan-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pkg-active-pkg-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-active-plan-1")).not.toBeInTheDocument();
    // read-only status pills instead
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Derived columns
// ---------------------------------------------------------------------------
describe("RentalTab — derived table columns", () => {
  it("package row shows total visits via serviceVisitsTotal; plan row shows contract value + included package name", () => {
    setConfig([makePackage()], [makePlan()]);
    render(<RentalTab isPrincipal={true} />);
    // 24 months × 2 visits/yr = 4 total
    expect(screen.getByTestId("pkg-row-pkg-1")).toHaveTextContent("2 / yr · 4 total");
    // RM 59 × 84 months = RM 4,956.00
    expect(screen.getByTestId("plan-row-plan-1")).toHaveTextContent("4,956");
    // included package resolved by id → name
    expect(screen.getByTestId("plan-row-plan-1")).toHaveTextContent("Mattress Care Plan");
  });
});

// ---------------------------------------------------------------------------
// Plan create + live preview
// ---------------------------------------------------------------------------
describe("RentalTab — new plan", () => {
  it("renders the live split preview and fires useCreateRentalPlan with the camelCase payload", () => {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("plan-add"));

    fireEvent.change(screen.getByTestId("plan-sku"), { target: { value: "CLOUD-K" } });
    // "7 years" preset pill → 84 months
    fireEvent.click(screen.getByTestId("plan-term-84"));
    fireEvent.change(screen.getByTestId("plan-fee"), { target: { value: "59" } });
    fireEvent.change(screen.getByTestId("plan-supplier"), { target: { value: "49" } });
    fireEvent.change(screen.getByTestId("plan-commission"), { target: { value: "20" } });

    // live preview: RM 59.00 × 84 months = RM 4,956.00 · supplier RM 28.91/mo ·
    // commission RM 11.80/mo · Carres RM 18.29/mo
    const preview = screen.getByTestId("plan-preview");
    expect(preview).toHaveTextContent("4,956");
    expect(preview).toHaveTextContent("28.91");
    expect(preview).toHaveTextContent("11.80");
    expect(preview).toHaveTextContent("18.29");

    fireEvent.click(screen.getByText("Create plan"));
    expect(mockCreatePlan).toHaveBeenCalledTimes(1);
    expect(mockCreatePlan.mock.calls[0][0]).toMatchObject({
      sku: "CLOUD-K",
      termMonths: 84,
      monthlyFee: 59,
      supplierRatePct: 49,
      commissionBasePct: 20,
      includedPackageId: null,
      active: false, // a NEW plan defaults inactive
    });
  });

  it("free numeric term input overrides the presets", () => {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("plan-add"));
    fireEvent.change(screen.getByTestId("plan-sku"), { target: { value: "CLOUD-K" } });
    fireEvent.change(screen.getByTestId("plan-term"), { target: { value: "36" } });
    fireEvent.change(screen.getByTestId("plan-fee"), { target: { value: "99" } });
    fireEvent.click(screen.getByText("Create plan"));
    expect(mockCreatePlan.mock.calls[0][0]).toMatchObject({ termMonths: 36, monthlyFee: 99 });
  });
});

// ---------------------------------------------------------------------------
// Package create + active toggle
// ---------------------------------------------------------------------------
describe("RentalTab — service packages", () => {
  it("creating a package fires useCreateServicePackage with the camelCase payload (duration preset pill)", () => {
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("package-add"));
    fireEvent.change(screen.getByTestId("pkg-name"), { target: { value: "Sofa Care" } });
    fireEvent.change(screen.getByTestId("pkg-type"), { target: { value: "cleaning" } });
    fireEvent.click(screen.getByTestId("pkg-duration-36")); // "3 years" preset
    fireEvent.change(screen.getByTestId("pkg-visits"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("pkg-price"), { target: { value: "499" } });
    fireEvent.click(screen.getByText("Create package"));
    expect(mockCreatePkg).toHaveBeenCalledTimes(1);
    expect(mockCreatePkg.mock.calls[0][0]).toMatchObject({
      name: "Sofa Care",
      serviceType: "cleaning",
      durationMonths: 36,
      visitsPerYear: 3,
      price: 499,
      sku: null,
      active: true,
    });
  });

  it("the row Active toggle fires usePatchServicePackage({ id, patch })", () => {
    setConfig([makePackage()], []);
    render(<RentalTab isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("pkg-active-pkg-1"));
    expect(mockPatchPkg).toHaveBeenCalledTimes(1);
    expect(mockPatchPkg.mock.calls[0][0]).toEqual({ id: "pkg-1", patch: { active: false } });
  });
});

describe("RentalTab — Stripe sync column (0255)", () => {
  it("a synced plan shows the Synced pill; no Sync button", () => {
    setConfig([], [makePlan({ stripeProductId: "prod_X", stripePriceId: "price_X" })]);
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByTestId("plan-stripe-plan-1")).toHaveTextContent("Synced");
    expect(screen.queryByTestId("plan-sync-plan-1")).not.toBeInTheDocument();
  });

  it("an unsynced plan shows Not synced + the principal Sync retry fires the mutation", () => {
    setConfig([], [makePlan({ stripeProductId: null, stripePriceId: null })]);
    render(<RentalTab isPrincipal={true} />);
    expect(screen.getByTestId("plan-stripe-plan-1")).toHaveTextContent("Not synced");
    fireEvent.click(screen.getByTestId("plan-sync-plan-1"));
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
    expect(mockSyncPlan.mock.calls[0][0]).toBe("plan-1");
  });

  it("non-principal sees the status pill but no Sync button", () => {
    setConfig([], [makePlan({ stripePriceId: null })]);
    render(<RentalTab isPrincipal={false} />);
    expect(screen.getByTestId("plan-stripe-plan-1")).toHaveTextContent("Not synced");
    expect(screen.queryByTestId("plan-sync-plan-1")).not.toBeInTheDocument();
  });
});
