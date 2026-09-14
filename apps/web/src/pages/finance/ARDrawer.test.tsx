import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import ARDrawer, { type OrderPaymentRow } from "./ARDrawer";
import type { CustomerOwingRow } from "./money-owed";

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
      <MemoryRouter>{ui}</MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

const BAL: CustomerOwingRow = {
  orderId: "11111111-1111-1111-1111-000000000001",
  so: 1240,
  customer: "Probe Customer AR",
  doorId: "inv-door-1",
  outstanding: 2500,
  storageOwing: 0,
  overpaid: 0,
  placedAt: "2026-09-01T02:00:00Z",
};

const HISTORY: OrderPaymentRow[] = [
  { id: "p1", receipt_no: "RC-090926-0001", amount: 10000, paid_on: "2026-09-09",
    voided_at: null, reference: "TRX-1", method: "bank" },
  { id: "p2", receipt_no: "RC-090926-0002", amount: 50, paid_on: "2026-09-09",
    voided_at: "2026-09-10T01:00:00Z", reference: null, method: "cash" },
];

const REGISTRY = {
  methods: [
    { method: "bank", label: "Bank transfer", account_code: "1120", account_name: "Bank", active: true, sort: 1 },
    { method: "cash", label: "Cash", account_code: "1110", account_name: "Cash", active: false, sort: 4 },
    { method: "probe_wallet", label: "Probe Wallet", account_code: "1130", account_name: "Card", active: true, sort: 7 },
  ],
  money_accounts: [],
};

function drawer(over: Partial<CustomerOwingRow> = {}, payments: OrderPaymentRow[] = []) {
  return <ARDrawer balance={{ ...BAL, ...over }} payments={payments} open onOpenChange={() => {}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ARDrawer", () => {
  it("has no Issue invoice button — one invoice door per act (0476)", () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(wrap(drawer({ outstanding: 0 })));
    expect(screen.queryByRole("button", { name: /Issue invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download invoice/i })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/api/finance/invoices/issue", expect.anything());
  });

  it("shows Outstanding with its storage part, and opens the invoice", () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(wrap(drawer({ outstanding: 2658, storageOwing: 158 })));
    expect(screen.getByTestId("ar-drawer-outstanding")).toHaveTextContent("RM 2,658.00");
    expect(screen.getByText("includes storage RM 158.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open invoice" })).toHaveAttribute("href", "/finance/invoices?invoice=inv-door-1");
  });

  it("Payment history is the order's own receipts — dated, worded, a voided one marked", () => {
    vi.mocked(apiFetch).mockResolvedValue(REGISTRY);
    render(wrap(drawer({}, HISTORY)));
    const history = screen.getByTestId("ar-drawer-history");
    expect(history).toHaveTextContent("RC-090926-0001");
    expect(history).toHaveTextContent("RM 10,000.00");
    expect(history).toHaveTextContent("RC-090926-0002 · VOIDED");
    expect(history).not.toHaveTextContent("2026-09-09"); // a date goes through fmtDate
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/finance\/payments\?/));
  });

  it("Record receipt offers the Active methods from Settings → Payment and sends the key", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/payment-settings/methods")) return REGISTRY;
      if (url.includes("/order-receipt")) return { id: "p1" };
      return [];
    });
    render(wrap(drawer()));
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
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body).toMatchObject({ orderId: BAL.orderId, amount: 2500, method: "probe_wallet" });
    expect(typeof body.idempotencyKey).toBe("string");
  });

  it("opens with the form closed, and with it showing when startRecording is set", () => {
    vi.mocked(apiFetch).mockResolvedValue(REGISTRY);
    const closed = render(wrap(drawer()));
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    closed.unmount();
    render(wrap(<ARDrawer balance={BAL} payments={[]} open onOpenChange={() => {}} startRecording />));
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("the default is bank, never the old bank_transfer word", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/payment-settings/methods")) throw new Error("down");
      if (url.includes("/order-receipt")) return { id: "p1" };
      return [];
    });
    render(wrap(drawer()));
    fireEvent.click(screen.getByRole("button", { name: "Record receipt" }));
    expect(screen.getByLabelText("Method")).toHaveValue("bank");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/finance/payments/order-receipt", expect.anything()));
    const call = vi.mocked(apiFetch).mock.calls.find(([u]) => u === "/api/finance/payments/order-receipt")!;
    expect(JSON.parse(String((call[1] as RequestInit).body)).method).toBe("bank");
  });
});
