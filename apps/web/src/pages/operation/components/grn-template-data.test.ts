import { describe, it, expect } from "vitest";
import type { ReceivingSessionDetail } from "@/lib/queries";
import { grnTemplateDataOf } from "./grn-template-data";

/**
 * grn-template-data — the ONE arithmetic feeding the ONE GRN renderer
 * (owner correction 2026-09-06 §4/§6).
 *
 * The preview, Print, Download and the Amend LIVE preview all pass through
 * this builder, so what these tests pin is what every one of them prints.
 */

function detail(over?: {
  receipt?: Record<string, unknown>;
  events?: unknown[];
}): ReceivingSessionDetail {
  return {
    receipt: {
      id: "r-1",
      po_id: "PO-2001",
      warehouse_id: "wh-klang",
      warehouse_name: "Carres Klang",
      supplier_name: "Nice Future",
      do_number: "DO-5512",
      do_file_path: "dos/PO-2001/do.pdf",
      note: null,
      lines: [
        {
          id: "lr1",
          sku: "MS01",
          received_now: 2,
          damaged_qty: 1,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
        // A zero line — the PO's fact, not this arrival's; it stays OFF the
        // paper.
        {
          id: "lr2",
          sku: "BF01",
          received_now: 0,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ],
      status: "posted",
      submitted_by_name: null,
      submitted_at: "2026-09-01T02:00:00Z",
      reviewed_by_name: null,
      reviewed_at: null,
      return_reason: null,
      summary: "2 good",
      opens_claims: false,
      grn_no: "GRN-20260901-1234",
      goods_received_at: "2026-09-01",
      submitted_from: "office",
      posted_at: "2026-09-01T03:00:00Z",
      posted_by_name: "Shasha",
      posted_duty_holder_name: "Shasha",
      posted_duty_cover_name: null,
      posted_authority: "grn_duty",
      actual_site_name: null,
      arrival_evidence: [
        { path: "a.jpg", kind: "photo" },
        { path: "b.mp4", kind: "video" },
      ],
      extra_lines: [{ sku: "SF99", qty: 1, note: null }],
      unit_results: [
        {
          stock_item_id: "si1",
          unit_code: "U-0001",
          outcome: "received",
          issue_kind: null,
          note: null,
        },
        {
          stock_item_id: "si2",
          unit_code: "U-0002",
          outcome: "received_with_issue",
          issue_kind: "damaged",
          note: null,
        },
      ],
      ...(over?.receipt ?? {}),
    },
    po: {
      id: "PO-2001",
      supplier_id: "sup-nf",
      warehouse_id: "wh-klang",
      purchase_order_lines: [
        {
          id: "lr1",
          sku: "MS01",
          qty: 5,
          received_qty: 2,
          damaged_qty: 1,
          wrong_item_qty: 0,
        },
        {
          id: "lr2",
          sku: "BF01",
          qty: 2,
          received_qty: 0,
          damaged_qty: 0,
          wrong_item_qty: 0,
        },
      ],
    },
    line_info: {
      MS01: { description: "Mattress Forte K", category: "Mattress" },
      BF01: { description: "Bedframe Jager Q", category: "Bedframe" },
      SF99: { description: "Sofa Muro 1A", category: "Sofa" },
    },
    events: (over?.events ?? []) as ReceivingSessionDetail["events"],
  } as unknown as ReceivingSessionDetail;
}

describe("grnTemplateDataOf — the saved document", () => {
  it("carries the number, source, supplier and the three location/date facts", () => {
    const d = grnTemplateDataOf(detail());
    expect(d.grn_no).toBe("GRN-20260901-1234");
    expect(d.status_label).toBe("Valid");
    expect(d.source.po_number).toBe("PO-2001");
    expect(d.supplier.name).toBe("Nice Future");
    expect(d.supplier_do_no).toBe("DO-5512");
    expect(d.deliver_to).toBe("Carres Klang");
    // No override — the goods physically arrived at the instructed site.
    expect(d.goods_arrived_at).toBe("Carres Klang");
    expect(d.goods_received_on).toBe("2026-09-01");
  });

  it("prints only the lines this arrival counted, with the five quantity words", () => {
    const d = grnTemplateDataOf(detail());
    expect(d.lines).toHaveLength(1);
    const l = d.lines[0];
    expect(l.sku).toBe("MS01");
    expect(l.description).toBe("Mattress Forte K");
    expect(l.category).toBe("Mattress");
    expect(l.order_qty).toBe(5);
    expect(l.received_qty).toBe(2);
    expect(l.damaged_qty).toBe(1);
    expect(l.wrong_item_qty).toBe(0);
    // Cumulative: 5 ordered − 2 received = 3 still owed.
    expect(l.pending_delivery_qty).toBe(3);
  });

  it("carries Unit outcomes, extra goods, evidence counts and the duty trio", () => {
    const d = grnTemplateDataOf(detail());
    expect(d.unit_results).toEqual([
      { unit_code: "U-0001", outcome_label: "Received" },
      { unit_code: "U-0002", outcome_label: "Received with issue · damaged" },
    ]);
    expect(d.extra_lines).toEqual([{ sku: "SF99", qty: 1, note: null }]);
    expect(d.evidence).toEqual({ photos: 1, videos: 1, do_file: true });
    expect(d.duty.holder_name).toBe("Shasha");
    expect(d.duty.actor_name).toBe("Shasha");
    expect(d.duty.authority_label).toBe("GRN Duty");
    expect(d.cancelled).toBeNull();
  });

  it("binds Units by exact source line, preserving unbound and unreceived-line evidence", () => {
    const input = detail();
    input.receipt.unit_results[0].po_line_id = "lr1";
    input.receipt.unit_results[1].po_line_id = "lr2";
    // The same SKU on two lines must never join their Units.
    input.receipt.lines[1].sku = "MS01";
    input.receipt.unit_results.push({
      stock_item_id: "si3", unit_code: "U-0003", outcome: "not_received",
      issue_kind: null, note: null, po_line_id: null,
    });
    const data = grnTemplateDataOf(input);
    expect(data.lines[0].unit_results).toEqual([{ unit_code: "U-0001", outcome_label: "Received" }]);
    expect(data.unit_results).toEqual([
      { unit_code: "U-0002", outcome_label: "Received with issue · damaged" },
      { unit_code: "U-0003", outcome_label: "Not received" },
    ]);
  });

  it("a cancelled GRN is marked on the paper — number preserved", () => {
    const d = grnTemplateDataOf(
      detail({
        receipt: {
          status: "voided",
          void_at: "2026-09-02T00:00:00Z",
          void_by_name: "Jess",
          void_reason: "Duplicate entry",
        },
      }),
    );
    expect(d.status_label).toBe("Cancelled");
    expect(d.grn_no).toBe("GRN-20260901-1234");
    expect(d.cancelled).toEqual({
      date: "2026-09-02",
      reason: "Duplicate entry",
      by: "Jess",
    });
  });

  it("recorded amendments print on the paper, oldest first", () => {
    const d = grnTemplateDataOf(
      detail({
        events: [
          {
            id: "e2",
            receipt_id: "r-1",
            event: "amended",
            event_at: "2026-09-03T01:00:00Z",
            actor_name: "Li Ching",
            payload: { reason: "Second fix" },
          },
          {
            id: "e1",
            receipt_id: "r-1",
            event: "amended",
            event_at: "2026-09-02T01:00:00Z",
            actor_name: "Shasha",
            payload: { reason: "Miscount fixed" },
          },
        ],
      }),
    );
    expect(d.amendments).toEqual([
      { date: "2026-09-02", reason: "Miscount fixed", by: "Shasha" },
      { date: "2026-09-03", reason: "Second fix", by: "Li Ching" },
    ]);
  });
});

describe("grnTemplateDataOf — the Amend LIVE preview", () => {
  it("reflects the proposed correction: same number, corrected facts, amendment marked", () => {
    const d = grnTemplateDataOf(detail(), {
      reason: "Goods landed at Setia",
      goodsReceivedAt: "2026-08-30",
      doNumber: "DO-9999",
      goodsArrivedAt: "Carres Setia",
      lines: { lr1: 3 },
      byName: "Shasha",
      todayIso: "2026-09-06",
    });
    // The number NEVER changes.
    expect(d.grn_no).toBe("GRN-20260901-1234");
    expect(d.goods_received_on).toBe("2026-08-30");
    expect(d.supplier_do_no).toBe("DO-9999");
    expect(d.goods_arrived_at).toBe("Carres Setia");
    // The proposed received count moves this session AND the cumulative
    // pending by the same delta: 5 − (2 + 1) = 2.
    expect(d.lines[0].received_qty).toBe(3);
    expect(d.lines[0].pending_delivery_qty).toBe(2);
    // The amendment is clearly marked on the previewed paper.
    expect(d.amendments?.at(-1)).toEqual({
      date: "2026-09-06",
      reason: "Goods landed at Setia",
      by: "Shasha",
    });
  });
});

describe("grnTemplateDataOf — who received it and when (0601, owner 2026-09-17 / 09-28)", () => {
  it("prints the arrival time in Kuala Lumpur, on the KL date", () => {
    // 17:30 UTC on 30 Sep is 01:30 on 1 Oct in Kuala Lumpur.
    const d = grnTemplateDataOf(
      detail({ receipt: { goods_received_at: "2026-10-01", goods_received_time: "2026-09-30T17:30:00+00:00" } }),
    );
    expect(d.goods_received_on).toBe("2026-10-01");
    expect(d.goods_received_time).toBe("01:30");
  });

  it("an older record carries no clock — never back-filled", () => {
    const d = grnTemplateDataOf(detail());
    expect(d.goods_received_time).toBeNull();
  });

  it("prints Received by the company at a partner-run Site, the staff member at a Carres site", () => {
    expect(grnTemplateDataOf(detail({ receipt: { received_by_kind: "company", received_by_name: "NETS" } })).received_by).toBe("NETS");
    expect(grnTemplateDataOf(detail({ receipt: { received_by_kind: "staff", received_by_name: "Shasha" } })).received_by).toBe("Shasha");
    expect(grnTemplateDataOf(detail()).received_by).toBe("Not recorded");
  });

  it("the posting label names a non-duty Operation poster plainly", () => {
    const d = grnTemplateDataOf(detail({ receipt: { posted_authority: "operation_staff" } }));
    expect(d.duty.authority_label).toBe("Operation staff");
  });

  it("a SKU the Catalog could not answer prints Not recorded, never Other goods", () => {
    const input = detail();
    input.line_info = {};
    const d = grnTemplateDataOf(input);
    expect(d.lines[0]!.category).toBe("Not recorded");
  });

  it("the Amend preview reflects a named Unit and a corrected arrival time", () => {
    const input = detail();
    input.receipt.unit_results[0]!.po_line_id = "lr1";
    const d = grnTemplateDataOf(input, {
      reason: "Wrong Unit scanned",
      goodsReceivedTime: "2026-09-01T02:15:00+00:00",
      units: { si1: "not_received" },
      todayIso: "2026-09-06",
    });
    expect(d.goods_received_time).toBe("10:15");
    expect(d.lines[0]!.unit_results).toEqual([{ unit_code: "U-0001", outcome_label: "Not received" }]);
    // One named Unit back to Not received: 2 − 1 received on this GRN.
    expect(d.lines[0]!.received_qty).toBe(1);
    expect(d.lines[0]!.pending_delivery_qty).toBe(4);
  });
});

