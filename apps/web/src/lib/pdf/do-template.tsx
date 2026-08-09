/**
 * Delivery Order PDF template — the signed proof-of-delivery the customer
 * and the driver both put a name to.
 *
 * 2026-08-09 (Loo) — rebuilt on docs/pdf/SO-PDF-STANDARD.md: the SAME
 * chrome as the Sales Order (header with hero number, drawInfoColumns
 * parties voice, ink bar + grey band items table with a TOTAL row, fixed
 * zones, bottom-anchored signing zone, quiet footer with page numbers),
 * with the DO's own business rules:
 *
 * - NO MONEY anywhere. A delivery document shows quantity, not price —
 *   the same ruling 2990's owner made (2026-06-26) and our PO law lives by.
 * - DELIVER TO leads (the driver's page, not the biller's): name, address,
 *   phone. DELIVERY DETAILS: Doc No · SO Ref · Delivery date · Logistic ·
 *   Access (floor/lift — nobody needs it more than the crew).
 * - TWO dashed signature boxes pinned to the page bottom — customer
 *   received + driver delivered — over the good-order acknowledgment
 *   sentence. A captured POD eSign prints into the customer box.
 * - The PO No column IS 2990's Source PO picking aid — Carres HAS the
 *   data (24 POs, 23 linked to SOs, verified 2026-08-09); the owner
 *   caught my earlier false "no such data" claim. m³ and Rack stay
 *   uncopied — those really don't exist here.
 * - DELIVER TO carries the Emergency contact — who the driver calls when
 *   the customer is unreachable (sales portal collects it, 32/77).
 * - ONE DO PER TRIP (owner, 2026-08-09; mirrors the frozen purchasing
 *   bundle rule): mattress + bedframe travel as ONE DO, the sofa gets its
 *   OWN DO — and the sofa DO carries the layout drawing (below) so the
 *   crew never assembles it mirror-reversed. The SPLIT is the API's job
 *   when cutting DOs; this template renders whatever one trip carries.
 *
 * Sizes and row pitches are SO-PDF-STANDARD §2.1/§8.5 verbatim (the
 * conversion law: 2990 nominal − 0.5pt, pitches in absolute mm).
 */

import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { DoTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAND_BG = "#EDEDED";
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

  // ── parties — §4 voice ──
  cards: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), minHeight: mm(32) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(20), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },

  // ── items table — §5, without the money columns ──
  tableHead: {
    backgroundColor: BAR_BG,
    flexDirection: "row",
    paddingVertical: mm(1.8),
    paddingHorizontal: mm(2),
    marginTop: mm(2.5),
  },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  colNo: { width: mm(7) },
  colCode: { width: mm(30) },
  colPo: { width: mm(24) },
  colQty: { width: mm(14), textAlign: "right" },
  bandRow: {
    flexDirection: "row",
    backgroundColor: BAND_BG,
    paddingVertical: mm(1.2),
    paddingHorizontal: mm(2),
    marginTop: mm(1),
  },
  bandText: { fontSize: 7.5, fontWeight: 700, color: INK, letterSpacing: 0.3 },
  row: { flexDirection: "row", paddingVertical: mm(2), paddingHorizontal: mm(2) },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },
  cellNo: { fontSize: 7, color: GREY, width: mm(7), textAlign: "right", paddingRight: mm(1.5), lineHeight: 1 },
  cellCode: { fontSize: 7.5, width: mm(30), paddingRight: mm(2), lineHeight: 1 },
  desc: { flex: 1, paddingRight: mm(3) },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1 },
  cellPo: { fontSize: 7, color: GREY, width: mm(24), lineHeight: 1.3 },
  cellQty: { fontSize: 7, width: mm(14), textAlign: "right", lineHeight: 1 },

  // ── sofa layout drawing (ported from po-template — direction contract) ──
  layout: { marginTop: mm(4), paddingHorizontal: mm(4) },
  layoutCaption: { fontSize: 7, color: GREY, marginTop: mm(1) },
  layoutRow: { flexDirection: "row", alignItems: "flex-start", marginTop: mm(2), justifyContent: "center" },
  moduleBox: { alignItems: "center", marginRight: mm(2) },
  moduleCode: { fontSize: 7.5, fontWeight: 600, marginTop: mm(1.5) },
  moduleFabric: { fontSize: 7, color: GREY, marginTop: mm(0.5) },
  tvLine: { width: 0.6, height: mm(4), backgroundColor: GREY, marginTop: mm(2), alignSelf: "center" },
  tvBox: { backgroundColor: INK, paddingHorizontal: mm(3), paddingVertical: mm(0.8), marginTop: mm(0.5), alignSelf: "center" },
  tvText: { fontSize: 7.5, color: "#FFFFFF", letterSpacing: 1.5 },

  // ── signing zone (bottom-anchored) ──
  signZone: { flexDirection: "row", justifyContent: "space-between", marginTop: mm(6), paddingHorizontal: mm(4) },
  signBox: {
    borderWidth: 0.6,
    borderColor: "#787878",
    borderStyle: "dashed",
    width: mm(85),
    height: mm(22),
    paddingBottom: mm(1.2),
    alignItems: "center",
    justifyContent: "flex-end",
  },
  signImage: { width: mm(55), height: mm(14), objectFit: "contain" },
  signCaption: { fontSize: 6.5, color: GREY, lineHeight: 1 },
  ackLine: { fontSize: 7, color: GREY, lineHeight: 1.3, marginTop: mm(2.5), paddingHorizontal: mm(4) },

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

const SEAT_BG = "#EDE8E0";
const BACK_BG = "#D8D2C8";

type DoLine = DoTemplateData["lines"][number];

/** Sofa module lines carry a side marker in the SKU (`BOAAT-1A(LHF)`). */
const SIDE_RE = /\((LHF|RHF)\)/;

function sofaGroups(lines: DoLine[]): Array<{ model: string; modules: DoLine[] }> {
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

function moduleCodeOf(line: DoLine): string {
  const dash = line.sku.indexOf("-");
  return dash > 0 ? line.sku.slice(dash + 1) : line.sku;
}

/** Chaise modules read deeper toward the TV — `L(RHF)` / `CHL(LHF)` shapes. */
function isChaise(code: string): boolean {
  return /^L\(/.test(code) || code.includes("CHL");
}

/** Lines grouped into category bands, original order preserved (SO §5). */
function bandedLines(lines: DoLine[]): Array<{ band: string | null; rows: Array<{ line: DoLine; index: number }> }> {
  const groups: Array<{ band: string | null; rows: Array<{ line: DoLine; index: number }> }> = [];
  lines.forEach((line, index) => {
    const band = line.category?.trim().toUpperCase() || null;
    const last = groups[groups.length - 1];
    if (last && last.band === band) last.rows.push({ line, index });
    else groups.push({ band, rows: [{ line, index }] });
  });
  return groups;
}

export function DoTemplate(data: DoTemplateData) {
  const { do_number, issue_date, order_code, customer, partner, lines, delivery_date, delivery, pod } = data;

  const deliveryAddress =
    delivery?.address && delivery.address.trim().length > 0 ? delivery.address.trim() : customer.address;
  const floorText = delivery == null || delivery.floor == null ? null : `Floor ${delivery.floor}`;
  const liftText =
    delivery == null || delivery.has_lift == null ? null : delivery.has_lift ? "Lift available" : "No lift";
  const accessText = [floorText, liftText].filter(Boolean).join(" · ") || null;

  const detailRows: Array<[string, string | null]> = [
    ["Doc No", do_number],
    ["SO Ref", order_code],
    ["Issued", niceDate(issue_date)],
    ["Delivery date", delivery_date ? niceDate(delivery_date) : null],
    ["Logistic", partner?.name ?? null],
    ["Access", accessText],
  ];

  const groups = bandedLines(lines);
  const totalQty = lines.reduce((n, l) => n + Number(l.qty), 0);
  const podSigned = Boolean(pod?.signature_url);

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
                    <Text style={styles.docNumber}>{do_number}</Text>
                    <Text style={styles.docTitle}>DELIVERY ORDER</Text>
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
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>DELIVERY ORDER · {do_number}</Text>
                </View>
                <View style={styles.headerRule} />
              </View>
            )
          }
        />

        {/* ── DELIVER TO leads · DELIVERY DETAILS ── */}
        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: mm(6) }}>
            <Text style={styles.blockLabel}>Deliver To</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {([
                ["Name", customer.name],
                ["Address", deliveryAddress],
                ["Tel", customer.phone],
                /* who the driver calls when the customer is unreachable */
                ["Emergency", customer.emergency ?? null],
              ] as Array<[string, string | null]>).map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={styles.pairLabel}>{label}</Text>
                    <Text style={styles.pairValue}>{value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel}>Delivery Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {detailRows.map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={[styles.pairLabel, { width: mm(26) }]}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        </View>

        {/* ── items — quantity only; a delivery doc never talks money ── */}
        <View style={styles.tableHead} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colCode]}>Item Code</Text>
          <Text style={[styles.th, { flex: 1 }]}>Description</Text>
          <Text style={[styles.th, styles.colPo]}>PO No</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
        </View>
        {groups.map((group, gi) => (
          <View key={`band-${gi}`}>
            {group.band ? (
              <View style={styles.bandRow} minPresenceAhead={30}>
                <Text style={styles.bandText}>
                  {group.band} · {group.rows.length} {group.rows.length > 1 ? "items" : "item"}
                </Text>
              </View>
            ) : null}
            {group.rows.map(({ line, index }) => (
              <View key={`${line.sku}-${index}`} wrap={false} style={[styles.row, styles.rowHair]}>
                <Text style={styles.cellNo}>{index + 1}</Text>
                <Text style={styles.cellCode}>{line.sku}</Text>
                <View style={styles.desc}>
                  <Text style={styles.descMain}>{line.description}</Text>
                </View>
                <Text style={styles.cellPo}>
                  {line.source_po && line.source_po.length > 0 ? line.source_po.join("\n") : "—"}
                </Text>
                <Text style={line.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>
                  {line.qty}
                </Text>
              </View>
            ))}
          </View>
        ))}
        {/* TOTAL row between two ink rules (SO §5) */}
        <View
          wrap={false}
          style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
        >
          <Text style={styles.cellNo}> </Text>
          <Text style={styles.cellCode}> </Text>
          <View style={styles.desc}>
            <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>TOTAL</Text>
          </View>
          <Text style={styles.cellPo}> </Text>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totalQty}</Text>
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />

        {/* ── sofa layout drawings — one per model with module lines, so the
            crew assembles on site exactly what the factory built ── */}
        {sofaGroups(lines).map(({ model, modules }) => (
          <View key={model} wrap={false} style={styles.layout}>
            <Text style={styles.blockLabel}>Sofa Layout</Text>
            <Text style={styles.layoutCaption}>Top view. Back at the top. TV in front.</Text>
            <View style={styles.layoutRow}>
              {modules.map((m, i) => {
                const code = moduleCodeOf(m);
                const fabric = (m.attrs as { fabric_name?: string } | null | undefined)?.fabric_name;
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

        {/* ── signing zone — pinned to the page bottom as one unit ── */}
        <View wrap={false} style={{ marginTop: "auto" }}>
          <View style={styles.signZone}>
            <View style={styles.signBox}>
              {podSigned ? <Image src={pod!.signature_url!} style={styles.signImage} /> : null}
              <Text style={styles.signCaption}>Customer Signature · {customer.name}</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.signCaption}>
                Driver / Logistic{partner?.name ? ` · ${partner.name}` : ""}
              </Text>
            </View>
          </View>
          <Text style={styles.ackLine}>
            By signing above, the customer confirms receipt of the items listed in good order and condition.
          </Text>
        </View>

        {/* ── footer — fixed, every page (SO §9) ── */}
        <View style={styles.footer} fixed>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.footerCell}>{do_number}</Text>
            <Text style={styles.footerCenter}>Computer-generated document · Signatures above are the delivery record.</Text>
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
