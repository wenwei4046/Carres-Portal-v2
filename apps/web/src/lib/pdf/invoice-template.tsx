/**
 * Tax Invoice PDF template — Phase 5 Chunk C (Q7=A locked).
 *
 * Server-rendered via @react-pdf/renderer in the GET /invoices/:id/pdf
 * endpoint. Uses Noto Sans SC for CJK glyph coverage in customer names
 * (registered via fonts/noto.ts). Page format: A4, terracotta accent.
 *
 * SST 8% inclusive — `unit_price` is the gross figure customers see in the
 * order; `tax_amount` is computed `total * 0.08 / 1.08`. Tax-compliance:
 * the totals block always shows the SST split explicitly per LHDN
 * requirements for B2C tax invoices.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { InvoiceTemplateData } from "./types";

const ACCENT = "#D64F20";
const BORDER = "#D9D2C7";
const MUTED  = "#7A7268";

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: "#1A1714",
  },
  // 2026-05-16 — header rendering moved to shared DocHeader.
  partyRow: { flexDirection: "row", marginBottom: 16, gap: 16 },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  partyLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  partyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 9, color: "#3F3A33", marginBottom: 1 },
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 14 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F5EFE6",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowLast: { flexDirection: "row" },
  th: { fontSize: 9, fontWeight: 700, padding: 6, color: "#1A1714" },
  td: { fontSize: 9, padding: 6 },
  colSku:       { width: "14%" },
  colDesc:      { width: "38%" },
  colQty:       { width: "8%",  textAlign: "right" },
  colUnit:      { width: "8%",  textAlign: "left"  },
  colUnitPrice: { width: "16%", textAlign: "right" },
  colTotal:     { width: "16%", textAlign: "right" },
  totalsBlock: {
    width: "45%",
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 18,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totalsRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F5EFE6",
  },
  totalsLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  totalsValue: { fontSize: 10, fontWeight: 700 },
  totalsValueGrand: { fontSize: 12, fontWeight: 700, color: ACCENT },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 24,
  },
  signBlock: {
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: "#1A1714",
    paddingTop: 4,
  },
  signLabel: { fontSize: 8, color: MUTED },
  disclaimer: {
    fontSize: 8,
    color: MUTED,
    marginTop: 24,
    textAlign: "center",
  },
});

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function InvoiceTemplate(data: InvoiceTemplateData) {
  const { invoice_no, issue_date, order_code, customer, dealer, lines, subtotal, tax_amount, total, currency } = data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="TAX INVOICE"
          docMetaRows={[invoice_no, `Date: ${issue_date}`, `Order: ${order_code}`]}
        />

        <View style={styles.partyRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Bill To</Text>
            <Text style={styles.partyName}>{customer.name}</Text>
            <Text style={styles.partyLine}>{customer.address}</Text>
            {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Sold By</Text>
            <Text style={styles.partyName}>{dealer.name}</Text>
            {dealer.contact ? <Text style={styles.partyLine}>{dealer.contact}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colSku]}>SKU</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colUnitPrice]}>Unit Price</Text>
            <Text style={[styles.th, styles.colTotal]}>Line Total</Text>
          </View>
          {lines.map((line, idx) => {
            const isLast = idx === lines.length - 1;
            return (
              <View key={`${line.sku}-${idx}`} style={isLast ? styles.tableRowLast : styles.tableRow}>
                <Text style={[styles.td, styles.colSku]}>{line.sku}</Text>
                <Text style={[styles.td, styles.colDesc]}>{line.description}</Text>
                <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
                <Text style={[styles.td, styles.colUnit]}>{line.unit}</Text>
                <Text style={[styles.td, styles.colUnitPrice]}>{formatMoney(line.unit_price, currency)}</Text>
                <Text style={[styles.td, styles.colTotal]}>{formatMoney(line.line_total, currency)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal (excl. SST)</Text>
            <Text style={styles.totalsValue}>{formatMoney(subtotal, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>SST 8%</Text>
            <Text style={styles.totalsValue}>{formatMoney(tax_amount, currency)}</Text>
          </View>
          <View style={styles.totalsRowLast}>
            <Text style={styles.totalsLabel}>Total</Text>
            <Text style={styles.totalsValueGrand}>{formatMoney(total, currency)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Issued by (Carres Finance)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Customer signature</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          This is a tax invoice. Please retain for your records. SST 8% is included in unit prices per LHDN inclusive convention.
        </Text>
      </Page>
    </Document>
  );
}
