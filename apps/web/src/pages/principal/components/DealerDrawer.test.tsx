import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DealerDrawer from "./DealerDrawer";

/**
 * 0598 — the dealer's bank account lives in the drawer's master section, so a
 * commission payment voucher can read it. Finance opens the same drawer with
 * canSetStatus false; the bank fields must be editable there too.
 */
const mutateAsync = vi.fn().mockResolvedValue({ ok: true, dealer: null });

const dealer = {
  id: "d1111111-0000-0000-0000-000000000001",
  name: "JB Sleep",
  region: "Johor",
  status: "active",
  contact: "Aisha · 0123344556",
  joined_date: "2026-01-01",
  order_count: 0,
  gmv: 0,
  outstanding: 0,
  address: null,
  ssm_code: null,
  contact_name: null,
  contact_phone: null,
  channel: "dealer",
  code: "JB1",
  state: null,
  bank_name: null,
  bank_account_no: null,
  bank_account_holder: null,
};

vi.mock("@/lib/queries", () => ({
  usePrincipalDealer: () => ({ data: { dealer, recentOrders: [] }, isLoading: false }),
  useDealerSetStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateDealer: () => ({ mutateAsync, isPending: false }),
}));

describe("DealerDrawer bank account (0598)", () => {
  beforeEach(() => mutateAsync.mockClear());

  for (const [who, canSetStatus] of [
    ["principal", true],
    ["finance", false],
  ] as const) {
    it(`${who} saves bank, account number and holder`, async () => {
      render(<DealerDrawer dealerId={dealer.id} onClose={() => {}} canSetStatus={canSetStatus} />);
      fireEvent.change(screen.getByLabelText("Bank"), { target: { value: " Maybank " } });
      fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "514012345678" } });
      fireEvent.change(screen.getByLabelText("Account holder"), { target: { value: "JB Sleep Sdn Bhd" } });
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync).toHaveBeenCalledWith({
        bankName: "Maybank",
        bankAccountNo: "514012345678",
        bankAccountHolder: "JB Sleep Sdn Bhd",
      });
    });
  }

  it("shows the account number hint", () => {
    render(<DealerDrawer dealerId={dealer.id} onClose={() => {}} canSetStatus={false} />);
    expect(screen.getByText("Digits only, 6 to 20.")).toBeTruthy();
  });
});
