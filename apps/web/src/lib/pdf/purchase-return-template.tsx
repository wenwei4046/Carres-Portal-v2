/**
 * Purchase Return PDF template — docs/pdf/DOCUMENT-KIT.md (the family law) and
 * Purchasing MASTER §9.6 creation door (owner approval 2026-09-25). Change the
 * law first, the template second.
 *
 * - The family chrome, exactly as the Repair Order prints it: every page the
 *   same full header (logo · legal name · SSM · three address lines · the hero
 *   `PR-20260929-1001` over `PURCHASE RETURN`), the fixed audit / legal / page
 *   footer, Noto Sans SC only, ink / grey / hairline, no colour.
 * - Section 2: SUPPLIER · RETURN TO (the supplier's recorded return address)
 *   · PR DETAILS.
 * - Goods table: `# · Category · PO No / Unit ID · Items · Qty · Pickup
 *   Location`, one tracked Unit per row at Qty 1 (§9.6), closing `TOTAL`.
 *   Unit IDs print in full with the last three digits bold (`UnitCode`).
 * - While issuing, the preview is the paper it WILL be (`pr_no` null): `DRAFT`
 *   hero, `Assigned when issued`, and the PO family's draft footer.
 * - The payload (`PurchaseReturnPrintData`) carries no figure at all: a return
 *   names the goods, never their value; the credit is Finance's (§4).
 */

import type { ReactNode } from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PurchaseReturnPrintData } from "@carres/shared";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import { UnitCode, poPrintDate } from "./po-template";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";

const mm = (v: number) => v * 2.83465;
const MARGIN = mm(12);
/** The PO's measured full-header reserve (PO-PDF-STANDARD §5). */
const HEADER_H = mm(26);
const FOOTER_H = mm(8);

/** Read at render time, so a test (or a server render) can point it at a file. */
const carresLogoSrc = () =>
  (globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ ?? "/carres-logo.png";

/** Column widths, mm: # 7 · CATEGORY 20 · PO NO / UNIT ID 30 · ITEMS flex ·
 *  QTY 10 · PICKUP LOCATION 44. The rules are ABSOLUTE lines at these
 *  offsets: change a width, change RULE_X in the same commit. */
const W = { no: 7, cat: 20, unit: 30, qty: 10, pickup: 44 } as const;
const CONTENT_W = 186;
const RULE_X = [
  W.no,
  W.no + W.cat,
  W.no + W.cat + W.unit,
  CONTENT_W - W.pickup - W.qty,
  CONTENT_W - W.pickup,
];

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 8,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1, paddingRight: mm(4), flexDirection: "row", alignItems: "center" },
  headerLogo: { width: mm(13), height: mm(13), objectFit: "contain", marginRight: mm(4) },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  cards: { flexDirection: "row", minHeight: mm(28) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(15), lineHeight: 1.42 },
  detailLabel: { fontSize: 8, color: GREY, width: mm(24), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },
  placeName: { fontSize: 8, fontWeight: 600, lineHeight: 1.42 },
  placeAddress: { fontSize: 8, lineHeight: 1.42 },


  tableHead: { position: "relative", backgroundColor: INK, flexDirection: "row", paddingVertical: mm(1.8), marginTop: mm(3) },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  row: {
    position: "relative",
    flexDirection: "row",
    minHeight: mm(9),
    paddingVertical: mm(2),
    borderLeftWidth: 0.3,
    borderRightWidth: 0.3,
    borderBottomWidth: 0.3,
    borderColor: HAIR,
  },
  totalRow: {
    position: "relative",
    flexDirection: "row",
    minHeight: mm(9),
    paddingVertical: mm(2),
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: INK,
  },
  vline: { position: "absolute", top: 0, bottom: 0, width: 0.4, backgroundColor: HAIR },
  bNo: { width: mm(W.no), paddingRight: mm(1.5), justifyContent: "center" },
  bCat: { width: mm(W.cat), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bUnit: { width: mm(W.unit), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bItems: { flex: 1, paddingHorizontal: mm(1.5), justifyContent: "center" },
  bQty: { width: mm(W.qty), justifyContent: "center" },
  bPickup: { width: mm(W.pickup), paddingHorizontal: mm(1.5), justifyContent: "center" },
  cell: { fontSize: 7.5, lineHeight: 1.25 },
  cellGrey: { fontSize: 7, color: GREY, lineHeight: 1.25 },
  cellNo: { fontSize: 7, color: GREY, textAlign: "right", lineHeight: 1.25 },
  cellQty: { fontSize: 7.5, textAlign: "center", lineHeight: 1.25 },
  itemMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1.25 },
  itemSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), lineHeight: 1.2 },
  totalLabel: { fontSize: 7.5, fontWeight: 700, textAlign: "right", lineHeight: 1.25 },
  totalQty: { fontSize: 7.5, fontWeight: 700, textAlign: "center", lineHeight: 1.25 },
  absence: { fontSize: 8, color: GREY, marginTop: mm(3) },


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
  footerCell: { fontSize: 7.5, color: GREY, width: mm(58) },
  footerCenter: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
  footerPage: { fontSize: 7.5, color: GREY, width: mm(40), textAlign: "right" },
});

const NOT_RECORDED = "Not recorded";

function ColumnRules() {
  return (
    <>
      {RULE_X.map((x) => (
        <View key={x} style={[styles.vline, { left: mm(x) }]} />
      ))}
    </>
  );
}

export function PurchaseReturnTemplate(data: PurchaseReturnPrintData) {
  const draft = !data.pr_no;
  const prId = data.pr_no ?? "DRAFT";
  const units = data.units;
  const detailRows: Array<[string, string | null]> = [
    ["PR No", draft ? "Assigned when issued" : prId],
    ["PR Doc Date", poPrintDate(data.pr_doc_date)],
    ["Supplier Claim No", data.claim_no],
    ["GRN No", data.grn_no],
    ["Confirmed Pickup Date", poPrintDate(data.confirmed_pickup_date)],
  ];

  const EST_ROW = 11;
  const CAP_FIRST = 150;
  const CAP_REST = 205;
  const rows: Array<{ h: number; node: ReactNode }> = units.map((u, i) => ({
    h: EST_ROW,
    node: (
      <View key={`u-${u.unit_id}`} wrap={false} style={styles.row}>
        <ColumnRules />
        <View style={styles.bNo}><Text style={styles.cellNo}>{i + 1}</Text></View>
        <View style={styles.bCat}><Text style={styles.cell}>{u.category ?? NOT_RECORDED}</Text></View>
        <View style={styles.bUnit}>
          <Text style={u.po_no ? styles.cell : styles.cellGrey}>{u.po_no ?? NOT_RECORDED}</Text>
          <Text style={styles.cell}><UnitCode code={u.unit_id} /></Text>
        </View>
        <View style={styles.bItems}>
          <Text style={styles.itemMain}>{u.item ?? NOT_RECORDED}</Text>
          {u.item_spec ? <Text style={styles.itemSub}>{u.item_spec}</Text> : null}
        </View>
        <View style={styles.bQty}><Text style={styles.cellQty}>1</Text></View>
        <View style={styles.bPickup}><Text style={u.pickup_location ? styles.cell : styles.cellGrey}>{u.pickup_location ?? NOT_RECORDED}</Text></View>
      </View>
    ),
  }));
  rows.push({
    h: 12,
    node: (
      <View key="total" wrap={false} style={styles.totalRow}>
        <View style={{ flex: 1, paddingRight: mm(3), justifyContent: "center" }}>
          <Text style={styles.totalLabel}>TOTAL</Text>
        </View>
        <View style={[styles.vline, { left: mm(RULE_X[3]!) }]} />
        <View style={styles.bQty}><Text style={styles.totalQty}>{units.length}</Text></View>
        <View style={{ width: mm(W.pickup) }} />
      </View>
    ),
  });

  const chunks: Array<Array<{ h: number; node: ReactNode }>> = [[]];
  let used = 0;
  let cap = CAP_FIRST;
  for (const r of rows) {
    if (used + r.h > cap && chunks[chunks.length - 1]!.length > 0) {
      chunks.push([]);
      used = 0;
      cap = CAP_REST;
    }
    chunks[chunks.length - 1]!.push(r);
    used += r.h;
  }

  const pages: ReactNode[] = chunks.map((chunk, ci) => (
    <View key={`g-${ci}`} break={ci > 0}>
      {ci === 0 ? (
        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: mm(5) }}>
            <Text style={styles.blockLabel}>Supplier</Text>
            <View style={{ marginTop: mm(1.5) }}>
              <View style={styles.pairRow}>
                <Text style={styles.pairLabel}>Name</Text>
                <Text style={[styles.pairValue, { fontWeight: 600 }]}>{data.supplier.name || NOT_RECORDED}</Text>
              </View>
              {data.supplier.contact ? (
                <View style={styles.pairRow}>
                  <Text style={styles.pairLabel}>Tel</Text>
                  <Text style={styles.pairValue}>{data.supplier.contact}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={{ flex: 1, paddingRight: mm(5) }}>
            <Text style={styles.blockLabel}>Return To</Text>
            <View style={{ marginTop: mm(1.2) }}>
              <Text style={data.return_to ? styles.placeAddress : styles.cellGrey}>{data.return_to ?? NOT_RECORDED}</Text>
            </View>
          </View>
          <View style={{ width: mm(62) }}>
            <Text style={styles.blockLabel}>PR Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {detailRows.map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={[styles.detailLabel, { width: mm(30) }]}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        </View>
      ) : null}
      <View style={styles.tableHead}>
        <ColumnRules />
        <View style={styles.bNo}><Text style={[styles.th, { textAlign: "right" }]}>#</Text></View>
        <View style={styles.bCat}><Text style={styles.th}>Category</Text></View>
        <View style={styles.bUnit}><Text style={styles.th}>PO No / Unit ID</Text></View>
        <View style={styles.bItems}><Text style={styles.th}>Items</Text></View>
        <View style={styles.bQty}><Text style={[styles.th, { textAlign: "center" }]}>Qty</Text></View>
        <View style={styles.bPickup}><Text style={styles.th}>Pickup Location</Text></View>
      </View>
      {chunk.map((r) => r.node)}
    </View>
  ));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Image src={carresLogoSrc()} style={styles.headerLogo} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                  <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
                  <Text style={styles.ssmInline}>SSM {CARRES_COMPANY.regNo}</Text>
                </View>
                <Text style={[styles.legalLine, { marginTop: mm(1.8) }]}>{CARRES_COMPANY.addressLines[0]}</Text>
                <Text style={styles.legalLine}>{CARRES_COMPANY.addressLines[1]}</Text>
                <Text style={styles.legalLine}>{CARRES_COMPANY.addressLines[2]}</Text>
              </View>
            </View>
            <View style={styles.docBlock}>
              <Text style={styles.docNumber}>{prId}</Text>
              <Text style={styles.docTitle}>PURCHASE RETURN</Text>
            </View>
          </View>
          <View style={styles.headerRule} />
        </View>

        {pages}

        <View style={styles.footer} fixed>
          {/* An unknown issuer prints the number alone — never a placeholder. */}
          <Text style={styles.footerCell}>{!draft && data.issued_by ? `${prId} · Issued by ${data.issued_by}` : prId}</Text>
          <Text style={styles.footerCenter}>{draft ? "DRAFT · Not issued · Do not send to supplier." : "Computer-generated document · No signature required."}</Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
