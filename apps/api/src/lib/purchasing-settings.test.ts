import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPurchasingNumbers, loadPurchasingSettings } from "./purchasing-settings";

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
            manual_purchase_min_delivery_days: 0,
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

describe("loadPurchasingNumbers — the Manual Purchase floor cannot take Purchasing down (2026-09-04)", () => {
  const core = { order_by_buffer_days: 7, earliest_sell_days: 21, logistics_call_working_days: 1, po_days: [1, 3, 5] };

  it("reads 0 when the 0423 column is not there yet", async () => {
    /* The row exists but the column does not: exactly production between the
       deploy and the SQL paste. Every other number still loads. */
    const n = await loadPurchasingNumbers(fakeClient({ purchasing_settings: [core] }));
    expect(n.earliestSellDays).toBe(21);
    expect(n.manualPurchaseMinDeliveryDays).toBe(0);
  });

  it("reads 0 when the column read itself errors, and the number when it is there", async () => {
    let calls = 0;
    const sb = {
      from() {
        calls += 1;
        const mine = calls;
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () =>
            mine === 1
              ? { data: core, error: null }
              : { data: null, error: { message: "column purchasing_settings.manual_purchase_min_delivery_days does not exist" } },
        };
        return b;
      },
    } as unknown as SupabaseClient;
    const n = await loadPurchasingNumbers(sb);
    expect(n.manualPurchaseMinDeliveryDays).toBe(0);
    const ok = await loadPurchasingNumbers(fakeClient({ purchasing_settings: [{ ...core, manual_purchase_min_delivery_days: 14 }] }));
    expect(ok.manualPurchaseMinDeliveryDays).toBe(14);
  });
});
