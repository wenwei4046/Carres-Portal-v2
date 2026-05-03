/**
 * Delivery Order PDF template (M4 Task 4).
 *
 * Server-rendered via @react-pdf/renderer in the /print-do endpoint
 * (M4 Task 5). Uses Noto Sans SC for CJK glyph coverage in customer
 * names / addresses (registered via fonts/noto.ts).
 *
 * Page format: A4, Carres terracotta accent (#D64F20).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import type { DoTemplateData } from "./types";

const ACCENT = "#D64F20";
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: {
    fontSize: 22,
    fontWeight: 700,
    color: ACCENT,
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 9,
    color: MUTED,
    marginTop: 2,
  },
  docMeta: {
    textAlign: "right",
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  docMetaRow: {
    fontSize: 9,
    color: MUTED,
  },
  partyRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 16,
  },
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
  partyName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 9,
    color: "#3F3A33",
    marginBottom: 1,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
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
  tableRowLast: {
    flexDirection: "row",
  },
  th: {
    fontSize: 9,
    fontWeight: 700,
    padding: 6,
    color: "#1A1714",
  },
  td: {
    fontSize: 9,
    padding: 6,
  },
  colSku: { width: "18%" },
  colDesc: { width: "44%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "left" },
  colTotal: { width: "18%", textAlign: "right" },
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
  signLabel: {
    fontSize: 8,
    color: MUTED,
  },
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

export function DoTemplate(data: DoTemplateData) {
  const { do_number, issue_date, order_code, customer, dealer, partner, lines, currency } = data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>CARRES</Text>
            <Text style={styles.brandSub}>HOUZS Venture Sdn Bhd</Text>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>DELIVERY ORDER</Text>
            <Text style={styles.docMetaRow}>{do_number}</Text>
            <Text style={styles.docMetaRow}>Date: {issue_date}</Text>
            <Text style={styles.docMetaRow}>Order: {order_code}</Text>
          </View>
        </View>

        <View style={styles.partyRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Deliver To</Text>
            <Text style={styles.partyName}>{customer.name}</Text>
            <Text style={styles.partyLine}>{customer.address}</Text>
            {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Dealer</Text>
            <Text style={styles.partyName}>{dealer.name}</Text>
            {dealer.contact ? <Text style={styles.partyLine}>{dealer.contact}</Text> : null}
            {partner ? (
              <>
                <Text style={[styles.partyLabel, { marginTop: 8 }]}>Carrier</Text>
                <Text style={styles.partyLine}>{partner.name}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colSku]}>SKU</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
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
                <Text style={[styles.td, styles.colTotal]}>{formatMoney(line.line_total, currency)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Issued by (Carres)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Received by (Customer)</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Goods received in good condition. Please verify quantity and description above before signing.
        </Text>
      </Page>
    </Document>
  );
}
