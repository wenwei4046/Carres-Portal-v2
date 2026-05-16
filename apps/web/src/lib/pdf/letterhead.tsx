/**
 * Shared letterhead for every Carres-issued PDF (SO / PO / DO / Invoice /
 * Supplier-DO).
 *
 * Loo 2026-05-16 — official legal letterhead that customers / suppliers /
 * dealers should see on every document we print:
 *
 *   CARRES SDN. BHD.    20201055306 (1601150-X)
 *   E-28-02, and E-28-03, Menara SUEZCAP 2, KL Gateway,
 *   No.2, Jalan Kerinchi, Gerbang Kerinchi Lestari,
 *   59200 Kuala Lumpur, Wilayah Persekutuan KL.
 *
 * with the CARRES wordmark right-aligned. A hairline rule below separates
 * the letterhead from the document-specific meta block each template
 * renders next.
 *
 * Brand consistency rule (Loo): the legal name + reg no + wordmark stay
 * CARRES on every doc, regardless of who's selling. The ADDRESS, however,
 * can be overridden for Sales Orders — a SO issued from a showroom should
 * print that showroom's address, not Carres HQ's. Pass `addressLines` to
 * swap it, optionally `subTitle` to label the location (e.g., the outlet
 * name).
 */

import { StyleSheet, Text, View } from "@react-pdf/renderer";

const ACCENT = "#D64F20";
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
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  company: { flex: 1, paddingRight: 16 },
  nameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  legalName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1A1714",
    letterSpacing: 0.4,
  },
  regNo: { fontSize: 8, color: MUTED, marginLeft: 6 },
  subTitle: {
    fontSize: 9.5,
    color: "#1A1714",
    fontWeight: 700,
    marginTop: 6,
  },
  addressBlock: { marginTop: 4 },
  addressLine: { fontSize: 8.5, color: "#3F3A33", marginTop: 1 },
  wordmark: {
    fontSize: 26,
    fontWeight: 700,
    color: ACCENT,
    letterSpacing: 2,
  },
});

interface LetterheadHeaderProps {
  /**
   * Replace the default Carres HQ address lines. Used by Sales Orders so the
   * letterhead carries the showroom/outlet address where the sale was made.
   * Pass each address line as a separate entry to control wrapping.
   */
  addressLines?: readonly string[];
  /**
   * Optional bold sub-title between the legal name and the address. Typical
   * use: the showroom/outlet name when `addressLines` overrides the HQ
   * address. Pass null/undefined to omit.
   */
  subTitle?: string | null;
}

export function LetterheadHeader(props: LetterheadHeaderProps = {}) {
  const lines = props.addressLines ?? CARRES_COMPANY.addressLines;
  // Top margin between name-row and address block is bigger when there's no
  // subTitle, so the spacing stays consistent across the two layouts.
  const addressBlockStyle =
    props.subTitle != null && props.subTitle.length > 0
      ? styles.addressBlock
      : [styles.addressBlock, { marginTop: 6 }];
  return (
    <View style={styles.band}>
      <View style={styles.company}>
        <View style={styles.nameRow}>
          <Text style={styles.legalName}>{CARRES_COMPANY.legalName}</Text>
          <Text style={styles.regNo}>{CARRES_COMPANY.regNo}</Text>
        </View>
        {props.subTitle != null && props.subTitle.length > 0 ? (
          <Text style={styles.subTitle}>{props.subTitle}</Text>
        ) : null}
        <View style={addressBlockStyle}>
          {lines.map((line, i) => (
            <Text key={i} style={styles.addressLine}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.wordmark}>CARRES</Text>
    </View>
  );
}
