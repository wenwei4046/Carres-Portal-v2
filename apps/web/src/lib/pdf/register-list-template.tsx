/**
 * REGISTER LIST PDF — the current view of any Register, as a document.
 *
 * The document PDFs beside this file (SO / DO / PO / Invoice) each render ONE
 * business record and are governed by `docs/pdf/*-PDF-STANDARD.md`. This one is
 * not a business document and deliberately carries no letterhead, no terms and
 * no signature block: it is the operator's current listing, printed. Handing a
 * customer this page must never look like handing them an invoice.
 *
 * It takes already-derived text — the SAME `cellText` the Excel export uses —
 * so a cell can never say one thing on screen, another in Excel and a third
 * here. Columns arrive in their on-screen order and only the visible ones.
 *
 * Landscape A4 because a Register is wide; column widths are proportional to
 * the widest cell so a `Not recorded` column cannot claim the same width as a
 * customer name.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface RegisterListTemplateData {
  /** The destination's own word — `Sales Orders`. */
  title: string;
  /** Column headers, in on-screen order. */
  headers: string[];
  /** One array per row, aligned to `headers`. */
  rows: string[][];
  /** The Register's own status-footer sentence, printed verbatim. */
  summary?: string;
  /** Printed under the title so a filed copy says when it was true. */
  printedAt: string;
}

const INK = "#1a1a1a";
const GREY = "#6b7280";
const LINE = "#e5e7eb";
const BAND = "#f9fafb";

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 34, paddingHorizontal: 24, fontSize: 8, color: INK },
  title: { fontSize: 13, fontWeight: 700 },
  meta: { fontSize: 8, color: GREY, marginTop: 3, marginBottom: 10 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, backgroundColor: BAND },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  headCell: { paddingVertical: 5, paddingHorizontal: 4, fontSize: 7.5, fontWeight: 700, color: GREY },
  cell: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 8 },
  summary: { marginTop: 8, fontSize: 8, color: GREY },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: GREY,
  },
});

/** Proportional widths, floored so a short column stays readable and capped so
 *  one long cell cannot eat the page. */
function widths(headers: string[], rows: string[][]): number[] {
  const raw = headers.map((h, i) => {
    let w = h.length;
    for (const r of rows) w = Math.max(w, (r[i] ?? "").length);
    return Math.min(28, Math.max(7, w));
  });
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => (w / total) * 100);
}

export function RegisterListTemplate(data: RegisterListTemplateData) {
  const w = widths(data.headers, data.rows);
  return (
    <Document title={data.title}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.meta}>
          {data.rows.length} {data.rows.length === 1 ? "row" : "rows"} · printed {data.printedAt}
        </Text>

        <View style={styles.headRow} fixed>
          {data.headers.map((h, i) => (
            <Text key={h + i} style={[styles.headCell, { width: `${w[i]}%` }]}>
              {h}
            </Text>
          ))}
        </View>

        {data.rows.map((row, ri) => (
          <View key={ri} style={styles.row} wrap={false}>
            {data.headers.map((h, i) => (
              <Text key={h + i} style={[styles.cell, { width: `${w[i]}%` }]}>
                {row[i] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        {data.summary ? <Text style={styles.summary}>{data.summary}</Text> : null}

        <View style={styles.footer} fixed>
          <Text>{data.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
