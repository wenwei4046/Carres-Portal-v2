import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  storage_rules: [
    { id: "r1", product_group: "mattress_bedframe", free_days: 14, charge_amount: 150,
      cycle_days: 30, operation_limit_day: 21, waiver_limit_day: 30,
      extra_free_allowed: true, inspection_days: 30, effective_from: "2026-09-06" },
    { id: "r2", product_group: "sofa", free_days: 14, charge_amount: 200,
      cycle_days: 14, operation_limit_day: null, waiver_limit_day: null,
      extra_free_allowed: false, inspection_days: 30, effective_from: "2026-09-06" },
  ],
};

const REGISTRY = {
  methods: [
    { method: "bank", label: "Bank transfer", account_code: "1120", account_name: "Bank", active: true, sort: 1 },
    { method: "duitnow_qr", label: "DuitNow QR", account_code: "1130", account_name: "Card and online settlement", active: true, sort: 2 },
    { method: "cheque", label: "Cheque", account_code: null, account_name: null, active: false, sort: 3 },
  ],
  money_accounts: [
    { code: "1110", name: "Cash" },
    { code: "1120", name: "Bank" },
    { code: "1130", name: "Card and online settlement" },
  ],
};

/** Every read and write, routed by URL — the page makes several. */
function route(url: string) {
  if (url === "/api/finance/payment-settings") return PAYLOAD;
  if (url === "/api/finance/payment-settings/methods") return REGISTRY;
  if (url.includes("/templates")) return { templates: [] };
  return { ok: true };
}

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
  state.fetch.mockImplementation(async (url: string) => route(url));
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
    await waitFor(() => expect(screen.getByLabelText(/Cheque — Cheque photo/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Cheque — Cheque photo/));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/finance/payment-settings/method",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ method: "cheque", active: true }) }),
    ));
  });
  it("each method shows its money account; a method with none reads Not configured", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("method-row-bank")).toBeInTheDocument());
    expect(screen.getByTestId("method-row-bank")).toHaveTextContent("Money account: 1120 · Bank");
    expect(screen.getByTestId("method-row-duitnow_qr")).toHaveTextContent("1130 · Card and online settlement");
    expect(screen.getByTestId("method-row-cheque")).toHaveTextContent("Money account: Not configured");
    expect(screen.getByTestId("method-row-cheque")).toHaveTextContent("Inactive");
  });

  it("Edit renames a method and keeps its key and account (0476)", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("method-row-duitnow_qr")).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId("method-row-duitnow_qr")).getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("DuitNow QR");
    fireEvent.change(name, { target: { value: "DuitNow" } });
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/finance/payment-settings/method/save",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ method: "duitnow_qr", label: "DuitNow", accountCode: "1130", active: true }),
      }),
    ));
  });

  it("Add a payment method names its gap until a name and a money account are chosen", async () => {
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a payment method" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add a payment method" }));
    expect(screen.getByRole("button", { name: "Save method — type a name" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Probe Wallet" } });
    expect(screen.getByRole("button", { name: "Save method — choose a money account" })).toBeDisabled();
    // The kit Select opens from the keyboard in jsdom (no PointerEvent).
    fireEvent.keyDown(screen.getByLabelText("Money account"), { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "1110 · Cash" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "Save method" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/finance/payment-settings/method/save",
      expect.objectContaining({
        body: JSON.stringify({ method: null, label: "Probe Wallet", accountCode: "1110", active: true }),
      }),
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
