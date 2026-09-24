/**
 * Purchase Order PDF template — built to docs/pdf/PO-PDF-STANDARD.md (the Law).
 * Change the Law first, the template second.
 *
 * Owner rulings 2026-09-21/22, reviewed on rendered previews:
 * - EVERY page prints the same full header — logo · legal name · SSM · address
 *   (three lines) · the hero `PO260924-4827(1)` over `PURCHASE ORDER`. Between pages
 *   only the Deliver To, the goods and `Page n of m` change. (PO-only override
 *   of the SO's one-line continuation header.)
 * - ONE PO may carry several Deliver To. Each Deliver To starts on a NEW page
 *   of this one PDF, with its own section 2 and its own `TOTAL`; the last page
 *   closes with `PO TOTAL`. No per-line DELIVER TO column, no `(1 of 2)`.
 * - Five columns on every PO: `# · SO NO · UNIT ID · DESCRIPTION · QTY`.
 * - Unit IDs: ink 7.5pt, the last three digits bold, consecutive Units as one
 *   `first to last` line COMPUTED from the codes (a gap starts a new line).
 * - QTY is a count: centred, one weight.
 * - PO DETAILS speaks the dictionary: `PO No` · `PO Date` ·
 *   `PO {n}-Day Delivery Date` (two-line label, bold date) · `Delivery Method`.
 * - Supplier and Deliver To NAMES bold; addresses regular.
 *
 * Unchanged business: MONEY-FREE, structurally (the payload is the
 * `purchasing_po_document` RPC, 0307) · the sofa plan-view drawing, one set per
 * page · `Issued by {audit_log actor}` in the footer · no signatures.
 */

import type { ReactNode } from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { CARRES_COMPANY } from "./letterhead";
import { poDocumentNumberOf } from "@carres/shared";
import type { PoTemplateData } from "./types";

const INK = "#1A1714";
const GREY = "#7A7268";
const HAIR = "#CFC9C0";
const BAR_BG = INK;
const SEAT_BG = "#EDE8E0";
const BACK_BG = "#D8D2C8";

const mm = (v: number) => v * 2.83465;

const MARGIN = mm(12);
/** The full header on EVERY page: name line + three address lines + rule.
 *  MEASURED against the actual Noto Sans SC 700 file at 18pt (2026-09-23,
 *  fontkit over the Fontsource TTF this renderer fetches) — PO-PDF-STANDARD
 *  asked for the new form to be measured before anyone claimed it fits:
 *    `PO-20260922-8987 V2`  192.5pt  67.9mm  (the old form; reproduces the
 *                                             standard's own figure)
 *    `PO260924-4827(1)`     163.0pt  57.5mm  (the new form — 10.4mm NARROWER)
 *    `PO260924-4827(10)`    173.6pt  61.2mm  (a two-digit version still fits)
 *  So the left column grows from 97.1mm to 107.5mm and the company name row
 *  (87.6mm) keeps 19.9mm instead of 9.5mm. The address still prints on three
 *  lines, and the 26mm reserve is a HEIGHT, unchanged by any of this. */
const HEADER_H = mm(26);
const FOOTER_H = mm(8);

const CARRES_LOGO_SRC =
  (globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ ?? "/carres-logo.png";

/** Column widths, mm: # 9 · SO NO 22 · UNIT ID 36 · DESCRIPTION flex · QTY 12.
 *  UNIT ID: `U1-000-001 to U1-000-004` with bold digits measures 32.4mm + 3mm
 *  padding. SO NO: `SO-13180 × 12` measures 18.6mm + 3mm. The rules are
 *  ABSOLUTE lines at these offsets (SO-PDF-STANDARD §5): CHANGE A WIDTH, CHANGE
 *  RULE_X IN THE SAME COMMIT. */
const W = { no: 9, so: 22, unit: 36, qty: 12 } as const;
const CONTENT_W = 186;
const RULE_X = [W.no, W.no + W.so, W.no + W.so + W.unit, CONTENT_W - W.qty];

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 8,
    color: INK,
    paddingTop: MARGIN + HEADER_H + mm(2),
    paddingBottom: MARGIN + FOOTER_H + mm(4),
    paddingHorizontal: MARGIN,
  },

  // ── header (fixed, identical on every page) ──
  header: { position: "absolute", top: MARGIN, left: MARGIN, right: MARGIN },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1, paddingRight: mm(4), flexDirection: "row", alignItems: "center" },
  headerLogo: { width: mm(13), height: mm(13), objectFit: "contain", marginRight: mm(4) },
  companyName: { fontSize: 14, fontWeight: 700 },
  ssmInline: { fontSize: 8, color: GREY, marginLeft: mm(2.5) },
  legalLine: { fontSize: 8, lineHeight: 1.42 },
  docBlock: { alignItems: "flex-end" },
  docNumber: { fontSize: 18, fontWeight: 700 },
  docTitle: { fontSize: 9, color: GREY, letterSpacing: 1.5, marginTop: mm(1) },
  headerRule: { borderBottomWidth: 0.5, borderBottomColor: "#B4B4B4", marginTop: mm(3) },

  // ── section 2 — SUPPLIER · DELIVER TO · PO DETAILS ──
  cards: { flexDirection: "row", minHeight: mm(28) },
  blockLabel: { fontSize: 8.5, fontWeight: 700, color: INK, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 },
  pairRow: { flexDirection: "row" },
  /* PO DETAILS only: the two-line `PO {n}-Day / Delivery Date` label puts its
     colon and value on the label's LAST line (the SO's two-line-label rule). */
  pairRowEnd: { flexDirection: "row", alignItems: "flex-end" },
  pairLabel: { fontSize: 8, color: GREY, width: mm(15), lineHeight: 1.42 },
  detailLabel: { fontSize: 8, color: GREY, width: mm(23), lineHeight: 1.42 },
  pairValue: { fontSize: 8, flex: 1, lineHeight: 1.42 },
  deliverNote: { fontSize: 7, color: GREY, marginTop: mm(0.8), lineHeight: 1.3 },

  // ── items table — ink bar, boxed rows, absolute column rules ──
  tableHead: { position: "relative", backgroundColor: BAR_BG, flexDirection: "row", paddingVertical: mm(1.8), marginTop: mm(3) },
  th: { fontSize: 7.5, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2, textTransform: "uppercase" },
  row: {
    position: "relative",
    flexDirection: "row",
    minHeight: mm(9),
    paddingVertical: mm(2),
    borderLeftWidth: 0.3,
    borderRightWidth: 0.3,
    borderBottomWidth: 0.3,
    borderColor: HAIR,
  },
  totalRow: {
    position: "relative",
    flexDirection: "row",
    minHeight: mm(9),
    paddingVertical: mm(2),
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: INK,
  },
  vline: { position: "absolute", top: 0, bottom: 0, width: 0.4, backgroundColor: HAIR },
  bNo: { width: mm(W.no), paddingRight: mm(1.5), justifyContent: "center" },
  bSo: { width: mm(W.so), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bUnit: { width: mm(W.unit), paddingHorizontal: mm(1.5), justifyContent: "center" },
  bDesc: { flex: 1, paddingHorizontal: mm(1.5), justifyContent: "center" },
  bQty: { width: mm(W.qty), justifyContent: "center" },
  cell: { fontSize: 7.5, lineHeight: 1.25 },
  cellNo: { fontSize: 7, color: GREY, textAlign: "right", lineHeight: 1.25 },
  cellQty: { fontSize: 7.5, textAlign: "center", lineHeight: 1.25 },
  unitWarn: { fontSize: 7, color: INK, lineHeight: 1.25 },
  descMain: { fontSize: 7.5, fontWeight: 600, lineHeight: 1.25 },
  descSub: { fontSize: 7, color: GREY, marginTop: mm(0.8), lineHeight: 1.2 },
  totalLabel: { fontSize: 7.5, fontWeight: 700, textAlign: "right", lineHeight: 1.25 },
  totalQty: { fontSize: 7.5, fontWeight: 700, textAlign: "center", lineHeight: 1.25 },

  // ── sofa layout drawing (direction contract), one set per page ──
  layoutCaption: { fontSize: 7, color: GREY, marginTop: mm(1) },
  layoutRow: { flexDirection: "row", alignItems: "flex-start", marginTop: mm(4), justifyContent: "center" },
  moduleBox: { alignItems: "center", marginRight: mm(2) },
  moduleCode: { fontSize: 7.5, fontWeight: 600, marginTop: mm(1.5) },
  moduleFabric: { fontSize: 7, color: GREY, marginTop: mm(0.5) },
  tvLine: { width: 0.6, height: mm(4), backgroundColor: GREY, marginTop: mm(2), alignSelf: "center" },
  tvBox: { backgroundColor: INK, paddingHorizontal: mm(3), paddingVertical: mm(0.8), marginTop: mm(0.5), alignSelf: "center" },
  tvText: { fontSize: 7.5, color: "#FFFFFF", letterSpacing: 1.5 },

  // ── footer (fixed, every page) ──
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
    paddingTop: mm(2),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerCell: { fontSize: 7.5, color: GREY, width: mm(58) },
  footerCenter: { fontSize: 7.5, color: GREY, textAlign: "center", flex: 1 },
  footerPage: { fontSize: 7.5, color: GREY, width: mm(40), textAlign: "right" },
});

type PoLine = PoTemplateData["lines"][number];
type Destination = { name: string; address: string };

/** `2026-10-09` → `Fri, 9 Oct 2026` (textual parse — timezone-proof). */
export function poPrintDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return `${dow}, ${d} ${mon} ${y}`;
}

const UNIT_RE = /^U(\d+)-(\d{3})-(\d{3})$/;

/**
 * Consecutive Unit IDs as runs, COMPUTED from the codes — never assumed from
 * the quantity (a §6.2 replacement or a reduced revision leaves gaps).
 * `U1-999-999 → U2-000-001` counts as consecutive. A code outside the
 * `U1-000-001` shape (the grandfathered `id-…` labels) stands alone.
 */
export function unitRuns(codes: readonly string[]): Array<{ first: string; last: string | null }> {
  const key = (c: string): number | null => {
    const m = UNIT_RE.exec(c);
    return m ? Number(m[1]) * 1_000_000 + Number(m[2] + m[3]) : null;
  };
  const shaped = codes.filter((c) => key(c) != null).sort((a, b) => key(a)! - key(b)!);
  const other = codes.filter((c) => key(c) == null);
  const runs: Array<{ first: string; last: string | null }> = [];
  let first: string | null = null;
  let prev: string | null = null;
  for (const c of shaped) {
    if (first != null && prev != null) {
      const p = key(prev)!;
      const next = p % 1_000_000 === 999_999 ? (Math.floor(p / 1_000_000) + 1) * 1_000_000 + 1 : p + 1;
      if (key(c) === next) {
        prev = c;
        continue;
      }
      runs.push({ first, last: first === prev ? null : prev });
    }
    first = c;
    prev = c;
  }
  if (first != null && prev != null) runs.push({ first, last: first === prev ? null : prev });
  return [...runs, ...other.map((c) => ({ first: c, last: null }))];
}

/** One Unit ID, its last three digits bold — the running number a packer reads. */
function UnitCode({ code }: { code: string }) {
  if (!UNIT_RE.test(code)) return <Text>{code}</Text>;
  return (
    <Text>
      {code.slice(0, -3)}
      <Text style={{ fontWeight: 700 }}>{code.slice(-3)}</Text>
    </Text>
  );
}

function ColumnRules() {
  return (
    <>
      {RULE_X.map((x) => (
        <View key={x} style={[styles.vline, { left: mm(x) }]} />
      ))}
    </>
  );
}

/** Sofa module lines carry a side marker in the SKU (`5539-2B(LHF)`). */
const SIDE_RE = /\((LHF|RHF)\)/;

function sofaGroups(lines: PoLine[]): Array<{ model: string; modules: PoLine[] }> {
  const models = new Set<string>();
  for (const l of lines) {
    if (SIDE_RE.test(l.sku)) {
      const dash = l.sku.indexOf("-");
      if (dash > 0) models.add(l.sku.slice(0, dash));
    }
  }
  return [...models].map((model) => ({ model, modules: lines.filter((l) => l.sku.startsWith(`${model}-`)) }));
}

function moduleCodeOf(line: PoLine): string {
  const dash = line.sku.indexOf("-");
  return dash > 0 ? line.sku.slice(dash + 1) : line.sku;
}

/** Chaise modules read deeper toward the TV — `L(RHF)` / `CHL(LHF)` shapes. */
function isChaise(code: string): boolean {
  return /^L\(/.test(code) || code.includes("CHL");
}

/* The key joins two free-text facts, so it needs a separator no address can
   contain. It is written as an ESCAPE, never as a raw NUL byte: a literal
   0x00 in the source made `file` report this template as `data` and made
   grep skip it silently — a template nobody can search is a template
   nobody reviews. */
const destKey = (d: Destination) => `${d.name}\u0000${d.address}`;

export function PoTemplate(data: PoTemplateData) {
  const { po_number, version, issue_date, supplier, destination, delivery_instructions, eta_date, so_refs, issued_by, lines } = data;
  const draft = Boolean(data.draft);
  /* 0378 + owner 2026-09-22 — the version TRAVELS WITH THE NUMBER on every page
     (hero, PO No row, footer). Version 1 prints too: a supplier holding two
     papers with one number cannot tell which to build from. It never prints on
     its own.
     ⭐ THE SPELLING IS THE NUMBER'S OWN (owner ruling 2026-09-23, MASTER §6.1):
     a new `PO260924-4827` wears `(1)`, while every pre-cutover `PO-20260904-4665`
     keeps the ` V1` its supplier already holds — including a kept version
     reprinted from `po_version_documents`, whose payload carries that same old
     number. `poDocumentNumberOf` is the one place that decides. */
  const poId = draft ? "DRAFT" : poDocumentNumberOf(po_number, version);

  const soCell = (line: PoLine): string[] => {
    const src = (line.sources ?? []).filter((s) => s.so != null);
    if (src.length === 1) return [`SO-${src[0]!.so}`];
    if (src.length > 1) return src.map((s) => `SO-${s.so} × ${s.qty}`);
    return so_refs && so_refs.length === 1 ? [`SO-${so_refs[0]}`] : [];
  };

  /* ONE PDF, ONE PAGE GROUP PER DELIVER TO. The PO's own destination leads;
     others follow in the order the goods name them. */
  const groupMap = new Map<string, { dest: Destination; lines: PoLine[] }>();
  groupMap.set(destKey(destination), { dest: destination, lines: [] });
  for (const line of lines) {
    const d = line.destination ?? destination;
    const k = destKey(d);
    if (!groupMap.has(k)) groupMap.set(k, { dest: d, lines: [] });
    groupMap.get(k)!.lines.push(line);
  }
  const groups = [...groupMap.values()].filter((g) => g.lines.length > 0);
  if (groups.length === 0) groups.push({ dest: destination, lines: [] });
  const poTotal = lines.reduce((n, l) => n + Number(l.qty), 0);

  const daysLabel = data.delivery_working_days != null && data.delivery_working_days > 0
    ? `PO ${data.delivery_working_days}-Day\nDelivery Date`
    : "PO Delivery Date";
  const deliveryValue = poPrintDate(eta_date) ?? (draft ? null : "Not recorded");
  const methodValue =
    data.delivery_method === "we_collect" ? "We collect" : data.delivery_method === "supplier_delivers" ? "Supplier delivers" : null;
  const detailRows: Array<[string, string | null, boolean?]> = [
    ["PO No", draft ? "Assigned when issued" : poId],
    ["PO Doc Date", poPrintDate(issue_date)],
    [daysLabel, deliveryValue, true],
    ["Delivery Method", methodValue],
  ];

  const Section2 = ({ dest }: { dest: Destination }) => (
    <View style={styles.cards}>
      <View style={{ flex: 1, paddingRight: mm(5) }}>
        <Text style={styles.blockLabel}>Supplier</Text>
        <View style={{ marginTop: mm(1.5) }}>
          <View style={styles.pairRow}>
            <Text style={styles.pairLabel}>Name</Text>
            <Text style={[styles.pairValue, { fontWeight: 600 }]}>{supplier.name}</Text>
          </View>
          {supplier.address ? (
            <View style={styles.pairRow}>
              <Text style={styles.pairLabel}>Address</Text>
              <Text style={styles.pairValue}>{supplier.address}</Text>
            </View>
          ) : null}
          {supplier.contact ? (
            <View style={styles.pairRow}>
              <Text style={styles.pairLabel}>Tel</Text>
              <Text style={styles.pairValue}>{supplier.contact}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1, paddingRight: mm(5) }}>
        <Text style={styles.blockLabel}>Deliver To</Text>
        <View style={{ marginTop: mm(1.5) }}>
          <View style={styles.pairRow}>
            <Text style={styles.pairLabel}>Name</Text>
            <Text style={[styles.pairValue, { fontWeight: 600 }]}>{dest.name}</Text>
          </View>
          {dest.address ? (
            <View style={styles.pairRow}>
              <Text style={styles.pairLabel}>Address</Text>
              <Text style={styles.pairValue}>{dest.address}</Text>
            </View>
          ) : null}
          {delivery_instructions ? <Text style={styles.deliverNote}>{delivery_instructions}</Text> : null}
        </View>
      </View>
      <View style={{ width: mm(52) }}>
        <Text style={styles.blockLabel}>PO Details</Text>
        <View style={{ marginTop: mm(1.5) }}>
          {detailRows.map(([label, value, bold]) =>
            value ? (
              <View key={label} style={label.includes("\n") ? styles.pairRowEnd : styles.pairRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.pairValue}>
                  :  <Text style={bold ? { fontWeight: 700 } : {}}>{value}</Text>
                </Text>
              </View>
            ) : null,
          )}
        </View>
      </View>
    </View>
  );

  const TableHead = () => (
    <View style={styles.tableHead}>
      <ColumnRules />
      <View style={styles.bNo}><Text style={[styles.th, { textAlign: "right" }]}>#</Text></View>
      <View style={styles.bSo}><Text style={styles.th}>SO No</Text></View>
      <View style={styles.bUnit}><Text style={styles.th}>Unit ID</Text></View>
      <View style={styles.bDesc}><Text style={styles.th}>Description</Text></View>
      <View style={styles.bQty}><Text style={[styles.th, { textAlign: "center" }]}>Qty</Text></View>
    </View>
  );

  const TotalRow = ({ label, qty }: { label: string; qty: number }) => (
    <View wrap={false} style={styles.totalRow}>
      <View style={{ flex: 1, paddingRight: mm(3), justifyContent: "center" }}>
        <Text style={styles.totalLabel}>{label}</Text>
      </View>
      <View style={[styles.vline, { left: mm(RULE_X[3]!) }]} />
      <View style={styles.bQty}><Text style={styles.totalQty}>{qty}</Text></View>
    </View>
  );

  // ── PAGE CHUNKING — every page that carries goods carries the column bar
  //    (SO-PDF-STANDARD §5). Heights in mm, deliberately generous: a page that
  //    breaks one row early is invisible; a chunk that overflows loses its bar.
  //    A4 297 − top (12 + 26 + 2) − bottom (12 + 8 + 4) = 233mm of body; a
  //    destination's first page also carries section 2 (~34mm) and the bar. ──
  const EST_ROW = 9;
  const EST_LINE = 3.6;
  const CAP_FIRST = 165;
  const CAP_REST = 205;
  let rowNo = 0;

  const pages: ReactNode[] = [];
  groups.forEach((group, gi) => {
    const blocks: Array<{ h: number; node: ReactNode }> = [];
    for (const line of group.lines) {
      rowNo += 1;
      const so = soCell(line);
      const units = line.unit_codes ?? [];
      const runs = unitRuns(units);
      const a = (line.attrs ?? {}) as { color?: string; gap?: string; fabric_name?: string };
      const bits: string[] = [];
      if (a.color) bits.push(a.color);
      if (a.gap) bits.push(`Gap ${a.gap}`);
      if (a.fabric_name) bits.push(`Fabric ${a.fabric_name}`);
      const showVariant = line.description && line.description !== line.sku;
      /* COPY-STANDARD: an exact-unit line with no Unit IDs is a defect the
         operator must see before sending; a quantity line's `—` is the law. */
      const missingUnits = !draft && line.identity_mode === "exact_unit" && units.length === 0;
      const stacked = Math.max(so.length, runs.length, missingUnits ? 3 : 1, 1 + (bits.length > 0 ? 1 : 0));
      blocks.push({
        h: Math.max(EST_ROW, 4 + stacked * EST_LINE),
        node: (
          <View key={`l-${rowNo}`} wrap={false} style={styles.row}>
            <ColumnRules />
            <View style={styles.bNo}><Text style={styles.cellNo}>{rowNo}</Text></View>
            <View style={styles.bSo}>
              {so.length > 0 ? so.map((s) => <Text key={s} style={styles.cell}>{s}</Text>) : <Text style={styles.cell}> </Text>}
            </View>
            <View style={styles.bUnit}>
              {missingUnits ? (
                <Text style={styles.unitWarn}>Unit IDs missing on this line — do not send this PO</Text>
              ) : runs.length === 0 ? (
                <Text style={styles.cell}>—</Text>
              ) : (
                runs.map((r) => (
                  <Text key={r.first} style={styles.cell}>
                    <UnitCode code={r.first} />
                    {r.last ? <Text> to <UnitCode code={r.last} /></Text> : null}
                  </Text>
                ))
              )}
            </View>
            <View style={styles.bDesc}>
              <Text style={styles.descMain}>
                {line.sku}
                {showVariant ? ` — ${line.description}` : ""}
              </Text>
              {bits.length > 0 ? <Text style={styles.descSub}>{bits.join(" · ")}</Text> : null}
            </View>
            <View style={styles.bQty}><Text style={styles.cellQty}>{line.qty}</Text></View>
          </View>
        ),
      });
    }
    const groupQty = group.lines.reduce((n, l) => n + Number(l.qty), 0);
    blocks.push({ h: 12, node: <TotalRow key={`t-${gi}`} label="TOTAL" qty={groupQty} /> });
    if (groups.length > 1 && gi === groups.length - 1) {
      blocks.push({
        h: 15,
        node: (
          <View key="po-total" style={{ marginTop: mm(3) }}>
            <TotalRow label="PO TOTAL" qty={poTotal} />
          </View>
        ),
      });
    }

    const chunks: Array<Array<{ h: number; node: ReactNode }>> = [[]];
    let used = 0;
    let cap = CAP_FIRST;
    for (const b of blocks) {
      if (used + b.h > cap && chunks[chunks.length - 1]!.length > 0) {
        chunks.push([]);
        used = 0;
        cap = CAP_REST;
      }
      chunks[chunks.length - 1]!.push(b);
      used += b.h;
    }
    chunks.forEach((chunk, ci) => {
      pages.push(
        <View key={`g-${gi}-${ci}`} break={pages.length > 0}>
          {ci === 0 ? <Section2 dest={group.dest} /> : null}
          <TableHead />
          {chunk.map((b) => b.node)}
        </View>,
      );
    });
  });

  // ── sofa layout drawings — ONE set per page (the picture is the contract;
  //    two contracts on one page get built as one). ──
  for (const { model, modules } of sofaGroups(lines)) {
    pages.push(
      <View key={`sofa-${model}`} break wrap={false}>
        <Text style={styles.blockLabel}>Sofa Layout · {model}</Text>
        <Text style={styles.layoutCaption}>Top view. Back at the top. TV in front.</Text>
        <View style={styles.layoutRow}>
          {modules.map((m, i) => {
            const code = moduleCodeOf(m);
            const fabric = (m.attrs as { fabric_name?: string } | null)?.fabric_name;
            return (
              <View key={`${m.sku}-${i}`} style={styles.moduleBox}>
                <View
                  style={{
                    width: mm(30),
                    height: isChaise(code) ? mm(42) : mm(24),
                    backgroundColor: SEAT_BG,
                    borderWidth: 0.6,
                    borderColor: GREY,
                  }}
                >
                  <View style={{ height: mm(5), backgroundColor: BACK_BG }} />
                </View>
                <Text style={styles.moduleCode}>{Number(m.qty) > 1 ? `${code} ×${m.qty}` : code}</Text>
                {fabric ? <Text style={styles.moduleFabric}>{fabric}</Text> : null}
              </View>
            );
          })}
        </View>
        <View style={styles.tvLine} />
        <View style={styles.tvBox}>
          <Text style={styles.tvText}>TV</Text>
        </View>
      </View>,
    );
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── header — the SAME full header on every page (owner, 2026-09-22) ── */}
        <View style={styles.header} fixed>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Image src={CARRES_LOGO_SRC} style={styles.headerLogo} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                  <Text style={styles.companyName}>{CARRES_COMPANY.legalName}</Text>
                  <Text style={styles.ssmInline}>SSM {CARRES_COMPANY.regNo}</Text>
                </View>
                <Text style={[styles.legalLine, { marginTop: mm(1.8) }]}>{CARRES_COMPANY.addressLines[0]}</Text>
                <Text style={styles.legalLine}>{CARRES_COMPANY.addressLines[1]}</Text>
                <Text style={styles.legalLine}>{CARRES_COMPANY.addressLines[2]}</Text>
              </View>
            </View>
            <View style={styles.docBlock}>
              <Text style={styles.docNumber}>{poId}</Text>
              <Text style={styles.docTitle}>PURCHASE ORDER</Text>
            </View>
          </View>
          <View style={styles.headerRule} />
        </View>

        {pages}

        {/* ── footer — fixed, every page: audit · legal · page ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerCell}>
            {draft ? poId : `${poId} · Issued by ${issued_by ?? "Not recorded"}`}
          </Text>
          <Text style={styles.footerCenter}>
            {draft ? "DRAFT · Not issued · Do not send to supplier." : "Computer-generated document · No signature required."}
          </Text>
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
