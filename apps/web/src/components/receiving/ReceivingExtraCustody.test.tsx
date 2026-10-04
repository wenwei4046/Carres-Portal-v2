import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReceivingExtraCustody from "./ReceivingExtraCustody";
import { apiFetch } from "@/lib/api";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReceivingExtraCustody receiptId="receipt-1" /></QueryClientProvider>); }
const evidence = { custody: [{ id: "custody-1", reported_sku: "EXTRA", reported_qty: 2, reported_note: null, actual_site_id: "site", goods_received_at: "2026-10-05" }], siteNames: { site: "Klang" } };
describe("Receiving extra-goods evidence", () => {
  it("reads the receipt's custody observation with its actual Site and quantity", async () => {
    vi.mocked(apiFetch).mockResolvedValue(evidence); show();
    expect(await screen.findByRole("table", { name: "Extra goods" })).toBeInTheDocument();
    expect(screen.getByText("Klang")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/operation/warehouse-receipts/receipt-1/extra-custody");
  });
  it("keeps unknown Site explicit without displaying an internal id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...evidence, siteNames: {} }); show();
    await screen.findByRole("table");
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
    expect(screen.queryByText("site")).not.toBeInTheDocument();
  });
  it("keeps read failure visible and supports retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(evidence); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
  it("treats an incomplete response as unreadable instead of an empty observation", async () => {
    vi.mocked(apiFetch).mockResolvedValue({}); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
  });
  it("does not show an empty custody table when the read proves none", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ custody: [], siteNames: {} }); show();
    await vi.waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
