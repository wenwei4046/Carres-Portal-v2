import { describe, expect, it } from "vitest";
import type { operationPoListRow } from "@/lib/queries";
import { notReceivedRows } from "./NotReceivedRegister";

function po(id: string, over: Partial<operationPoListRow> = {}): operationPoListRow {
  return { id, supplier_id: "supplier", status: "open", version: 2, eta_date: "2026-10-23",
    purchase_order_lines: [{ id: `${id}-line`, sku: "TEST", qty: 5, received_qty: 2, cancelled_qty: 1 }],
    sends: [{ kind: "confirmed_sent", po_version: 2, sent_at: "2026-10-18T00:00:00Z", channel: "whatsapp" }],
    ...over } as operationPoListRow;
}
describe("Not received reads canonical outstanding sent scope", () => {
  it("keeps partial receipt and cancellation distinct from accepted goods", () => {
    const read = notReceivedRows([po("PO-1")], new Map(), "2026-10-19");
    expect(read.rows).toEqual([expect.objectContaining({ id: "PO-1", ordered: 5, received: 2, pending: 2 })]);
  });
  it("never treats an unsent revision, external opening, completed or cancelled source as ready to check in", () => {
    const records = [po("unsent", { sends: [] }), po("stale", { version: 3 }),
      po("opened", { sends: [{ kind: "external_open", po_version: 2, sent_at: "2026-10-18", channel: "whatsapp" }] as operationPoListRow["sends"] }),
      po("cancelled", { status: "cancelled" }), po("received", { status: "received" }),
      po("no-balance", { purchase_order_lines: [{ id: "line", sku: "TEST", qty: 5, received_qty: 2, cancelled_qty: 3 }] })];
    expect(notReceivedRows(records, new Map(), "2026-10-19").rows).toEqual([]);
  });
  it("orders by earliest outstanding source due, preserving unknown dates last", () => {
    const read = notReceivedRows([po("later"), po("unknown", { eta_date: null }),
      po("earlier", { official_delivery_date: "2026-10-18" })], new Map(), "2026-10-19");
    expect(read.rows.map(row => row.id)).toEqual(["earlier", "later", "unknown"]);
  });
  it("does not count damage or wrong goods as accepted receipt", () => {
    const read = notReceivedRows([po("issue", { purchase_order_lines: [{ id: "line", sku: "TEST", qty: 5, received_qty: 1, damaged_qty: 2, wrong_item_qty: 1 }] })], new Map(), "2026-10-19");
    expect(read.rows[0]).toMatchObject({ received: 1, pending: 4 });
  });
  it("an unreadable quantity is unavailable, never an empty/completed claim", () => {
    const row = po("unknown-count"); Object.assign(row.purchase_order_lines[0]!, { received_qty: undefined });
    expect(notReceivedRows([row], new Map(), "2026-10-19")).toEqual({ rows: [], unknown: 1 });
  });
});
