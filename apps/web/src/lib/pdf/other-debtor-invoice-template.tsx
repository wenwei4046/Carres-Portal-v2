/**
 * Other debtor invoice PDF (ARI, migration 0478) — the bill Finance sends a
 * party that is not a customer, e.g. office rent to a sister company.
 *
 * Built like the customer invoice (invoice-template.tsx) but shorter: no SST
 * split, no item codes or quantities, because an ARI line is one account and
 * one amount. The letterhead is the shared `DocHeader`, so the company name,
 * registration and address come from `CARRES_COMPANY`, as on every Carres PDF.
 * A cancelled invoice still prints, marked CANCELLED with its reason, the same
 * way a voided customer receipt does.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader, formatMoney, moneyDigits, niceDate } from "./letterhead";
import type { OtherDebtorInvoiceTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAND_BG = "#EDEDED";

const styles = StyleSheet.create({
  page: { fontFamily: NOTO_SANS_SC_FAMILY, fontSize: 9, color: INK, padding: 36 },
  cancelled: { fontSize: 10, fontWeight: 700, marginBottom: 12 },
  cards: { flexDirection: "row", marginBottom: 16 },
  blockLabel: { fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8.5, color: GREY, width: 70, lineHeight: 1.42 },
  pairValue: { fontSize: 8.5, flex: 1, lineHeight: 1.42 },
  tableHead: { backgroundColor: INK, flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6 },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.3, borderBottomColor: HAIR },
  colNo: { width: 24 },
  colDesc: { flex: 1, paddingRight: 8 },
  colAmount: { width: 90, textAlign: "right" },
  grand: {
    marginTop: 12,
    marginLeft: "auto",
    width: 200,
    backgroundColor: BAND_BG,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  grandText: { fontSize: 9, fontWeight: 700 },
  note: { fontSize: 8.5, marginTop: 16 },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 24,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: GREY },
});

export function OtherDebtorInvoiceTemplate(data: OtherDebtorInvoiceTemplateData) {
  const { invoice_no, party, lines, total, currency, cancelled } = data;
  const partyRows: Array<[string, string | null]> = [
    ["Name", party.name],
    ["Reg No", party.registration_no],
    ["Address", party.address],
    ["Tel", party.phone],
  ];
  const detailRows: Array<[string, string | null]> = [
    ["Invoice No", invoice_no],
    ["Issued", niceDate(data.issue_date)],
    ["Due", niceDate(data.due_date)],
    ["Reference", data.reference],
  ];
  const pairs = (rows: Array<[string, string | null]>) =>
    rows.map(([label, value]) =>
      value ? (
        <View key={label} style={styles.pairRow}>
          <Text style={styles.pairLabel}>{label}</Text>
          <Text style={styles.pairValue}>{value}</Text>
        </View>
      ) : null,
    );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle={cancelled ? "INVOICE · CANCELLED" : "INVOICE"}
          docMetaRows={[invoice_no, `Date: ${data.issue_date}`]}
        />

        {cancelled ? (
          <Text style={styles.cancelled}>CANCELLED · {data.cancel_reason ?? "Reason not recorded"}</Text>
        ) : null}

        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={styles.blockLabel}>Bill To</Text>
            {pairs(partyRows)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel}>Invoice Details</Text>
            {pairs(detailRows)}
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colDesc]}>Description</Text>
          <Text style={[styles.th, styles.colAmount]}>Amount (RM)</Text>
        </View>
        {lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.colNo}>{i + 1}</Text>
            <Text style={styles.colDesc}>{line.description}</Text>
            <Text style={styles.colAmount}>{moneyDigits(line.amount)}</Text>
          </View>
        ))}

        <View style={styles.grand} wrap={false}>
          <Text style={styles.grandText}>TOTAL DUE</Text>
          <Text style={styles.grandText}>{formatMoney(total, currency)}</Text>
        </View>

        {data.narration ? <Text style={styles.note}>Note: {data.narration}</Text> : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{data.issued_by ? `Issued by ${data.issued_by}` : invoice_no}</Text>
          <Text style={styles.footerText}>Computer-generated document · No signature required.</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
