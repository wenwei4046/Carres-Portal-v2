/**
 * Purchase Order PDF template (M4 Task 4).
 *
 * Server-rendered via @react-pdf/renderer in the /print endpoint
 * (M4 Task 6). Same Noto Sans SC family + Carres terracotta as the
 * DO template, distinct title block + line-table columns.
 *
 * Page format: A4.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { LetterheadHeader } from "./letterhead";
import type { PoTemplateData } from "./types";

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
  // 2026-05-16 — letterhead handles brand + accent rule; docMeta is its
  // own right-aligned block below.
  docMeta: {
    alignItems: "flex-end",
    marginBottom: 16,
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
  colDesc: { width: "36%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "8%", textAlign: "left" },
  colUnitPrice: { width: "14%", textAlign: "right" },
  colTotal: { width: "14%", textAlign: "right" },
  // 0076 / 0077 — variant suffix line (color + gap or fabric) shown under
  // the description in slightly muted weight so the supplier knows which
  // version to make. Empty for mattress lines (no extras).
  variant: {
    fontSize: 8,
    color: ACCENT,
    marginTop: 2,
    fontWeight: 700,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 14,
  },
  totalsLabel: {
    fontSize: 11,
    fontWeight: 700,
    marginRight: 12,
  },
  totalsValue: {
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
  },
  termsBlock: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    marginTop: 16,
  },
  termsLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  termsText: {
    fontSize: 9,
    color: "#3F3A33",
    lineHeight: 1.4,
  },
});

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

/**
 * 0076 / 0077 — flatten attrs into a one-line variant suffix the supplier
 * can read at a glance. Bedframe shows "{color} · gap {gap}", sofa shows
 * "{fabric_name}" with optional "+RM {surcharge}" suffix, mattress returns
 * empty (template hides the row when label is empty). Mirrors the
 * PoDetailModal display logic so the on-screen + PDF descriptions match.
 */
function variantLabel(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) return "";
  const parts: string[] = [];
  const a = attrs as {
    color?: string;
    gap?: string;
    fabric_name?: string;
    fabric_surcharge?: number;
  };
  if (a.color) parts.push(a.color);
  if (a.gap) parts.push(`gap ${a.gap}`);
  if (a.fabric_name) {
    parts.push(
      a.fabric_surcharge && a.fabric_surcharge > 0
        ? `${a.fabric_name} (+RM ${a.fabric_surcharge})`
        : a.fabric_name,
    );
  }
  return parts.join(" · ");
}

export function PoTemplate(data: PoTemplateData) {
  const { po_number, issue_date, supplier, buyer, lines, grand_total, currency, terms } = data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <LetterheadHeader />
        <View style={styles.docMeta}>
          <Text style={styles.docTitle}>PURCHASE ORDER</Text>
          <Text style={styles.docMetaRow}>{po_number}</Text>
          <Text style={styles.docMetaRow}>Date: {issue_date}</Text>
        </View>

        <View style={styles.partyRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Supplier</Text>
            <Text style={styles.partyName}>{supplier.name}</Text>
            {supplier.address ? <Text style={styles.partyLine}>{supplier.address}</Text> : null}
            {supplier.contact ? <Text style={styles.partyLine}>{supplier.contact}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Buyer</Text>
            <Text style={styles.partyName}>{buyer.name}</Text>
            {buyer.contact ? <Text style={styles.partyLine}>{buyer.contact}</Text> : null}
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
            const variant = variantLabel(line.attrs);
            return (
              <View key={`${line.sku}-${idx}`} style={isLast ? styles.tableRowLast : styles.tableRow}>
                <Text style={[styles.td, styles.colSku]}>{line.sku}</Text>
                <View style={[styles.td, styles.colDesc]}>
                  <Text>{line.description}</Text>
                  {variant ? <Text style={styles.variant}>{variant}</Text> : null}
                </View>
                <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
                <Text style={[styles.td, styles.colUnit]}>{line.unit}</Text>
                <Text style={[styles.td, styles.colUnitPrice]}>{formatMoney(line.unit_price, currency)}</Text>
                <Text style={[styles.td, styles.colTotal]}>{formatMoney(line.line_total, currency)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Total</Text>
          <Text style={styles.totalsValue}>{formatMoney(grand_total, currency)}</Text>
        </View>

        {terms ? (
          <View style={styles.termsBlock}>
            <Text style={styles.termsLabel}>Terms</Text>
            <Text style={styles.termsText}>{terms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
