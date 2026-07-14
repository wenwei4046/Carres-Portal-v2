/**
 * StripeCollectModal (0223) — amount stage → link stage (QR + copy/WhatsApp)
 * → paid stage, with the queries layer mocked. The poll/reconcile mechanics
 * are server-side (stripe.test.ts); here we assert the modal's stage machine
 * and that a paid session refreshes the order caches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StripeCheckoutSessionInfo } from "@carres/shared";

const createMutateAsync = vi.fn();
let statusData: { session: StripeCheckoutSessionInfo } | undefined;
const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) };
});
vi.mock("@/lib/queries", () => ({
  qk: { order: (id: string) => ["orders", id], stripeSession: (o: string, s: string) => ["orders", o, "stripe-session", s] },
  useCreateStripeCheckout: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useStripeCheckoutStatus: () => ({ data: statusData }),
}));

import StripeCollectModal from "./StripeCollectModal";

const SESSION: StripeCheckoutSessionInfo = {
  sessionId: "cs_test_abc",
  url: "https://checkout.stripe.com/c/cs_test_abc",
  amount: 1600,
  status: "open",
  paidAt: null,
  expiresAt: "2026-07-15T00:00:00Z",
  paymentMethodDetail: null,
};

function mount() {
  return render(
    <StripeCollectModal
      orderId="o-1"
      so={1174}
      total={2100}
      paid={500}
      customerName="Tan"
      customerPhone="012-3456789"
      onClose={() => {}}
    />,
  );
}

beforeEach(() => {
  createMutateAsync.mockReset();
  invalidateQueries.mockReset();
  statusData = undefined;
});

describe("StripeCollectModal", () => {
  it("prefills the outstanding balance and offers the quick chips", () => {
    mount();
    expect(screen.getByTestId("pos-stripe-amount")).toHaveValue(1600);
    // paid 500 / total 2100 → to-50% chip = 1050 − 500 = 550
    expect(screen.getByTestId("pos-stripe-half").textContent).toContain("550.00");
    expect(screen.getByTestId("pos-stripe-full").textContent).toContain("1,600.00");
  });

  it("creates a link and shows the QR + WhatsApp handoff", async () => {
    createMutateAsync.mockResolvedValue({ session: SESSION });
    mount();
    fireEvent.click(screen.getByTestId("pos-stripe-create"));
    await waitFor(() => expect(screen.getByTestId("pos-stripe-qr")).toBeInTheDocument());
    expect(createMutateAsync).toHaveBeenCalledWith({ amount: 1600 });
    // wa.me link carries the normalised MY number (0… → 60…)
    const wa = screen.getByText("WhatsApp").closest("a");
    expect(wa?.getAttribute("href")).toContain("wa.me/60123456789");
    expect(wa?.getAttribute("href")).toContain(encodeURIComponent(SESSION.url));
  });

  it("flips to the paid stage from the status poll and refreshes order caches", async () => {
    // The mocked poll hook reports 'paid' immediately — the effect folds it in
    // regardless of which stage the modal is on (mirrors a WhatsApp'd link
    // being paid while the salesperson reopened the modal).
    statusData = { session: { ...SESSION, status: "paid", paymentMethodDetail: "fpx (maybank2u)" } };
    mount();
    await waitFor(() => expect(screen.getByTestId("pos-stripe-paid")).toBeInTheDocument());
    expect(screen.getByTestId("pos-stripe-paid").textContent).toContain("1,600.00");
    expect(screen.getByTestId("pos-stripe-paid").textContent).toContain("fpx (maybank2u)");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["orders", "o-1"], exact: true });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["orders"] });
  });

  it("surfaces the server's maxAmount clamp on amount_exceeds_outstanding", async () => {
    const { ApiError } = await import("@/lib/api");
    createMutateAsync.mockRejectedValue(
      new ApiError(422, "Amount is above the outstanding balance (RM 1200.00).", {
        message: "Amount is above the outstanding balance (RM 1200.00).",
        maxAmount: 1200,
      }),
    );
    mount();
    fireEvent.click(screen.getByTestId("pos-stripe-create"));
    await waitFor(() =>
      expect(screen.getByText(/above the outstanding balance/i)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("pos-stripe-amount")).toHaveValue(1200);
  });
});
