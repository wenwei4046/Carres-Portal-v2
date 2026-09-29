/**
 * Repair Order PDF template — docs/pdf/DOCUMENT-KIT.md (the family law) and
 * Purchasing MASTER §9.7 "THE DOCUMENT CARRIES THE REASON AND THE PHOTOGRAPHS"
 * (owner, Jess 2026-09-23). Change the law first, the template second.
 *
 * - The family chrome, exactly as the Purchase Order prints it: every page the
 *   same full header (logo · legal name · SSM · three address lines · the hero
 *   `RO260928-4827(1)` over `REPAIR ORDER`), the fixed audit / legal / page
 *   footer, Noto Sans SC only, ink / grey / hairline, no colour.
 * - Section 2: SUPPLIER · the two locations · RO DETAILS.
 * - `Reason` box under section 2 (§3 rule 11): the recorded `What happened, in
 *   one sentence` per Unit, verbatim. It is never a second place to type.
 * - Goods table: `# · Category · PO No / Unit ID · Items · Qty · Problem ·
 *   Repair Requirement`, one tracked Unit per row at Qty 1, closing `TOTAL`.
 *   Unit IDs print in full with the last three digits bold (`UnitCode`).
 * - The damage photographs (§3 rule 12) take a page of their own after the
 *   goods table, headed `DAMAGE PHOTOS · {Unit ID}` under the same header —
 *   laid out as the PO lays out a sofa set. They are the Unit's and the Claim's
 *   own evidence, read through. No photograph is one sentence, never a page.
 * - The payload (`RepairOrderPrintData`) carries no figure at all: this paper
 *   names the goods and what to do with them, never their value (§4).
 */

import type { ReactNode } from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { poDocumentNumberOf, type RepairOrderPrintData } from "@carres/shared";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import { UnitCode, poPrintDate } from "./po-template";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";

const mm = (v: number) => v * 2.83465;
const MARGIN = mm(12);
/** The PO's measured full-header reserve (PO-PDF-STANDARD §5): the RO hero
 *  `RO260928-4827(1)` has the PO's new-form shape, so the same 26mm holds. */
const HEADER_H = mm(26);
const FOOTER_H = mm(8);

/** Read at render time, so a test (or a server render) can point it at a file. */
const carresLogoSrc = () =>
  (globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ ?? "/carres-logo.png";

/** Column widths, mm: # 7 · CATEGORY 20 · PO NO / UNIT ID 30 · ITEMS flex ·
 *  QTY 10 · PROBLEM 24 · REPAIR REQUIREMENT 42. `U1-000-001` with its bold
 *  digits is 15.1mm, `PO260920-1111` 19.6mm, `Missing component` 21.8mm (7.5pt)
 *  — each plus 3mm padding. The rules are ABSOLUTE lines at these offsets:
 *  change a width, change RULE_X in the same commit. */
const W = { no: 7, cat: 20, unit: 30, qty: 10, problem: 24, req: 42 } as const;
const CONTENT_W = 186;
const RULE_X = [
  W.no,
  W.no + W.cat,
  W.no + W.cat + W.unit,
  CONTENT_W - W.req - W.problem - W.qty,
  CONTENT_W - W.req - W.problem,
  CONTENT_W - W.req,
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

  reasonBox: { marginTop: mm(3), borderWidth: 0.5, borderColor: INK, paddingHorizontal: mm(3), paddingVertical: mm(2) },
  reasonLine: { flexDirection: "row", marginTop: mm(1) },
  reasonUnit: { fontSize: 8, width: mm(24), lineHeight: 1.42 },
  reasonText: { fontSize: 8, flex: 1, lineHeight: 1.42 },

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
  bProblem: { width: mm(W.problem), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bReq: { width: mm(W.req), paddingHorizontal: mm(1.5), justifyContent: "center" },
  cell: { fontSize: 7.5, lineHeight: 1.25 },
  cellGrey: { fontSize: 7, color: GREY, lineHeight: 1.25 },
  cellNo: { fontSize: 7, color: GREY, textAlign: "right", lineHeight: 1.25 },
  cellQty: { fontSize: 7.5, textAlign: "center", lineHeight: 1.25 },
  itemMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1.25 },
  itemSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), lineHeight: 1.2 },
  totalLabel: { fontSize: 7.5, fontWeight: 700, textAlign: "right", lineHeight: 1.25 },
  totalQty: { fontSize: 7.5, fontWeight: 700, textAlign: "center", lineHeight: 1.25 },
  absence: { fontSize: 8, color: GREY, marginTop: mm(3) },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: mm(4) },
  photoCell: { width: mm(90), height: mm(100), marginBottom: mm(4), alignItems: "center", justifyContent: "center", borderWidth: 0.3, borderColor: HAIR },
  photo: { width: mm(88), height: mm(98), objectFit: "contain" },

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

const PHOTOS_PER_PAGE = 4;
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

function Place({ label, place }: { label: string; place: { name: string; address: string | null } }) {
  return (
    <View style={{ marginBottom: mm(2) }}>
      <Text style={styles.blockLabel}>{label}</Text>
      <View style={{ marginTop: mm(1.2) }}>
        <Text style={styles.placeName}>{place.name || NOT_RECORDED}</Text>
        {place.address ? <Text style={styles.placeAddress}>{place.address}</Text> : null}
      </View>
    </View>
  );
}

export function RepairOrderTemplate(data: RepairOrderPrintData) {
  const roId = poDocumentNumberOf(data.ro_no, data.version);
  const units = data.units;

  const detailRows: Array<[string, string | null]> = [
    ["RO No", roId],
    ["RO Doc Date", poPrintDate(data.ro_doc_date)],
    // Only a Claim-origin repair carries it; a direct repair omits the row.
    ["Supplier Claim No", data.claim_no],
  ];

  /* ONE layout: the goods table's page(s), then one photo page per 4 photos
     of each Unit that has any. A row is ~9mm; the first page also carries
     section 2, the Reason box and the bar, so it takes fewer rows. */
  const EST_ROW = 11;
  const CAP_FIRST = 130 - units.length * 5;
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
        <View style={styles.bProblem}><Text style={styles.cell}>{u.problem}</Text></View>
        <View style={styles.bReq}><Text style={styles.cell}>{u.repair_requirement}</Text></View>
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
        <View style={{ width: mm(W.problem + W.req) }} />
      </View>
    ),
  });
  const withoutPhotos = units.filter((u) => u.photos.length === 0).map((u) => u.unit_id);
  if (withoutPhotos.length > 0) {
    rows.push({
      h: 8,
      node: (
        <Text key="no-photos" style={styles.absence}>
          {withoutPhotos.length === units.length
            ? "No damage photos recorded."
            : `No damage photos recorded for ${withoutPhotos.join(", ")}.`}
        </Text>
      ),
    });
  }

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
        <>
          <View style={styles.cards}>
            <View style={{ flex: 1, paddingRight: mm(5) }}>
              <Text style={styles.blockLabel}>Supplier</Text>
              <View style={{ marginTop: mm(1.5) }}>
                <View style={styles.pairRow}>
                  <Text style={styles.pairLabel}>Name</Text>
                  <Text style={[styles.pairValue, { fontWeight: 600 }]}>{data.supplier.name || NOT_RECORDED}</Text>
                </View>
                {data.supplier.address ? (
                  <View style={styles.pairRow}>
                    <Text style={styles.pairLabel}>Address</Text>
                    <Text style={styles.pairValue}>{data.supplier.address}</Text>
                  </View>
                ) : null}
                {data.supplier.contact ? (
                  <View style={styles.pairRow}>
                    <Text style={styles.pairLabel}>Tel</Text>
                    <Text style={styles.pairValue}>{data.supplier.contact}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ flex: 1, paddingRight: mm(5) }}>
              <Place label="Supplier Pickup Location" place={data.pickup} />
              <Place label="Supplier Return Location" place={data.return_to} />
            </View>
            <View style={{ width: mm(56) }}>
              <Text style={styles.blockLabel}>RO Details</Text>
              <View style={{ marginTop: mm(1.5) }}>
                {detailRows.map(([label, value]) =>
                  value ? (
                    <View key={label} style={styles.pairRow}>
                      <Text style={styles.detailLabel}>{label}</Text>
                      <Text style={styles.pairValue}>:  {value}</Text>
                    </View>
                  ) : null,
                )}
              </View>
            </View>
          </View>
          {/* §3 rule 11 — what is being repaired, in the recorded words. */}
          <View style={styles.reasonBox} wrap={false}>
            <Text style={styles.blockLabel}>Reason</Text>
            {units.length === 1 ? (
              <Text style={[styles.reasonText, { marginTop: mm(1) }]}>{units[0]!.problem_note}</Text>
            ) : (
              units.map((u) => (
                <View key={`r-${u.unit_id}`} style={styles.reasonLine}>
                  <Text style={styles.reasonUnit}><UnitCode code={u.unit_id} /></Text>
                  <Text style={styles.reasonText}>{u.problem_note}</Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
      <View style={styles.tableHead}>
        <ColumnRules />
        <View style={styles.bNo}><Text style={[styles.th, { textAlign: "right" }]}>#</Text></View>
        <View style={styles.bCat}><Text style={styles.th}>Category</Text></View>
        <View style={styles.bUnit}><Text style={styles.th}>PO No / Unit ID</Text></View>
        <View style={styles.bItems}><Text style={styles.th}>Items</Text></View>
        <View style={styles.bQty}><Text style={[styles.th, { textAlign: "center" }]}>Qty</Text></View>
        <View style={styles.bProblem}><Text style={styles.th}>Problem</Text></View>
        <View style={styles.bReq}><Text style={styles.th}>Repair Requirement</Text></View>
      </View>
      {chunk.map((r) => r.node)}
    </View>
  ));

  // §3 rule 12 — the photographs, a page of their own per Unit (4 per sheet).
  for (const u of units) {
    for (let at = 0; at < u.photos.length; at += PHOTOS_PER_PAGE) {
      const sheet = u.photos.slice(at, at + PHOTOS_PER_PAGE);
      pages.push(
        <View key={`p-${u.unit_id}-${at}`} break wrap={false}>
          <Text style={styles.blockLabel}>Damage Photos · {u.unit_id}</Text>
          <View style={styles.photoGrid}>
            {sheet.map((src, i) => (
              <View key={`${u.unit_id}-${at + i}`} style={styles.photoCell}>
                <Image src={src} style={styles.photo} />
              </View>
            ))}
          </View>
        </View>,
      );
    }
  }

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
              <Text style={styles.docNumber}>{roId}</Text>
              <Text style={styles.docTitle}>REPAIR ORDER</Text>
            </View>
          </View>
          <View style={styles.headerRule} />
        </View>

        {pages}

        <View style={styles.footer} fixed>
          <Text style={styles.footerCell}>{`${roId} · Issued by ${data.issued_by ?? NOT_RECORDED}`}</Text>
          <Text style={styles.footerCenter}>Computer-generated document · No signature required.</Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
