/**
 * Purchase Order PDF template — built to docs/pdf/PO-PDF-STANDARD.md (the Law,
 * Loo 2026-08-01/02). That file is the single source of truth for every rule
 * here; change the Law first, the template second.
 *
 * The payload is the money-free `purchasing_po_document` RPC (migration 0307):
 * no RM figure ever reaches this component, so nothing here can print one.
 *
 * Header  — logo stamp + 35mm label-gutter (SUPPLIER DELIVERY BY / PO ISSUED
 *           DATE, dates ALL CAPS 7pt/700 on one X) · right: PURCHASE ORDER
 *           over the PO number (18pt, the page's only bold-black hero).
 *           Fixed — repeats on every page.
 * Cards   — frameless SUPPLIER + DELIVER TO, inset 4mm (first page only).
 * Table   — # · Sales Order · Item ID · Description · Qty. Zero grid lines;
 *           hairline rhythm between items; an item never splits across pages
 *           (wrap={false}); Qty inset 10mm from the table edge.
 * Sofa    — a plan-view layout drawing per model when the PO carries module
 *           lines (…(LHF)/…(RHF)), so the factory never builds mirror-reversed.
 * Footer  — one 8mm row: Issued by · legal sentence · page — fixed, every page.
 *
 * Known v1 gaps (recorded in the Law, not hidden):
 * - Per-line Sales Order attribution does not exist in the schema
 *   (purchase_order_lines carries no SO). The column prints only when the PO
 *   covers exactly ONE sales order; a merged PO leaves the cells blank until
 *   the allocation work (P5) lands.
 * - Item ID is the per-unit id the system will mint at Issue; no such system
 *   exists yet, so the reserved column prints blank (never the SKU).
 */

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import type { PoTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const LIGHT = "#9A9288";
const HAIR = "#CFC9C0";
const SEAT_BG = "#EDE8E0";
const BACK_BG = "#D8D2C8";

const mm = (v: number) => v * 2.83465;

// The wordmark asset the app serves. In the browser @react-pdf fetches the
// absolute URL; under node (tests/harnesses) it reads the file from disk, so
// the path form keeps both worlds rendering the same stamp.
const LOGO_SRC =
  typeof window !== "undefined" && window.location
    ? `${window.location.origin}/carres-wordmark.png`
    : "public/carres-wordmark.png";

const MARGIN = mm(12);
const HEADER_H = mm(20);
const FOOTER_H = mm(8);

/** `2026-08-12` → `WED, 12 AUG 26`. Textual parse — timezone-proof. */
function capsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][mo - 1];
  return `${dow}, ${d} ${mon} ${String(y).slice(2)}`;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 9,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },
  // ── header (fixed) ─────────────────────────────────────────────────────────
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { height: mm(6), width: mm(25.3) },
  wlabel: { fontSize: 6, color: LIGHT, letterSpacing: 1.2, width: mm(35) },
  wdate: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, color: INK },
  metaRow: { flexDirection: "row", alignItems: "flex-end" },
  docBlock: { alignItems: "flex-end", alignSelf: "flex-end" },
  docTitle: { fontSize: 10, color: GREY, letterSpacing: 1.5 },
  docNumber: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  headerRule: { borderBottomWidth: 0.8, borderBottomColor: INK, marginTop: mm(1.5) },
  // ── cards ──────────────────────────────────────────────────────────────────
  cards: { flexDirection: "row", marginTop: mm(2), paddingHorizontal: mm(4) },
  cardLabel: { fontSize: 7.5, color: GREY, letterSpacing: 0.8, textTransform: "uppercase" },
  cardName: { fontSize: 9.5, fontWeight: 600, marginTop: mm(1.5) },
  cardLine: { fontSize: 9, marginTop: mm(1) },
  cardNote: { fontSize: 7.5, color: GREY, marginTop: mm(1) },
  // ── table ──────────────────────────────────────────────────────────────────
  tableHead: {
    borderTopWidth: 0.5,
    borderTopColor: INK,
    borderBottomWidth: 0.5,
    borderBottomColor: INK,
    flexDirection: "row",
    paddingVertical: mm(1.5),
    marginTop: mm(3),
  },
  th: { fontSize: 7.5, color: GREY, letterSpacing: 0.8, textTransform: "uppercase" },
  colNo: { width: mm(8) },
  colSo: { width: mm(24) },
  colId: { width: mm(22) },
  colQty: { width: mm(24), textAlign: "right", paddingRight: mm(10) },
  row: { flexDirection: "row", paddingVertical: mm(2.2) },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },
  cellNo: { fontSize: 9, color: GREY, width: mm(8) },
  cellSo: { fontSize: 8.5, width: mm(24) },
  cellId: { fontSize: 8.5, color: LIGHT, width: mm(22) },
  desc: { flex: 1, paddingRight: mm(4) },
  descSku: { fontSize: 9.5, fontWeight: 700 },
  descVariant: { fontSize: 9.5, color: GREY },
  descLine: { fontSize: 9, marginTop: mm(0.8) },
  pairRow: { flexDirection: "row", marginTop: mm(0.8) },
  pairLabel: { fontSize: 7.5, color: GREY, width: mm(22) },
  pairValue: { fontSize: 9, flex: 1 },
  cellQty: { fontSize: 10, fontWeight: 700, width: mm(24), textAlign: "right", paddingRight: mm(10) },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: INK,
    borderBottomWidth: 0.5,
    borderBottomColor: INK,
    paddingVertical: mm(1.5),
  },
  totalLabel: { fontSize: 7.5, color: GREY, letterSpacing: 0.8, flex: 1 },
  // ── sofa layout drawing ────────────────────────────────────────────────────
  layout: { marginTop: mm(4) },
  layoutCaption: { fontSize: 8, color: GREY, marginTop: mm(1) },
  layoutRow: { flexDirection: "row", alignItems: "flex-start", marginTop: mm(2), justifyContent: "center" },
  moduleBox: { alignItems: "center", marginRight: mm(2) },
  moduleCode: { fontSize: 8.5, fontWeight: 600, marginTop: mm(1.5) },
  moduleFabric: { fontSize: 8, color: GREY, marginTop: mm(0.5) },
  tvLine: { width: 0.6, height: mm(4), backgroundColor: GREY, marginTop: mm(2), alignSelf: "center" },
  tvBox: { backgroundColor: INK, paddingHorizontal: mm(3), paddingVertical: mm(0.8), marginTop: mm(0.5), alignSelf: "center" },
  tvText: { fontSize: 8, color: "#FFFFFF", letterSpacing: 1.5 },
  // ── footer (fixed) ─────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: mm(2),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerCell: { fontSize: 7.5, color: GREY, width: mm(45) },
  footerLegal: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
  footerPage: { fontSize: 7.5, color: GREY, width: mm(45), textAlign: "right" },
});

type PoLine = PoTemplateData["lines"][number];

/** Sofa module lines carry a side marker in the SKU (`5539-2B(LHF)`). */
const SIDE_RE = /\((LHF|RHF)\)/;

function sofaGroups(lines: PoLine[]): Array<{ model: string; modules: PoLine[] }> {
  const models = new Set<string>();
  for (const l of lines) {
    if (SIDE_RE.test(l.sku)) {
      const dash = l.sku.indexOf("-");
      if (dash > 0) models.add(l.sku.slice(0, dash));
    }
  }
  return [...models].map((model) => ({
    model,
    modules: lines.filter((l) => l.sku.startsWith(`${model}-`)),
  }));
}

function moduleCodeOf(line: PoLine): string {
  const dash = line.sku.indexOf("-");
  return dash > 0 ? line.sku.slice(dash + 1) : line.sku;
}

/** Chaise modules read deeper toward the TV — `L(RHF)` / `CHL(LHF)` shapes. */
function isChaise(code: string): boolean {
  return /^L\(/.test(code) || code.includes("CHL");
}

export function PoTemplate(data: PoTemplateData) {
  const { po_number, issue_date, supplier, destination, delivery_instructions, eta_date, so_refs, issued_by, lines } = data;

  const deliveryBy = capsDate(eta_date);
  const issuedOn = capsDate(issue_date);

  // Per-line SO attribution exists only when the PO covers ONE sales order.
  const soLabel = so_refs && so_refs.length === 1 ? `SO-${so_refs[0]}` : "";
  // Bulk PO (several sales orders) closes with a TOTAL QUANTITY summary row;
  // a one-customer PO does not (PO-PDF-STANDARD §6.1 / §6.2).
  const isBulk = (so_refs?.length ?? 0) > 1;
  const totalQty = lines.reduce((s, l) => s + Number(l.qty), 0);

  const groups = sofaGroups(lines);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* header — fixed, repeats on every page */}
        <View style={styles.header} fixed>
          <View style={styles.headerRow}>
            <View>
              <Image style={styles.logo} src={LOGO_SRC} />
              {deliveryBy ? (
                <View style={[styles.metaRow, { marginTop: mm(2.2) }]}>
                  <Text style={styles.wlabel}>SUPPLIER DELIVERY BY</Text>
                  <Text style={styles.wdate}>{deliveryBy}</Text>
                </View>
              ) : null}
              {issuedOn ? (
                <View style={[styles.metaRow, { marginTop: mm(1) }]}>
                  <Text style={styles.wlabel}>PO ISSUED DATE</Text>
                  <Text style={styles.wdate}>{issuedOn}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.docBlock}>
              <Text style={styles.docTitle}>PURCHASE ORDER</Text>
              <Text style={styles.docNumber}>{po_number}</Text>
            </View>
          </View>
          <View style={styles.headerRule} />
        </View>

        {/* cards — first page only (they flow) */}
        <View style={styles.cards}>
          <View style={{ flex: 2, paddingRight: mm(6) }}>
            <Text style={styles.cardLabel}>Supplier</Text>
            <Text style={styles.cardName}>{supplier.name}</Text>
            {supplier.contact ? <Text style={styles.cardLine}>{supplier.contact}</Text> : null}
          </View>
          <View style={{ flex: 4 }}>
            <Text style={styles.cardLabel}>Deliver To</Text>
            <Text style={styles.cardName}>{destination.name}</Text>
            <Text style={styles.cardLine}>{destination.address}</Text>
            {delivery_instructions ? <Text style={styles.cardNote}>{delivery_instructions}</Text> : null}
          </View>
        </View>

        {/* table */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colSo]}>Sales Order</Text>
          <Text style={[styles.th, styles.colId]}>Item ID</Text>
          <Text style={[styles.th, { flex: 1 }]}>Description</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
        </View>
        {lines.map((line, idx) => {
          const isLast = idx === lines.length - 1;
          const a = (line.attrs ?? {}) as { color?: string; gap?: string; fabric_name?: string };
          const pairs: Array<[string, string]> = [];
          if (a.gap) pairs.push(["Gap", a.gap]);
          if (a.fabric_name) pairs.push(["Fabric", a.fabric_name]);
          const showVariant = line.description && line.description !== line.sku;
          return (
            <View key={`${line.sku}-${idx}`} wrap={false} style={isLast ? styles.row : [styles.row, styles.rowHair]}>
              <Text style={styles.cellNo}>{idx + 1}</Text>
              <Text style={styles.cellSo}>{soLabel}</Text>
              <Text style={styles.cellId}> </Text>
              <View style={styles.desc}>
                <Text>
                  <Text style={styles.descSku}>{line.sku}</Text>
                  {showVariant ? <Text style={styles.descVariant}>{` — ${line.description}`}</Text> : null}
                </Text>
                {a.color ? <Text style={styles.descLine}>{a.color}</Text> : null}
                {pairs.map(([pl, pv]) => (
                  <View key={pl} style={styles.pairRow}>
                    <Text style={styles.pairLabel}>{pl}</Text>
                    <Text style={styles.pairValue}>{pv}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.cellQty}>{line.qty}</Text>
            </View>
          );
        })}
        {isBulk ? (
          <View style={styles.totalRow}>
            <View style={{ width: mm(8 + 24 + 22) }} />
            <Text style={styles.totalLabel}>TOTAL QUANTITY</Text>
            <Text style={styles.cellQty}>{totalQty}</Text>
          </View>
        ) : null}

        {/* sofa layout drawings — one per model with module lines */}
        {groups.map(({ model, modules }) => (
          <View key={model} wrap={false} style={styles.layout}>
            <Text style={styles.cardLabel}>Sofa Layout</Text>
            <Text style={styles.layoutCaption}>Top view. Back at the top. TV in front.</Text>
            <View style={styles.layoutRow}>
              {modules.map((m, i) => {
                const code = moduleCodeOf(m);
                const fabric = (m.attrs as { fabric_name?: string } | null)?.fabric_name;
                return (
                  <View key={`${m.sku}-${i}`} style={styles.moduleBox}>
                    <View
                      style={{
                        width: mm(30),
                        height: isChaise(code) ? mm(42) : mm(24),
                        backgroundColor: SEAT_BG,
                        borderWidth: 0.6,
                        borderColor: GREY,
                      }}
                    >
                      <View style={{ height: mm(5), backgroundColor: BACK_BG }} />
                    </View>
                    <Text style={styles.moduleCode}>{Number(m.qty) > 1 ? `${code} ×${m.qty}` : code}</Text>
                    {fabric ? <Text style={styles.moduleFabric}>{fabric}</Text> : null}
                  </View>
                );
              })}
            </View>
            <View style={styles.tvLine} />
            <View style={styles.tvBox}>
              <Text style={styles.tvText}>TV</Text>
            </View>
          </View>
        ))}

        {/* footer — one quiet 8mm row, fixed on every page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerCell}>{issued_by ? `Issued by ${issued_by}` : " "}</Text>
          <Text style={styles.footerLegal}>Computer-generated document · No signature required.</Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
