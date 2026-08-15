/**
 * Tax Invoice PDF template — the tax half of the customer paper trail.
 *
 * 2026-08-09 (Loo) — rebuilt on the family chrome (SO-PDF-STANDARD §2.1
 * measurement sheet + §8.5 conversion law): same header, parties voice,
 * ink-bar banded table, quiet footer. The invoice's OWN business:
 *
 * - SST 8% INCLUSIVE (LHDN convention, Q7=A locked): unit prices are the
 *   gross figures the customer agreed to; `tax_amount = total × 0.08 ÷ 1.08`.
 *   The totals card shows the split — `Subtotal (excl. SST) · SST 8% ·
 *   Total` — the arithmetic the SO deliberately does not print.
 * - TWO MODES by `doc_title`: "TAX INVOICE" (the tax document, SST rows +
 *   tax disclaimer) vs "PAYMENT REQUEST" (imported orders — AutoCount holds
 *   their tax invoice; no SST rows, "Total due", its own disclaimer).
 * - The items table's closing row is **TOTAL** (gross), NOT Subtotal — on
 *   this document "Subtotal" means the ex-SST figure in the card; one name
 *   may not carry two numbers.
 * - GUARANTEES block (0261-0267): every purchased cover in writing — what
 *   it covers, until when, and the claim id the customer quotes.
 * - No amount-in-words (family ruling, 2026-08-09) and NO signature blocks
 *   of any kind — a tax invoice is a computer document.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { displayCustomerName } from "@/lib/customer-name";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import type { InvoiceTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAND_BG = "#EDEDED";
const BAR_BG = INK;

const mm = (v: number) => v * 2.83465;

const MARGIN = mm(12);
const HEADER_H = mm(20);
const FOOTER_H = mm(8);

/** `2026-08-09` → `Sun, 9 Aug 26` (family body-date form). */
function niceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return `${dow}, ${d} ${mon} ${String(y).slice(2)}`;
}

function moneyDigits(value: number): string {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    fontSize: 8,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },

  // ── header (fixed) — family chrome ──
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  // ── parties — family voice ──
  cards: { flexDirection: "row", marginTop: mm(3.5), paddingHorizontal: mm(4), minHeight: mm(26) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(20), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },

  // ── items table — the SO's table, verbatim ──
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
  cellQty: { fontSize: 7, width: mm(10), textAlign: "right", lineHeight: 1 },
  cellMoney: { fontSize: 7, textAlign: "right", lineHeight: 1 },
  cellAmount: { fontSize: 7, fontWeight: 700, textAlign: "right", lineHeight: 1 },

  // ── totals card (right) — the invoice's own arithmetic ──
  totalsZone: { flexDirection: "row", alignItems: "stretch", marginTop: mm(5), paddingHorizontal: mm(4) },
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
  grandBox: {
    backgroundColor: BAND_BG,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: mm(1.5),
    paddingHorizontal: mm(3),
  },
  grandLabel: { fontSize: 8.5, fontWeight: 700 },
  grandValue: { fontSize: 8.5, fontWeight: 700 },

  // ── guarantees — the customer's cover, in writing ──
  guaranteeRow: { marginTop: mm(2) },
  guaranteeTitle: { fontSize: 8, fontWeight: 600, lineHeight: 1.2 },
  guaranteeLine: { fontSize: 7.5, color: GREY, marginTop: mm(0.6), lineHeight: 1.3 },

  // ── disclaimer + footer ──
  disclaimer: { fontSize: 7, color: GREY, lineHeight: 1.3, marginTop: mm(2.5), paddingHorizontal: mm(4), textAlign: "right" },
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

type InvLine = InvoiceTemplateData["lines"][number];

/** Lines grouped into category bands, original order preserved (SO §5). */
function bandedLines(lines: InvLine[]): Array<{ band: string | null; rows: Array<{ line: InvLine; index: number }> }> {
  const groups: Array<{ band: string | null; rows: Array<{ line: InvLine; index: number }> }> = [];
  lines.forEach((line, index) => {
    const band = (line as { category?: string | null }).category?.trim().toUpperCase() || null;
    const last = groups[groups.length - 1];
    if (last && last.band === band) last.rows.push({ line, index });
    else groups.push({ band, rows: [{ line, index }] });
  });
  return groups;
}

export function InvoiceTemplate(data: InvoiceTemplateData) {
  const { doc_title, invoice_no, issue_date, order_code, customer, lines, subtotal, tax_amount, total, currency } = data;
  const guarantees = data.guarantees ?? [];

  const title = doc_title ?? "TAX INVOICE";
  // A PAYMENT REQUEST (imported order's statement) is NOT a tax document —
  // no SST rows, no tax disclaimer, the band reads "Total due".
  const isTaxInvoice = title === "TAX INVOICE";

  const dash = "—";
  const money = (v: number) => formatMoney(v, currency);
  const groups = bandedLines(lines);

  const totalQty = lines.reduce((n, l) => n + Number(l.qty), 0);
  const totalDiscount = lines.reduce((n, l) => {
    const d = (l as { discount?: number | null }).discount;
    return n + (d && d > 0 ? d : 0);
  }, 0);
  // The closing row is TOTAL (gross) — on this document "Subtotal" is the
  // ex-SST figure in the card; one name may not carry two numbers.
  const totalAmount = lines.reduce((n, l) => n + Number(l.line_total), 0);

  const detailRows: Array<[string, string | null]> = [
    ["Invoice No", invoice_no],
    ["SO No", order_code],
    ["Issued", niceDate(issue_date)],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── header — full identity page 1, one-liner after (SO §3) ── */}
        <View
          style={styles.header}
          fixed
          render={({ pageNumber }) =>
            pageNumber === 1 ? (
              <View>
                <View style={styles.headerRow}>
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
                  <View style={styles.docBlock}>
                    <Text style={styles.docNumber}>{invoice_no}</Text>
                    <Text style={styles.docTitle}>{title}</Text>
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
                    {title} · {invoice_no}
                  </Text>
                </View>
                <View style={styles.headerRule} />
              </View>
            )
          }
        />

        {/* ── BILL TO · INVOICE DETAILS ── */}
        <View style={styles.cards}>
          <View style={{ flex: 1, paddingRight: mm(6) }}>
            <Text style={styles.blockLabel}>Bill To</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {([
                ["Name", displayCustomerName(customer.name)],
                ["Address", customer.address],
                ["Tel", customer.phone],
              ] as Array<[string, string | null]>).map(([label, value]) =>
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
            <Text style={styles.blockLabel}>Invoice Details</Text>
            <View style={{ marginTop: mm(1.5) }}>
              {detailRows.map(([label, value]) =>
                value ? (
                  <View key={label} style={styles.pairRow}>
                    <Text style={[styles.pairLabel, { width: mm(26) }]}>{label}</Text>
                    <Text style={styles.pairValue}>:  {value}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        </View>

        {/* ── items — the SO's table, verbatim ── */}
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
              const discount = (line as { discount?: number | null }).discount;
              return (
                <View key={`${line.sku}-${index}`} wrap={false} style={[styles.row, styles.rowHair]}>
                  <Text style={styles.cellNo}>{index + 1}</Text>
                  <Text style={styles.cellCode}>{line.sku}</Text>
                  <View style={styles.desc}>
                    <Text style={styles.descMain}>{line.description}</Text>
                  </View>
                  <Text style={line.qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty}>
                    {line.qty}
                  </Text>
                  <Text style={[styles.cellMoney, styles.colPrice]}>{moneyDigits(line.unit_price)}</Text>
                  <Text style={[styles.cellMoney, styles.colDisc]}>
                    {discount && discount > 0 ? moneyDigits(discount) : dash}
                  </Text>
                  <Text style={[styles.cellAmount, styles.colAmount]}>{moneyDigits(line.line_total)}</Text>
                </View>
              );
            })}
          </View>
        ))}
        <View
          wrap={false}
          style={[styles.row, { borderTopWidth: 0.5, borderTopColor: INK, paddingVertical: mm(1.8) }]}
        >
          <Text style={styles.cellNo}> </Text>
          <Text style={styles.cellCode}> </Text>
          <View style={styles.desc}>
            <Text style={[styles.descMain, { fontWeight: 700, textAlign: "right" }]}>TOTAL</Text>
          </View>
          <Text style={[styles.cellQty, { fontWeight: 700 }]}>{totalQty}</Text>
          <Text style={[styles.cellMoney, styles.colPrice]}> </Text>
          <Text style={[styles.cellMoney, styles.colDisc, totalDiscount > 0 ? { fontWeight: 700 } : {}]}>
            {totalDiscount > 0 ? money(totalDiscount) : dash}
          </Text>
          <Text style={[styles.cellAmount, styles.colAmount]}>{money(totalAmount)}</Text>
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: INK }} />

        {/* ── bottom unit, pinned: GUARANTEES left | TOTALS right on ONE
            top line (the SO's pair law — nothing floats alone), then the
            short disclaimer right-aligned with the money column. ── */}
        <View wrap={false} style={{ marginTop: "auto" }}>
          <View style={styles.totalsZone}>
            <View style={{ flex: 1, paddingRight: mm(6) }}>
              {guarantees.length > 0 ? (
                <View>
                  <Text style={styles.blockLabel}>Guarantee Cover On This Order</Text>
                  {guarantees.map((g, idx) => (
                    <View key={`g-${idx}`} style={styles.guaranteeRow}>
                      <Text style={styles.guaranteeTitle}>
                        {g.label}
                        {g.guarantee_id ? `  ·  Guarantee ID: ${g.guarantee_id}` : ""}
                      </Text>
                      <Text style={styles.guaranteeLine}>
                        Covers {g.covers} · {g.coverage_years} years ·{" "}
                        {g.remedy === "replace" ? "one-for-one replacement (not repair)" : "repair"}
                      </Text>
                      <Text style={styles.guaranteeLine}>
                        {g.expires_on
                          ? `Valid ${g.starts_on ?? ""} to ${g.expires_on}`
                          : "Cover starts on the delivery date"}
                      </Text>
                      {g.terms_text ? <Text style={styles.guaranteeLine}>{g.terms_text}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.totalsBlock}>
              {isTaxInvoice ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Subtotal (excl. SST)</Text>
                  <Text style={styles.totalsValue}>{money(subtotal)}</Text>
                </View>
              ) : null}
              {isTaxInvoice ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>SST 8%</Text>
                  <Text style={styles.totalsValue}>{money(tax_amount)}</Text>
                </View>
              ) : null}
              <View style={styles.grandBox}>
                <Text style={styles.grandLabel}>{isTaxInvoice ? "TOTAL" : "TOTAL DUE"}</Text>
                <Text style={styles.grandValue}>{money(total)}</Text>
              </View>
            </View>
          </View>

          {/* short, right-aligned with the money column (owner: annotation
              words align right; the old sentence was a paragraph) */}
          <Text style={styles.disclaimer}>
            {isTaxInvoice
              ? "Tax invoice · SST 8% included in unit prices (LHDN inclusive)."
              : "Payment request — not a tax invoice."}
          </Text>
        </View>

        {/* ── footer — fixed, every page ── */}
        <View style={styles.footer} fixed>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.footerCell}>
              {data.issued_by ? `Issued by ${data.issued_by}` : invoice_no}
            </Text>
            <Text style={styles.footerCenter}>Computer-generated document · No signature required.</Text>
            <Text
              style={styles.footerPage}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
