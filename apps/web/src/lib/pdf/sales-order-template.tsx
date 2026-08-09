/**
 * Sales Order PDF template — customer-facing document.
 *
 * 2026-08-09 (STAGE 2) — rebuilt to the owner's GOLDEN BASELINE
 * (`CARRES-SO.pdf`, BUILD-QUEUE "SALES ORDER PDF — GOLDEN BASELINE").
 * The Golden resolves, and this file follows it without redesigning:
 *   · canonical SO number `SO-1256` everywhere — header · ORDER DETAILS ·
 *     footer, no zero-padding, no second format
 *   · monochrome document: black bands, gray metadata, no brand accent
 *   · BILL TO (Name · Address · Tel · Email · Emergency) beside
 *     ORDER DETAILS (SO No · Ordered · Sales Location · Proceed date ·
 *     Delivery date · Salesperson · Access)
 *   · items table `# · ITEM CODE · DESCRIPTION · QTY · UNIT (RM) ·
 *     DISCOUNT (RM) · AMOUNT (RM)` under CATEGORY BANDS ("SOFA · 2 items"),
 *     continuous row numbers, SUBTOTAL row
 *   · payments table `DATE · PAYMENT RECEIVED · APPROVAL CODE ·
 *     COLLECTED BY · AMOUNT (RM)`
 *   · Amount in words · dashed signature box · totals card
 *     (Subtotal · Paid to date · BALANCE DUE — the SST line is GONE)
 *   · T&C #1 corrected: a Sales Order never claims to become a tax invoice —
 *     Sales Order / Delivery Order / Sales Invoice are separate lifecycle
 *     documents (the ONE outstanding copy correction the card names)
 *
 * The header always prints Carres HQ (brand-consistency rule).
 */

import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { lineConfigBits } from "@/pages/dealer/new-order/special-addons-picker";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import { amountInWords } from "./amount-in-words";
import type { SalesOrderTemplateData } from "./types";

const INK = "#1A1714";
const MUTED = "#6F675E";
const LINE = "#D9D4CB";
const BAND = "#EFECE6"; // category band + BALANCE DUE band
const HEAD = "#1A1714"; // table header band (black, white text)

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 9,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    color: INK,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
  },
  companyName: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 },
  companyRegNo: { fontSize: 7.5, color: MUTED },
  companyAddrLine: { fontSize: 8, color: "#3F3A33", marginTop: 1 },
  companyAddrFirst: { marginTop: 6 },
  headerMeta: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, letterSpacing: 2.4, color: MUTED, marginTop: 2 },

  // ── BILL TO | ORDER DETAILS ──
  partiesRow: {
    flexDirection: "row",
    gap: 28,
    marginBottom: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  partyCol: { flex: 1 },
  partyHeading: { fontSize: 9, fontWeight: 700, letterSpacing: 0.6, marginBottom: 5 },
  factRow: { flexDirection: "row", marginBottom: 2 },
  factLabel: { width: 78, fontSize: 8.5, color: MUTED },
  factValue: { flex: 1, fontSize: 8.5 },
  factValueBold: { flex: 1, fontSize: 8.5, fontWeight: 700 },

  // ── Items table ──
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: HEAD,
  },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", padding: 5, letterSpacing: 0.5 },
  bandRow: {
    flexDirection: "row",
    backgroundColor: BAND,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  bandText: { fontSize: 8, fontWeight: 700, padding: 4, paddingLeft: 6, letterSpacing: 0.4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  td: { fontSize: 8.5, padding: 5 },
  tdMuted: { fontSize: 8, color: MUTED, padding: 5 },
  descCell: { padding: 5 },
  descMain: { fontSize: 8.5, fontWeight: 700 },
  descSub: { fontSize: 7.5, color: MUTED, marginTop: 1.5 },
  colNo: { width: "5%" },
  colCode: { width: "16%" },
  colDesc: { width: "34%" },
  colQty: { width: "8%", textAlign: "right" },
  colUnit: { width: "12%", textAlign: "right" },
  colDisc: { width: "12%", textAlign: "right" },
  colAmt: { width: "13%", textAlign: "right" },
  subtotalRow: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderTopColor: INK,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    marginBottom: 14,
  },
  subtotalLabel: { fontSize: 8.5, fontWeight: 700, padding: 5, textAlign: "right" },
  subtotalValue: { fontSize: 8.5, fontWeight: 700, padding: 5, textAlign: "right" },

  // ── Payments table ──
  payHeaderRow: { flexDirection: "row", backgroundColor: HEAD, marginTop: 2 },
  payRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  colPayDate: { width: "14%" },
  colPayMethod: { width: "38%" },
  colPayRef: { width: "18%" },
  colPayBy: { width: "16%" },
  colPayAmt: { width: "14%", textAlign: "right" },
  paymentsEnd: { marginBottom: 14 },

  // ── Amount in words · signature · totals ──
  wordsLine: { fontSize: 8, color: MUTED, marginBottom: 8 },
  signTotalsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  signBlock: { flex: 1 },
  signBox: {
    borderWidth: 1,
    borderColor: "#B9B2A6",
    borderStyle: "dashed",
    height: 76,
    alignItems: "center",
    justifyContent: "center",
  },
  signImage: { width: 170, height: 58, objectFit: "contain" },
  signCaption: { fontSize: 8, color: MUTED, marginTop: 4, textAlign: "center" },
  signMark: { fontSize: 7.5, color: MUTED, marginTop: 1.5, textAlign: "center" },
  totalsBlock: { width: "42%" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  totalsRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: BAND,
  },
  totalsLabel: { fontSize: 8.5, color: INK },
  totalsLabelGrand: { fontSize: 9, fontWeight: 700 },
  totalsValue: { fontSize: 9, fontWeight: 700 },
  totalsValueGrand: { fontSize: 11, fontWeight: 700 },

  // ── Terms ──
  termsHeading: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  termsLine: { fontSize: 7.5, color: MUTED, lineHeight: 1.5, marginBottom: 1.5 },

  // ── Fixed footer ──
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 22,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: LINE,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: MUTED },

  voucherBlock: { marginBottom: 12, marginTop: -8 },
  voucherLine: { fontSize: 7.5, color: MUTED, marginTop: 1 },
});

const money2 = (v: number): string =>
  v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = (v: number): string => `RM ${money2(v)}`;

/** ISO → "Sun, 9 Aug 26" (the Golden's ORDER DETAILS format). */
function fmtLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
  return `${wd}, ${d.getUTCDate()} ${mo} ${String(d.getUTCFullYear()).slice(2)}`;
}
/** ISO → "9 Aug 26" (the Golden's payments-table format). */
function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "—";
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mo} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** The item configuration as ONE muted line — the SAME formula the POS
 *  order-detail drawer renders (`lineConfigBits`). A sofa-build row prints
 *  its `sofa_spec` instead; only the remark bit rides along there. */
function configLine(attrs: Record<string, unknown> | null): string | null {
  if (!attrs) return null;
  if (typeof attrs["sofa_spec"] === "string" && attrs["sofa_spec"]) {
    const remark = typeof attrs["remark"] === "string" && attrs["remark"] ? attrs["remark"] : null;
    return remark ? `✎ ${remark}` : null;
  }
  const bits = lineConfigBits(attrs);
  return bits.length > 0 ? bits.join(" · ") : null;
}

function sofaSpecLine(attrs: Record<string, unknown> | null): string | null {
  const spec = attrs?.["sofa_spec"];
  return typeof spec === "string" && spec.length > 0 ? spec : null;
}

function pwpMarkerLine(attrs: Record<string, unknown> | null): string | null {
  const pwp = attrs?.["pwp"] as Record<string, unknown> | undefined;
  if (!pwp || typeof pwp !== "object") return null;
  const code = typeof pwp["code"] === "string" ? pwp["code"] : null;
  const base = pwp["type"] === "promo" ? "Promo · FREE" : "PWP price";
  return code ? `${base} · ${code}` : base;
}

function freeMarkerLine(attrs: Record<string, unknown> | null): string | null {
  if (attrs?.["free_gift"]) return "Free gift";
  if (attrs?.["free_item"]) return "Free item";
  return null;
}

function addonAttrsDescription(attrs: Record<string, unknown> | null | undefined): string | null {
  if (!attrs) return null;
  const bits: string[] = [];
  const size = attrs["size"];
  if (typeof size === "string" && size.length > 0) bits.push(size);
  const followUp = attrs["cross_category_source_so"];
  if (typeof followUp === "string" && followUp.length > 0) bits.push(`✎ Follow-up of ${followUp}`);
  return bits.length > 0 ? bits.join(" · ") : null;
}

type Voucher = NonNullable<SalesOrderTemplateData["vouchers"]>[number];

function voucherIssuedLine(v: Voucher): string {
  const kind = v.type === "promo" ? "Free-item" : "PWP";
  const reward = v.reward_category ? ` (${v.reward_category})` : "";
  return `${kind} voucher issued: ${v.code}${reward} · ${v.redeemed ? "redeemed" : "not redeemed yet"}`;
}

/** One printable row of the banded items table. */
type ItemRow = {
  code: string;
  name: string;
  subs: string[];
  qty: number;
  unit: number;
  discount: number | null;
  amount: number;
  attrs: Record<string, unknown> | null;
  sku: string;
};

export function SalesOrderTemplate(data: SalesOrderTemplateData) {
  const {
    so_number,
    issue_date,
    customer,
    dealer,
    delivery,
    lines,
    addons,
    subtotal,
    paid,
    balance_due,
    signed,
    signature_url,
  } = data;
  const payments = data.payments ?? [];
  const vouchers = data.vouchers ?? [];

  const outletName = dealer.outlet_name?.trim() || null;
  const sellerName = outletName ?? dealer.name;

  // Vouchers print under their trigger line; orphans fall to a block below.
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

  // ── CATEGORY BANDS — first-appearance order; unknown → ITEMS; addons →
  // SERVICE, always last (the Golden's own order). Row numbers run through. ──
  const bandOrder: string[] = [];
  const rowsByBand = new Map<string, ItemRow[]>();
  const pushRow = (band: string, row: ItemRow) => {
    if (!rowsByBand.has(band)) {
      rowsByBand.set(band, []);
      bandOrder.push(band);
    }
    rowsByBand.get(band)!.push(row);
  };
  for (const line of lines) {
    const band = (line.category ?? "").trim().toUpperCase() || "ITEMS";
    const subs: string[] = [];
    const sofaSub = sofaSpecLine(line.attrs);
    const configSub = configLine(line.attrs);
    const pwpSub = pwpMarkerLine(line.attrs);
    const freeSub = freeMarkerLine(line.attrs);
    if (sofaSub) subs.push(sofaSub);
    if (configSub) subs.push(configSub);
    if (pwpSub) subs.push(pwpSub);
    if (freeSub) subs.push(freeSub);
    if (!attachedTriggerSkus.has(line.sku) && vouchersByTrigger.has(line.sku)) {
      attachedTriggerSkus.add(line.sku);
      for (const v of vouchersByTrigger.get(line.sku) ?? []) subs.push(voucherIssuedLine(v));
    }
    pushRow(band, {
      code: line.sku,
      name: line.description,
      subs,
      qty: line.qty,
      unit: line.unit_price,
      discount: line.discount ?? null,
      amount: line.line_total,
      attrs: line.attrs,
      sku: line.sku,
    });
  }
  for (const a of addons) {
    const sub = addonAttrsDescription(a.attrs);
    pushRow("SERVICE", {
      code: "ADD-ON",
      name: a.label,
      subs: sub ? [sub] : [],
      qty: a.qty,
      unit: a.unit_price,
      discount: null,
      amount: a.line_total,
      attrs: a.attrs ?? null,
      sku: `addon-${a.label}`,
    });
  }
  // SERVICE last, everything else in first-appearance order.
  const orderedBands = [
    ...bandOrder.filter((b) => b !== "SERVICE"),
    ...bandOrder.filter((b) => b === "SERVICE"),
  ];
  const qtyTotal = [...rowsByBand.values()].flat().reduce((s, r) => s + r.qty, 0);
  const discountTotal = [...rowsByBand.values()]
    .flat()
    .reduce((s, r) => s + (r.discount ?? 0), 0);

  const ordered = data.ordered_date ?? issue_date;
  let rowNo = 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header — company block · SO-1256 + SALES ORDER ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
            <Text style={styles.companyRegNo}>SSM {CARRES_COMPANY.regNo}</Text>
            {CARRES_COMPANY.addressLines.map((line, i) => (
              <Text
                key={i}
                style={
                  i === 0 ? [styles.companyAddrLine, styles.companyAddrFirst] : styles.companyAddrLine
                }
              >
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.docNumber}>{so_number}</Text>
            <Text style={styles.docTitle}>SALES ORDER</Text>
          </View>
        </View>

        {/* ── BILL TO | ORDER DETAILS ── */}
        <View style={styles.partiesRow}>
          <View style={styles.partyCol}>
            <Text style={styles.partyHeading}>BILL TO</Text>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Name</Text>
              <Text style={styles.factValueBold}>{customer.name}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Address</Text>
              <Text style={styles.factValue}>{customer.address}</Text>
            </View>
            {customer.phone ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Tel</Text>
                <Text style={styles.factValue}>{customer.phone}</Text>
              </View>
            ) : null}
            {customer.email ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Email</Text>
                <Text style={styles.factValue}>{customer.email}</Text>
              </View>
            ) : null}
            {customer.emergency ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Emergency</Text>
                <Text style={styles.factValue}>{customer.emergency}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyHeading}>ORDER DETAILS</Text>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>SO No</Text>
              <Text style={styles.factValueBold}>: {so_number}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Ordered</Text>
              <Text style={styles.factValue}>: {fmtLong(ordered)}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Sales Location</Text>
              <Text style={styles.factValue}>: {sellerName}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Proceed date</Text>
              <Text style={styles.factValue}>: {fmtLong(data.proceed_date)}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Delivery date</Text>
              <Text style={styles.factValue}>: {fmtLong(delivery.date)}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Salesperson</Text>
              <Text style={styles.factValue}>: {dealer.salesperson_name ?? "—"}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Access</Text>
              <Text style={styles.factValue}>
                : Floor {delivery.floor} · {delivery.has_lift ? "Lift" : "No lift"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Items table — black header · category bands · continuous # ── */}
        <View style={styles.tableHeaderRow} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colCode]}>ITEM CODE</Text>
          <Text style={[styles.th, styles.colDesc]}>DESCRIPTION</Text>
          <Text style={[styles.th, styles.colQty]}>QTY</Text>
          <Text style={[styles.th, styles.colUnit]}>UNIT (RM)</Text>
          <Text style={[styles.th, styles.colDisc]}>DISCOUNT (RM)</Text>
          <Text style={[styles.th, styles.colAmt]}>AMOUNT (RM)</Text>
        </View>
        {orderedBands.map((band) => {
          const rows = rowsByBand.get(band)!;
          return [
            <View key={`band-${band}`} style={styles.bandRow} minPresenceAhead={24}>
              <Text style={styles.bandText}>
                {band} · {rows.length} item{rows.length === 1 ? "" : "s"}
              </Text>
            </View>,
            ...rows.map((r) => {
              rowNo += 1;
              return (
                <View key={`${r.sku}-${rowNo}`} wrap={false} style={styles.tableRow}>
                  <Text style={[styles.tdMuted, styles.colNo]}>{rowNo}</Text>
                  <Text style={[styles.td, styles.colCode]}>{r.code}</Text>
                  <View style={[styles.descCell, styles.colDesc]}>
                    <Text style={styles.descMain}>{r.name}</Text>
                    {r.subs.map((sub, i) => (
                      <Text key={i} style={styles.descSub}>
                        {sub}
                      </Text>
                    ))}
                  </View>
                  <Text style={[styles.td, styles.colQty]}>{r.qty}</Text>
                  <Text style={[styles.td, styles.colUnit]}>{money2(r.unit)}</Text>
                  <Text style={[styles.td, styles.colDisc]}>
                    {r.discount != null && r.discount > 0 ? money2(r.discount) : "—"}
                  </Text>
                  <Text style={[styles.td, styles.colAmt]}>{money2(r.amount)}</Text>
                </View>
              );
            }),
          ];
        })}
        <View style={styles.subtotalRow} wrap={false}>
          <Text style={[styles.subtotalLabel, styles.colNo]} />
          <Text style={[styles.subtotalLabel, styles.colCode]} />
          <Text style={[styles.subtotalLabel, styles.colDesc]}>SUBTOTAL</Text>
          <Text style={[styles.subtotalValue, styles.colQty]}>{qtyTotal}</Text>
          <Text style={[styles.subtotalValue, styles.colUnit]} />
          <Text style={[styles.subtotalValue, styles.colDisc]}>
            {discountTotal > 0 ? rm(discountTotal) : "—"}
          </Text>
          <Text style={[styles.subtotalValue, styles.colAmt]}>{rm(subtotal)}</Text>
        </View>

        {orphanVouchers.length > 0 ? (
          <View style={styles.voucherBlock}>
            {orphanVouchers.map((v) => (
              <Text key={v.code} style={styles.voucherLine}>
                {voucherIssuedLine(v)}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Payments table ── */}
        {payments.length > 0 ? (
          <>
            <View style={styles.payHeaderRow} minPresenceAhead={30}>
              <Text style={[styles.th, styles.colPayDate]}>DATE</Text>
              <Text style={[styles.th, styles.colPayMethod]}>PAYMENT RECEIVED</Text>
              <Text style={[styles.th, styles.colPayRef]}>APPROVAL CODE</Text>
              <Text style={[styles.th, styles.colPayBy]}>COLLECTED BY</Text>
              <Text style={[styles.th, styles.colPayAmt]}>AMOUNT (RM)</Text>
            </View>
            {payments.map((p, i) => (
              <View key={i} wrap={false} style={styles.payRow}>
                <Text style={[styles.td, styles.colPayDate]}>{fmtShort(p.date)}</Text>
                <Text style={[styles.td, styles.colPayMethod]}>{p.label}</Text>
                <Text style={[styles.td, styles.colPayRef]}>{p.reference ?? "—"}</Text>
                <Text style={[styles.td, styles.colPayBy]}>{p.collected_by ?? "—"}</Text>
                <Text style={[styles.td, styles.colPayAmt]}>{money2(p.amount)}</Text>
              </View>
            ))}
            <View style={styles.paymentsEnd} />
          </>
        ) : null}

        {/* ── Amount in words · signature · totals ── */}
        <Text style={styles.wordsLine}>Amount in words: {amountInWords(subtotal)}</Text>
        <View style={styles.signTotalsRow} wrap={false}>
          <View style={styles.signBlock}>
            <View style={styles.signBox}>
              {signed && signature_url ? <Image src={signature_url} style={styles.signImage} /> : null}
            </View>
            <Text style={styles.signCaption}>
              Customer Signature · {customer.name}
            </Text>
            {signed ? (
              <Text style={styles.signMark}>Signed electronically by customer</Text>
            ) : null}
          </View>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{rm(subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid to date</Text>
              <Text style={styles.totalsValue}>{rm(paid)}</Text>
            </View>
            <View style={styles.totalsRowLast}>
              <Text style={styles.totalsLabelGrand}>BALANCE DUE</Text>
              <Text style={styles.totalsValueGrand}>{rm(balance_due)}</Text>
            </View>
          </View>
        </View>

        {/* ── Terms — #1 corrected: SO · DO · Invoice are SEPARATE documents ── */}
        <View wrap={false}>
          <Text style={styles.termsHeading}>Terms &amp; Conditions</Text>
          <Text style={styles.termsLine}>
            1. This sales order records your purchase agreement with Carres. The sales invoice is a separate document issued upon delivery.
          </Text>
          <Text style={styles.termsLine}>
            2. Balance due is payable in full on or before delivery. Cash, bank transfer, DuitNow QR, and cheque accepted.
          </Text>
          <Text style={styles.termsLine}>
            3. Delivery date is best-effort and may shift ±3 working days subject to operation confirmation.
          </Text>
          <Text style={styles.termsLine}>
            4. Once the delivery date has been confirmed, any subsequent request to change or extend the date will incur a rescheduling surcharge.
          </Text>
        </View>

        {/* ── Fixed footer — SO-1256 · generated note · Page N of M ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{so_number}</Text>
          <Text style={styles.footerText}>
            Computer-generated document · No company signature required.
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
