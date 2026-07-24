import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OperationRental from "./OperationRental";

/**
 * OperationRental — the read-only Rental base page. Mocks the two rental hooks
 * (useRentalAgreements / useRentalUnits) directly; asserts the empty states,
 * one agreement row + one unit row from fixtures, and — the state-vocabulary
 * law — that raw DB stage words (underscored) NEVER reach the DOM.
 *
 * NOTE: the mock below is a FULL factory replacing "@/lib/queries" (the two
 * rental hooks land in queries.ts in a parallel workstream; a partial
 * importActual mock is unnecessary since this page only imports these two).
 */

interface HookState {
  data: unknown;
  isPending: boolean;
  error: unknown;
}

let agreementsState: HookState = { data: undefined, isPending: false, error: null };
let unitsState: HookState = { data: undefined, isPending: false, error: null };

vi.mock("@/lib/queries", () => ({
  useRentalAgreements: () => agreementsState,
  useRentalUnits: () => unitsState,
}));

const AGREEMENTS = [
  {
    id: "ag-1",
    agreementNo: "RA-1001",
    customerId: "cus-1",
    dealerId: null,
    salespersonId: null,
    orderId: null,
    planId: "plan-1",
    sku: "CLOUD-K",
    termMonths: 84,
    monthlyFee: 59,
    supplierRatePct: 40,
    commissionBasePct: 5,
    startDate: "2026-07-01",
    status: "active",
    buyoutAt: null,
    buyoutAmount: null,
    ownershipTransferAt: null,
    ownershipDocUrl: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    notes: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    createdBy: null,
    customerName: "Aisyah Rahman",
    customerPhone: "0123456789",
  },
  {
    id: "ag-2",
    agreementNo: "RA-1002",
    customerId: "cus-2",
    dealerId: null,
    salespersonId: null,
    orderId: null,
    planId: "plan-1",
    sku: "CLOUD-Q",
    termMonths: 60,
    monthlyFee: 79,
    supplierRatePct: 40,
    commissionBasePct: 5,
    startDate: "2020-01-01",
    status: "ownership_transferred",
    buyoutAt: null,
    buyoutAmount: null,
    ownershipTransferAt: "2026-01-01T00:00:00Z",
    ownershipDocUrl: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    notes: null,
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    customerName: "Tan Wei Ming",
    customerPhone: null,
  },
];

const UNITS = [
  {
    id: "u-1",
    unitCode: "RU-1001",
    sku: "CLOUD-K",
    agreementId: "ag-1",
    customerId: "cus-1",
    status: "in_rental",
    deployedAt: "2026-07-03",
    returnedAt: null,
    warrantyUntil: "2031-07-03",
    notes: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
    updatedBy: null,
  },
  {
    id: "u-2",
    unitCode: "RU-1002",
    sku: "CLOUD-Q",
    agreementId: "ag-2",
    customerId: "cus-2",
    status: "transferred",
    deployedAt: "2020-01-05",
    returnedAt: null,
    warrantyUntil: null,
    notes: null,
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: null,
  },
];

beforeEach(() => {
  agreementsState = { data: { agreements: [] }, isPending: false, error: null };
  unitsState = { data: { units: [] }, isPending: false, error: null };
});

describe("OperationRental", () => {
  it("renders the header and both empty states when there is no data", () => {
    render(<OperationRental />);
    expect(screen.getByText("Rental")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No rental agreements yet — the POS rental lane ships next.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /No rental units yet — units are registered here when the first agreement deploys\./,
      ),
    ).toBeInTheDocument();
  });

  it("renders an agreement row and a unit row from the hooks", () => {
    agreementsState = {
      data: { agreements: [AGREEMENTS[0]] },
      isPending: false,
      error: null,
    };
    unitsState = { data: { units: [UNITS[0]] }, isPending: false, error: null };
    render(<OperationRental />);

    // Agreement row
    const agRow = screen.getByTestId("rental-agreement-row");
    expect(within(agRow).getByText("RA-1001")).toBeInTheDocument();
    expect(within(agRow).getByText("Aisyah Rahman")).toBeInTheDocument();
    expect(within(agRow).getByText("0123456789")).toBeInTheDocument();
    expect(within(agRow).getByText("RM 59.00/mo · 84 mo")).toBeInTheDocument();
    expect(within(agRow).getByText("Active")).toBeInTheDocument();

    // Unit row — linked agreement number resolves from the agreements data
    const unitRow = screen.getByTestId("rental-unit-row");
    expect(within(unitRow).getByText("RU-1001")).toBeInTheDocument();
    expect(within(unitRow).getByText("In rental")).toBeInTheDocument();
    expect(within(unitRow).getByText("RA-1001")).toBeInTheDocument();
  });

  it("never leaks raw underscore DB status words", () => {
    agreementsState = {
      data: { agreements: AGREEMENTS },
      isPending: false,
      error: null,
    };
    unitsState = { data: { units: UNITS }, isPending: false, error: null };
    render(<OperationRental />);

    // The display words render…
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("Owned by customer")).toBeInTheDocument();
    expect(screen.getByText("In rental")).toBeInTheDocument();
    // …the raw DB words never do.
    expect(
      screen.queryByText(/ownership_transferred|in_rental|buyout_pending/),
    ).toBeNull();
  });

  it("counts the stat tiles from the hook data", () => {
    agreementsState = {
      data: { agreements: AGREEMENTS },
      isPending: false,
      error: null,
    };
    unitsState = { data: { units: UNITS }, isPending: false, error: null };
    render(<OperationRental />);

    // 1 of 2 agreements is active; 1 of 2 units is in rental; visits = dash.
    // Assert the VALUES, not just the labels — a broken filter must fail here.
    expect(
      within(screen.getByTestId("rental-tile-Active agreements")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("rental-tile-Units in rental")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("rental-tile-Visits due")).getByText("—"),
    ).toBeInTheDocument();
  });

  it("shows the skeleton while either hook is pending", () => {
    agreementsState = { data: undefined, isPending: true, error: null };
    render(<OperationRental />);
    expect(screen.getByTestId("operation-rental-skeleton")).toBeInTheDocument();
  });
});
