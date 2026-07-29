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
import { DocHeader } from "./letterhead";
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
  // 2026-05-16 — header rendering moved to shared DocHeader.
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
  // P4 — the Unit Price (14%) and Line Total (14%) columns are gone; their
  // 28% is given to SKU and Description rather than left as white space, so a
  // long variant name stops wrapping.
  colSku: { width: "22%" },
  colDesc: { width: "52%" },
  colQty: { width: "14%", textAlign: "right" },
  colUnit: { width: "12%", textAlign: "left" },
  // 0076 / 0077 — variant suffix line (color + gap or fabric) shown under
  // the description in slightly muted weight so the supplier knows which
  // version to make. Empty for mattress lines (no extras).
  variant: {
    fontSize: 8,
    color: ACCENT,
    marginTop: 2,
    fontWeight: 700,
  },
  // The totals row is deliberately absent — see the PoTemplateData note. A
  // leftover `totalsValue` style is an invitation to print a total again.
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

/**
 * 0076 / 0077 — flatten attrs into a one-line variant suffix the supplier
 * can read at a glance. Bedframe shows "{color} · gap {gap}", sofa shows
 * "{fabric_name}", mattress returns empty (template hides the row when the
 * label is empty).
 *
 * P4 (Loo 2026-07-29) — this used to append "(+RM {fabric_surcharge})", which
 * is how a purchase price survived on a supplier's document after every named
 * money field had been removed. `fabric_surcharge` is stripped by the
 * `purchasing_po_document` allowlist and is not read here either: a template
 * that still ASKS for it would print money again the moment somebody widened
 * the payload.
 */
function variantLabel(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) return "";
  const parts: string[] = [];
  const a = attrs as {
    color?: string;
    gap?: string;
    fabric_name?: string;
  };
  if (a.color) parts.push(a.color);
  if (a.gap) parts.push(`gap ${a.gap}`);
  if (a.fabric_name) parts.push(a.fabric_name);
  return parts.join(" · ");
}

export function PoTemplate(data: PoTemplateData) {
  const { po_number, issue_date, supplier, destination, delivery_instructions, eta_date, lines, terms } =
    data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="PURCHASE ORDER"
          docMetaRows={[
            po_number,
            `Date: ${issue_date}`,
            ...(eta_date ? [`Expected: ${eta_date}`] : []),
          ]}
        />

        <View style={styles.partyRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Supplier</Text>
            <Text style={styles.partyName}>{supplier.name}</Text>
            {supplier.address ? <Text style={styles.partyLine}>{supplier.address}</Text> : null}
            {supplier.contact ? <Text style={styles.partyLine}>{supplier.contact}</Text> : null}
          </View>
          {/* P4 — this block used to be "Buyer" filled with the receiving
              warehouse. A factory does not need to know where we book our
              inventory; it needs to know where to drive. The heading is the
              locked field label and the name is the SAVED destination, never
              `Ship-to` / `Destination` / `Drop point` (COPY-STANDARD). */}
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Where the goods go</Text>
            <Text style={styles.partyName}>{destination.name}</Text>
            <Text style={styles.partyLine}>{destination.address}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colSku]}>SKU</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
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
              </View>
            );
          })}
        </View>

        {delivery_instructions ? (
          <View style={styles.termsBlock}>
            <Text style={styles.termsLabel}>Delivery instructions</Text>
            <Text style={styles.termsText}>{delivery_instructions}</Text>
          </View>
        ) : null}

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
