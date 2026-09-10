/**
 * Purchase Order PDF template — built to docs/pdf/PO-PDF-STANDARD.md (the Law).
 * Change the Law first, the template second.
 *
 * 2026-08-09 (Loo) — the PO joins the FAMILY CHROME (SO-PDF-STANDARD §2.1
 * measurement sheet + §8.5 conversion law): typeset company header with the
 * hero number, ink bar table, conversion-law sizes, quiet footer. The old
 * logo-stamp header and zero-fill table are DELETED from the law, not kept
 * beside it (Master Overwrite Law).
 *
 * What stays the PO's own (unchanged business):
 * - MONEY-FREE, structurally: the payload is the `purchasing_po_document`
 *   RPC (0307) — no RM figure ever reaches this component.
 * - `Delivery by` is the supplier's 3-second fact — first row of PO DETAILS,
 *   bold value.
 * - Unit ID = ops_stock_items.unit_code, born at official PO issue and bound
 *   to its line (0442/0443); a quantity line prints `—` because it has none — the
 *   column the old law reserved is now LIVE: supplier labels each unit by
 *   id, the warehouse scans on receive. Prints `—` until codes arrive.
 * - Sofa plan-view layout drawing per model (direction contract).
 * - `Issued by {name}` audit in the footer; no signatures anywhere.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { PoTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAR_BG = INK;
const SEAT_BG = "#EDE8E0";
const BACK_BG = "#D8D2C8";

const mm = (v: number) => v * 2.83465;

const MARGIN = mm(12);
const HEADER_H = mm(20);
const FOOTER_H = mm(8);

/** `2026-08-12` → `Wed, 12 Aug 26` (family body-date form). */
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

  // ── header (fixed) — family chrome ──
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  // ── parties — family voice ──
  cards: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), minHeight: mm(26) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(20), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },
  stackValue: { fontSize: 8, lineHeight: 1.42 },
  deliverBlock: { marginTop: mm(2.5), paddingHorizontal: mm(4) },
  deliverNote: { fontSize: 7, color: GREY, marginTop: mm(0.8), lineHeight: 1.3 },

  // ── items table — ink bar, hairline rows, NO money columns ──
  tableHead: {
    backgroundColor: BAR_BG,
    flexDirection: "row",
    paddingVertical: mm(1.8),
    paddingHorizontal: mm(2),
    marginTop: mm(2.5),
  },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  colNo: { width: mm(7) },
  colSo: { width: mm(20) },
  colUnit: { width: mm(26) },
  colDestination: { width: mm(35), paddingRight: mm(3) },
  colQty: { width: mm(13), textAlign: "right", paddingRight: mm(3) },
  row: { flexDirection: "row", paddingVertical: mm(2), paddingHorizontal: mm(2) },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },
  cellNo: { fontSize: 7, color: GREY, width: mm(7), textAlign: "right", paddingRight: mm(1.5), lineHeight: 1 },
  cellSo: { fontSize: 7.5, width: mm(20), lineHeight: 1 },
  cellUnit: { fontSize: 7, color: GREY, width: mm(26), lineHeight: 1.3 },
  desc: { flex: 1, paddingRight: mm(3) },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1 },
  descSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), paddingLeft: mm(2), lineHeight: 1.2 },
  cellDestination: { fontSize: 7, width: mm(35), paddingRight: mm(3), lineHeight: 1.2 },
  destinationAddress: { fontSize: 6.5, color: GREY, marginTop: mm(0.5), lineHeight: 1.15 },
  cellQty: { fontSize: 7.5, width: mm(13), textAlign: "right", paddingRight: mm(3), lineHeight: 1 },

  // ── sofa layout drawing (direction contract, unchanged) ──
  layout: { marginTop: mm(4), paddingHorizontal: mm(4) },
  layoutCaption: { fontSize: 7, color: GREY, marginTop: mm(1) },
  layoutRow: { flexDirection: "row", alignItems: "flex-start", marginTop: mm(2), justifyContent: "center" },
  moduleBox: { alignItems: "center", marginRight: mm(2) },
  moduleCode: { fontSize: 7.5, fontWeight: 600, marginTop: mm(1.5) },
  moduleFabric: { fontSize: 7, color: GREY, marginTop: mm(0.5) },
  tvLine: { width: 0.6, height: mm(4), backgroundColor: GREY, marginTop: mm(2), alignSelf: "center" },
  tvBox: { backgroundColor: INK, paddingHorizontal: mm(3), paddingVertical: mm(0.8), marginTop: mm(0.5), alignSelf: "center" },
  tvText: { fontSize: 7.5, color: "#FFFFFF", letterSpacing: 1.5 },

  // ── footer (fixed) — family chrome + the PO's audit cell ──
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: mm(2),
  },
  footerCell: { fontSize: 7.5, color: GREY, width: mm(58) },
  footerCenter: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
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
  const { po_number, version, issue_date, supplier, destination, delivery_instructions, eta_date, so_refs, issued_by, lines } = data;
  /* 0378 — the document's own identity. A supplier holding two papers with one
     number and no version cannot tell which to build from, so Version 1 prints
     too. (`Version 1 prints nothing` is the internal REVISIONS PANEL's rule —
     `docs/COPY-STANDARD.md` — and this is paper that leaves the building.) */
  const versionLabel = data.draft ? "Not issued" : `Version ${version ?? 1}`;

  /**
   * ⭐ PER-LINE SO ATTRIBUTION, FROM THE LINE'S OWN LINEAGE (0382).
   *
   * This used to print only when the whole purchase order covered exactly ONE
   * sales order, because the schema kept `so_refs` on the DOCUMENT and nothing
   * per line. Every bulk purchase order therefore printed a blank `SO NO`
   * column — the one column that tells the factory whose goods these are.
   *
   * A line serving three customers prints all three, with the quantity beside
   * each, because ten mattresses on one line are not interchangeable once they
   * are promised to three people. The document-level fallback stays for the
   * purchase orders raised before 0382, which have no lineage to read.
   */
  const soCell = (line: PoTemplateData["lines"][number]): string => {
    const src = (line.sources ?? []).filter((s) => s.so != null);
    if (src.length === 1) return `SO-${src[0]!.so}`;
    if (src.length > 1) return src.map((s) => `SO-${s.so} × ${s.qty}`).join("\n");
    return so_refs && so_refs.length === 1 ? `SO-${so_refs[0]}` : "";
  };
  // Bulk PO (several sales orders) closes with a TOTAL row; a one-customer
  // PO does not (one set per page makes a total meaningless).
  const isBulk = (so_refs?.length ?? 0) > 1;
  const totalQty = lines.reduce((s, l) => s + Number(l.qty), 0);
  const groups = sofaGroups(lines);
  const effectiveDestinations = lines.map((line) => line.destination ?? destination);
  const uniqueDestinations = [...new Map(
    effectiveDestinations.map((item) => [`${item.name}\u0000${item.address}`, item]),
  ).values()];
  const multipleDestinations = uniqueDestinations.length > 1;

  // No SO No row here — a bulk PO can carry dozens; the table's SO NO
  // column is the one home (owner round, 2026-08-09). `Deliver by` is the
  // frozen term's paper form: the reader IS the supplier, imperative.
  const detailRows: Array<[string, string | null, boolean?]> = [
    ["PO No", data.draft ? "Assigned when issued" : po_number],
    ["Version", data.draft ? null : versionLabel.replace("Version ", "")],
    ["Status", data.draft ? "Not issued" : null],
    ["Issued", data.draft ? null : niceDate(issue_date)],
    ["Deliver by", niceDate(eta_date), true],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── header — family chrome; continuation pages get one line ── */}
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
                    <Text style={styles.docNumber}>{po_number}</Text>
                    <Text style={styles.docTitle}>PURCHASE ORDER</Text>
                    {/* The identity a supplier reads at a glance, on the same
                        line the number lives on. */}
                    <Text style={styles.docTitle}>{versionLabel}</Text>
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
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>
                    PURCHASE ORDER · {po_number} · {versionLabel}
                  </Text>
                </View>
                <View style={styles.headerRule} />
              </View>
            )
          }
        />

        {/* ── section 2, THREE columns: who supplies · where every line goes ·
            when it is due. A multi-destination PO names every governed address
            here and repeats each line's effective destination in the table. ── */}
        <View style={styles.cards}>
          {/* Content decides the widths: the two ADDRESS blocks flex and
              wrap; only the details column (fixed facts) is fixed. The
              supplier prints its FULL address — a formal document names
              both parties completely (owner, 2026-08-09). */}
          <View style={{ flex: 1, paddingRight: mm(5) }}>
            <Text style={styles.blockLabel}>Supplier</Text>
            <View style={{ marginTop: mm(1.5) }}>
              <Text style={[styles.stackValue, { fontWeight: 600 }]}>{supplier.name}</Text>
              {supplier.address ? <Text style={styles.stackValue}>{supplier.address}</Text> : null}
              {supplier.contact ? <Text style={styles.stackValue}>{supplier.contact}</Text> : null}
            </View>
          </View>
          <View style={{ flex: 1.1, paddingRight: mm(5) }}>
            <Text style={styles.blockLabel}>Deliver To</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {multipleDestinations ? (
                <>
                  <Text style={[styles.stackValue, { fontWeight: 700 }]}>Multiple destinations</Text>
                  {uniqueDestinations.map((item) => (
                    <View key={`${item.name}-${item.address}`} style={{ marginTop: mm(1) }}>
                      <Text style={[styles.stackValue, { fontWeight: 600 }]}>{item.name}</Text>
                      <Text style={styles.stackValue}>{item.address}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <Text style={[styles.stackValue, { fontWeight: 600 }]}>{uniqueDestinations[0]?.name ?? destination.name}</Text>
                  <Text style={styles.stackValue}>{uniqueDestinations[0]?.address ?? destination.address}</Text>
                </>
              )}
              {delivery_instructions ? <Text style={styles.deliverNote}>{delivery_instructions}</Text> : null}
            </View>
          </View>
          <View style={{ width: mm(52) }}>
            <Text style={styles.blockLabel}>PO Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {detailRows.map(([label, value, bold]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={[styles.pairLabel, { width: mm(17) }]}>{label}</Text>
                    <Text style={bold ? [styles.pairValue, { fontWeight: 700 }] : styles.pairValue}>
                      :  {value}
                    </Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        </View>

        {/* ── items — the supplier reads Description; nothing here is money ── */}
        <View style={styles.tableHead} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colSo]}>SO No</Text>
          <Text style={[styles.th, styles.colUnit]}>Unit ID</Text>
          <Text style={[styles.th, { flex: 1 }]}>Description</Text>
          <Text style={[styles.th, styles.colDestination]}>Deliver To</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
        </View>
        {lines.map((line, idx) => {
          const a = (line.attrs ?? {}) as { color?: string; gap?: string; fabric_name?: string };
          const bits: string[] = [];
          if (a.color) bits.push(a.color);
          if (a.gap) bits.push(`Gap ${a.gap}`);
          if (a.fabric_name) bits.push(`Fabric ${a.fabric_name}`);
          const showVariant = line.description && line.description !== line.sku;
          const lineDestination = line.destination ?? destination;
          return (
            <View key={`${line.sku}-${idx}`} wrap={false} style={[styles.row, styles.rowHair]}>
              <Text style={styles.cellNo}>{idx + 1}</Text>
              <Text style={styles.cellSo}>{soCell(line)}</Text>
              <Text style={styles.cellUnit}>
                {line.unit_codes && line.unit_codes.length > 0 ? line.unit_codes.join("\n") : "—"}
              </Text>
              <View style={styles.desc}>
                <Text style={styles.descMain}>
                  {line.sku}
                  {showVariant ? ` — ${line.description}` : ""}
                </Text>
                {bits.length > 0 ? <Text style={styles.descSub}>{bits.join(" · ")}</Text> : null}
              </View>
              <View style={styles.cellDestination}>
                <Text>{lineDestination.name}</Text>
                <Text style={styles.destinationAddress}>{lineDestination.address}</Text>
              </View>
              <Text style={line.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>
                {line.qty}
              </Text>
            </View>
          );
        })}
        {isBulk ? (
          <View
            wrap={false}
            style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
          >
            <Text style={styles.cellNo}> </Text>
            <Text style={styles.cellSo}> </Text>
            <Text style={styles.cellUnit}> </Text>
            <View style={styles.desc}>
              <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>TOTAL</Text>
            </View>
            <Text style={styles.cellDestination}> </Text>
            <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totalQty}</Text>
          </View>
        ) : null}
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />

        {/* ── sofa layout drawings — one per model with module lines ── */}
        {groups.map(({ model, modules }) => (
          <View key={model} wrap={false} style={styles.layout}>
            <Text style={styles.blockLabel}>Sofa Layout</Text>
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

        {/* ── footer — fixed, every page: audit · legal · page ── */}
        <View style={styles.footer} fixed>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.footerCell}>
              {po_number}
              {issued_by ? ` · Issued by ${issued_by}` : ""}
            </Text>
            <Text style={styles.footerCenter}>{data.draft ? "DRAFT · Not issued · Do not send to supplier." : "Computer-generated document · No signature required."}</Text>
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
