import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import ARDrawer from "./ARDrawer";
import type { FinanceArAgingRow } from "@/lib/queries";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const ROW: FinanceArAgingRow = {
  order_id:      "11111111-1111-1111-1111-000000000001",
  so:            1240,
  customer_name: "Probe Customer AR",
  dealer_id:     "d1",
  dealer_name:   "Probe Dealer",
  placed_at:     "2026-04-29T00:00:00Z",
  days:          11,
  aging:         "0-30",
  total:         12500,
  paid:          10000,
  outstanding:   2500,
  invoice_no:    "INV-2026-0001",
  status:        "delivered",
};

const REGISTRY = {
  methods: [
    { method: "bank", label: "Bank transfer", account_code: "1120", account_name: "Bank", active: true, sort: 1 },
    { method: "cash", label: "Cash", account_code: "1110", account_name: "Cash", active: false, sort: 4 },
    { method: "probe_wallet", label: "Probe Wallet", account_code: "1130", account_name: "Card", active: true, sort: 7 },
  ],
  money_accounts: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ARDrawer", () => {
  it("has no Issue invoice button — one invoice door per act (0476)", () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(wrap(<ARDrawer row={{ ...ROW, paid: 12500, outstanding: 0 }} onClose={() => {}} />));
    expect(screen.queryByRole("button", { name: /Issue invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download invoice/i })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/api/finance/invoices/issue", expect.anything());
  });

  it("Record receipt offers the Active methods from Settings → Payment and sends the key", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/payment-settings/methods")) return REGISTRY;
      if (url.includes("/order-receipt")) return { id: "p1" };
      return [];
    });
    render(wrap(<ARDrawer row={ROW} onClose={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Probe Wallet" })).toBeInTheDocument());
    const options = Array.from(screen.getByLabelText("Method").querySelectorAll("option"))
      .map((o) => o.getAttribute("value"));
    expect(options).toEqual(["bank", "probe_wallet"]);
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "probe_wallet" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/finance/payments/order-receipt", expect.objectContaining({ method: "POST" })));
    const call = vi.mocked(apiFetch).mock.calls.find(([u]) => u === "/api/finance/payments/order-receipt")!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({
      orderId: ROW.order_id, amount: 2500, method: "probe_wallet",
    });
  });

  it("the default is bank, never the old bank_transfer word", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/payment-settings/methods")) throw new Error("down");
      if (url.includes("/order-receipt")) return { id: "p1" };
      return [];
    });
    render(wrap(<ARDrawer row={ROW} onClose={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    expect(screen.getByLabelText("Method")).toHaveValue("bank");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/finance/payments/order-receipt", expect.anything()));
    const call = vi.mocked(apiFetch).mock.calls.find(([u]) => u === "/api/finance/payments/order-receipt")!;
    expect(JSON.parse(String((call[1] as RequestInit).body)).method).toBe("bank");
  });
});
