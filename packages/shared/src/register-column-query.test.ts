import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesRegisterColumnFilters, dateMatchesPreset, type RegisterColumnQuery } from "./register-column-query";
import { buildGrnRegisterView, type GrnRegisterFactRow } from "./receiving-register";
const empty = (): RegisterColumnQuery => ({ filters: {}, dateFilters: {}, numberFilters: {}, dateRangeFilters: {}, sort: null });
afterEach(() => vi.useRealTimers());
describe("shared register column arithmetic", () => {
  it("uses Malaysia midnight and inclusive date boundaries", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T16:01:00Z"));
    expect(dateMatchesPreset("2026-10-05", "today")).toBe(true);
    expect(dateMatchesPreset("2026-10-04", "today")).toBe(false);
    const query = { ...empty(), dateRangeFilters: { arrived: { from: "2026-10-04", to: "2026-10-05" } } };
    expect(matchesRegisterColumnFilters(query, () => ({ text: "", date: "2026-10-05T12:00:00Z" }))).toBe(true);
    expect(matchesRegisterColumnFilters(query, () => ({ text: "Not recorded", date: null }))).toBe(false);
  });
  it("does not turn an unavailable numeric value into zero", () => {
    const query = { ...empty(), numberFilters: { received: { min: 0, max: 0 } } };
    expect(matchesRegisterColumnFilters(query, () => ({ text: "0", number: null }))).toBe(false);
    expect(matchesRegisterColumnFilters(query, () => ({ text: "0", number: 0 }))).toBe(true);
  });
  it("finds receipts beyond page 1, counts the full answer, sorts numbers and clears back to all", () => {
    const rows: GrnRegisterFactRow[] = Array.from({ length: 123 }, (_, i) => ({
      id: `receipt-${i}`, categories: ["Mattress"], supplierName: i >= 100 ? "Other supplier" : "First supplier",
      siteName: "Klang", grnDateIso: "2026-10-04", damaged: i >= 100, wrongItem: false, extra: false,
      cancelled: false, searchText: `receipt-${i}`, columnFacts: {
        supplier: { text: i >= 100 ? "Other supplier" : "First supplier" },
        receivedQty: { text: String(i), number: i },
      },
    }));
    const columns: RegisterColumnQuery = { ...empty(), filters: { supplier: ["Other supplier"] }, sort: { key: "receivedQty", dir: "desc" } };
    const found = buildGrnRegisterView(rows, { columns }, 0, 10);
    expect(found.total).toBe(23); expect(found.pageIds).toEqual(Array.from({ length: 10 }, (_, i) => `receipt-${122-i}`));
    expect(found.facets.receivedWith.damaged).toBe(23);
    expect(buildGrnRegisterView(rows, { columns }, 20, 10).pageIds).toEqual(["receipt-102", "receipt-101", "receipt-100"]);
    expect(buildGrnRegisterView(rows, { columns: empty() }, 0, 50).total).toBe(123);
  });
});
