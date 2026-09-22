/**
 * REVIEW COPY — DEV ONLY. A copy of the official Sales Order template for the
 * owner's review of the approved 2026-09-22 rules. It is NOT the official PDF
 * and is never imported by the app. Differences from the official template:
 * no TOTAL RECEIVED row · the items total counts physical pieces (services never
 * counted) · goods and service amounts shown apart · the signature belongs to the
 * revision that was signed · every page is stamped REVIEW SAMPLE.
 */
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

import type { ReactNode } from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { displayCustomerName } from "@/lib/customer-name";
import { lineConfigBits } from "@/pages/dealer/new-order/special-addons-picker";
import { NOTO_SANS_SC_FAMILY } from "@/lib/pdf/fonts/noto";
import { GOODS_CATEGORY_WORDS, goodsCategoryWordOf } from "@carres/shared";
// main moved the money formatters into the shared letterhead (#1337) — the
// document family keeps ONE date and money format. Take theirs, keep ours.
import { CARRES_COMPANY, formatMoney, moneyDigits } from "@/lib/pdf/letterhead";
import { ORDER_TERMS } from "@/lib/order-terms";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";

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
/* The §8 lift gate moved to DO-PDF-STANDARD with the Access row (owner,
   2026-09-21). Nothing on the Sales Order reads floor or lift any more. */

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

/** Square mark, left of the legal name — the Houzs stamp shape (owner,
 *  2026-09-21, OVERRIDES round 13's "no logo image on the SO"). 13mm fits
 *  inside the header's existing 15.7mm text block: zero added height. */
const CARRES_LOGO_SRC =
  (globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ ?? "/carres-logo.png";

/** Column-rule offsets, mm from the row's LEFT EDGE. The row carries no
 *  horizontal padding — the 2mm lives inside `bNo` and `bAmount` — so these
 *  numbers and the column widths are one coordinate system.
 *  Content 186mm; fixed columns 9+27+10+25+24+27 = 122; DESCRIPTION flexes
 *  to 64. CHANGE A WIDTH, CHANGE THIS LINE IN THE SAME COMMIT. */
const RULE_X = [9, 36, 100, 110, 135, 159];

/** PAYMENTS columns: date 26 (incl. 2mm rail pad) · method flex 75 · approval
 *  30 · collected by 30 · amount 25 (incl. 2mm rail pad) = 186mm. Same law as
 *  RULE_X: these numbers ARE the widths. */
const PAY_RULE_X = [26, 101, 131, 161];

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
  /* ONE left rail for the whole page: BILL TO, the tables, the signature
     and the terms all start at the same x (owner, 2026-09-21). */
  cards: { flexDirection: "row", marginTop: mm(3.5), minHeight: mm(36) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  partyName: { fontSize: 9.5, fontWeight: 600, marginTop: mm(1) },
  partyLine: { fontSize: 9, marginTop: mm(1) },
  pairRow: { flexDirection: "row" },
  /* SALES ORDER INFO only. A two-line LABEL needs its colon and value on the
     SECOND line, which is what bottom-alignment gives. BILL TO must NOT use
     it: there the two-line thing is the VALUE (a wrapped address), and
     bottom-aligning floated the address above its own label (measured). */
  pairRowBase: { flexDirection: "row", alignItems: "flex-end" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(20), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },
  deliverBlock: { marginTop: mm(2) },

  // ── items table: zero grid lines, hairline rhythm, category bands ──
  tableHead: {
    position: "relative",
    backgroundColor: BAR_BG,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: mm(1.8),
    marginTop: mm(2.5),
  },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  colNo: { width: mm(7) },
  colCode: { width: mm(27) },
  colQty: { textAlign: "right" },
  colPrice: { textAlign: "right" },
  colDisc: { textAlign: "right" },
  colAmount: { textAlign: "right" },
  headerLogo: { width: mm(13), height: mm(13), objectFit: "contain", marginRight: mm(4) },
  /* No fill (owner, 2026-09-21 — Houzs' way). Once every goods row is boxed,
     the boxes do the grouping and a grey band on top of them is one texture
     too many. The label now reads as a heading ABOVE its group, which is what
     it is. Air above it does the separating. */
  bandRow: {
    flexDirection: "row",
    paddingTop: mm(2.6),
    paddingBottom: mm(1.2),
    paddingHorizontal: mm(2),
  },
  bandText: { fontSize: 7.5, fontWeight: 700, color: INK, letterSpacing: 0.3 },
  // Every goods row is BOXED. Bands and the payments table stay open — the
  // box is what says "these are the goods" (Houzs does the same).
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: mm(9),
    paddingVertical: mm(2),
    borderLeftWidth: 0.3,
    borderRightWidth: 0.3,
    borderTopWidth: 0.3,
    borderLeftColor: HAIR,
    borderRightColor: HAIR,
    borderTopColor: HAIR,
  },
  rowHair: { borderBottomWidth: 0.3, borderBottomColor: HAIR },

  vline: { position: "absolute", top: 0, bottom: 0, width: 0.4, backgroundColor: HAIR },
  gridV: { justifyContent: "center" },
  bNo: { width: mm(9), paddingLeft: mm(2), paddingRight: mm(1.5), justifyContent: "center" },
  bCode: { width: mm(27), paddingLeft: mm(1.5), paddingRight: mm(2), justifyContent: "center" },
  bQty: { width: mm(10), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bPrice: { width: mm(25), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bDisc: { width: mm(24), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bAmount: { width: mm(27), paddingLeft: mm(1.5), paddingRight: mm(2), justifyContent: "center" },
  cellNo: { fontSize: 7, color: GREY, textAlign: "right", lineHeight: 1 },
  cellCode: { fontSize: 7.5, lineHeight: 1 },
  desc: { flex: 1, paddingLeft: mm(1.5), paddingRight: mm(3) },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1 },
  descSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), paddingLeft: mm(2), lineHeight: 1.2 },
  cellQty: { fontSize: 7, textAlign: "right", lineHeight: 1 },
  cellMoney: { fontSize: 7, textAlign: "right", lineHeight: 1 },
  // The line's own amount anchors the row (international convention: the
  // rightmost figure is the one the reader scans down).
  cellAmount: { fontSize: 7, fontWeight: 700, textAlign: "right", lineHeight: 1 },

  voucherBlock: { marginTop: mm(1) },
  voucherLine: { fontSize: 8, color: GREY, marginTop: mm(0.5) },

  // ── payments received ──
  payEmptyTitle: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  payEmpty: { fontSize: 8, color: GREY, marginTop: mm(1.5) },
  payHead: {
    position: "relative",
    backgroundColor: BAR_BG,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: mm(1.8),
    marginTop: mm(1.2),
  },
  payColAmount: { textAlign: "right" },
  bDate: { width: mm(26), paddingLeft: mm(2), paddingRight: mm(1.5), justifyContent: "center" },
  bMethod: { flex: 1, paddingHorizontal: mm(1.5), justifyContent: "center" },
  bApproval: { width: mm(30), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bBy: { width: mm(30), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bPayAmt: { width: mm(25), paddingLeft: mm(1.5), paddingRight: mm(2), justifyContent: "center" },
  payCell: { fontSize: 8, lineHeight: 1 },

  // ── amount in words · totals ──
  /* No side padding: the signature box's LEFT edge and the totals card's
     RIGHT edge must land on the same rails as the tables above, or the page
     reads as two documents (owner, 2026-09-21). */
  totalsZone: { flexDirection: "row", justifyContent: "space-between", marginTop: mm(4), alignItems: "stretch" },
  wordsRow: { marginTop: mm(5) },
  depositLine: { fontSize: 8.5, color: GREY, marginTop: mm(2) },
  /* 110 + 6 gap + 70 = 186mm: the pair spans the content width exactly,
     so both outer edges land on the table rails. */
  totalsBlock: { width: mm(70), borderWidth: 0.6, borderColor: HAIR, alignSelf: "stretch" },
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
  /* The box was 110 × 40mm — a room, not a signature. A person signs a line
     ~70mm wide; anything larger just prints emptiness (owner, 2026-09-21).
     The column still spans 110mm so the LEFT rail stays with the tables; the
     box sits at its BOTTOM so it lines up with the totals card's last row. */
  signCol: { width: mm(110), alignSelf: "stretch", justifyContent: "flex-end" },
  signBox: {
    borderWidth: 0.6,
    borderColor: "#787878",
    borderStyle: "dashed",
    width: mm(72),
    height: mm(20),
    alignItems: "center",
    justifyContent: "center",
  },
  signCaption: { fontSize: 6.5, color: GREY, lineHeight: 1 },
  contLine: { fontSize: 6.5, color: GREY, paddingTop: mm(1.2), paddingLeft: mm(2) },
  signImage: { width: mm(55), height: mm(14), objectFit: "contain" },
  signLabel: { fontSize: 7.5, color: GREY, letterSpacing: 0.8, textTransform: "uppercase", marginTop: mm(1) },
  signName: { fontSize: 8.5, marginTop: mm(0.6) },
  signMark: { fontSize: 7.5, color: GREY, marginTop: mm(0.5) },
  legalBlock: { flex: 1, paddingLeft: mm(8), paddingTop: mm(6) },
  legalSentence: { fontSize: 7.5, color: GREY, lineHeight: 1.5 },

  // ── terms ──
  terms: { paddingTop: mm(4) },
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

/** The box table (owner, 2026-09-21 — Houzs' structure, Carres' hairline).
 *  Full-height rules, drawn as ABSOLUTE lines pinned to the row's top and
 *  bottom. A border on the cell itself stops at the cell's CONTENT height and
 *  renders as ragged stubs beside a two-line description; `alignSelf:
 *  "stretch"` does not fix it in react-pdf. Measured, not assumed. */
function ColumnRules({ xs = RULE_X }: { xs?: readonly number[] }) {
  return (
    <>
      {xs.map((x) => (
        <View key={x} style={[styles.vline, { left: mm(x) }]} />
      ))}
    </>
  );
}

export type ReviewSoData = SalesOrderTemplateData & {
  review_rev: number;
  review_signature: { by: string; at: string; rev: number } | null;
  /** Payments has not confirmed the paid figure: print "To check", never a computed balance. */
  review_payment_check?: string | null;
};

export function ReviewSalesOrderTemplate(data: ReviewSoData) {
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
  // ACCESS (floor · lift) is NOT a Sales Order fact — owner, 2026-09-21:
  // "Access remove due to DO only show". Floor/lift, the stair-carry sentence
  // and its T&C clause now live ONLY on the Delivery Order, which is the
  // document the crew carries. This also retires the §8 lift gate here: with
  // no access row on the paper, no charge basis can rest on a default.

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
  /* What the printed payment rows add up to. It should equal `paid` — if a
     future payload ever disagrees, the paper shows the rows' own arithmetic,
     never a figure the reader cannot check. */
  const paymentsSum = payments.reduce((n, pm) => n + Number(pm.amount), 0);
  const hasAddons = addons.length > 0;

  const dash = "—";
  const money = (v: number) => formatMoney(v, currency);

  // The table's own footer sums the rows it printed (round 24).
  /* Physical pieces only — a service is never a piece (approved 2026-09-22). */
  const totalQty = lines.reduce((n, l) => n + Number(l.qty), 0);
  const goodsAmount = lines.reduce((n, l) => n + Number(l.line_total), 0);
  /* Owner ruling 2026-09-22: quantities by product kind, services named, never counted as goods. */
  const kindQty = new Map<string, number>();
  for (const l of lines) {
    /* The Register's ladder (Law D); an unnamed line keeps its qty, counted apart as "Not in catalog" (COPY-STANDARD). */
    const w = goodsCategoryWordOf({ sku: l.sku, attrs: (l.attrs ?? null) as Record<string, unknown> | null, category: l.category ?? null });
    const name = w === "Other goods" ? "Not in catalog" : w;
    kindQty.set(name, (kindQty.get(name) ?? 0) + Number(l.qty));
  }
  const rank = (k: string) => { const i = (GOODS_CATEGORY_WORDS as readonly string[]).indexOf(k); return i < 0 ? 99 : i; };
  const qtyLine = `Qty: ${[...kindQty].sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, n]) => `${k} ${n}`).join(" · ")}`;
  /* Services summary: name and quantity (a line count is not a service quantity). The table row keeps the plain name. */
  const servicesLine = addons.length ? `Services: ${addons.map((a) => (Number(a.qty) > 1 ? `${a.label} ×${a.qty}` : a.label)).join(" · ")}` : "";
  const serviceAmount = addons.reduce((n, a) => n + Number(a.line_total), 0);
  const totalDiscount = lines.reduce((n, l) => n + (l.discount && l.discount > 0 ? l.discount : 0), 0);
  const totalAmount =
    lines.reduce((n, l) => n + Number(l.line_total), 0) +
    addons.reduce((n, a) => n + Number(a.line_total), 0);


  // ── PAGE CHUNKING ───────────────────────────────────────────────────
  // Heights in mm, deliberately generous: a page that breaks one row early
  // is invisible; a row that overflows its page is not.
  const EST_ROW = 9;    // the row minimum
  const EST_SUB = 3.6;  // each description sub-line
  const EST_BAND = 9;   // a category heading with its air
  // A4 297 − top (12 margin + 20 header + 2) − bottom (12 + 8 footer + 4) =
  // 239mm of body. Page 1 also carries the parties block (~42) and the bar
  // (~8). Both caps keep a safety margin: if a chunk ever overflowed, react-
  // pdf would break it mid-chunk and the continuation would lose its bar —
  // the one failure this whole mechanism exists to prevent.
  const CAP_FIRST = 170;
  const CAP_REST = 225;
  const blocks: Array<{ h: number; node: ReactNode }> = [];

  for (const [gi, group] of groups.entries()) {
    if (group.band) {
      blocks.push({
        h: EST_BAND,
        node: (
          <View key={`band-${gi}`} style={styles.bandRow} minPresenceAhead={30}>
            <Text style={styles.bandText}>
              {group.band} · {group.rows.length} {group.rows.length > 1 ? "items" : "item"}
            </Text>
          </View>
        ),
      });
    }
    for (const { line, index } of group.rows) {
      const sofaSub = sofaSpecLine(line.attrs);
      const configSub = configLine(line.attrs);
      const pwpSub = pwpMarkerLine(line.attrs);
      const freeSub = freeMarkerLine(line.attrs);
      let issuedSubs: Voucher[] = [];
      if (!attachedTriggerSkus.has(line.sku) && vouchersByTrigger.has(line.sku)) {
        attachedTriggerSkus.add(line.sku);
        issuedSubs = vouchersByTrigger.get(line.sku) ?? [];
      }
      const subs = [sofaSub, configSub, pwpSub, freeSub].filter(Boolean).length + issuedSubs.length;
      blocks.push({
        h: EST_ROW + subs * EST_SUB,
        node: (
          <View key={`${line.sku}-${index}`} wrap={false} style={[styles.row, styles.rowHair]}>
            <ColumnRules />
            <View style={styles.bNo}><Text style={styles.cellNo}>{index + 1}</Text></View>
            <View style={[styles.bCode, styles.gridV]}><Text style={styles.cellCode}>{line.sku}</Text></View>
            <View style={[styles.desc, styles.gridV]}>
              <Text style={styles.descMain}>{line.description}</Text>
              {sofaSub ? <Text style={styles.descSub}>{sofaSub}</Text> : null}
              {configSub ? <Text style={styles.descSub}>{configSub}</Text> : null}
              {pwpSub ? <Text style={styles.descSub}>{pwpSub}</Text> : null}
              {freeSub ? <Text style={styles.descSub}>{freeSub}</Text> : null}
              {issuedSubs.map((v) => (
                <Text key={v.code} style={styles.descSub}>{voucherIssuedLine(v)}</Text>
              ))}
            </View>
            <View style={[styles.bQty, styles.gridV]}>
              <Text style={line.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>{line.qty}</Text>
            </View>
            <View style={[styles.bPrice, styles.gridV]}>
              <Text style={[styles.cellMoney, styles.colPrice]}>{moneyDigits(line.unit_price)}</Text>
            </View>
            <View style={[styles.bDisc, styles.gridV]}>
              <Text style={[styles.cellMoney, styles.colDisc]}>
                {line.discount && line.discount > 0 ? moneyDigits(line.discount) : dash}
              </Text>
            </View>
            <View style={[styles.bAmount, styles.gridV]}>
              <Text style={[styles.cellAmount, styles.colAmount]}>{moneyDigits(line.line_total)}</Text>
            </View>
          </View>
        ),
      });
    }
  }
  if (hasAddons) {
    blocks.push({
      h: EST_BAND,
      node: (
        <View key="addon-band" style={styles.bandRow} minPresenceAhead={30}>
          <Text style={styles.bandText}>
            SERVICE · {addons.length} {addons.length > 1 ? "items" : "item"}
          </Text>
        </View>
      ),
    });
    addons.forEach((a, idx) => {
      const addonSub = addonAttrsDescription(a.attrs);
      blocks.push({
        h: EST_ROW + (addonSub ? EST_SUB : 0),
        node: (
          <View key={`addon-${idx}`} wrap={false} style={[styles.row, styles.rowHair]}>
            <ColumnRules />
            <View style={styles.bNo}><Text style={styles.cellNo}>{lines.length + idx + 1}</Text></View>
            <View style={[styles.bCode, styles.gridV]}><Text style={styles.cellCode}>{a.sku ?? "ADD-ON"}</Text></View>
            <View style={[styles.desc, styles.gridV]}>
              <Text style={styles.descMain}>{a.label}</Text>
              {addonSub ? <Text style={styles.descSub}>{addonSub}</Text> : null}
            </View>
            <View style={[styles.bQty, styles.gridV]}>
              <Text style={a.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>{a.qty}</Text>
            </View>
            <View style={[styles.bPrice, styles.gridV]}>
              <Text style={[styles.cellMoney, styles.colPrice]}>{moneyDigits(a.unit_price)}</Text>
            </View>
            <View style={[styles.bDisc, styles.gridV]}><Text style={[styles.cellMoney, styles.colDisc]}>{dash}</Text></View>
            <View style={[styles.bAmount, styles.gridV]}>
              <Text style={[styles.cellAmount, styles.colAmount]}>{moneyDigits(a.line_total)}</Text>
            </View>
          </View>
        ),
      });
    });
  }

  const itemPages: Array<Array<{ h: number; node: ReactNode }>> = [[]];
  let used = 0;
  let cap = CAP_FIRST;
  for (const b of blocks) {
    if (used + b.h > cap && itemPages[itemPages.length - 1].length > 0) {
      itemPages.push([]);
      used = 0;
      cap = CAP_REST;
    }
    itemPages[itemPages.length - 1].push(b);
    used += b.h;
  }

  // Row order + words fixed by the owner (round 23): Doc No · Ordered ·
  // Sales Location (2990's word; was Showroom) · Proceed date · Delivery
  // date · Salesperson · Access.
  const orderDetailRows: Array<[string, string | null]> = [
    ["SO No", so_number],
    ["SO Doc Date", niceDate(issue_date, true)],
    ["Proceed Date", proceed_date ? niceDate(proceed_date, true) : null],
    /* TWO deliberate lines (owner, 2026-09-21) — the colon and value sit on
       the label's SECOND line; SALES ORDER INFO rows bottom-align for it. */
    ["Customer Requested\nDelivery Date", niceDate(delivery.date, true) ?? delivery.date],
    /* One row, always filled: the outlet when the order sold from a showroom,
       else the dealer (0144 fallback). `Sold by` retired as a second row. */
    ["Sales Location", outletName ?? sellerName],
    ["Salesperson", dealer.salesperson_name],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* REVIEW SAMPLE stamp — this copy is never the official document. */}
        <Text fixed style={{ position: "absolute", top: mm(3), left: mm(12), right: mm(12), textAlign: "center", fontSize: 7.5, fontWeight: 700, color: "#B42318", letterSpacing: 1 }}>
          {`REVIEW SAMPLE · Rev ${data.review_rev} · not the official Sales Order PDF`}
        </Text>
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
                  <View style={{ flex: 1, paddingRight: mm(4), flexDirection: "row", alignItems: "center" }}>
                    <Image src={CARRES_LOGO_SRC} style={styles.headerLogo} />
                    <View style={{ flex: 1 }}>
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
                ["Name", displayCustomerName(customer.name)],
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
            <Text style={styles.blockLabel}>Sales Order Info</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {orderDetailRows.map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRowBase}>
                    <Text style={[styles.pairLabel, { width: mm(32) }]}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
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
        {/* ── THE GOODS TABLE, PAGINATED BY US ──────────────────────────
            Every page that carries goods carries the column bar. react-pdf's
            `fixed` cannot do this: it repeats on EVERY page of the Page, so a
            long order whose money zone lands on a page of its own would print
            an items header over nothing (measured, 40-line stress pass —
            3 pages, page 3 money-only). So the rows are chunked HERE against
            an estimated height and each chunk opens with its own bar.
            The estimate is deliberately conservative: a page that breaks one
            row early is invisible; a row that overflows is not. ── */}
        {itemPages.map((blocks, pi) => (
          <View key={`page-${pi}`} break={pi > 0}>
            <View style={styles.tableHead} minPresenceAhead={40}>
              <ColumnRules />
              <View style={styles.bNo}><Text style={styles.th}>#</Text></View>
              <View style={[styles.bCode, styles.gridV]}><Text style={styles.th}>Item Code</Text></View>
              <View style={[styles.desc, styles.gridV]}><Text style={styles.th}>Description</Text></View>
              <View style={[styles.bQty, styles.gridV]}><Text style={[styles.th, styles.colQty]}>Qty</Text></View>
              <View style={[styles.bPrice, styles.gridV]}><Text style={[styles.th, styles.colPrice]}>Unit (RM)</Text></View>
              <View style={[styles.bDisc, styles.gridV]}><Text style={[styles.th, styles.colDisc]}>Disc (RM)</Text></View>
              <View style={[styles.bAmount, styles.gridV]}><Text style={[styles.th, styles.colAmount]}>Amount (RM)</Text></View>
            </View>
            {pi > 0 ? (
              <Text style={styles.contLine}>Continued from page {pi}</Text>
            ) : null}
            {blocks.map((b) => b.node)}
          </View>
        ))}
        <View
          wrap={false}
          style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
        >
          <ColumnRules />
          <View style={styles.bNo}><Text style={styles.cellNo}> </Text></View>
          <View style={[styles.bCode, styles.gridV]}><Text style={styles.cellCode}> </Text></View>
          <View style={[styles.desc, styles.gridV]}>
            <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>TOTAL PAYABLE</Text>
          </View>
          <View style={[styles.bQty, styles.gridV]}><Text style={[styles.cellQty, { fontWeight: 700 }]}>{totalQty}</Text></View>
          <View style={[styles.bPrice, styles.gridV]}><Text style={[styles.cellMoney, styles.colPrice]}> </Text></View>
          <View style={[styles.bDisc, styles.gridV]}>
            <Text style={[styles.cellMoney, styles.colDisc, totalDiscount > 0 ? { fontWeight: 700 } : {}]}>
              {totalDiscount > 0 ? money(totalDiscount) : dash}
            </Text>
          </View>
          <View style={[styles.bAmount, styles.gridV]}><Text style={[styles.cellAmount, styles.colAmount]}>{money(totalAmount)}</Text></View>
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />
        {/* Stacked, not side by side: a real order's Qty line (SO-1206) ran into the Services line. */}
        <View style={{ marginTop: mm(1.5) }}>
          <Text style={{ fontSize: 7.5, color: "#1A1714" }}>{qtyLine}</Text>
          {servicesLine ? <Text style={{ fontSize: 7.5, color: "#1A1714", marginTop: mm(0.8) }}>{servicesLine}</Text> : null}
        </View>

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
        {/* Content FLOWS, top to bottom — Houzs' way (owner, 2026-09-21).
            The money zone used to pin to the page bottom (`marginTop: auto`)
            so BALANCE DUE landed on the same spot on every order; the price
            was a hole the size of half a page on a short order, and short
            orders are most orders. Predictable geometry lost to the thing the
            customer actually sees. */}
        <View wrap={false} style={{ marginTop: mm(4) }}>
        {payments.length > 0 ? (
          /* Height follows the rows now: the frozen four-row block was part
             of the same pinned-geometry idea and left its own gap. */
          <View style={{ marginTop: mm(5) }}>
            <View style={styles.payHead}>
              <ColumnRules xs={PAY_RULE_X} />
              <View style={styles.bDate}><Text style={styles.th}>Date</Text></View>
              <View style={[styles.bMethod, styles.gridV]}><Text style={styles.th}>Payment Received</Text></View>
              <View style={[styles.bApproval, styles.gridV]}><Text style={styles.th}>Approval Code</Text></View>
              <View style={[styles.bBy, styles.gridV]}><Text style={styles.th}>Collected By</Text></View>
              <View style={[styles.bPayAmt, styles.gridV]}><Text style={[styles.th, styles.payColAmount]}>Amount (RM)</Text></View>
            </View>
            {/* Same box as the goods table: one table style on the document.
                EVERY row carries the bottom hairline, including the last —
                a table that stops without a closing line looks like the last
                row is taller than the rest. */}
            {payments.map((p, i) => (
              <View key={i} style={[styles.row, styles.rowHair]}>
                <ColumnRules xs={PAY_RULE_X} />
                <View style={styles.bDate}><Text style={styles.payCell}>{p.date ? (niceDate(p.date) ?? p.date) : dash}</Text></View>
                <View style={[styles.bMethod, styles.gridV]}><Text style={styles.payCell}>{p.label}</Text></View>
                <View style={[styles.bApproval, styles.gridV]}><Text style={styles.payCell}>{p.approval_code ?? p.reference ?? dash}</Text></View>
                <View style={[styles.bBy, styles.gridV]}><Text style={styles.payCell}>{p.collected_by ?? dash}</Text></View>
                <View style={[styles.bPayAmt, styles.gridV]}><Text style={[styles.payCell, styles.payColAmount, { fontWeight: 600 }]}>{moneyDigits(p.amount)}</Text></View>
              </View>
            ))}
            <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />
          </View>
        ) : (
          /* An empty payments zone that simply VANISHES reads as a printing
             fault (owner, 2026-09-21, after the Houzs compare). The geometry
             holds and absence speaks — COPY-STANDARD's absence law. */
          <View style={{ marginTop: mm(5) }}>
            {/* No column headers over zero rows (owner, 2026-09-21). A bar
                reading DATE · APPROVAL CODE · COLLECTED BY above nothing asks
                the reader a question the document cannot answer. With the
                money zone no longer pinned, the bar bought no geometry
                either. Houzs prints a title and a sentence; so do we. */}
            <Text style={styles.payEmptyTitle}>Payments Received</Text>
            <Text style={styles.payEmpty}>No payments recorded.</Text>
          </View>
        )}

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
          <View style={styles.signCol}>
            <View style={styles.signBox}>
              {data.review_signature && data.review_signature.rev === data.review_rev && signature_url ? <Image src={signature_url} style={styles.signImage} /> : null}
            </View>
            <Text style={[styles.signCaption, { marginTop: mm(1.4) }]}>
              {data.review_signature && data.review_signature.rev === data.review_rev
                ? `Customer Signature · ${displayCustomerName(customer.name)} · Rev ${data.review_rev} · ${data.review_signature.at}`
                : `Rev ${data.review_rev} · not signed by the customer`}
            </Text>
          </View>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Goods amount</Text>
              <Text style={styles.totalsValue}>{money(goodsAmount)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Service amount</Text>
              <Text style={styles.totalsValue}>{money(serviceAmount)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total payable</Text>
              <Text style={styles.totalsValue}>{money(total)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Paid to date</Text>
              <Text style={styles.totalsValue}>{data.review_payment_check ?? money(paid)}</Text>
            </View>
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>BALANCE DUE</Text>
              <Text style={styles.balanceValue}>{data.review_payment_check ?? money(balance_due)}</Text>
            </View>
          </View>
        </View>

        {/* ── terms — wording is the owner's; numbered, quiet. The stair-
            carry clause rides the same gate as the DELIVER TO sentence: a
            signed charge basis may not rest on an unasked default. ── */}
        <View style={styles.terms} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, lineHeight: 1 }}>Terms & Conditions</Text>
          {ORDER_TERMS.map((t, i) => (
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
            {/* `Issued by` is the audit_log actor for the CREATION — never
                salespersons.name, which answers a different question (who the
                customer calls). The PO shipped this cell hard-coded null and
                named nobody on every purchase order Carres ever sent, so an
                unknown actor prints WORDS, not a blank. */}
            <Text style={styles.footerCell}>
              {order_code} · Issued by {data.issued_by ?? "Not recorded"}
            </Text>
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
