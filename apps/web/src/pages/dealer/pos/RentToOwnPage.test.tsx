/**
 * RentToOwnPage — the POS rental sell lane (0254). Mocked queries (RentalTab
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

const CREATED = {
  agreement: {
    id: "00000000-0000-0000-0000-0000000d0001",
    agreementNo: "RA-1001",
    sku: "M-CLOUD-K",
    termMonths: 84,
    monthlyFee: 59,
    status: "active",
  },
  customer: { id: "c1", name: "Tan Mei Ling", phone: "0123456789" },
  unit: { id: "u1", unitCode: "RU-1001", status: "allocated" },
  entitlementId: "e1",
  visitsTotal: 21,
};

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

describe("RentToOwnPage — sign", () => {
  it("gates on plan + name + phone, then signs with planId/startDate (+ salesperson scoped to the dealer)", () => {
    mockCreate.mockImplementation(
      (_input: unknown, opts: { onSuccess: (r: typeof CREATED) => void }) => opts.onSuccess(CREATED),
    );
    render(<RentToOwnPage actingDealerId="d1" dealerId="d1" onClose={() => {}} />);

    const sign = screen.getByTestId("rental-sign");
    expect(sign).toBeDisabled();

    fireEvent.click(screen.getByTestId(`rental-term-${PLAN.id}`));
    fireEvent.change(screen.getByTestId("rental-name"), { target: { value: "Tan Mei Ling" } });
    fireEvent.change(screen.getByTestId("rental-phone"), { target: { value: "0123456789" } });

    // Salesperson list is scoped to dealer d1 — Ben (d2) must not appear.
    const spSelect = screen.getByTestId("rental-salesperson");
    expect(spSelect).toHaveTextContent("Aina");
    expect(spSelect).not.toHaveTextContent("Ben");
    fireEvent.change(spSelect, { target: { value: "00000000-0000-0000-0000-0000000f0001" } });

    expect(sign).not.toBeDisabled();
    fireEvent.click(sign);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      planId: PLAN.id,
      customerName: "Tan Mei Ling",
      customerPhone: "0123456789",
      dealerId: "d1", // acting on behalf → body dealerId travels
      salespersonId: "00000000-0000-0000-0000-0000000f0001",
    });
    expect((mockCreate.mock.calls[0]![0] as { startDate: string }).startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Signed screen: RA number + the collect CTA opens the (stubbed) modal.
    expect(screen.getByTestId("rental-created-no")).toHaveTextContent("RA-1001 signed");
    expect(screen.getByText(/21 service visits/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rental-collect-open"));
    expect(screen.getByTestId("collect-modal-stub")).toHaveTextContent("RA-1001");
  });

  it("a store login (no acting dealer) sends NO body dealerId — the JWT wins server-side", () => {
    mockCreate.mockImplementation(
      (_input: unknown, opts: { onSuccess: (r: typeof CREATED) => void }) => opts.onSuccess(CREATED),
    );
    render(<RentToOwnPage dealerId="d1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId(`rental-term-${PLAN.id}`));
    fireEvent.change(screen.getByTestId("rental-name"), { target: { value: "Tan" } });
    fireEvent.change(screen.getByTestId("rental-phone"), { target: { value: "01234567" } });
    fireEvent.click(screen.getByTestId("rental-sign"));
    expect("dealerId" in (mockCreate.mock.calls[0]![0] as Record<string, unknown>)).toBe(false);
  });
});
