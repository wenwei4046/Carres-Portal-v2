/**
 * grn-template-data — the ONE arithmetic feeding the ONE GRN renderer
 * (owner correction 2026-09-06).
 *
 * PURE — no I/O, no clock. The GRN object's preview pane, its Print, its
 * Download PDF and the Amend view's LIVE preview all pass through this
 * builder, so the paper and the screen can never disagree (the
 * SalesOrderWorkspace `draftTemplateData` discipline).
 *
 * The Amend draft overlay reflects the PROPOSED correction into the preview:
 * the same GRN number, the corrected facts, and the amendment marked on the
 * paper itself — nothing is silently editable.
 */
import {
  countedOnLine,
  goodsCategoryWordOf,
  receivingDisplayNo,
  RECEIVING_AUTHORITY_LABEL,
  RECEIVING_UNIT_OUTCOME_LABEL,
  warehouseReceiptStatusLabel,
  type WarehouseReceiptLine,
} from "@carres/shared";
import type { GrnTemplateData } from "@/lib/pdf/types";
import type { ReceivingSessionDetail } from "@/lib/queries";

/** The proposed correction, exactly as the Amend form holds it mid-edit. */
export interface GrnAmendDraft {
  reason: string;
  goodsReceivedAt?: string;
  doNumber?: string;
  /** The proposed physical arrival location's NAME (display fact). */
  goodsArrivedAt?: string;
  /** Proposed `received_now` per receipt line id. */
  lines?: Record<string, number>;
  /** Who is proposing — printed on the draft's amendment mark. */
  byName?: string | null;
  /** Today, ISO — passed in, never read from a clock here. */
  todayIso: string;
}

export function grnTemplateDataOf(
  detail: ReceivingSessionDetail,
  draft?: GrnAmendDraft | null,
): GrnTemplateData {
  const r = detail.receipt;
  const info = detail.line_info ?? {};
  const allLines = (r.lines ?? []) as WarehouseReceiptLine[];
  // The GRN documents THIS arrival: lines the delivery actually counted. A
  // session that somehow counted nothing prints all its lines rather than an
  // empty paper.
  const counted = allLines.filter(
    (l) =>
      countedOnLine({
        receivedNow: l.received_now,
        damagedQty: l.damaged_qty,
        wrongItemQty: l.wrong_item_qty,
      }) > 0,
  );
  const docLines = counted.length > 0 ? counted : allLines;

  const poLineById = new Map(
    (detail.po?.purchase_order_lines ?? []).map((pl) => [pl.id, pl]),
  );

  const lines = docLines.map((l) => {
    const pl = poLineById.get(l.id);
    const receivedNow = draft?.lines?.[l.id] ?? l.received_now;
    // A proposed received_now change moves the PO's cumulative received by
    // the same delta — the preview's Pending must say what saving would.
    const delta = receivedNow - l.received_now;
    const orderQty = pl?.qty ?? 0;
    const cumulativeReceived = (pl?.received_qty ?? 0) + delta;
    return {
      sku: l.sku,
      description: info[l.sku]?.description ?? l.sku,
      // Server-resolved word first; the same shared ladder covers version
      // skew (an older Worker sends no line_info).
      category: info[l.sku]?.category ?? goodsCategoryWordOf({ sku: l.sku }),
      order_qty: orderQty,
      received_qty: receivedNow,
      damaged_qty: l.damaged_qty,
      wrong_item_qty: l.wrong_item_qty,
      pending_delivery_qty: pl ? Math.max(0, orderQty - cumulativeReceived) : 0,
    };
  });

  const evidence = {
    photos: (r.arrival_evidence ?? []).filter((e) => e.kind === "photo").length,
    videos: (r.arrival_evidence ?? []).filter((e) => e.kind === "video").length,
    do_file: Boolean(r.do_file_path),
  };

  // Append-only amendment history, oldest first — the paper reads downward.
  const amendments = detail.events
    .filter((e) => e.event === "amended")
    .map((e) => ({
      date: e.event_at.slice(0, 10),
      reason: (e.payload?.reason as string | undefined) ?? null,
      by: e.actor_name ?? null,
    }))
    .reverse();
  if (draft) {
    amendments.push({
      date: draft.todayIso.slice(0, 10),
      reason: draft.reason.trim() || null,
      by: draft.byName ?? null,
    });
  }

  return {
    grn_no: receivingDisplayNo(r),
    status_label: warehouseReceiptStatusLabel(r.status),
    source: {
      po_number: r.po_id,
      is_consignment: Boolean(
        (detail.po as { is_consignment?: boolean } | null)?.is_consignment,
      ),
    },
    supplier: { name: r.supplier_name ?? "" },
    supplier_do_no: draft?.doNumber ?? r.do_number,
    deliver_to: r.warehouse_name ?? "",
    goods_arrived_at:
      draft?.goodsArrivedAt ?? r.actual_site_name ?? r.warehouse_name ?? "",
    goods_received_on: draft?.goodsReceivedAt ?? r.goods_received_at ?? null,
    lines,
    unit_results: (r.unit_results ?? []).map((u) => ({
      unit_code: u.unit_code,
      outcome_label: [
        RECEIVING_UNIT_OUTCOME_LABEL[u.outcome],
        u.issue_kind === "wrong_item" ? "wrong item" : null,
        u.issue_kind === "damaged" ? "damaged" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    extra_lines: r.extra_lines ?? [],
    evidence,
    duty: {
      holder_name: r.posted_duty_holder_name ?? null,
      cover_name: r.posted_duty_cover_name ?? null,
      actor_name: r.posted_by_name ?? null,
      authority_label: r.posted_authority
        ? (RECEIVING_AUTHORITY_LABEL[r.posted_authority] ?? null)
        : null,
      posted_on: r.posted_at ? r.posted_at.slice(0, 10) : null,
    },
    amendments,
    cancelled:
      r.status === "voided"
        ? {
            date: r.void_at ? r.void_at.slice(0, 10) : null,
            reason: r.void_reason ?? null,
            by: r.void_by_name ?? null,
          }
        : null,
  };
}
