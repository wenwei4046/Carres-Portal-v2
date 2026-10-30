import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import FinanceCreditNotes from "./FinanceCreditNotes";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/pdf/render", () => ({ renderCreditNotePdf: vi.fn() }));
import { apiFetch } from "@/lib/api";

const NOTE = {
  id: "cn1", credit_note_no: "CN-0001", note_date: "2026-10-20", invoice_no: "INV-1", so: 1300,
  customer_name: "LIM", reason: "Wrong size", amount: 250, status: "issued",
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><FinanceCreditNotes /></QueryClientProvider>);
  return qc;
}

describe("Customer Credit Notes states", () => {
  it("a failed read says so with Try again, never No credit notes yet", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The credit notes could not be loaded. Try again.");
    expect(screen.queryByText("No credit notes yet.")).not.toBeInTheDocument();
    vi.mocked(apiFetch).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it("a failed background refetch keeps the notes already read", async () => {
    vi.mocked(apiFetch).mockResolvedValue([NOTE]);
    const qc = show();
    await screen.findByText("CN-0001");
    vi.mocked(apiFetch).mockRejectedValue(new Error("down"));
    await act(() => qc.refetchQueries());
    expect(screen.getByText("CN-0001")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
