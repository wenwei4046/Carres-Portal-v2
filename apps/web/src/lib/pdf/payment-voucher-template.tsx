/**
 * Payment voucher PDF (PV, migrations 0477 / 0529) — the paper Finance files
 * and signs. Built like the other debtor invoice (other-debtor-invoice-template.tsx):
 * the shared `DocHeader` letterhead, a payee block, one line per thing paid,
 * the total. Below it the three signatures: Prepared By on the left, Checked
 * By and Approved By on the right, each filled with the name and date the
 * voucher records. A cancelled voucher still prints, marked CANCELLED.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader, formatMoney, moneyDigits, niceDate } from "./letterhead";
import type { PaymentVoucherTemplateData } from "./types";

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
  signs: { flexDirection: "row", marginTop: 48 },
  signCol: { flex: 1, flexDirection: "row" },
  sign: { width: 150, marginRight: 16 },
  signLine: { borderBottomWidth: 0.6, borderBottomColor: INK, height: 36, marginBottom: 4 },
  signText: { fontSize: 8.5, lineHeight: 1.42 },
  signGrey: { fontSize: 8, color: GREY },
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

export function PaymentVoucherTemplate(data: PaymentVoucherTemplateData) {
  const { voucher_no, lines, total, cancelled, signatures } = data;
  const payeeRows: Array<[string, string | null]> = [
    ["Payee", data.payee],
    ["Supplier", data.supplier],
  ];
  const detailRows: Array<[string, string | null]> = [
    ["Voucher No", voucher_no],
    ["Date", niceDate(data.voucher_date)],
    ["Paid from", data.pay_from],
    ["Method", data.pay_method],
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
  const sign = (s: PaymentVoucherTemplateData["signatures"][number]) => (
    <View key={s.label} style={styles.sign} wrap={false}>
      <View style={styles.signLine} />
      <Text style={styles.signText}>{s.label}</Text>
      <Text style={styles.signText}>{s.name ?? " "}</Text>
      <Text style={styles.signGrey}>{s.at ? niceDate(s.at) : "Date:"}</Text>
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle={cancelled ? "PAYMENT VOUCHER · CANCELLED" : "PAYMENT VOUCHER"}
          docMetaRows={[voucher_no, `Date: ${data.voucher_date}`]}
        />

        {cancelled ? (
          <Text style={styles.cancelled}>CANCELLED · {data.cancel_reason ?? "Reason not recorded"}</Text>
        ) : null}

        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={styles.blockLabel}>Pay To</Text>
            {pairs(payeeRows)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel}>Voucher Details</Text>
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
          <Text style={styles.grandText}>TOTAL</Text>
          <Text style={styles.grandText}>{formatMoney(total, "RM")}</Text>
        </View>

        {data.narration ? <Text style={styles.note}>Note: {data.narration}</Text> : null}

        <View style={styles.signs} wrap={false}>
          <View style={styles.signCol}>{signatures.slice(0, 1).map(sign)}</View>
          <View style={[styles.signCol, { justifyContent: "flex-end" }]}>{signatures.slice(1).map(sign)}</View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{voucher_no}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
