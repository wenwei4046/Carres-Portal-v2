/**
 * RentToOwnPage — the POS rental sell lane (0255). Mocked queries (RentalTab
 * idiom); the Stripe collect modal is stubbed — its own contract is the poll
 * hooks', not this page's.
 *
 * Covers:
 *  - Dormant empty state (no active plans).
 *  - Offers grouped per SKU with term chips; picking one shows the contract
 *    summary WITHOUT any split figure (a store must never see the pcts).
 *  - Sign gates on name+phone, then fires the create mutation with planId +
 *    startDate (+ actingDealerId only when acting on behalf).
 *  - The signed screen shows the RA number and opens the collect modal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RentToOwnPage from "./RentToOwnPage";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("./RentalCollectModal", () => ({
  default: ({ agreementNo }: { agreementNo: string }) => (
    <div data-testid="collect-modal-stub">{agreementNo}</div>
  ),
}));

const mockCreate = vi.fn();
let plansState: { data: { plans: unknown[] } | undefined; isPending: boolean; error: unknown; isSuccess: boolean };

vi.mock("@/lib/queries", () => ({
  useRentalPosPlans: () => plansState,
  useCatalog: () => ({
    data: {
      models: [{ id: "m1", name: "Cloud Mattress", category: "mattress", photoUrl: null }],
      skus: [{ id: "s1", modelId: "m1", sku: "M-CLOUD-K", variant: "King", price: 2990 }],
    },
  }),
  useSalespersons: () => ({
    data: {
      salespersons: [
        { id: "00000000-0000-0000-0000-0000000f0001", dealerId: "d1", outletId: null, name: "Aina" },
        { id: "00000000-0000-0000-0000-0000000f0002", dealerId: "d2", outletId: null, name: "Ben" },
      ],
    },
  }),
  useCreateRentalAgreement: () => ({ mutate: mockCreate, isPending: false }),
  // RentalCollectModal is stubbed above, but keep the hooks present for safety.
  useCreateRentalCheckout: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRentalCheckoutStatus: () => ({ data: undefined }),
}));

const PLAN = {
  id: "00000000-0000-0000-0000-0000000b0001",
  sku: "M-CLOUD-K",
  termMonths: 84,
  monthlyFee: 59,
  includedPackageId: "pkg-1",
  packageName: "Mattress Care Plan",
  packageServiceType: "cleaning",
  packageVisitsPerYear: 3,
  stripeReady: true,
};

// The CREATED fixture went with the signup tests: since 0278 this page cannot
// create an agreement at all, so there is no success payload to stand in for.

function setPlans(plans: unknown[]) {
  plansState = { data: { plans }, isPending: false, error: null, isSuccess: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  setPlans([PLAN]);
});

describe("RentToOwnPage — offers", () => {
  it("shows the dormant empty state when no plans are active", () => {
    setPlans([]);
    render(<RentToOwnPage dealerId="d1" onClose={() => {}} />);
    expect(screen.getByTestId("rental-empty")).toHaveTextContent("No rent-to-own offers");
  });

  it("groups offers per SKU with the catalog name and term chips; picking shows the contract summary sans splits", () => {
    render(<RentToOwnPage dealerId="d1" onClose={() => {}} />);
    const offer = screen.getByTestId("rental-offer-M-CLOUD-K");
    expect(offer).toHaveTextContent("Cloud Mattress · King");
    expect(offer).toHaveTextContent("Mattress Care Plan");

    fireEvent.click(screen.getByTestId(`rental-term-${PLAN.id}`));
    const summary = screen.getByTestId("rental-selected-summary");
    expect(summary).toHaveTextContent("RM 59/mo × 84 mo");
    expect(summary).toHaveTextContent("4,956");
    // The stripped projection carries no split — and the UI must never invent one.
    expect(summary.textContent).not.toMatch(/49|supplier|commission/i);
  });
});

describe("RentToOwnPage — sign (RETIRED since 0278)", () => {
  // This page was replaced by the Rental CATEGORY in the POS (PR #347) and has
  // no signature pad. Since 0278 an agreement is born signed or is not born, so
  // this form structurally cannot create one — the server would refuse it with
  // `signature_required`. The button now says that instead of firing a request
  // that cannot succeed. These tests pin the door SHUT.

  it("does not call the signup API, even with a complete form", () => {
    render(<RentToOwnPage actingDealerId="d1" dealerId="d1" onClose={() => {}} />);

    const sign = screen.getByTestId("rental-sign");
    expect(sign).toBeDisabled();

    fireEvent.click(screen.getByTestId(`rental-term-${PLAN.id}`));
    fireEvent.change(screen.getByTestId("rental-name"), { target: { value: "Tan Mei Ling" } });
    fireEvent.change(screen.getByTestId("rental-phone"), { target: { value: "0123456789" } });

    // Salesperson list is still scoped to dealer d1 — Ben (d2) must not appear.
    const spSelect = screen.getByTestId("rental-salesperson");
    expect(spSelect).toHaveTextContent("Aina");
    expect(spSelect).not.toHaveTextContent("Ben");

    expect(sign).not.toBeDisabled();
    fireEvent.click(sign);

    // THE assertion: no unsigned agreement can be created from here.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("tells the operator where rentals are actually signed now", () => {
    render(<RentToOwnPage dealerId="d1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId(`rental-term-${PLAN.id}`));
    fireEvent.change(screen.getByTestId("rental-name"), { target: { value: "Tan" } });
    fireEvent.change(screen.getByTestId("rental-phone"), { target: { value: "01234567" } });
    fireEvent.click(screen.getByTestId("rental-sign"));
    // A dead end that explains itself beats a dead end that just does nothing.
    expect(screen.getByText(/Rental category in the POS/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
