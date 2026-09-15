import { describe, expect, it } from "vitest";
import { stockMovementEvidence } from "./stock-movement-evidence";

function source(rows: Record<string, Record<string, unknown>[]>, failure?: string) {
  return { from(table: string) {
    let filtered = rows[table] ?? [];
    let start = 0; let end = 499;
    const result = () => ({ data: filtered.slice(start, end + 1), error: table === failure ? new Error("Evidence unavailable") : null });
    const query = {
      select: () => query, order: () => query,
      range: (a: number, b: number) => { start = a; end = b; return query; },
      eq: (key: string, value: unknown) => { filtered = filtered.filter((r) => r[key] === value); return query; },
      overlaps: (key: string, values: unknown[]) => { filtered = filtered.filter((r) => (r[key] as unknown[]).some((v) => values.includes(v))); return query; },
      maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } } as never;
}

describe("physical movement evidence", () => {
  it("uses posted actual receipts, excluding absent and voided results and another Unit", async () => {
    const evidence = await stockMovementEvidence(source({
      receiving_unit_results: [
        { id: "r1", stock_item_id: "u1", receipt_id: "grn1", outcome: "received_with_issue" },
        { id: "r2", stock_item_id: "u1", receipt_id: "grn2", outcome: "not_received" },
        { id: "r3", stock_item_id: "u1", receipt_id: "grn3", outcome: "received" },
        { id: "r4", stock_item_id: "u2", receipt_id: "grn4", outcome: "received" },
      ],
      warehouse_receipts: [
        { id: "grn1", status: "posted", actual_site_id: "A", goods_received_at: "2026-09-02", grn_no: "GRN-1", po_id: "PO-1", posted_by: "actor" },
        { id: "grn3", status: "voided", actual_site_id: "B", goods_received_at: "2026-09-03" },
      ], warehouses: [{ id: "A", name: "Actual receipt Site" }],
    }), "u1");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ direction: "in", siteId: "A", at: "2026-09-02", actorId: "actor", reference: "GRN-1" });
  });
  it("keeps Warehouse handover and carrier receipt distinct and never supplies a DO Site", async () => {
    const evidence = await stockMovementEvidence(source({
      delivery_handover_event_units: [
        { id: "l1", item_id: "u1", event_id: "h1", recorded_side: "warehouse" },
        { id: "l2", item_id: "u1", event_id: "h2", recorded_side: "logistics" },
      ],
      delivery_handover_events: [{ id: "h1", kind: "handed_over", delivery_order_id: "do1", recorded_at: "2026-09-03T10:00:00Z", recorded_by: "warehouse-actor" }],
      ops_delivery_orders: [{ id: "do1", do_number: "DO-1" }],
      arrival_source_events: [
        { id: "a1", unit_ids: ["u1"], source_id: "s1", kind: "collected", occurred_at: "2026-09-04T10:00:00Z", actor_id: "transfer-actor" },
        { id: "a2", unit_ids: ["u1"], source_id: "s1", kind: "carrier_received", occurred_at: "2026-09-04T11:00:00Z" },
      ],
      arrival_sources: [{ id: "s1", source_no: "TR-1", from_site_id: "B" }],
      warehouses: [{ id: "B", name: "Origin Site" }],
    }), "u1");
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({ reference: "DO-1", siteId: null, actorId: "warehouse-actor" });
    expect(evidence[1]).toMatchObject({ reference: "TR-1", siteId: "B", actorId: "transfer-actor" });
  });
  it("reports an unavailable source instead of returning a false empty history", async () => {
    await expect(stockMovementEvidence(source({}, "receiving_unit_results"), "u1")).rejects.toThrow("Evidence unavailable");
  });
});
