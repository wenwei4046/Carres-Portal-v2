/**
 * Sales Order PDF template — proto `pdf-render.jsx` `printSalesOrder`
 * (line 504+) ported to @react-pdf/renderer. Customer-facing document handed
 * out at point of sale. Loo 2026-05-12.
 *
 * Layout mirrors the proto:
 *   - Brand header (CARRES + HOUZS subline + accent rule)
 *   - Doc meta (SO-001001 · date · order ref)
 *   - Meta band (Order ref · Delivery · Status)
 *   - Parties (Bill To customer · Sold By dealer-or-outlet · Salesperson)
 *   - Line table (sku + description with attrs + qty + unit price + total)
 *   - Addons mini-table (only if any)
 *   - Totals block (subtotal · paid · balance due)
 *   - Customer signature box
 *   - Terms paragraph
 *   - Footer
 *
 * Reuses the invoice template's visual conventions (terracotta accent,
 * warm-linen palette) so SO + Invoice look like a matched pair.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { SalesOrderTemplateData } from "./types";

const ACCENT = "#D64F20";
const BORDER = "#D9D2C7";
const MUTED  = "#7A7268";
const SOFT   = "#F5EFE6";

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

  metaBand: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  metaCol: {
    flex: 1,
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  metaColLast: { flex: 1, padding: 8 },
  metaLbl: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  metaVal: { fontSize: 10, fontWeight: 700 },
  metaSub: { fontSize: 8, color: MUTED, marginTop: 1 },

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
  partyDivider: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 6,
    paddingTop: 6,
  },

  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 14 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: SOFT,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowLast: { flexDirection: "row" },
  th: { fontSize: 9, fontWeight: 700, padding: 6 },
  td: { fontSize: 9, padding: 6 },
  tdSub: { fontSize: 8, color: MUTED, paddingHorizontal: 6, paddingBottom: 4 },
  colSku:       { width: "14%" },
  colDesc:      { width: "44%" },
  colQty:       { width: "8%",  textAlign: "right" },
  colUnitPrice: { width: "17%", textAlign: "right" },
  colTotal:     { width: "17%", textAlign: "right" },

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
    backgroundColor: SOFT,
  },
  totalsLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  totalsValue: { fontSize: 10, fontWeight: 700 },
  totalsValueGrand: { fontSize: 12, fontWeight: 700, color: ACCENT },

  signBlock: {
    width: "50%",
    borderTopWidth: 1,
    borderTopColor: "#1A1714",
    paddingTop: 4,
    marginBottom: 18,
  },
  signLabel: { fontSize: 8, color: MUTED },
  signMark: { fontSize: 9, color: ACCENT, fontWeight: 700, marginBottom: 4 },

  terms: { fontSize: 8, color: MUTED, lineHeight: 1.4, marginBottom: 12 },
  termsLine: { marginBottom: 2 },

  footer: {
    marginTop: "auto",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerLeft: { fontSize: 8, color: MUTED },
  footerRight: { fontSize: 8, color: MUTED },
});

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

/** Pretty-print line attrs: bedframe `{color, gap}`, sofa
 *  `{fabric_name, fabric_surcharge}`, mattress `{mode}`. Returns null when
 *  nothing useful to print (mattress preset on its own). */
function attrsDescription(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null;
  const bits: string[] = [];
  const color = attrs["color"];
  if (typeof color === "string" && color.length > 0) bits.push(color);
  const gap = attrs["gap"];
  if (typeof gap === "string" && gap.length > 0) bits.push(`gap ${gap}`);
  const fabricName = attrs["fabric_name"];
  if (typeof fabricName === "string" && fabricName.length > 0) {
    const surcharge = attrs["fabric_surcharge"];
    if (typeof surcharge === "number" && surcharge > 0) {
      bits.push(`${fabricName} (+RM ${surcharge})`);
    } else {
      bits.push(fabricName);
    }
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

export function SalesOrderTemplate(data: SalesOrderTemplateData) {
  const {
    so_number,
    issue_date,
    order_code,
    status_label,
    customer,
    dealer,
    delivery,
    lines,
    addons,
    subtotal,
    total,
    paid,
    balance_due,
    currency,
    signed,
  } = data;

  // Loo 2026-05-16 — Sales Orders override the default Carres HQ address
  // in the shared DocHeader with the showroom/outlet address so the
  // customer sees where the sale actually happened. Legal name + reg no
  // stay Carres per the brand-consistency rule.
  const outletName =
    dealer.outlet_name && dealer.outlet_name.trim().length > 0
      ? dealer.outlet_name.trim()
      : null;
  const outletAddress =
    dealer.outlet_address && dealer.outlet_address.trim().length > 0
      ? dealer.outlet_address.trim()
      : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="SALES ORDER"
          docMetaRows={[so_number, `Date: ${issue_date}`, `Order: ${order_code}`]}
          subTitle={outletName}
          addressLines={outletAddress ? [outletAddress] : undefined}
        />

        <View style={styles.metaBand}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLbl}>Order reference</Text>
            <Text style={styles.metaVal}>{order_code}</Text>
            <Text style={styles.metaSub}>{so_number}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLbl}>Delivery</Text>
            <Text style={styles.metaVal}>{delivery.date}</Text>
            <Text style={styles.metaSub}>
              Floor {delivery.floor} · {delivery.has_lift ? "lift available" : "no lift"}
            </Text>
          </View>
          <View style={styles.metaColLast}>
            <Text style={styles.metaLbl}>Status</Text>
            <Text style={styles.metaVal}>{status_label}</Text>
            <Text style={styles.metaSub}>Sales order — pending fulfilment</Text>
          </View>
        </View>

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
            {/* Showroom block lives in the letterhead now (Loo 2026-05-16) — no
                duplication here. Salesperson stays since it's people-info, not
                location-info. */}
            {dealer.salesperson_name ? (
              <View style={styles.partyDivider}>
                <Text style={styles.partyLabel}>Salesperson</Text>
                <Text style={styles.partyLine}>{dealer.salesperson_name}</Text>
                {dealer.salesperson_phone ? (
                  <Text style={styles.partyLine}>{dealer.salesperson_phone}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colSku]}>SKU</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnitPrice]}>Unit Price</Text>
            <Text style={[styles.th, styles.colTotal]}>Line Total</Text>
          </View>
          {lines.map((line, idx) => {
            const isLast = idx === lines.length - 1 && addons.length === 0;
            const variantSub = attrsDescription(line.attrs);
            return (
              <View key={`${line.sku}-${idx}`}>
                <View style={isLast ? styles.tableRowLast : styles.tableRow}>
                  <Text style={[styles.td, styles.colSku]}>{line.sku}</Text>
                  <Text style={[styles.td, styles.colDesc]}>{line.description}</Text>
                  <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
                  <Text style={[styles.td, styles.colUnitPrice]}>
                    {formatMoney(line.unit_price, currency)}
                  </Text>
                  <Text style={[styles.td, styles.colTotal]}>
                    {formatMoney(line.line_total, currency)}
                  </Text>
                </View>
                {variantSub ? <Text style={styles.tdSub}>{variantSub}</Text> : null}
              </View>
            );
          })}
          {addons.map((a, idx) => {
            const isLast = idx === addons.length - 1;
            return (
              <View
                key={`addon-${idx}`}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.td, styles.colSku]}>ADD-ON</Text>
                <Text style={[styles.td, styles.colDesc]}>{a.label}</Text>
                <Text style={[styles.td, styles.colQty]}>{a.qty}</Text>
                <Text style={[styles.td, styles.colUnitPrice]}>
                  {formatMoney(a.unit_price, currency)}
                </Text>
                <Text style={[styles.td, styles.colTotal]}>
                  {formatMoney(a.line_total, currency)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatMoney(subtotal, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Deposit paid</Text>
            <Text style={styles.totalsValue}>{formatMoney(paid, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total (incl. SST 8%)</Text>
            <Text style={styles.totalsValue}>{formatMoney(total, currency)}</Text>
          </View>
          <View style={styles.totalsRowLast}>
            <Text style={styles.totalsLabel}>Balance due</Text>
            <Text style={styles.totalsValueGrand}>
              {formatMoney(balance_due, currency)}
            </Text>
          </View>
        </View>

        <View style={styles.signBlock}>
          {signed ? (
            <Text style={styles.signMark}>✓ Signed electronically by customer</Text>
          ) : null}
          <Text style={styles.signLabel}>Customer signature</Text>
          <Text style={styles.signLabel}>
            {customer.name}
            {customer.phone ? ` · ${customer.phone}` : ""}
          </Text>
        </View>

        <View style={styles.terms}>
          <Text style={styles.termsLine}>
            1. This sales order becomes a binding tax invoice once goods are delivered and full payment is reconciled.
          </Text>
          <Text style={styles.termsLine}>
            2. Balance due is payable in full on or before delivery. Cash, bank transfer, DuitNow QR, and cheque accepted.
          </Text>
          <Text style={styles.termsLine}>
            3. Delivery date is best-effort and may shift ±3 working days subject to operation confirmation.
          </Text>
          <Text style={styles.termsLine}>
            4. Stair-carry surcharges (if any) are billed on this sales order and are not invoiced separately on the DO.
          </Text>
          <Text style={styles.termsLine}>
            5. SST 8% is included in unit prices per LHDN inclusive convention.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLeft}>{so_number}</Text>
          <Text style={styles.footerRight}>Carres Portal · {issue_date}</Text>
        </View>
      </Page>
    </Document>
  );
}
