/**
 * RegisterListTemplate — the REGISTER'S OWN PAPER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ONE SOURCE, THREE OUTPUTS. `Export ▾` was ruled by the owner 2026-08-11 as
 * **Excel · PDF · Print**, and all three must answer with the SAME rows and the
 * SAME columns — the ones the operator is looking at, post search · filter ·
 * sort, in the order they dragged them into. So this template takes the grid's
 * ALREADY-RESOLVED headers and cells and does nothing but set them on paper.
 *
 * **It computes nothing and it formats nothing** (`ui/MASTER.md` §4: *"DataTable
 * takes its header word from the column def, and it formats nothing"*). A money
 * cell arrives as the string the screen printed; a date arrives as the string
 * the screen printed. If paper and screen ever disagree, the bug is upstream of
 * this file — which is the point of giving it no arithmetic of its own.
 *
 * This is a LIST document, deliberately not one of the eight business documents
 * in `docs/pdf/`. It carries no document number and no signature block, because
 * it is not a Sales Order, a DO or an invoice — it is a printout of a view, and
 * pretending otherwise would mint a ninth document nobody ruled.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { CARRES_COMPANY } from "./letterhead";

export interface RegisterListTemplateData {
  /** The register's own word — `Sales Orders`. */
  title: string;
  /** What this paper is a printout OF: the scope + how many rows. */
  subtitle: string;
  /** Header words, in the operator's current column order. */
  headers: string[];
  /** Already-formatted cells. Same length and order as `headers`. */
  rows: string[][];
  /** Right-aligned columns, by index — the money and count columns. */
  rightAlign?: number[];
  /** Printed under the table. The register's footer summary, verbatim. */
  summary?: string;
  /** `11 Aug 2026, 4:12 pm` — passed IN, never read from a clock in here, so
      the same data always renders the same bytes in a test. */
  printedAt: string;
}

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 34, paddingHorizontal: 26, fontSize: 7.5 },
  head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 13, fontWeight: 700, color: "#111827" },
  subtitle: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  company: { fontSize: 8, color: "#374151", textAlign: "right" },
  companyMeta: { fontSize: 6.5, color: "#9ca3af", textAlign: "right", marginTop: 1 },

  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  th: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 6.5,
    fontWeight: 700,
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  thead: { borderBottomWidth: 1, borderBottomColor: "#9ca3af", backgroundColor: "#f9fafb" },
  td: { paddingVertical: 3.5, paddingHorizontal: 3, color: "#111827" },

  summary: { marginTop: 8, fontSize: 7.5, fontWeight: 700, color: "#111827" },
  foot: {
    position: "absolute",
    bottom: 16,
    left: 26,
    right: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: "#9ca3af",
  },
});

/**
 * Column widths are proportional to the header word's own length plus the
 * longest cell under it, so a `Customer` column gets the room `Promised` does
 * not. **Content decides column width, never the table width** (`CLAUDE.md`
 * §2) — the same law the screen obeys, applied to paper.
 */
function widths(headers: string[], rows: string[][]): string[] {
  const longest = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length), 4),
  );
  /* Cap one runaway cell (an item list is far longer than a date) so a single
     wide column cannot squeeze every other one off the sheet. */
  const capped = longest.map((n) => Math.min(n, 34));
  const total = capped.reduce((a, b) => a + b, 0) || 1;
  return capped.map((n) => `${((n / total) * 100).toFixed(3)}%`);
}

export function RegisterListTemplate(data: RegisterListTemplateData): ReactElement<DocumentProps> {
  const w = widths(data.headers, data.rows);
  const right = new Set(data.rightAlign ?? []);
  return (
    <Document title={data.title}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head} fixed>
          <View>
            <Text style={s.title}>{data.title}</Text>
            <Text style={s.subtitle}>{data.subtitle}</Text>
          </View>
          <View>
            <Text style={s.company}>{CARRES_COMPANY.legalName}</Text>
            <Text style={s.companyMeta}>Printed {data.printedAt}</Text>
          </View>
        </View>

        <View style={[s.tr, s.thead]} fixed>
          {data.headers.map((h, i) => (
            <Text
              key={h + i}
              style={[s.th, { width: w[i], textAlign: right.has(i) ? "right" : "left" }]}
            >
              {h}
            </Text>
          ))}
        </View>

        {data.rows.map((row, ri) => (
          <View key={ri} style={s.tr} wrap={false}>
            {data.headers.map((_, ci) => (
              <Text
                key={ci}
                style={[s.td, { width: w[ci], textAlign: right.has(ci) ? "right" : "left" }]}
              >
                {row[ci] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}

        <View style={s.foot} fixed>
          <Text>{data.title}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
