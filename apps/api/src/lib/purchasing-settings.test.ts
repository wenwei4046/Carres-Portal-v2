import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPurchasingSettings, loadPurchasingNumbers } from "./purchasing-settings";

describe("purchasing numbers schema compatibility", () => {
  const row = { order_by_buffer_days: 7, earliest_sell_days: 21, logistics_call_working_days: 1, po_days: [1, 3, 5] };
  function client(...responses: Array<{ data: unknown; error: unknown }>) {
    const maybeSingle = vi.fn();
    responses.forEach((response) => maybeSingle.mockResolvedValueOnce(response));
    const select = vi.fn().mockReturnValue({ eq: () => ({ maybeSingle }) });
    return { sb: { from: () => ({ select }) } as unknown as SupabaseClient, select };
  }
  const missing = { code: "42703", message: "column purchasing_settings.manual_purchase_enforce_earliest_date does not exist" };

  it("reads the stored numbers before 0422 with the new switch off", async () => {
    const { sb, select } = client({ data: null, error: missing }, { data: row, error: null });
    expect(await loadPurchasingNumbers(sb)).toEqual({ orderByBufferDays: 7, earliestSellDays: 21, logisticsCallWorkingDays: 1, poDays: [1, 3, 5], manualPurchaseEnforceEarliestDate: false });
    expect(select.mock.calls[1][0]).not.toContain("manual_purchase_enforce_earliest_date");
  });
  it("preserves an enabled switch on migrated schemas", async () => {
    const { sb, select } = client({ data: { ...row, manual_purchase_enforce_earliest_date: true }, error: null });
    expect((await loadPurchasingNumbers(sb)).manualPurchaseEnforceEarliestDate).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
  });
  it("does not hide other missing columns", async () => {
    const { sb, select } = client({ data: null, error: { code: "42703", message: "column purchasing_settings.po_days does not exist" } });
    await expect(loadPurchasingNumbers(sb)).rejects.toThrow("po_days does not exist");
    expect(select).toHaveBeenCalledTimes(1);
  });
  it("propagates errors from the legacy read", async () => {
    const { sb } = client({ data: null, error: missing }, { data: null, error: { message: "permission denied" } });
    await expect(loadPurchasingNumbers(sb)).rejects.toThrow("permission denied");
  });
});

function fakeClient(rows: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const data = rows[table] ?? [];
      const result = { data, error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("loadPurchasingSettings — Deliver To master data", () => {
  it("returns every destination and derives a warehouse-linked address", async () => {
    const settings = await loadPurchasingSettings(
      fakeClient({
        purchasing_settings: [
          {
            order_by_buffer_days: 7,
            earliest_sell_days: 21,
            logistics_call_working_days: 1,
            po_days: [1, 3, 5],
          },
        ],
        product_skus: [],
        suppliers: [],
        purchasing_production_days: [],
        purchasing_supplier_settings: [],
        purchasing_setting_changes: [],
        purchasing_destinations: [
          {
            id: "11111111-0000-0000-0000-000000000001",
            name: "Carres Klang",
            address: null,
            is_default: true,
            active: true,
            warehouse_id: "22222222-0000-0000-0000-000000000002",
            warehouses: { address: "Lot 12, Klang" },
          },
          {
            id: "33333333-0000-0000-0000-000000000003",
            name: "Ohana",
            address: null,
            is_default: false,
            active: true,
            warehouse_id: null,
            warehouses: null,
          },
        ],
      }),
    );

    expect(settings.destinations).toEqual([
      {
        id: "11111111-0000-0000-0000-000000000001",
        name: "Carres Klang",
        address: "Lot 12, Klang",
        isDefault: true,
        active: true,
        warehouseLinked: true,
      },
      {
        id: "33333333-0000-0000-0000-000000000003",
        name: "Ohana",
        address: null,
        isDefault: false,
        active: true,
        warehouseLinked: false,
      },
    ]);
  });
});
