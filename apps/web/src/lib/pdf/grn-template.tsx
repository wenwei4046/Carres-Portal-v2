/**
 * Goods Received Note PDF template — the formal receiving document
 * (owner correction 2026-09-06; the 【RECEIVING】 CARD 01 completion).
 *
 * Built on docs/pdf/SO-PDF-STANDARD.md chrome, exactly as the DO and the PO
 * are: header with hero number, parties voice, ink bar + hairline items
 * table with a TOTAL row, quiet footer with page numbers. The GRN's own
 * business rules:
 *
 * - NO MONEY anywhere — a receiving document talks quantity and identity.
 * - THREE location/date facts, never merged (owner correction 2026-09-06):
 *   `Deliver To` (the PO's instruction) · `Goods arrived at` (the physical
 *   truth) · `Goods received on` (the physical arrival date).
 * - The FIVE quantity words per line: Order Qty · Received Qty · Damaged Qty
 *   · Wrong Item Qty · Pending Delivery Qty (purchasing/MASTER §5.7).
 * - Exact-Unit outcomes print under their line — the scan record is part of
 *   the paper, not a screen-only fact.
 * - AMENDED and CANCELLED are marked ON the document: a reprint of an
 *   amended GRN carries its amendment history; a cancelled GRN says so in a
 *   band nobody can miss. The number never changes.
 * - The duty-evidence trio prints: normal GRN Duty holder · dated cover ·
 *   the actual actor — three facts, never one overwritten name.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { GrnTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAR_BG = INK;

const mm = (v: number) => v * 2.83465;

const MARGIN = mm(12);
const HEADER_H = mm(20);
const FOOTER_H = mm(8);

/** `2026-08-24` → `Mon, 24 Aug 26` (SO-PDF-STANDARD body-date form). */
function niceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return `${dow}, ${d} ${mon} ${String(y).slice(2)}`;
}

const QTY_W = mm(13);

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 8,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },

  // ── header (fixed) — SO-PDF-STANDARD §3 ──
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  // ── the CANCELLED / AMENDED band — marking, not decoration ──
  markBand: {
    borderWidth: 1.4,
    borderColor: "#000000",
    paddingVertical: mm(2.2),
    paddingHorizontal: mm(3),
    marginTop: mm(3.5),
  },
  markText: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4 },
  markSub: { fontSize: 7.5, color: GREY, marginTop: mm(0.8), lineHeight: 1.3 },

  // ── parties — §4 voice ──
  cards: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), minHeight: mm(26) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(30), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },

  // ── items table — the five quantity words ──
  tableHead: {
    backgroundColor: BAR_BG,
    flexDirection: "row",
    paddingVertical: mm(1.8),
    paddingHorizontal: mm(2),
    marginTop: mm(2.5),
  },
  th: { fontSize: 6.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  colNo: { width: mm(6) },
  colCat: { width: mm(20) },
  colQty: { width: QTY_W, textAlign: "right", paddingRight: mm(1) },
  row: { flexDirection: "row", paddingVertical: mm(2), paddingHorizontal: mm(2) },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },
  cellNo: { fontSize: 7, color: GREY, width: mm(6), textAlign: "right", paddingRight: mm(1.5), lineHeight: 1 },
  desc: { flex: 1, paddingRight: mm(2) },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1.15 },
  descSku: { fontSize: 7, color: GREY, marginTop: mm(0.6), lineHeight: 1.15 },
  unitLine: { fontSize: 6.8, color: GREY, marginTop: mm(0.5), paddingLeft: mm(2), lineHeight: 1.25 },
  cellCat: { fontSize: 7, color: GREY, width: mm(20), lineHeight: 1.3 },
  cellQty: { fontSize: 7.5, width: QTY_W, textAlign: "right", paddingRight: mm(1), lineHeight: 1 },

  // ── evidence + extra goods ──
  noteBlock: { marginTop: mm(3), paddingHorizontal: mm(4) },
  noteText: { fontSize: 7.5, color: GREY, lineHeight: 1.4 },

  // ── the recording block — the duty-evidence trio ──
  dutyZone: { marginTop: mm(6), paddingHorizontal: mm(4) },

  // ── footer (fixed) — §9 ──
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: mm(2),
  },
  footerCell: { fontSize: 7.5, color: GREY, width: mm(45) },
  footerCenter: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
  footerPage: { fontSize: 7.5, color: GREY, width: mm(45), textAlign: "right" },
});

export function GrnTemplate(data: GrnTemplateData) {
  const {
    grn_no,
    source,
    supplier,
    supplier_do_no,
    deliver_to,
    goods_arrived_at,
    goods_received_on,
    lines,
    unit_results,
    extra_lines,
    evidence,
    duty,
    amendments,
    cancelled,
  } = data;

  const detailRows: Array<[string, string | null]> = [
    [source.is_consignment ? "CO No" : "PO No", source.po_number],
    ["Supplier", supplier.name],
    ["Supplier DO No.", supplier_do_no],
    ["Deliver To", deliver_to],
    ["Goods arrived at", goods_arrived_at],
    ["Goods received on", niceDate(goods_received_on)],
  ];

  const totals = lines.reduce(
    (t, l) => ({
      order: t.order + l.order_qty,
      received: t.received + l.received_qty,
      damaged: t.damaged + l.damaged_qty,
      wrong: t.wrong + l.wrong_item_qty,
      pending: t.pending + l.pending_delivery_qty,
    }),
    { order: 0, received: 0, damaged: 0, wrong: 0, pending: 0 },
  );

  const evidenceBits = [
    evidence && evidence.photos > 0
      ? `${evidence.photos} arrival photo${evidence.photos === 1 ? "" : "s"}`
      : null,
    evidence && evidence.videos > 0
      ? `${evidence.videos} arrival video${evidence.videos === 1 ? "" : "s"}`
      : null,
    evidence?.do_file ? "signed supplier DO on file" : null,
  ].filter(Boolean);

  const isAmended = (amendments ?? []).length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── header — full identity page 1, one-liner after (SO §3) ── */}
        <View
          style={styles.header}
          fixed
          render={({ pageNumber }) =>
            pageNumber === 1 ? (
              <View>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1, paddingRight: mm(10) }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                      <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
                      <Text style={styles.ssmInline}>SSM {CARRES_COMPANY.regNo}</Text>
                    </View>
                    <Text style={[styles.legalLine, { marginTop: mm(1.8) }]}>
                      {CARRES_COMPANY.addressLines[0]}
                    </Text>
                    <Text style={styles.legalLine}>
                      {CARRES_COMPANY.addressLines[1]} {CARRES_COMPANY.addressLines[2]}
                    </Text>
                  </View>
                  <View style={styles.docBlock}>
                    <Text style={styles.docNumber}>{grn_no}</Text>
                    <Text style={styles.docTitle}>GOODS RECEIVED NOTE</Text>
                  </View>
                </View>
                <View style={styles.headerRule} />
              </View>
            ) : (
              <View>
                <View style={[styles.headerRow, { alignItems: "flex-end" }]}>
                  <Text style={styles.legalLine}>
                    {CARRES_COMPANY.legalName} · SSM {CARRES_COMPANY.regNo}
                  </Text>
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>GOODS RECEIVED NOTE · {grn_no}</Text>
                </View>
                <View style={styles.headerRule} />
              </View>
            )
          }
        />

        {/* ── cancellation / amendment marking — on the paper itself ── */}
        {cancelled ? (
          <View style={styles.markBand} minPresenceAhead={30}>
            <Text style={styles.markText}>CANCELLED</Text>
            <Text style={styles.markSub}>
              {[
                cancelled.date ? `Cancelled ${niceDate(cancelled.date)}` : "Cancelled",
                cancelled.by ? `by ${cancelled.by}` : null,
                cancelled.reason,
              ]
                .filter(Boolean)
                .join(" · ")}
              . The record and its evidence are preserved; its stock consequences were reversed.
            </Text>
          </View>
        ) : isAmended ? (
          <View style={styles.markBand} minPresenceAhead={30}>
            <Text style={styles.markText}>AMENDED</Text>
            {(amendments ?? []).map((a, i) => (
              <Text key={i} style={styles.markSub}>
                {[niceDate(a.date), a.by ? `by ${a.by}` : null, a.reason]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── RECEIVING DETAILS — the three facts, never merged ── */}
        <View style={styles.cards}>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel}>Receiving Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {detailRows.map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={styles.pairLabel}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        </View>

        {/* ── items — the five governed quantity words per line ── */}
        <View style={styles.tableHead} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, { flex: 1 }]}>Description</Text>
          <Text style={[styles.th, styles.colCat]}>Category</Text>
          <Text style={[styles.th, styles.colQty]}>Order Qty</Text>
          <Text style={[styles.th, styles.colQty]}>Received Qty</Text>
          <Text style={[styles.th, styles.colQty]}>Damaged Qty</Text>
          <Text style={[styles.th, styles.colQty]}>Wrong Item Qty</Text>
          <Text style={[styles.th, styles.colQty]}>Pending Delivery Qty</Text>
        </View>
        {lines.map((l, i) => (
          <View key={`${l.sku}-${i}`} wrap={false} style={[styles.row, styles.rowHair]}>
            <Text style={styles.cellNo}>{i + 1}</Text>
            <View style={styles.desc}>
              <Text style={styles.descMain}>{l.description}</Text>
              <Text style={styles.descSku}>{l.sku}</Text>
            </View>
            <Text style={styles.cellCat}>{l.category}</Text>
            <Text style={styles.cellQty}>{l.order_qty}</Text>
            <Text style={styles.cellQty}>{l.received_qty}</Text>
            <Text style={styles.cellQty}>{l.damaged_qty}</Text>
            <Text style={styles.cellQty}>{l.wrong_item_qty}</Text>
            <Text style={styles.cellQty}>{l.pending_delivery_qty}</Text>
          </View>
        ))}
        <View
          wrap={false}
          style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
        >
          <Text style={styles.cellNo}> </Text>
          <View style={styles.desc}>
            <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>TOTAL</Text>
          </View>
          <Text style={styles.cellCat}> </Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totals.order}</Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totals.received}</Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totals.damaged}</Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totals.wrong}</Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totals.pending}</Text>
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />

        {/* ── exact-Unit outcomes — the scan record is part of the paper ── */}
        {(unit_results ?? []).length > 0 ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text style={styles.blockLabel}>Unit results</Text>
            {(unit_results ?? []).map((u) => (
              <Text key={u.unit_code} style={[styles.unitLine, { paddingLeft: 0 }]}>
                · {u.unit_code} — {u.outcome_label}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── extra goods — outside Inventory and the pending arithmetic ── */}
        {(extra_lines ?? []).length > 0 ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text style={styles.blockLabel}>Extra goods recorded</Text>
            {(extra_lines ?? []).map((x, i) => (
              <Text key={`x-${i}`} style={[styles.noteText, { marginTop: mm(0.8) }]}>
                · {x.sku} × {x.qty}
                {x.note ? ` — ${x.note}` : ""} (recorded separately; not Inventory)
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── evidence references ── */}
        {evidenceBits.length > 0 ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text style={styles.noteText}>Evidence: {evidenceBits.join(" · ")}.</Text>
          </View>
        ) : null}

        {/* ── the recording block — three facts, never one overwritten name ── */}
        <View wrap={false} style={[styles.dutyZone, { marginTop: "auto" }]}>
          <Text style={styles.blockLabel}>Recorded By</Text>
          <View style={{ marginTop: mm(1.5) }}>
            <View style={styles.pairRow}>
              <Text style={styles.pairLabel}>GRN Duty</Text>
              <Text style={styles.pairValue}>
                :  {duty.holder_name ?? "No GRN duty holder recorded"}
              </Text>
            </View>
            {duty.cover_name ? (
              <View style={styles.pairRow}>
                <Text style={styles.pairLabel}>Cover</Text>
                <Text style={styles.pairValue}>:  {duty.cover_name}</Text>
              </View>
            ) : null}
            <View style={styles.pairRow}>
              <Text style={styles.pairLabel}>Saved by</Text>
              <Text style={styles.pairValue}>
                :  {duty.actor_name ?? "Staff identity not recorded"}
                {duty.authority_label ? ` (${duty.authority_label})` : ""}
                {duty.posted_on ? ` · ${niceDate(duty.posted_on)}` : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* ── footer — fixed, every page (SO §9) ── */}
        <View style={styles.footer} fixed>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.footerCell}>{grn_no}</Text>
            <Text style={styles.footerCenter}>
              Computer-generated document · A reprint carries the same number.
            </Text>
            <Text
              style={styles.footerPage}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
