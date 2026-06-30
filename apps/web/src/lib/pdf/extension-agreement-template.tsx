/**
 * Storage delivery-EXTENSION agreement PDF — migration 0196 (the two customer
 * Delivery-Extension Google Forms, Jess 2026-06-30). Exported from the order
 * detail's Storage panel to send the customer; replaces the Google Form. Same
 * client-side @react-pdf/renderer pipeline as the receipt / invoice / DO PDFs
 * (Workers WASM ban — see render.ts).
 *
 * The free-storage policy lines are pre-built by the caller from the order's
 * category (MS/BF 24 working days free → RM150/month; Sofa 14 working days free
 * → flat RM200/order), so this template stays presentational.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { ExtensionAgreementTemplateData } from "./types";

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
  party: { borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 16 },
  partyLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  partyName: { fontSize: 12, fontWeight: 700 },
  partySub: { fontSize: 9, color: "#3F3A33", marginTop: 2 },
  detailBlock: { borderWidth: 1, borderColor: BORDER, marginBottom: 18 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  detailRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  detailLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 10, fontWeight: 700 },
  sectionTitle: {
    fontSize: 9,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  policyBlock: {
    backgroundColor: "#F5EFE6",
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 18,
  },
  policyLine: { fontSize: 9.5, color: "#3F3A33", marginBottom: 4, lineHeight: 1.4 },
  ack: { fontSize: 9.5, color: "#1A1714", marginBottom: 18, lineHeight: 1.5 },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", paddingTop: 30 },
  signBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "#1A1714", paddingTop: 4 },
  signLabel: { fontSize: 8, color: MUTED },
  disclaimer: { fontSize: 8, color: MUTED, marginTop: 24, textAlign: "center" },
});

export function ExtensionAgreementTemplate(data: ExtensionAgreementTemplateData) {
  const { order_code, issue_date, customer, original_date, new_date, reason, policy_lines } = data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="DELIVERY EXTENSION AGREEMENT"
          docMetaRows={[`Order: ${order_code}`, `Date: ${issue_date}`]}
        />

        <View style={styles.party}>
          <Text style={styles.partyLabel}>Customer</Text>
          <Text style={styles.partyName}>{customer.name || "—"}</Text>
          {customer.phone ? <Text style={styles.partySub}>{customer.phone}</Text> : null}
        </View>

        <View style={styles.detailBlock}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Original requested delivery date</Text>
            <Text style={styles.detailValue}>{original_date || "—"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>New requested delivery date</Text>
            <Text style={styles.detailValue}>{new_date || "—"}</Text>
          </View>
          <View style={styles.detailRowLast}>
            <Text style={styles.detailLabel}>Reason for delay</Text>
            <Text style={styles.detailValue}>{reason || "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Storage policy</Text>
        <View style={styles.policyBlock}>
          {policy_lines.map((line, i) => (
            <Text key={i} style={styles.policyLine}>
              • {line}
            </Text>
          ))}
        </View>

        <Text style={styles.ack}>
          The customer acknowledges that this is a ONE-TIME delivery extension and agrees to the
          storage-fee policy above. Any further extension requires management approval. Storage fees,
          where applicable, must be settled before delivery.
        </Text>

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Customer signature</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Carres representative</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          This is a computer-generated delivery-extension agreement. Please retain for your records.
        </Text>
      </Page>
    </Document>
  );
}
