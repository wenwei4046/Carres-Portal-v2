/**
 * Credit Note PDF — Finance owns it (docs/pdf/DOCUMENT-KIT.md). Customer and
 * Finance copy; no supplier document carries the credit. Same family chrome as
 * the Receipt (DocHeader, party block, detail rows, amount block, signatures),
 * rendered in the browser through render.ts. A voided note still prints and
 * says so, as a voided receipt does.
 *
 * It prints what was credited and why. It prints no refund wording: Carres does
 * not refund (payment/MASTER.md §13) — the credit comes off what the customer
 * owes on the invoice.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CreditNotePrintData } from "@carres/shared/schemas/finance-credit-note";
import { displayCustomerName } from "@/lib/customer-name";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";

const ACCENT = "#D64F20";
const BORDER = "#D9D2C7";
const MUTED = "#7A7268";

const styles = StyleSheet.create({
  page: { fontFamily: NOTO_SANS_SC_FAMILY, fontSize: 10, paddingTop: 36, paddingBottom: 36, paddingHorizontal: 36, color: "#1A1714" },
  party: { borderWidth: 1, borderColor: BORDER, padding: 10, marginBottom: 16 },
  partyLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  partyName: { fontSize: 12, fontWeight: 700 },
  detailBlock: { borderWidth: 1, borderColor: BORDER, marginBottom: 18 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  detailLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  detailValue: { fontSize: 10, fontWeight: 700, maxWidth: "70%", textAlign: "right" },
  amountBlock: { backgroundColor: "#F5EFE6", borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountLabel: { fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  amountValue: { fontSize: 18, fontWeight: 700, color: ACCENT },
  note: { fontSize: 9, color: "#3F3A33", marginBottom: 18 },
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", paddingTop: 24 },
  signBlock: { width: "45%", borderTopWidth: 1, borderTopColor: "#1A1714", paddingTop: 4 },
  signLabel: { fontSize: 8, color: MUTED },
  disclaimer: { fontSize: 8, color: MUTED, marginTop: 24, textAlign: "center" },
});

export const creditNoteMoney = (value: number, currency: string) => `${currency} ${value.toFixed(2)}`;

export function CreditNoteTemplate(data: CreditNotePrintData) {
  const { credit_note_no, note_date, invoice_no, order_code, customer_name, amount, reason, voided, void_reason, currency } = data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle={voided ? "CREDIT NOTE · VOIDED" : "CREDIT NOTE"}
          docMetaRows={[credit_note_no, `Date: ${note_date}`, ...(order_code ? [`Order: ${order_code}`] : [])]}
        />

        {voided ? <Text style={styles.note}>VOIDED · {void_reason ?? "Reason not recorded"}</Text> : null}

        <View style={styles.party}>
          <Text style={styles.partyLabel}>Credited To</Text>
          <Text style={styles.partyName}>{displayCustomerName(customer_name ?? "") || " "}</Text>
        </View>

        <View style={styles.detailBlock}>
          {invoice_no ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invoice</Text>
              <Text style={styles.detailValue}>{invoice_no}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.detailValue}>{reason}</Text>
          </View>
        </View>

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount Credited</Text>
          <Text style={styles.amountValue}>{creditNoteMoney(amount, currency)}</Text>
        </View>

        <Text style={styles.note}>
          This amount is taken off what you owe Carres on the invoice above.
        </Text>

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Issued by (Carres Finance)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Customer acknowledgement</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>This is a computer-generated credit note. Please retain for your records.</Text>
      </Page>
    </Document>
  );
}
