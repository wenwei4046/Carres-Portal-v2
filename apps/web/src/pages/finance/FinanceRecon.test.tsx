import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceRecon from "./FinanceRecon";

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

const BS_MATCHED = {
  id:             "00000000-0000-0000-0000-0000000bb001",
  statement_date: "2026-04-26",
  description:    "FPX TRF · Tan Mei Ling",
  amount:         5970,
  reference:      "FPX-8821",
  currency:       "MYR",
  imported_from:  "manual",
  created_at:     "2026-04-26T10:00:00Z",
  matched_ref:    "INV-1240",
};
const BS_UNMATCHED = {
  ...BS_MATCHED,
  id:           "00000000-0000-0000-0000-0000000bb002",
  description:  "FPX TRF · unknown ref 8821",
  amount:       1500,
  reference:    null,
  matched_ref:  null,
};

const SUGGEST_PAYLOAD = {
  bank_statement: {
    id:             BS_UNMATCHED.id,
    statement_date: BS_UNMATCHED.statement_date,
    description:    BS_UNMATCHED.description,
    amount:         BS_UNMATCHED.amount,
    reference:      null,
  },
  candidates: [
    {
      dl: 1240, customer_name: "Tan Wei Ling", dealer_name: "Showroom KL",
      total: 5970, paid: 4470, outstanding: 1500,
      invoice_no: "INV-2026-1240", distance: 0,
    },
    {
      dl: 1241, customer_name: "Lee Kah Hong", dealer_name: "Showroom JB",
      total: 2000, paid: 0, outstanding: 2000,
      invoice_no: "INV-2026-1241", distance: 500,
    },
  ],
};

describe("FinanceRecon page", () => {
  it("renders 4 KPIs + bank line table with matched + unmatched rows", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("bank-statements") && !url.includes("suggest")) return [BS_MATCHED, BS_UNMATCHED];
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceRecon />));

    await waitFor(() => {
      expect(screen.getByText("FPX TRF · Tan Mei Ling")).toBeInTheDocument();
    });

    expect(screen.getByText("Inflow")).toBeInTheDocument();
    expect(screen.getByText("Outflow")).toBeInTheDocument();
    expect(screen.getByText("Matched")).toBeInTheDocument();
    // "Unmatched" appears in BOTH the KPI label AND the unmatched row's pill
    expect(screen.getAllByText("Unmatched").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("INV-1240")).toBeInTheDocument();   // matched pill
  });

  it("clicking Match… opens MatchModal with suggest candidates", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("bank-statements") && !url.includes("suggest")) return [BS_UNMATCHED];
      if (url.includes("/reconciliations/suggest/")) return SUGGEST_PAYLOAD;
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceRecon />));

    await waitFor(() => {
      expect(screen.getByText("FPX TRF · unknown ref 8821")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Match…" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Match bank line" })).toBeInTheDocument();
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-1241")).toBeInTheDocument();
    });
  });

  it("Open button on matched row shows readonly modal", async () => {
    vi.mocked(apiFetch).mockResolvedValue([BS_MATCHED]);
    render(wrap(<FinanceRecon />));

    await waitFor(() => {
      expect(screen.getByText("FPX TRF · Tan Mei Ling")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Matched bank line" })).toBeInTheDocument();
    });
  });

  it("Import statement button opens manual entry modal", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(wrap(<FinanceRecon />));

    await waitFor(() => {
      expect(screen.getByText(/Click Import statement to add one manually/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import statement" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Import bank statement line" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
    });
  });
});
