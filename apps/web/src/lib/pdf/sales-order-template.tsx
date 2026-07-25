/**
 * Sales Order PDF template — customer-facing document handed out at point
 * of sale.
 *
 * 2026-07-14 (Loo) — relaid out to match the 2990s Sales Order (the two
 * reference screenshots Loo supplied): company block + big SALES ORDER
 * title, rounded info cards (ORDER REFERENCE · DELIVERY ESTIMATE DATE with
 * PAYMENTS RECEIVED · BILL TO · SOLD BY), an items table whose Description
 * column carries the PRODUCT NAME (server-resolved `Model name (Variant)`)
 * with PWP / voucher / remark sub-lines, a dashed customer-signature box
 * beside the totals card (BALANCE DUE on a soft flame band), and flame
 * numbered terms. Accent moved to the v17 flame #C44D2B.
 *
 * The header always prints Carres HQ (brand-consistency rule); the showroom
 * / outlet address prints in the SOLD BY card — same as the 2990s doc.
 */

import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { lineConfigBits } from "@/pages/dealer/new-order/special-addons-picker";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { SalesOrderTemplateData } from "./types";

const ACCENT = "#C44D2B"; // v17 flame (supersedes the old #D64F20 terracotta)
const ACCENT_SOFT = "#FBEEE8"; // flame wash — BALANCE DUE band
const BORDER = "#E4DFD6";
const MUTED = "#6F675E";
const INK = "#1A1714";
const SOFT = "#F7F2E9"; // table header beige

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: INK,
  },

  // ── Header: company block left · big doc title right ──
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
  },
  companyName: { fontSize: 13, fontWeight: 700, letterSpacing: 0.4 },
  companyRegNo: { fontSize: 8, color: MUTED, marginTop: 2 },
  companyAddrLine: { fontSize: 8.5, color: "#3F3A33", marginTop: 1 },
  companyAddrFirst: { marginTop: 6 },
  headerMeta: { alignItems: "flex-end" },
  docTitle: { fontSize: 20, fontWeight: 700, letterSpacing: 0.6 },
  docNumber: { fontSize: 11, fontWeight: 700, color: ACCENT, marginTop: 3 },
  docDate: { fontSize: 9, color: MUTED, marginTop: 2 },

  // ── Info cards (rounded, bordered — reference look) ──
  cardRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 10,
  },
  cardLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  cardValue: { fontSize: 12, fontWeight: 700 },
  cardSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  cardDivider: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 7,
    paddingTop: 7,
  },
  payRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 2,
    gap: 8,
  },
  payLabel: { fontSize: 8.5, color: MUTED, flexShrink: 1 },
  payAmount: { fontSize: 9, fontWeight: 700 },

  partyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 9, color: "#3F3A33", marginBottom: 1 },
  partyDivider: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 6,
    paddingTop: 6,
  },

  // ── Items table ──
  // NOTE: the rows are DIRECT Page children (no wrapper View) — @react-pdf
  // v4 can't split a wrapper View's children across pages, which shoved the
  // whole table to page 2 on long orders. Frameless look (beige header band
  // + row dividers) matches the reference anyway.
  tableEnd: { marginBottom: 14 },
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
  descCell: { padding: 6 },
  descMain: { fontSize: 9 },
  descSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  descSubAccent: { fontSize: 8, fontWeight: 700, color: ACCENT, marginTop: 2 },
  colSku: { width: "16%" },
  colDesc: { width: "42%" },
  colQty: { width: "8%", textAlign: "right" },
  colUnitPrice: { width: "17%", textAlign: "right" },
  colTotal: { width: "17%", textAlign: "right" },

  // Vouchers earned on this order whose trigger sku no longer matches a
  // printed line (defensive) — listed under the table instead of dropped.
  voucherBlock: { marginBottom: 14, marginTop: -6 },
  voucherLine: { fontSize: 8, color: MUTED, marginTop: 1 },

  // ── Signature (dashed box) beside the totals card ──
  signTotalsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  signBlock: { flex: 1 },
  signBox: {
    borderWidth: 1,
    borderColor: "#C9C2B6",
    borderStyle: "dashed",
    borderRadius: 6,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  signImage: { width: 180, height: 64, objectFit: "contain" },
  signLabel: { fontSize: 8.5, fontWeight: 700, color: ACCENT, marginTop: 6 },
  signName: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  signMark: { fontSize: 8, color: ACCENT, marginTop: 2 },

  totalsBlock: {
    width: "45%",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    overflow: "hidden",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totalsRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: ACCENT_SOFT,
  },
  totalsLabel: { fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  totalsLabelGrand: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  totalsValue: { fontSize: 10, fontWeight: 700 },
  totalsValueGrand: { fontSize: 12, fontWeight: 700, color: ACCENT },

  // ── Terms (flame numbered lines — reference look) ──
  terms: { marginBottom: 12 },
  termsLine: { fontSize: 8, color: ACCENT, lineHeight: 1.5, marginBottom: 2 },

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
  return `${currency} ${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The item configuration as ONE muted line — the SAME formula the POS
 *  order-detail drawer renders (`lineConfigBits`, Loo 2026-07-25 "sales order
 *  description want same formula as well"): `gap 17" · Divan 10" · Leg 2" ·
 *  Fabric BF-03 · … · ✎ remark`, no point-form rows, no per-item RM (already
 *  folded into the line price). A sofa-build row prints its `sofa_spec`
 *  instead (fabric/leg live inside the spec) — only the remark bit rides
 *  along there. */
function configLine(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null;
  if (typeof attrs["sofa_spec"] === "string" && attrs["sofa_spec"]) {
    const remark = typeof attrs["remark"] === "string" && attrs["remark"] ? attrs["remark"] : null;
    return remark ? `✎ ${remark}` : null;
  }
  const bits = lineConfigBits(attrs);
  return bits.length > 0 ? bits.join(" · ") : null;
}

/** Sofa-build group sub-line (Loo 2026-07-19) — the server regroups a built
 *  sofa's exploded compartment lines into ONE model row whose `attrs.sofa_spec`
 *  carries the cart-style copy ("1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach ·
 *  leg 4″"). Null for every other line. */
function sofaSpecLine(attrs: Record<string, unknown> | null): string | null {
  const spec = attrs?.["sofa_spec"];
  return typeof spec === "string" && spec.length > 0 ? spec : null;
}

/** Flame PWP marker for a reward line carrying `attrs.pwp` (P8b/c/d server
 *  canonical marker `{ruleId, type, code?, …}`). Null when the line isn't a
 *  PWP/promo reward. */
function pwpMarkerLine(attrs: Record<string, unknown> | null): string | null {
  const pwp = attrs?.["pwp"] as Record<string, unknown> | undefined;
  if (!pwp || typeof pwp !== "object") return null;
  const code = typeof pwp["code"] === "string" ? pwp["code"] : null;
  const base = pwp["type"] === "promo" ? "Promo · FREE" : "PWP price";
  return code ? `${base} · ${code}` : base;
}

/** Muted free-line marker (P7 default gift / make-free campaign). */
function freeMarkerLine(attrs: Record<string, unknown> | null): string | null {
  if (attrs?.["free_gift"]) return "Free gift";
  if (attrs?.["free_item"]) return "Free item";
  return null;
}

/** Muted add-on sub-line: disposal size tag + delivery follow-up remark —
 *  same formula as the drawer's addon detail (the bare size, no "Size:"
 *  prefix). */
function addonAttrsDescription(attrs: Record<string, unknown> | null | undefined): string | null {
  if (!attrs) return null;
  const bits: string[] = [];
  const size = attrs["size"];
  if (typeof size === "string" && size.length > 0) bits.push(size);
  const followUp = attrs["cross_category_source_so"];
  if (typeof followUp === "string" && followUp.length > 0) {
    bits.push(`✎ Follow-up of ${followUp}`);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

type Voucher = NonNullable<SalesOrderTemplateData["vouchers"]>[number];

/** "PWP voucher issued: PWP-1401JXWP (bedframe) · not redeemed yet" */
function voucherIssuedLine(v: Voucher): string {
  const kind = v.type === "promo" ? "Free-item" : "PWP";
  const reward = v.reward_category ? ` (${v.reward_category})` : "";
  return `${kind} voucher issued: ${v.code}${reward} · ${v.redeemed ? "redeemed" : "not redeemed yet"}`;
}

export function SalesOrderTemplate(data: SalesOrderTemplateData) {
  const {
    so_number,
    issue_date,
    order_code,
    // status_label intentionally dropped from the render (Loo 2026-05-22)
    // — still present on the payload contract so callers/tests need not
    // change shape, but the customer-facing PDF no longer surfaces it.
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
    signature_url,
  } = data;
  const payments = data.payments ?? [];
  const vouchers = data.vouchers ?? [];

  const outletName =
    dealer.outlet_name && dealer.outlet_name.trim().length > 0
      ? dealer.outlet_name.trim()
      : null;
  const outletAddress =
    dealer.outlet_address && dealer.outlet_address.trim().length > 0
      ? dealer.outlet_address.trim()
      : null;
  // 2026-05-22 (Loo, migration 0144) — when an order isn't tied to an outlet
  // (pure dealer channel), fall back to the dealer's own address. The "Sold
  // By" card renders whichever resolves first.
  const sellerAddress =
    outletAddress ??
    (dealer.address && dealer.address.trim().length > 0 ? dealer.address.trim() : null);
  // Showroom orders sell under the OUTLET name (reference: "PJ Showroom");
  // pure dealer channel keeps the dealer name.
  const sellerName = outletName ?? dealer.name;

  // Earned vouchers print under the FIRST table line matching their trigger
  // sku (the 2990s look); the rest fall through to a block below the table.
  const vouchersByTrigger = new Map<string, Voucher[]>();
  for (const v of vouchers) {
    if (!v.trigger_sku) continue;
    const list = vouchersByTrigger.get(v.trigger_sku) ?? [];
    list.push(v);
    vouchersByTrigger.set(v.trigger_sku, list);
  }
  const attachedTriggerSkus = new Set<string>();
  const printedLineSkus = new Set(lines.map((l) => l.sku));
  const orphanVouchers = vouchers.filter(
    (v) => !v.trigger_sku || !printedLineSkus.has(v.trigger_sku),
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header: Carres HQ (brand rule) · big SALES ORDER title ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
            <Text style={styles.companyRegNo}>SSM {CARRES_COMPANY.regNo}</Text>
            {CARRES_COMPANY.addressLines.map((line, i) => (
              <Text
                key={i}
                style={
                  i === 0
                    ? [styles.companyAddrLine, styles.companyAddrFirst]
                    : styles.companyAddrLine
                }
              >
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.docTitle}>SALES ORDER</Text>
            <Text style={styles.docNumber}>{so_number}</Text>
            <Text style={styles.docDate}>Date: {issue_date}</Text>
          </View>
        </View>

        {/* ── Card row 1: Order reference · Delivery + payments received ── */}
        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Order reference</Text>
            <Text style={styles.cardValue}>{order_code}</Text>
            <Text style={styles.cardSub}>Placed {issue_date}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Delivery estimate date</Text>
            <Text style={styles.cardValue}>{delivery.date}</Text>
            <Text style={styles.cardSub}>
              Floor {delivery.floor} · {delivery.has_lift ? "lift available" : "no lift"}
            </Text>
            {payments.length > 0 ? (
              <View style={styles.cardDivider}>
                <Text style={styles.cardLabel}>Payments received</Text>
                {payments.map((p, i) => (
                  <View key={i} style={styles.payRow}>
                    <Text style={styles.payLabel}>
                      {p.label}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </Text>
                    <Text style={styles.payAmount}>{formatMoney(p.amount, currency)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Card row 2: Bill To · Sold By ── */}
        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Bill To</Text>
            <Text style={styles.partyName}>{customer.name}</Text>
            <Text style={styles.partyLine}>{customer.address}</Text>
            {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Sold By</Text>
            <Text style={styles.partyName}>{sellerName}</Text>
            {sellerAddress ? <Text style={styles.partyLine}>{sellerAddress}</Text> : null}
            {dealer.contact ? <Text style={styles.partyLine}>{dealer.contact}</Text> : null}
            {dealer.salesperson_name ? (
              <View style={styles.partyDivider}>
                <Text style={styles.cardLabel}>Salesperson</Text>
                <Text style={styles.partyLine}>{dealer.salesperson_name}</Text>
                {dealer.salesperson_phone ? (
                  <Text style={styles.partyLine}>{dealer.salesperson_phone}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Items table — Description = product name + sub-lines.
            Rows sit directly on the Page so long orders split per-row;
            minPresenceAhead keeps the header from stranding alone. ── */}
        <View style={styles.tableHeaderRow} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colSku]}>SKU</Text>
          <Text style={[styles.th, styles.colDesc]}>Description</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
          <Text style={[styles.th, styles.colUnitPrice]}>Unit Price</Text>
          <Text style={[styles.th, styles.colTotal]}>Line Total</Text>
        </View>
        {lines.map((line, idx) => {
            const isLast = idx === lines.length - 1 && addons.length === 0;
            const sofaSub = sofaSpecLine(line.attrs);
            const configSub = configLine(line.attrs);
            const pwpSub = pwpMarkerLine(line.attrs);
            const freeSub = freeMarkerLine(line.attrs);
            let issuedSubs: Voucher[] = [];
            if (!attachedTriggerSkus.has(line.sku) && vouchersByTrigger.has(line.sku)) {
              attachedTriggerSkus.add(line.sku);
              issuedSubs = vouchersByTrigger.get(line.sku) ?? [];
            }
            return (
              <View
                key={`${line.sku}-${idx}`}
                wrap={false}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.td, styles.colSku]}>{line.sku}</Text>
                <View style={[styles.descCell, styles.colDesc]}>
                  <Text style={styles.descMain}>{line.description}</Text>
                  {sofaSub ? <Text style={styles.descSub}>{sofaSub}</Text> : null}
                  {configSub ? <Text style={styles.descSub}>{configSub}</Text> : null}
                  {pwpSub ? <Text style={styles.descSubAccent}>{pwpSub}</Text> : null}
                  {freeSub ? <Text style={styles.descSub}>{freeSub}</Text> : null}
                  {issuedSubs.map((v) => (
                    <Text key={v.code} style={styles.descSub}>
                      {voucherIssuedLine(v)}
                    </Text>
                  ))}
                </View>
                <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
                <Text style={[styles.td, styles.colUnitPrice]}>
                  {formatMoney(line.unit_price, currency)}
                </Text>
                <Text style={[styles.td, styles.colTotal]}>
                  {formatMoney(line.line_total, currency)}
                </Text>
              </View>
            );
          })}
          {addons.map((a, idx) => {
            const isLast = idx === addons.length - 1;
            const addonSub = addonAttrsDescription(a.attrs);
            return (
              <View
                key={`addon-${idx}`}
                wrap={false}
                style={isLast ? styles.tableRowLast : styles.tableRow}
              >
                <Text style={[styles.td, styles.colSku]}>ADD-ON</Text>
                <View style={[styles.descCell, styles.colDesc]}>
                  <Text style={styles.descMain}>{a.label}</Text>
                  {addonSub ? <Text style={styles.descSub}>{addonSub}</Text> : null}
                </View>
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
        <View style={styles.tableEnd} />

        {/* Vouchers whose trigger line isn't on the doc (defensive) */}
        {orphanVouchers.length > 0 ? (
          <View style={styles.voucherBlock}>
            {orphanVouchers.map((v) => (
              <Text key={v.code} style={styles.voucherLine}>
                {voucherIssuedLine(v)}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Customer signature (dashed box) · totals card ── */}
        <View style={styles.signTotalsRow} wrap={false}>
          <View style={styles.signBlock}>
            <View style={styles.signBox}>
              {signed && signature_url ? (
                <Image src={signature_url} style={styles.signImage} />
              ) : null}
            </View>
            <Text style={styles.signLabel}>Customer signature</Text>
            <Text style={styles.signName}>
              {customer.name}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </Text>
            {signed ? (
              <Text style={styles.signMark}>✓ Signed electronically by customer</Text>
            ) : null}
          </View>

          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatMoney(subtotal, currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid to date</Text>
              <Text style={styles.totalsValue}>{formatMoney(paid, currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total (incl. SST 8%)</Text>
              <Text style={styles.totalsValue}>{formatMoney(total, currency)}</Text>
            </View>
            <View style={styles.totalsRowLast}>
              <Text style={styles.totalsLabelGrand}>Balance due</Text>
              <Text style={styles.totalsValueGrand}>
                {formatMoney(balance_due, currency)}
              </Text>
            </View>
          </View>
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
            5. Once the delivery date has been confirmed, any subsequent request to change or extend the date will incur a rescheduling surcharge.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLeft}>{order_code}</Text>
          <Text style={styles.footerRight}>Carres Portal · {issue_date}</Text>
        </View>
      </Page>
    </Document>
  );
}
