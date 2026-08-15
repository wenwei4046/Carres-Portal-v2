/**
 * Sales Order PDF template — customer-facing document handed out at point
 * of sale.
 *
 * 2026-08-09 (Loo) — "骨架抄 2990、皮肤用 Carres Muji": the block order is the
 * owner's approved 2990 skeleton (BILL TO / ORDER DETAILS · DELIVER TO ·
 * category-banded items · PAYMENTS RECEIVED · amount-in-words + BALANCE DUE ·
 * customer signature · T&C · fixed footer with page numbers), the skin is the
 * PO-PDF-STANDARD voice (wordmark stamp, ink/grey/hairline, zero fills, one
 * quiet footer row). Supersedes the 2026-07-14 flame-accent relayout.
 *
 * Owner rulings folded in (this chat, 2026-08-09):
 * - Venue and Status never print (status removed 2026-05-22 stays removed).
 * - Discount column and Expected deposit STAY on the layout, data-driven —
 *   no schema field carries either today, so they print "—" / not at all
 *   until the portal sends figures.
 * - The SO does not talk tax: no Tax row, no "incl. SST" claim — the totals
 *   are "Items total / Paid to date / BALANCE DUE". The invoice owns SST.
 * - Lift/floor are three-state: a stair-carry note may print ONLY when both
 *   are actually recorded; unknown prints "Not recorded" + an access-check
 *   sentence instead of a silent charge basis.
 * - Company signature box removed — "Computer-generated document · No company
 *   signature required." The CUSTOMER signature (POS eSign) stays.
 *
 * The header always prints Carres HQ (brand-consistency rule); the showroom
 * / outlet prints in ORDER DETAILS and the seller block.
 */

import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { lineConfigBits } from "../../pages/dealer/new-order/special-addons-picker";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { SalesOrderTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAND_BG = "#EDEDED"; // category band — 2990's neutral grey (beige rejected, owner round 9)
const BAR_BG = INK; // table header bar — white text on ink (2990)

const mm = (v: number) => v * 2.83465;

/** B ruling (Loo, 2026-08-09): the DB's delivery_has_lift is a NOT-NULL
 * boolean today, so an order nobody asked about prints `LIFT No` — that may
 * NOT feed a charge sentence the customer signs. Until the nullable-columns
 * migration + POS form land, the stair-carry sentence and its T&C clause
 * stay OFF. Flip this to true in the migration's PR, nowhere else. */
const LIFT_THREE_STATE_READY = false;

const MARGIN = mm(12);
const HEADER_H = mm(20);
const FOOTER_H = mm(8);

/** `2026-08-09` → `SUN, 9 AUG 26` (textual parse — timezone-proof). */
function capsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso).toUpperCase();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][mo - 1];
  return `${dow}, ${d} ${mon} ${String(y).slice(2)}`;
}

/** Body dates read mixed-case — `9 Aug 26`, or `Mon, 24 Aug 26` with the
 *  weekday. ALL-CAPS dates live in the header only; inside tables they were
 *  noise (owner review 2026-08-09: "payment received part messy"). */
function niceDate(iso: string | null | undefined, withDow = false): string | null {
  const caps = capsDate(iso);
  if (!caps) return null;
  const pretty = caps
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return withDow ? pretty : pretty.replace(/^[A-Za-z]{3}, /, "");
}

/** Table cells print DIGITS only — the column header carries `(RM)` once
 *  (owner round 7: a dozen repeated "RM" was noise; Stripe/IKEA print the
 *  currency once). The money zone keeps the full `RM x` form. */
function moneyDigits(value: number): string {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Customer-facing money: `RM 1,495.00` (MYR prints as RM — the word the
 *  customer reads on every Malaysian receipt). */
function formatMoney(value: number, currency: string): string {
  const unit = currency === "MYR" ? "RM" : currency;
  return `${unit} ${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 9,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },

  // ── header (fixed, every page): wordmark + legal identity · doc hero ──
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  docNumber: { fontSize: 18, fontWeight: 700 },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  // ── frameless info blocks. Section anchors are INK — the owner's review
  //    (2026-08-09) found the all-grey voice hard to read; international
  //    references (Stripe / Shopify invoices) bold the section titles small
  //    and keep grey for genuinely secondary text only. ──
  cards: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), minHeight: mm(36) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  partyName: { fontSize: 9.5, fontWeight: 600, marginTop: mm(1) },
  partyLine: { fontSize: 9, marginTop: mm(1) },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(20), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },
  deliverBlock: { marginTop: mm(2), paddingHorizontal: mm(4) },
  accessNote: { fontSize: 7.5, color: GREY, marginTop: mm(0.8) },

  // ── items table: zero grid lines, hairline rhythm, category bands ──
  tableHead: {
    backgroundColor: BAR_BG,
    flexDirection: "row",
    paddingVertical: mm(1.8),
    paddingHorizontal: mm(2),
    marginTop: mm(2.5),
  },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  colNo: { width: mm(7) },
  colCode: { width: mm(27) },
  colQty: { width: mm(10), textAlign: "right" },
  colPrice: { width: mm(25), textAlign: "right" },
  colDisc: { width: mm(24), textAlign: "right" },
  colAmount: { width: mm(25), textAlign: "right" },
  bandRow: {
    flexDirection: "row",
    backgroundColor: BAND_BG,
    paddingVertical: mm(1.2),
    paddingHorizontal: mm(2),
    marginTop: mm(1),
  },
  bandText: { fontSize: 7.5, fontWeight: 700, color: INK, letterSpacing: 0.3 },
  row: { flexDirection: "row", paddingVertical: mm(2), paddingHorizontal: mm(2) },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },
  cellNo: { fontSize: 7, color: GREY, width: mm(7), textAlign: "right", paddingRight: mm(1.5), lineHeight: 1 },
  cellCode: { fontSize: 7.5, width: mm(27), paddingRight: mm(2), lineHeight: 1 },
  desc: { flex: 1, paddingRight: mm(3) },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1 },
  descSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), paddingLeft: mm(2), lineHeight: 1.2 },
  cellQty: { fontSize: 7, width: mm(10), textAlign: "right", lineHeight: 1 },
  cellMoney: { fontSize: 7, textAlign: "right", lineHeight: 1 },
  // The line's own amount anchors the row (international convention: the
  // rightmost figure is the one the reader scans down).
  cellAmount: { fontSize: 7, fontWeight: 700, textAlign: "right", lineHeight: 1 },

  voucherBlock: { marginTop: mm(1), paddingHorizontal: mm(4) },
  voucherLine: { fontSize: 8, color: GREY, marginTop: mm(0.5) },

  // ── payments received ──
  payHead: {
    backgroundColor: BAR_BG,
    flexDirection: "row",
    paddingVertical: mm(1.8),
    paddingHorizontal: mm(2),
    marginTop: mm(1.2),
  },
  payColDate: { width: mm(24) },
  payColCode: { width: mm(30) },
  payColBy: { width: mm(30) },
  payColAmount: { width: mm(23), textAlign: "right" },
  payCell: { fontSize: 8, lineHeight: 1 },

  // ── amount in words · totals ──
  totalsZone: { flexDirection: "row", justifyContent: "space-between", marginTop: mm(2.5), paddingHorizontal: mm(4), alignItems: "stretch" },
  wordsRow: { marginTop: mm(5), paddingHorizontal: mm(4) },
  depositLine: { fontSize: 8.5, color: GREY, marginTop: mm(2) },
  totalsBlock: { width: mm(70), borderWidth: 0.6, borderColor: HAIR },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: mm(1.1),
    paddingHorizontal: mm(3),
    borderBottomWidth: 0.4,
    borderBottomColor: HAIR,
  },
  totalsLabel: { fontSize: 8.5, lineHeight: 1.33 },
  totalsValue: { fontSize: 8.5, lineHeight: 1.33 },
  balanceBox: {
    backgroundColor: BAND_BG,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(3),
  },
  balanceLabel: { fontSize: 8.5, fontWeight: 700 },
  balanceValue: { fontSize: 8.5, fontWeight: 700 },

  // ── customer signature · legal sentence ──
  signZone: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), alignItems: "flex-start" },
  signBlock: { width: mm(90) },
  signBox: {
    borderWidth: 0.6,
    borderColor: "#787878",
    borderStyle: "dashed",
    width: mm(80),
    paddingBottom: mm(1.2),
    alignItems: "center",
    justifyContent: "flex-end",
  },
  signCaption: { fontSize: 6.5, color: GREY, lineHeight: 1 },
  signImage: { width: mm(55), height: mm(14), objectFit: "contain" },
  signLabel: { fontSize: 7.5, color: GREY, letterSpacing: 0.8, textTransform: "uppercase", marginTop: mm(1) },
  signName: { fontSize: 8.5, marginTop: mm(0.6) },
  signMark: { fontSize: 7.5, color: GREY, marginTop: mm(0.5) },
  legalBlock: { flex: 1, paddingLeft: mm(8), paddingTop: mm(6) },
  legalSentence: { fontSize: 7.5, color: GREY, lineHeight: 1.5 },

  // ── terms ──
  terms: { paddingTop: mm(4), paddingHorizontal: mm(4) },
  termsLine: { fontSize: 7, color: GREY, lineHeight: 1.3, marginTop: mm(0.8) },

  // ── footer (fixed, every page) ──
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: mm(2),
  },
  footerCell: { fontSize: 7.5, color: GREY, width: mm(45) },
  footerCenter: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
  footerPage: { fontSize: 7.5, color: GREY, width: mm(45), textAlign: "right" },
});

/** The item configuration as ONE muted line — the SAME formula the POS
 *  order-detail drawer renders (`lineConfigBits`, Loo 2026-07-25). A
 *  sofa-build row prints its `sofa_spec` instead; only the remark rides. */
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

/** PWP / promo marker for a reward line carrying `attrs.pwp`. */
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
  if (typeof followUp === "string" && followUp.length > 0) {
    bits.push(`✎ Follow-up of ${followUp}`);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

type Voucher = NonNullable<SalesOrderTemplateData["vouchers"]>[number];
type SoLine = SalesOrderTemplateData["lines"][number];

function voucherIssuedLine(v: Voucher): string {
  const kind = v.type === "promo" ? "Free-item" : "PWP";
  const reward = v.reward_category ? ` (${v.reward_category})` : "";
  return `${kind} voucher issued: ${v.code}${reward} · ${v.redeemed ? "redeemed" : "not redeemed yet"}`;
}

/** Lines grouped into category bands, original order preserved. Rows without
 *  a category fall under a nameless band (no header row prints). */
function bandedLines(lines: SoLine[]): Array<{ band: string | null; rows: Array<{ line: SoLine; index: number }> }> {
  const groups: Array<{ band: string | null; rows: Array<{ line: SoLine; index: number }> }> = [];
  lines.forEach((line, index) => {
    const band = line.category?.trim().toUpperCase() || null;
    const last = groups[groups.length - 1];
    if (last && last.band === band) last.rows.push({ line, index });
    else groups.push({ band, rows: [{ line, index }] });
  });
  return groups;
}

export function SalesOrderTemplate(data: SalesOrderTemplateData) {
  const {
    so_number,
    issue_date,
    order_code,
    // status_label intentionally dropped from the render (Loo 2026-05-22,
    // re-affirmed 2026-08-09) — the customer-facing PDF prints no status;
    // the dates tell the story. The field stays on the payload contract.
    customer,
    dealer,
    delivery,
    proceed_date,
    lines,
    addons,
    total,
    paid,
    balance_due,
    currency,
    expected_deposit,
    signed,
    signature_url,
  } = data;
  const payments = data.payments ?? [];
  const vouchers = data.vouchers ?? [];

  const outletName =
    dealer.outlet_name && dealer.outlet_name.trim().length > 0 ? dealer.outlet_name.trim() : null;
  // Showroom orders sell under the OUTLET name; pure dealer channel keeps
  // the dealer name (0144 fallback rule).
  const sellerName = outletName ?? dealer.name;

  // ── DELIVER TO three-state facts (owner ruling 2026-08-09) ──
  const deliveryAddress =
    delivery.address && delivery.address.trim().length > 0 && delivery.address.trim() !== customer.address.trim()
      ? delivery.address.trim()
      : null;
  const floorText = delivery.floor == null ? "Floor not recorded" : `Floor ${delivery.floor}`;
  const liftText =
    delivery.has_lift == null ? "Lift not recorded" : delivery.has_lift ? "Lift available" : "No lift";
  const accessKnown = delivery.floor != null && delivery.has_lift != null;
  // The charge sentence prints only on a RECORDED walk-up; an unknown access
  // prints the to-be-checked sentence instead. Never a charge on a default.
  const stairCarry =
    LIFT_THREE_STATE_READY && accessKnown && delivery.floor! > 1 && delivery.has_lift === false;

  // Vouchers print under the FIRST table line matching their trigger sku;
  // the rest fall to a block below the table (defensive).
  const vouchersByTrigger = new Map<string, Voucher[]>();
  for (const v of vouchers) {
    if (!v.trigger_sku) continue;
    const list = vouchersByTrigger.get(v.trigger_sku) ?? [];
    list.push(v);
    vouchersByTrigger.set(v.trigger_sku, list);
  }
  const attachedTriggerSkus = new Set<string>();
  const printedLineSkus = new Set(lines.map((l) => l.sku));
  const orphanVouchers = vouchers.filter((v) => !v.trigger_sku || !printedLineSkus.has(v.trigger_sku));

  const groups = bandedLines(lines);
  const hasAddons = addons.length > 0;

  const dash = "—";
  const money = (v: number) => formatMoney(v, currency);

  // The table's own footer sums the rows it printed (round 24).
  const totalQty =
    lines.reduce((n, l) => n + Number(l.qty), 0) + addons.reduce((n, a) => n + Number(a.qty), 0);
  const totalDiscount = lines.reduce((n, l) => n + (l.discount && l.discount > 0 ? l.discount : 0), 0);
  const totalAmount =
    lines.reduce((n, l) => n + Number(l.line_total), 0) +
    addons.reduce((n, a) => n + Number(a.line_total), 0);

  // Row order + words fixed by the owner (round 23): Doc No · Ordered ·
  // Sales Location (2990's word; was Showroom) · Proceed date · Delivery
  // date · Salesperson · Access.
  const orderDetailRows: Array<[string, string | null]> = [
    ["SO No", so_number],
    ["Ordered", niceDate(issue_date, true)],
    ["Sales Location", outletName],
    ["Proceed date", proceed_date ? niceDate(proceed_date, true) : null],
    ["Delivery date", niceDate(delivery.date, true) ?? delivery.date],
  ];
  const accessText = `${floorText} · ${liftText}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── header, fixed: full identity on page 1; continuation pages get
            ONE quiet line (a repeated four-line letterhead on an overflow
            page is wasted paper — owner review 2026-08-09). ── */}
        <View
          style={styles.header}
          fixed
          render={({ subPageNumber }) =>
            subPageNumber === 1 ? (
              <View>
                <View style={styles.headerRow}>
                  {/* Left column is WIDTH-BOUNDED (flex + padding) so the
                      address and the doc number own separate ground — a
                      longer SO number can never touch the address (owner
                      round 11). Line 1: logo · legal name · SSM. Lines
                      2-3: the address, two lines, breathing. */}
                  {/* Carres amendment of 2990's drawHeader (owner round 15):
                      name 14/700 with the SSM inline at 8pt grey, address in
                      TWO 8.5pt lines. */}
                  <View style={{ flex: 1, paddingRight: mm(10) }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                      <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
                      <Text style={styles.ssmInline}>SSM {CARRES_COMPANY.regNo}</Text>
                    </View>
                    <Text style={[styles.legalLine, { marginTop: mm(1.8) }]}>
                      {CARRES_COMPANY.addressLines[0]}
                    </Text>
                    <Text style={styles.legalLine}>
                      {CARRES_COMPANY.addressLines[1]} {CARRES_COMPANY.addressLines[2]}
                    </Text>
                  </View>
                  {/* Owner round 16: the number IS the identity — 18/700
                      hero, no "Doc No:" label, no Date (ORDER DETAILS'
                      `Ordered` already prints it once). */}
                  {/* Round 17 (final): the NUMBER leads, the doc-type word
                      whispers under it — grey caps, the PO header's own
                      hierarchy. */}
                  <View style={styles.docBlock}>
                    <Text style={styles.docNumber}>{so_number}</Text>
                    <Text style={styles.docTitle}>SALES ORDER</Text>
                  </View>
                </View>
                <View style={styles.headerRule} />
              </View>
            ) : (
              <View>
                <View style={[styles.headerRow, { alignItems: "flex-end" }]}>
                  <Text style={styles.legalLine}>
                    {CARRES_COMPANY.legalName} · SSM {CARRES_COMPANY.regNo}
                  </Text>
                  <Text style={{ fontSize: 9, fontWeight: 700 }}>
                    SALES ORDER · {so_number}
                  </Text>
                </View>
                <View style={styles.headerRule} />
              </View>
            )
          }
        />

        {/* ── BILL TO · ORDER DETAILS (frameless, first page only) ── */}
        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: mm(6) }}>
            <Text style={styles.blockLabel}>Bill To</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {([
                ["Name", customer.name],
                ["Address", customer.address],
                ["Tel", customer.phone],
                ["Email", customer.email],
                ["Emergency", customer.emergency],
              ] as Array<[string, string | null | undefined]>).map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={styles.pairLabel}>{label}</Text>
                    <Text style={styles.pairValue}>{value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel}>Order Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {[
                ...orderDetailRows,
                /* Showroom already names the outlet — this row carries only
                   what is NEW: the salesperson, or the dealer when no outlet. */
                ["Salesperson", dealer.salesperson_name] as [string, string | null],
                ["Sold by", outletName ? null : sellerName] as [string, string | null],
                ["Access", accessText] as [string, string | null],
              ].map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={[styles.pairLabel, { width: mm(26) }]}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
              {stairCarry ? (
                <Text style={styles.accessNote}>Stair-carry charge applies — see Terms & Conditions.</Text>
              ) : null}
              {!accessKnown ? (
                <Text style={styles.accessNote}>Access not confirmed — to be checked before delivery.</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── DELIVER TO — prints ONLY when the delivery address differs
            from billing ("Same as billing address" was a wasted line;
            floor/lift live in ORDER DETAILS' Access row now). ── */}
        {deliveryAddress ? (
          <View style={styles.deliverBlock}>
            <Text style={styles.blockLabel}>Deliver To</Text>
            <Text style={styles.partyLine}>{deliveryAddress}</Text>
          </View>
        ) : null}

        {/* ── items table — banded, ink header bar, hairline rhythm.
            DEFERRED (cut 5, owner round 7): repeating the header bar on
            overflow pages needs the long-order stress pass — production's
            biggest order is 4 lines today, and @react-pdf's `fixed` would
            also stamp the bar on a money-zone-only last page. Do it with
            the 50-line stress test, not blind. ── */}
        <View style={styles.tableHead} minPresenceAhead={40}>
          <Text style={[styles.th, styles.colNo]}>#</Text>
          <Text style={[styles.th, styles.colCode]}>Item Code</Text>
          <Text style={[styles.th, { flex: 1 }]}>Description</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
          <Text style={[styles.th, styles.colPrice]}>Unit (RM)</Text>
          <Text style={[styles.th, styles.colDisc]}>Discount (RM)</Text>
          <Text style={[styles.th, styles.colAmount]}>Amount (RM)</Text>
        </View>
        {groups.map((group, gi) => (
          <View key={`band-${gi}`}>
            {group.band ? (
              <View style={styles.bandRow} minPresenceAhead={30}>
                <Text style={styles.bandText}>
                  {group.band} · {group.rows.length} {group.rows.length > 1 ? "items" : "item"}
                </Text>
              </View>
            ) : null}
            {group.rows.map(({ line, index }) => {
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
                  key={`${line.sku}-${index}`}
                  wrap={false}
                  style={[styles.row, styles.rowHair]}
                >
                  <Text style={styles.cellNo}>{index + 1}</Text>
                  <Text style={styles.cellCode}>{line.sku}</Text>
                  <View style={styles.desc}>
                    <Text style={styles.descMain}>{line.description}</Text>
                    {sofaSub ? <Text style={styles.descSub}>{sofaSub}</Text> : null}
                    {configSub ? <Text style={styles.descSub}>{configSub}</Text> : null}
                    {pwpSub ? <Text style={styles.descSub}>{pwpSub}</Text> : null}
                    {freeSub ? <Text style={styles.descSub}>{freeSub}</Text> : null}
                    {issuedSubs.map((v) => (
                      <Text key={v.code} style={styles.descSub}>
                        {voucherIssuedLine(v)}
                      </Text>
                    ))}
                  </View>
                  <Text style={line.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>
                    {line.qty}
                  </Text>
                  <Text style={[styles.cellMoney, styles.colPrice]}>{moneyDigits(line.unit_price)}</Text>
                  <Text style={[styles.cellMoney, styles.colDisc]}>
                    {line.discount && line.discount > 0 ? moneyDigits(line.discount) : dash}
                  </Text>
                  <Text style={[styles.cellAmount, styles.colAmount]}>{moneyDigits(line.line_total)}</Text>
                </View>
              );
            })}
          </View>
        ))}
        {hasAddons ? (
          <View style={styles.bandRow} minPresenceAhead={30}>
            <Text style={styles.bandText}>
              SERVICE · {addons.length} {addons.length > 1 ? "items" : "item"}
            </Text>
          </View>
        ) : null}
        {addons.map((a, idx) => {
          const addonSub = addonAttrsDescription(a.attrs);
          return (
            <View key={`addon-${idx}`} wrap={false} style={[styles.row, styles.rowHair]}>
              <Text style={styles.cellNo}>{lines.length + idx + 1}</Text>
              <Text style={styles.cellCode}>{a.sku ?? "ADD-ON"}</Text>
              <View style={styles.desc}>
                <Text style={styles.descMain}>{a.label}</Text>
                {addonSub ? <Text style={styles.descSub}>{addonSub}</Text> : null}
              </View>
              <Text style={a.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>{a.qty}</Text>
              <Text style={[styles.cellMoney, styles.colPrice]}>{moneyDigits(a.unit_price)}</Text>
              <Text style={[styles.cellMoney, styles.colDisc]}>{dash}</Text>
              <Text style={[styles.cellAmount, styles.colAmount]}>{moneyDigits(a.line_total)}</Text>
            </View>
          );
        })}
        {/* TOTAL row closes the table: qty · discount · amount sums (round 24) */}
        <View
          wrap={false}
          style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
        >
          <Text style={styles.cellNo}> </Text>
          <Text style={styles.cellCode}> </Text>
          <View style={styles.desc}>
            <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>SUBTOTAL</Text>
          </View>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totalQty}</Text>
          <Text style={[styles.cellMoney, styles.colPrice]}> </Text>
          <Text style={[styles.cellMoney, styles.colDisc, totalDiscount > 0 ? { fontWeight: 700 } : {}]}>
            {totalDiscount > 0 ? money(totalDiscount) : dash}
          </Text>
          <Text style={[styles.cellAmount, styles.colAmount]}>{money(totalAmount)}</Text>
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />

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

        {/* ── THE MONEY ZONE — payments box (option A, owner round 5) +
            words/signature/totals + terms all pin to the PAGE BOTTOM as one
            unit: the items table is the only flexible zone, so BALANCE DUE
            and the signature sit at the same spot on every printed order
            (pre-printed-form geometry). ── */}
        <View wrap={false} style={{ marginTop: "auto" }}>
        {payments.length > 0 ? (
          /* frozen at four rows' height — 1 payment or 4, the geometry
             never moves (owner round 28) */
          <View style={{ marginTop: mm(5), minHeight: mm(40) }}>
            <View style={styles.payHead}>
              <Text style={[styles.th, styles.payColDate]}>Date</Text>
              <Text style={[styles.th, { flex: 1 }]}>Payment Received</Text>
              <Text style={[styles.th, styles.payColCode]}>Approval Code</Text>
              <Text style={[styles.th, styles.payColBy]}>Collected By</Text>
              <Text style={[styles.th, styles.payColAmount]}>Amount (RM)</Text>
            </View>
            {payments.map((p, i) => (
              <View key={i} style={i === payments.length - 1 ? styles.row : [styles.row, styles.rowHair]}>
                <Text style={[styles.payCell, styles.payColDate]}>{p.date ? (niceDate(p.date) ?? p.date) : dash}</Text>
                <Text style={[styles.payCell, { flex: 1 }]}>{p.label}</Text>
                <Text style={[styles.payCell, styles.payColCode]}>{p.approval_code ?? p.reference ?? dash}</Text>
                <Text style={[styles.payCell, styles.payColBy]}>{p.collected_by ?? dash}</Text>
                <Text style={[styles.payCell, styles.payColAmount, { textAlign: "right", fontWeight: 600 }]}>{moneyDigits(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* amount in words + customer signature (left) · totals (right) */}
        {/* Amount-in-words REMOVED (owner, 2026-08-09): a computer-generated
            document needs no anti-tamper words — that was the handwritten-
            cheque era. The deposit line keeps its slot, data-driven. */}
        {expected_deposit != null && expected_deposit > 0 && paid < expected_deposit ? (
          <View style={styles.wordsRow} wrap={false}>
            <Text style={styles.depositLine}>Expected deposit: {money(expected_deposit)}</Text>
          </View>
        ) : null}

        {/* the two boxes share TOP and BOTTOM lines: the row stretches the
            dashed signature box to the totals card's exact height (round 27) */}
        <View style={styles.totalsZone} wrap={false}>
          <View style={styles.signBox}>
            {signed && signature_url ? <Image src={signature_url} style={styles.signImage} /> : null}
            <Text style={styles.signCaption}>Customer Signature · {customer.name}</Text>
          </View>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{money(total)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid to date</Text>
              <Text style={styles.totalsValue}>{money(paid)}</Text>
            </View>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>BALANCE DUE</Text>
              <Text style={styles.balanceValue}>{money(balance_due)}</Text>
            </View>
          </View>
        </View>

        {/* ── terms — wording is the owner's; numbered, quiet. The stair-
            carry clause rides the same gate as the DELIVER TO sentence: a
            signed charge basis may not rest on an unasked default. ── */}
        <View style={styles.terms} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, lineHeight: 1 }}>Terms & Conditions</Text>
          {[
            /* T&C #1 — the OWNER-CORRECTED wording (2026-08-09, BUILD-QUEUE
               "GOLDEN BASELINE": the ONLY outstanding copy correction). A
               Sales Order never claims to convert into the finance document — SO / DO /
               Sales Invoice are SEPARATE lifecycle documents, and "the SO
               does not talk tax" is this file's own header rule. The exact
               sentence is LAW in docs/pdf/SO-PDF-STANDARD.md §T&C. */
            "This sales order records your purchase agreement with Carres. The sales invoice is a separate document issued upon delivery.",
            "Balance due is payable in full on or before delivery. Cash, bank transfer, DuitNow QR, and cheque accepted.",
            "Delivery date is best-effort and may shift ±3 working days subject to operation confirmation.",
            ...(LIFT_THREE_STATE_READY
              ? ["Stair-carry surcharges (if any) follow the floor and lift access recorded above and are billed on this sales order, not on the delivery order."]
              : []),
            "Once the delivery date has been confirmed, any subsequent request to change or extend the date will incur a rescheduling surcharge.",
          ].map((t, i) => (
            <Text key={i} style={styles.termsLine}>
              {i + 1}. {t}
            </Text>
          ))}
        </View>
        </View>

        {/* ── footer — fixed on every page: the quiet row + the registered
            address in one whisper line (moved out of the header; owner:
            "carres address make it compact"). ── */}
        <View style={styles.footer} fixed>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.footerCell}>{order_code}</Text>
            <Text style={styles.footerCenter}>Computer-generated document · No company signature required.</Text>
            <Text
              style={styles.footerPage}
              render={({ subPageNumber, subPageTotalPages }) =>
                `Page ${subPageNumber} of ${subPageTotalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
