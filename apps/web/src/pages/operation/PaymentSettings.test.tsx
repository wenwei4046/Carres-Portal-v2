import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentSettings from "./PaymentSettings";

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch: state.fetch }));

const PAYLOAD = {
  bank_accounts: [
    { route_source: "pj_showroom", bank_name: "Hong Leong Bank", account_name: null, account_no: null },
    { route_source: "dealer", bank_name: "RHB", account_name: "Carres Sdn Bhd", account_no: "212345678" },
  ],
  manual_methods: [
    { method: "bank", active: true, sort: 1 },
    { method: "duitnow_qr", active: true, sort: 2 },
    { method: "cheque", active: false, sort: 3 },
  ],
  storage_rules: [
    { id: "r1", product_group: "mattress_bedframe", free_days: 14, charge_amount: 150,
      cycle_days: 30, operation_limit_day: 21, waiver_limit_day: 30,
      extra_free_allowed: true, inspection_days: 30, effective_from: "2026-09-06" },
    { id: "r2", product_group: "sofa", free_days: 14, charge_amount: 200,
      cycle_days: 14, operation_limit_day: null, waiver_limit_day: null,
      extra_free_allowed: false, inspection_days: 30, effective_from: "2026-09-06" },
  ],
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PaymentSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockResolvedValue(PAYLOAD);
});

describe("Settings → Payment (§16)", () => {
  it("shows readable summaries: routing, methods, numbering and the storage cards", async () => {
    show();
    await waitFor(() => expect(screen.getByText(/PJ own-showroom order/)).toBeInTheDocument());
    expect(screen.getByText(/→ Hong Leong Bank/)).toBeInTheDocument();
    expect(screen.getByText(/→ RHB/)).toBeInTheDocument();
    expect(screen.getByText("Carres Sdn Bhd · 212345678")).toBeInTheDocument();
    expect(screen.getByText("The account is not entered yet. Ask a manager to add it.")).toBeInTheDocument();
    expect(screen.getByText("Numbers are created automatically.")).toBeInTheDocument();
    // No raw numbering config — summary only.
    expect(screen.queryByText(/Prefix/)).not.toBeInTheDocument();
    // The §7 storage cards.
    const mb = screen.getByTestId("storage-card-mattress_bedframe");
    expect(mb).toHaveTextContent("Free storage: 14 calendar days");
    expect(mb).toHaveTextContent("RM 150.00");
    expect(mb).toHaveTextContent("Operation may approve until Day 21");
    expect(mb).toHaveTextContent("Storage Waiver Approver may approve until Day 30");
    const sofa = screen.getByTestId("storage-card-sofa");
    expect(sofa).toHaveTextContent("RM 200.00");
    expect(sofa).toHaveTextContent("Extra free storage: Not allowed");
    // No approver NAME, Payment Duty or roster in Payment Settings (§16).
    expect(screen.queryByText(/Jess/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment Duty/)).not.toBeInTheDocument();
  });
  it("a method toggle goes through the governed door", async () => {
    show();
    await waitFor(() => expect(screen.getByLabelText(/Cheque — cheque photo/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Cheque — cheque photo/));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/finance/payment-settings/method",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ method: "cheque", active: true }) }),
    ));
  });
  it("a failed read is an error with recovery, never empty settings", async () => {
    state.fetch.mockRejectedValue(new Error("down"));
    show();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "Payment settings could not be loaded."));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
