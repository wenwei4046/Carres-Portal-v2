/**
 * Shared inline doc header for every Carres-issued PDF (SO / PO / DO /
 * Invoice / Supplier-DO).
 *
 * Loo 2026-05-16 — folded the company info into each doc's own header
 * rhythm instead of a separate letterhead band on top. Customers + dealers
 * + suppliers see the legal entity + address inline next to the doc title:
 *
 *   CARRES SDN. BHD.                          TAX INVOICE
 *   20201055306 (1601150-X)                   INV-2026-001001
 *   E-28-02, and E-28-03, ...                 Date: 2026-05-16
 *   No.2, Jalan Kerinchi, ...                 Order: SO-1001
 *   59200 Kuala Lumpur, ...
 *   ────────────────────────────────────────────────────────────
 *
 * Brand consistency rule: the legal name + reg no stay CARRES on every
 * doc, regardless of who's selling. The ADDRESS can be overridden for
 * Sales Orders only — a SO issued from a showroom should print that
 * showroom's address, not Carres HQ's. Pass `addressLines` to swap it,
 * optionally `subTitle` to label the location (e.g., the outlet name).
 *
 * Single source of truth: edit `CARRES_COMPANY` here when the office or
 * registration changes, and every template picks it up.
 */

import { StyleSheet, Text, View } from "@react-pdf/renderer";

const BORDER = "#D9D2C7";
const MUTED  = "#7A7268";

export const CARRES_COMPANY = {
  legalName: "CARRES SDN. BHD.",
  regNo: "20201055306 (1601150-X)",
  addressLines: [
    "E-28-02, and E-28-03, Menara SUEZCAP 2, KL Gateway,",
    "No.2, Jalan Kerinchi, Gerbang Kerinchi Lestari,",
    "59200 Kuala Lumpur, Wilayah Persekutuan KL.",
  ],
} as const;

const styles = StyleSheet.create({
  band: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 16,
  },
  company: { flex: 1 },
  companyName: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1A1714",
    letterSpacing: 0.3,
  },
  companyRegNo: { fontSize: 8, color: MUTED, marginTop: 1 },
  companyOutlet: {
    fontSize: 9.5,
    color: "#1A1714",
    fontWeight: 700,
    marginTop: 5,
  },
  companyAddrLine: { fontSize: 8.5, color: "#3F3A33", marginTop: 1 },
  // First address line gets bigger top margin when there's no outlet
  // sub-title, so the spacing reads consistently across both layouts.
  companyAddrFirstNoSub: { marginTop: 5 },
  meta: { alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  docMetaRow: { fontSize: 9, color: MUTED },
});

interface DocHeaderProps {
  /** e.g. "TAX INVOICE", "PURCHASE ORDER", "DELIVERY ORDER", "SALES ORDER". */
  docTitle: string;
  /** Right-side metadata rows below the title — doc number, date, ref, etc. */
  docMetaRows: readonly string[];
  /**
   * Replace the default Carres HQ address. Used by SO so the letterhead
   * carries the showroom/outlet address where the sale was made. Each
   * entry is a separate line.
   */
  addressLines?: readonly string[];
  /**
   * Optional bold sub-title between the legal name and the address.
   * Typical use: the showroom/outlet name on SO when `addressLines` is
   * the outlet address.
   */
  subTitle?: string | null;
}

export function DocHeader({
  docTitle,
  docMetaRows,
  addressLines,
  subTitle,
}: DocHeaderProps) {
  const lines = addressLines ?? CARRES_COMPANY.addressLines;
  const hasSub = subTitle != null && subTitle.length > 0;
  return (
    <View style={styles.band}>
      <View style={styles.company}>
        <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
        <Text style={styles.companyRegNo}>{CARRES_COMPANY.regNo}</Text>
        {hasSub ? (
          <Text style={styles.companyOutlet}>{subTitle}</Text>
        ) : null}
        {lines.map((line, i) => (
          <Text
            key={i}
            style={
              i === 0 && !hasSub
                ? [styles.companyAddrLine, styles.companyAddrFirstNoSub]
                : styles.companyAddrLine
            }
          >
            {line}
          </Text>
        ))}
      </View>
      <View style={styles.meta}>
        <Text style={styles.docTitle}>{docTitle}</Text>
        {docMetaRows.map((row, i) => (
          <Text key={i} style={styles.docMetaRow}>
            {row}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** `2026-08-24` → `Mon, 24 Aug 2026`.
 *  FOUR-DIGIT YEAR (owner, Jess 2026-09-23; DOCUMENT-KIT.md §4 — every
 *  printed date reads `Fri, 9 Oct 2026`). It printed `26` until then, which
 *  contradicted the kit and disagreed with the PO on the same day's paper.
 *  A Carres document outlives the year it was issued in — a guarantee, a
 *  rental agreement, a claim — and `26` on a fax or a WhatsApp photo reads
 *  as part of the day. Costs 3.1mm per date at 8pt (measured). */
export function niceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return `${dow}, ${d} ${mon} ${y}`;
}

/** Table cells print DIGITS only — the column header carries `(RM)` once
 *  (owner round 7: a dozen repeated "RM" was noise; Stripe/IKEA print the
 *  currency once). The money zone keeps the full `RM x` form. */
export function moneyDigits(value: number): string {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Customer-facing money: `RM 1,495.00` (MYR prints as RM — the word the
 *  customer reads on every Malaysian receipt). */
export function formatMoney(value: number, currency: string): string {
  const unit = currency === "MYR" ? "RM" : currency;
  return `${unit} ${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
