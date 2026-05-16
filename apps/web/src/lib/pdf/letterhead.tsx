/**
 * Shared letterhead for every Carres-issued PDF (SO / PO / DO / Invoice /
 * Supplier-DO).
 *
 * Loo 2026-05-16 — until today every PDF showed a placeholder
 * "CARRES / HOUZS Venture Sdn Bhd" line. Replaced with the official legal
 * letterhead that customers / suppliers / dealers should see on every
 * document we print:
 *
 *   CARRES SDN. BHD.    20201055306 (1601150 - X)
 *   (Formerly known as Carres Sdn Bhd)
 *   E-28-02, and E-28-03, Menara SUEZCAP 2, KL Gateway,
 *   No.2, Jalan Kerinchi, Gerbang Kerinchi Lestari,
 *   59200 Kuala Lumpur, Wilayah Persekutuan KL.
 *
 * with the CARRES wordmark right-aligned. A hairline rule below separates
 * the letterhead from the document-specific meta block each template
 * renders next.
 *
 * Single source of truth: if Loo changes office / registration, edit
 * `CARRES_COMPANY` here and every template picks it up. No template-level
 * duplication.
 */

import { StyleSheet, Text, View } from "@react-pdf/renderer";

const ACCENT = "#D64F20";
const BORDER = "#D9D2C7";
const MUTED  = "#7A7268";

export const CARRES_COMPANY = {
  legalName: "CARRES SDN. BHD.",
  regNo: "20201055306 (1601150-X)",
  formerName: "Formerly known as Carres Sdn Bhd",
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
  formerName: { fontSize: 8, color: MUTED, marginTop: 1 },
  addressBlock: { marginTop: 6 },
  addressLine: { fontSize: 8.5, color: "#3F3A33", marginTop: 1 },
  wordmark: {
    fontSize: 26,
    fontWeight: 700,
    color: ACCENT,
    letterSpacing: 2,
  },
});

export function LetterheadHeader() {
  return (
    <View style={styles.band}>
      <View style={styles.company}>
        <View style={styles.nameRow}>
          <Text style={styles.legalName}>{CARRES_COMPANY.legalName}</Text>
          <Text style={styles.regNo}>{CARRES_COMPANY.regNo}</Text>
        </View>
        <Text style={styles.formerName}>
          ({CARRES_COMPANY.formerName})
        </Text>
        <View style={styles.addressBlock}>
          {CARRES_COMPANY.addressLines.map((line, i) => (
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
