/**
 * ON LOAN delivery-note PDF (Jess 2026-07-19, migration 0242) — the document the
 * customer signs when a LOANER (substitute piece) is handed over while their
 * real order is prepared. It is NOT a sale: no money, no transfer of ownership;
 * it doubles as the proof-of-receipt AND the loan/bailment agreement (one note
 * per hand-over). The loaner is collected back at the real delivery (same trip).
 * Same client-side @react-pdf/renderer pipeline as the receipt / DO / extension
 * agreement (Workers WASM ban — see render.ts).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { LoanNoteTemplateData } from "./types";

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
  terms: {
    backgroundColor: "#F5EFE6",
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 18,
  },
  termsLine: { fontSize: 9.5, color: "#3F3A33", marginBottom: 4, lineHeight: 1.4 },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", paddingTop: 30 },
  signBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "#1A1714", paddingTop: 4 },
  signLabel: { fontSize: 8, color: MUTED },
  disclaimer: { fontSize: 8, color: MUTED, marginTop: 24, textAlign: "center" },
});

export function LoanNoteTemplate(data: LoanNoteTemplateData) {
  const { ln_no, order_code, order_ref, issue_date, customer, item, condition, source } = data;
  // Order row carries the customer's CR/TCF ref after the SO — the number the
  // supplier / AutoCount know the order by (same as the REF chip on the card).
  const orderRow = order_ref ? `Order: ${order_code} · ${order_ref}` : `Order: ${order_code}`;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="LOAN NOTE — TEMPORARY, NOT A SALE"
          docMetaRows={[`Loan note: ${ln_no}`, orderRow, `Date: ${issue_date}`]}
        />

        <View style={styles.party}>
          <Text style={styles.partyLabel}>Customer</Text>
          <Text style={styles.partyName}>{customer.name || "—"}</Text>
          {customer.phone ? <Text style={styles.partySub}>{customer.phone}</Text> : null}
        </View>

        <View style={styles.detailBlock}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Loaned item</Text>
            <Text style={styles.detailValue}>{item || "—"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Condition at hand-over</Text>
            <Text style={styles.detailValue}>{condition || "—"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Source</Text>
            <Text style={styles.detailValue}>{source || "—"}</Text>
          </View>
          <View style={styles.detailRowLast}>
            <Text style={styles.detailLabel}>Return</Text>
            <Text style={styles.detailValue}>At delivery of your order</Text>
          </View>
        </View>

        <View style={styles.terms}>
          <Text style={styles.termsLine}>
            • This item remains the PROPERTY OF CARRES. It is lent on loan, free of charge, while
            your order is being prepared.
          </Text>
          <Text style={styles.termsLine}>
            • It will be COLLECTED BACK when your order is delivered — nothing to arrange separately.
          </Text>
          <Text style={styles.termsLine}>
            • Please keep it in good condition. Loss or damage while in your care may be chargeable.
          </Text>
          <Text style={styles.termsLine}>
            • This is not a sale: no payment is due and ownership does not transfer.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Customer signature (received on loan)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Carres / driver</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          This is a computer-generated loan note. Please retain until your order is delivered.
        </Text>
      </Page>
    </Document>
  );
}
