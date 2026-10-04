import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { fetchGrnRegisterExport } from "./queries";
vi.mock("./api", () => ({ apiFetch: vi.fn(), ApiError: class extends Error {} }));
afterEach(() => vi.clearAllMocks());
const filters = { offset: 50, limit: 12, columns: '{"filters":{"supplier":["Ohana"]}}', category: "Mattress", supplier: "s", site: "w", receivedWith: "damaged" as const, from: "2026-09-01", to: "2026-09-30", cancelled: true, q: "GRN-26" };
describe("Receiving full export request", () => {
  it("preserves every current filter and requests the full population", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ receipts: [{ id: "one" }], page: { total: 1 } });
    expect(await fetchGrnRegisterExport(filters)).toEqual([{ id: "one" }]);
    const url = new URL(String(vi.mocked(apiFetch).mock.calls[0][0]), "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ scope: "grn", export: "1", columns: filters.columns, category: "Mattress", supplier: "s", site: "w", receivedWith: "damaged", from: filters.from, to: filters.to, cancelled: "1", q: "GRN-26" });
  });
  it("refuses an incomplete server result", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ receipts: [{ id: "one" }], page: { total: 61 } });
    await expect(fetchGrnRegisterExport(filters)).rejects.toThrow("Incomplete register export");
  });
});
