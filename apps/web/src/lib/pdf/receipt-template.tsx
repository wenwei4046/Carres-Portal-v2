/**
 * Payment receipt PDF template — balance job (Jess 2026-06-26 "complete all the
 * balance job"; migration 0184). Issued per ledger entry as proof of payment /
 * storage-fee collection (the collect-before-delivery flow gives the customer a
 * receipt before dispatch). Rendered client-side via @react-pdf/renderer — same
 * pipeline as the invoice / DO / PO PDFs (Workers WASM ban, see render.ts).
 *
 * receipt_no is the server-issued R{so}-{n} number; the rest comes straight off
 * the order_payments row + order. No Storage-bucket persistence yet — renders
 * on-demand (mirrors the on-demand invoice PDF; persistence is a fast-follow).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { displayCustomerName } from "@/lib/customer-name";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { ReceiptTemplateData } from "./types";

const ACCENT = "#D64F20"; // matches the sibling invoice / DO / PO doc set
const BORDER = "#D9D2C7";
const MUTED = "#7A7268";

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: "#1A1714",
  },
  party: {
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    marginBottom: 16,
  },
  partyLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  partyName: { fontSize: 12, fontWeight: 700 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  detailBlock: { borderWidth: 1, borderColor: BORDER, marginBottom: 18 },
  detailLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 10, fontWeight: 700 },
  amountBlock: {
    backgroundColor: "#F5EFE6",
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: { fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  amountValue: { fontSize: 18, fontWeight: 700, color: ACCENT },
  note: { fontSize: 9, color: "#3F3A33", marginBottom: 18 },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", paddingTop: 24 },
  signBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "#1A1714", paddingTop: 4 },
  signLabel: { fontSize: 8, color: MUTED },
  disclaimer: { fontSize: 8, color: MUTED, marginTop: 24, textAlign: "center" },
});

function money(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

const KIND_LABEL: Record<string, string> = {
  payment: "Payment",
  deposit: "Deposit",
  storage: "Storage fee",
};

export function ReceiptTemplate(data: ReceiptTemplateData) {
  const { receipt_no, issue_date, order_code, customer, amount, method, kind, reference, note, currency } = data;
  const kindLabel = KIND_LABEL[kind] ?? kind;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="PAYMENT RECEIPT"
          docMetaRows={[receipt_no, `Date: ${issue_date}`, `Order: ${order_code}`]}
        />

        <View style={styles.party}>
          <Text style={styles.partyLabel}>Received From</Text>
          <Text style={styles.partyName}>{displayCustomerName(customer.name) || "—"}</Text>
        </View>

        <View style={styles.detailBlock}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>For</Text>
            <Text style={styles.detailValue}>{kindLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Method</Text>
            <Text style={styles.detailValue}>{method}</Text>
          </View>
          {reference ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reference</Text>
              <Text style={styles.detailValue}>{reference}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount Received</Text>
          <Text style={styles.amountValue}>{money(amount, currency)}</Text>
        </View>

        {note ? <Text style={styles.note}>Note: {note}</Text> : null}

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Received by (Carres)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Customer signature</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          This is a computer-generated payment receipt. Please retain for your records.
        </Text>
      </Page>
    </Document>
  );
}
