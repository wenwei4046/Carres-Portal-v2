import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { usePaymentRegister } from "./queries";

vi.mock("./api", () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }));
beforeEach(() => { vi.mocked(apiFetch).mockReset(); });

function renderRegister() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(usePaymentRegister, {
    wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("Payment Register source", () => {
  it("loads every page instead of reporting the first page as the total", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ rows: [{ id: "a" }], total: 2 })
      .mockResolvedValueOnce({ rows: [{ id: "b" }], total: 2 });
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual(["a", "b"]);
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/finance/payments/register?offset=1&limit=200");
  });
  it("keeps a failed read distinct from no payments", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Payments could not be loaded. Try again."));
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it.each([
    { rows: [], total: 2 },
    { rows: [{ id: "a" }], total: 2 },
    { rows: [{ id: "b" }], total: 3 },
  ])("refuses a partial or changing source %#", async (next) => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ rows: [{ id: "a" }], total: 2 })
      .mockResolvedValueOnce(next);
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it("accepts an authoritative empty register", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], total: 0 });
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
  it.each([null, -1, 0.5, undefined])("refuses an unknown record count %s", async (total) => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], total });
    const { result } = renderRegister();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
