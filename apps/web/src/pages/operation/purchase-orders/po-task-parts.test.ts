import { describe, expect, it } from "vitest";
import type { operationPoListRow } from "@/lib/queries";
import { poTaskHistory, poTaskOrders } from "./po-task-parts";

/** What a Purchase Order gives its task. Every value below is TEST data. */
const po = (over: Record<string, unknown>) => ({ id: "PO-261001-9001", ...over }) as unknown as operationPoListRow;

describe("the Sales Orders a PO serves", () => {
  it("are its Sales Order sources, each once, in source order; a Manual Purchase is not a Sales Order", () => {
    expect(poTaskOrders(po({ sources: [
      { kind: "sales_order", reference: "SO-9102", order_id: "o2" },
      { kind: "manual_purchase", reference: "MPR-20261001-0001", request_id: "r1" },
      { kind: "sales_order", reference: "SO-9101", order_id: "o1" },
      { kind: "sales_order", reference: "SO-9102", order_id: "o2" },
      { kind: "sales_order", reference: "SO-9103", order_id: null },
    ] }))).toEqual([{ orderId: "o2", label: "SO-9102" }, { orderId: "o1", label: "SO-9101" }]);
    expect(poTaskOrders(po({}))).toEqual([]);
  });
});

describe("the PO's recorded history", () => {
  it("opening a channel is never said as sending; only PO sent to supplier is", () => {
    const events = poTaskHistory(po({ sends: [
      { channel: "whatsapp", note: null, sent_at: "2026-10-01T02:10:00.000Z", kind: "external_open", po_version: 2, sent_by_name: "TEST · Staff A", po_revisions: null },
      { channel: "whatsapp", note: null, sent_at: "2026-10-01T02:14:00.000Z", kind: "confirmed_sent", po_version: 2, sent_by_name: "TEST · Staff A", po_revisions: null },
    ] }));
    expect(events.map((event) => [event.text, event.detail, event.by, event.at])).toEqual([
      ["WhatsApp opened", "PO-261001-9001-V2", "TEST · Staff A", "2026-10-01T02:10:00.000Z"],
      ["PO sent to supplier", "PO-261001-9001-V2 · WhatsApp", "TEST · Staff A", "2026-10-01T02:14:00.000Z"],
    ]);
  });
  it("the rows of one supplier answer are one line, with its dates and a delay said once", () => {
    const events = poTaskHistory(po({ promises: [
      { answer_group: "g1", kind: "line", answer: "delayed", about_date: "2026-10-07", previous_date: "2026-10-07", new_date: "2026-10-20", reason: "Production delay", recorded_at: "2026-10-08T03:00:00.000Z", recorded_by_name: "TEST · Staff A" },
      { answer_group: "g1", kind: "line", answer: "delayed", about_date: "2026-10-07", previous_date: "2026-10-07", new_date: "2026-10-22", reason: "Production delay", recorded_at: "2026-10-08T03:00:00.000Z", recorded_by_name: "TEST · Staff A" },
      { id: "p3", kind: "line", answer: "confirmed", about_date: "2026-10-07", previous_date: null, new_date: null, reason: null, recorded_at: "2026-10-02T03:00:00.000Z" },
    ] }));
    expect(events.map((event) => [event.text, event.detail, event.by ?? null])).toEqual([
      ["Supplier answer recorded", "Supplier date Tue, 20 Oct, Thu, 22 Oct · Delayed", "TEST · Staff A"],
      ["Supplier answer recorded", "Supplier date Wed, 7 Oct", null],
    ]);
  });
  it("a recorded Supplier DO is said with its number", () => {
    expect(poTaskHistory(po({ do_number: "TEST-DO-77", do_uploaded_at: "2026-10-09T01:00:00.000Z" })).map((event) => [event.text, event.at]))
      .toEqual([["Supplier DO TEST-DO-77 recorded", "2026-10-09T01:00:00.000Z"]]);
    expect(poTaskHistory(po({}))).toEqual([]);
  });
});
