import { arrivalHandoverDifferences } from "./arrival-source";
import type {
  ArrivalSource,
  ArrivalSourceUnit,
  ArrivalSourceType,
} from "./arrival-source";
import { poSupplierDeliveryDateOf, type PoDatePromise } from "./po-workspace";
/** Read-only Receiving projection. Commercial balances and Stock status are never receipt evidence. */
export interface InboundInput {
  arrivalSources?: ArrivalSource[];
  sourceUnits?: ArrivalSourceUnit[];
  sourceEvents?: Array<{ source_id: string; kind: string; unit_ids: string[] }>;
  parties?: Array<{ id: string; name: string }>;
  promises?: Array<PoDatePromise & { po_id: string }>;
  lines?: Array<{
    po_id: string;
    qty: number;
    destination_id: string | null;
    sku?: string | null;
  }>;
  pos: Array<{
    version?: number;
    id: string;
    supplier_id: string;
    warehouse_id: string;
    destination_id: string | null;
    status: string;
    official_delivery_date: string | null;
    eta_date: string | null;
    placed_at: string;
    so: number | null;
  }>;
  sites: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  destinations: Array<{ id: string; warehouse_id: string | null }>;
  units: Array<{
    id: string;
    unit_code: string;
    po_no: string | null;
    qty: number;
    sku?: string | null;
  }>;
  /** SKU → operator product name (product_skus.variant). Display only. */
  skuNames?: Array<{ sku: string; name: string | null }>;
  receipts: Array<{
    id: string;
    po_id: string | null;
    arrival_source_id?: string | null;
    actual_site_id?: string | null;
    status: string;
    posted_at: string | null;
    grn_no?: string | null;
    goods_received_at?: string | null;
  }>;
  results: Array<{
    receipt_id: string;
    stock_item_id: string;
    outcome: string;
    issue_kind: string | null;
  }>;
}
/** One product of one arrival arrangement — the arranged and received counts
 * are THIS arrangement's own scope, never the whole PO across arrangements. */
export interface InboundProduct {
  sku: string | null;
  name: string | null;
  qty: number;
  received: number;
}
export interface InboundArrival {
  id: string;
  sourceId: string;
  sourceType: ArrivalSourceType;
  sourceNo?: string;
  /** The document's own name — `PO No` · `Transfer No` · `Repair Order No`
   *  · `Claim No` · `Case No`. The column header stays `Document`. */
  documentWord: string;
  /** The document number the cell prints (the PO No, or the source's own
   *  minted number — never an invented interface document). */
  documentNo: string;
  handoverGaps?: ReturnType<typeof arrivalHandoverDifferences>;
  party: string | null;
  /** Where the goods physically come FROM. A carrier or driver never
   *  substitutes for the origin; a missing origin says so. */
  from: string;
  siteId: string;
  site: string;
  date: string | null;
  poDate: string | null;
  so: number | null;
  expected: number;
  received: number;
  remaining: number;
  issues: number;
  /** Every product of this arrangement, by name — never `+N more`. */
  products: InboundProduct[];
  identitiesMissing: boolean;
  sessionId: string | null;
  /** Every posted Receiving Session of this arrangement, oldest first —
   *  actual receipt evidence stays viewable per session. */
  sessions: Array<{
    id: string;
    grnNo: string | null;
    postedAt: string | null;
    receivedAt: string | null;
    actualSite: string | null;
  }>;
  units: Array<{
    id: string;
    code: string;
    sku: string | null;
    product: string | null;
    outcome: string;
    issue: string | null;
    receivedSite?: string | null;
  }>;
}

/** The Document cell's own word for each source kind (docs/stock/MASTER.md).
 * The numbers are minted from real records — `TR-…`, `RO-…`, the Claim's or
 * Case's own number — so the word names the document the number belongs to. */
export function inboundDocumentWordOf(kind: ArrivalSourceType): string {
  switch (kind) {
    case "supplier-delivery":
      return "PO No";
    case "transfer":
      return "Transfer No";
    case "repair-return":
      return "Repair Order No";
    case "supplier-replacement":
      return "Claim No";
    default:
      return "Case No";
  }
}

/** The one physical-progress word of an arrangement. Exceptions (issues,
 * site differences, missing records) are separate facts beside it — progress
 * and exceptions can both hold at once and never merge into one word. */
export function inboundStatusWordOf(
  r: Pick<InboundArrival, "received" | "remaining" | "identitiesMissing">,
): string {
  if (r.identitiesMissing) return "Records incomplete";
  if (r.received === 0) return "Not received yet";
  if (r.remaining > 0) return "Part received";
  return "Received";
}

/** The row's exception lines — each one a specific fact with its Unit or
 * record named, never a generic flag. `todayIso` decides overdue honestly. */
export function inboundExceptionLines(
  r: InboundArrival,
  todayIso: string,
  fmt: (iso: string) => string = (iso) => iso,
): string[] {
  const lines: string[] = [];
  if (r.identitiesMissing)
    lines.push("Unit IDs or Receiving results are not fully recorded");
  if (r.date && r.date < todayIso && r.remaining > 0 && !r.identitiesMissing)
    lines.push(
      `Expected arrival was ${fmt(r.date)}. ${r.remaining} Unit${r.remaining === 1 ? "" : "s"} not yet received`,
    );
  for (const u of r.units)
    if (u.outcome === "received_with_issue")
      lines.push(
        `${u.code} · ${u.issue === "wrong_item" ? "Wrong item" : "Damaged"}`,
      );
  for (const u of r.units)
    if (u.receivedSite && u.receivedSite !== r.site)
      lines.push(`${u.code} · Received at ${u.receivedSite}, not ${r.site}`);
  for (const g of r.handoverGaps ?? []) {
    const code = r.units.find((u) => u.id === g.unitId)?.code ?? g.unitId;
    lines.push(
      `${code} · ${g.originMissing ? "Origin handover not recorded" : "Delivery party receipt not recorded"}`,
    );
  }
  return lines;
}
function projectUnits(
  input: InboundInput,
  sourceUnits: InboundInput["units"],
  sessions: InboundInput["receipts"],
) {
  const results = new Map<string, InboundInput["results"][number]>();
  // A session describes THIS arrival. Not on a later truck does not
  // undo an earlier receipt; only amending/voiding that receipt can.
  for (const session of sessions)
    for (const result of input.results.filter(
      (r) => r.receipt_id === session.id,
    ))
      if (
        result.outcome !== "not_received" ||
        !results.has(result.stock_item_id)
      )
        results.set(result.stock_item_id, result);
  const unmappedReceipt = sessions.some(
    (session) => !input.results.some((r) => r.receipt_id === session.id),
  );
  const skuName = new Map(
    (input.skuNames ?? []).map((row) => [row.sku, row.name]),
  );
  const units = sourceUnits
    .filter((u) => u.qty === 1)
    .map((u) => ({
      id: u.id,
      code: u.unit_code,
      sku: u.sku ?? null,
      product: u.sku ? skuName.get(u.sku) ?? null : null,
      outcome:
        results.get(u.id)?.outcome ??
        (unmappedReceipt ? "unknown" : "not_received"),
      issue: results.get(u.id)?.issue_kind ?? null,
      receivedSite:
        input.sites.find(
          (s) =>
            s.id ===
            sessions.find((r) => r.id === results.get(u.id)?.receipt_id)
              ?.actual_site_id,
        )?.name ?? null,
    }));
  return { units, unmappedReceipt };
}

/** Every product of one arrangement, from the exact Unit rows first and the
 * ordered lines beside them — so an arrangement whose Unit identities are not
 * minted yet still names what was ordered, and one whose Units exist counts
 * received per product from its own results only. */
function projectProducts(
  input: InboundInput,
  units: InboundArrival["units"],
  lines: Array<{ qty: number; sku?: string | null }>,
): InboundProduct[] {
  const skuName = new Map(
    (input.skuNames ?? []).map((row) => [row.sku, row.name]),
  );
  const bySku = new Map<string, InboundProduct>();
  const keyOf = (sku: string | null) => sku ?? " no-sku";
  for (const line of lines) {
    const sku = line.sku ?? null;
    const entry = bySku.get(keyOf(sku)) ?? {
      sku,
      name: sku ? skuName.get(sku) ?? null : null,
      qty: 0,
      received: 0,
    };
    entry.qty += line.qty;
    bySku.set(keyOf(sku), entry);
  }
  for (const u of units) {
    const entry = bySku.get(keyOf(u.sku)) ?? {
      sku: u.sku,
      name: u.product,
      qty: 0,
      received: 0,
    };
    if (lines.length === 0) entry.qty += 1;
    if (u.outcome === "received" || u.outcome === "received_with_issue")
      entry.received += 1;
    bySku.set(keyOf(u.sku), entry);
  }
  return [...bySku.values()].sort((a, b) =>
    (a.name ?? a.sku ?? "~").localeCompare(b.name ?? b.sku ?? "~"),
  );
}

function projectSessions(
  input: InboundInput,
  sessions: InboundInput["receipts"],
): InboundArrival["sessions"] {
  return sessions.map((s) => ({
    id: s.id,
    grnNo: s.grn_no ?? null,
    postedAt: s.posted_at ?? null,
    receivedAt: s.goods_received_at ?? null,
    actualSite:
      input.sites.find((site) => site.id === s.actual_site_id)?.name ?? null,
  }));
}

/** A Unit has PO lineage, but no PO-line lineage for competing destination instructions.
 * Surface these sources separately; never guess which Site owns each exact Unit. */
export function inboundUnresolvedSources(input: InboundInput): string[] {
  return input.pos
    .filter(
      (p) =>
        p.status !== "cancelled" &&
        input.lines?.some(
          (l) =>
            l.po_id === p.id &&
            l.destination_id &&
            l.destination_id !== p.destination_id &&
            input.destinations.find((d) => d.id === l.destination_id)
              ?.warehouse_id !==
              (p.destination_id
                ? input.destinations.find((d) => d.id === p.destination_id)
                    ?.warehouse_id
                : p.warehouse_id),
        ),
    )
    .map((p) => p.id);
}
export function inboundArrivals(input: InboundInput): InboundArrival[] {
  const unresolved = new Set(inboundUnresolvedSources(input));
  const poRows = input.pos
    .filter((p) => p.status !== "cancelled" && !unresolved.has(p.id))
    .flatMap((p) => {
      const siteId = p.destination_id
        ? input.destinations.find((d) => d.id === p.destination_id)
            ?.warehouse_id
        : p.warehouse_id;
      const site = input.sites.find((s) => s.id === siteId);
      if (!site) return [];
      const sessions = input.receipts
        .filter((r) => r.po_id === p.id && r.status === "posted")
        .sort((a, b) => (a.posted_at ?? "").localeCompare(b.posted_at ?? ""));
      const replacementIds = new Set(
        input.sourceUnits
          ?.filter((u) => u.replaces_item_id)
          .map((u) => u.stock_item_id),
      );
      const sourceUnits = input.units.filter(
        (u) => u.po_no === p.id && !replacementIds.has(u.id),
      );
      const { units, unmappedReceipt } = projectUnits(
        input,
        sourceUnits,
        sessions,
      );
      const received = units.filter(
        (u) => u.outcome === "received" || u.outcome === "received_with_issue",
      ).length;
      const supplierName =
        input.suppliers.find((s) => s.id === p.supplier_id)?.name ?? null;
      const poLines = (input.lines ?? []).filter((l) => l.po_id === p.id);
      return [
        {
          id: p.id,
          sourceId: p.id,
          sourceType: "supplier-delivery" as const,
          documentWord: inboundDocumentWordOf("supplier-delivery"),
          documentNo: p.id,
          party: supplierName,
          from: supplierName ?? "Origin not recorded",
          siteId: site.id,
          site: site.name,
          date:
            poSupplierDeliveryDateOf(
              input.promises?.filter((r) => r.po_id === p.id),
              p.version ?? 1,
            ) ??
            p.official_delivery_date ??
            p.eta_date,
          poDate: p.placed_at,
          so: p.so,
          expected: units.length,
          received,
          remaining: units.length - received,
          issues: units.filter((u) => u.outcome === "received_with_issue")
            .length,
          products: projectProducts(input, units, poLines),
          identitiesMissing:
            unmappedReceipt ||
            sourceUnits.length === 0 ||
            sourceUnits.some((u) => u.qty !== 1) ||
            (input.lines !== undefined &&
              poLines.reduce((n, l) => n + l.qty, 0) !== units.length),
          sessionId: sessions.at(-1)?.id ?? null,
          sessions: projectSessions(input, sessions),
          units,
        },
      ];
    });
  const otherRows: InboundArrival[] = (input.arrivalSources ?? [])
    .filter((s) => !s.cancelled_at)
    .flatMap((source) => {
      const site = input.sites.find((s) => s.id === source.to_site_id);
      if (!site) return [];
      const links = (input.sourceUnits ?? []).filter(
        (u) => u.source_id === source.id,
      );
      const ids = new Set(links.map((u) => u.stock_item_id));
      const sourceUnits = input.units.filter((u) => ids.has(u.id));
      const sessions = input.receipts
        .filter(
          (r) => r.arrival_source_id === source.id && r.status === "posted",
        )
        .sort(
          (a, b) =>
            (a.posted_at ?? "").localeCompare(b.posted_at ?? "") ||
            a.id.localeCompare(b.id),
        );
      const { units, unmappedReceipt } = projectUnits(
        input,
        sourceUnits,
        sessions,
      );
      const received = units.filter(
        (u) => u.outcome === "received" || u.outcome === "received_with_issue",
      ).length;
      /* The origin is a place. A carrier or driver never substitutes for it:
         a movement whose origin Site is not recorded says exactly that. */
      const fromSite = input.sites.find(
        (s) => s.id === source.from_site_id,
      )?.name;
      const from =
        source.kind === "customer-return" ||
        source.kind === "failed-delivery-return"
          ? source.sales_order_ref
            ? `Customer · ${source.sales_order_ref}`
            : "Customer"
          : fromSite ??
            (source.kind === "supplier-replacement"
              ? input.parties?.find((p) => p.id === source.party_id)?.name ??
                "Origin not recorded"
              : "Origin not recorded");
      return [
        {
          id: source.id,
          sourceId: source.id,
          sourceNo: source.source_no,
          sourceType: source.kind,
          documentWord: inboundDocumentWordOf(source.kind),
          documentNo: source.source_no,
          handoverGaps:
            source.kind === "transfer" || source.kind === "repair-return"
              ? arrivalHandoverDifferences(
                  units,
                  (input.sourceEvents ?? []).filter(
                    (e) => e.source_id === source.id,
                  ),
                )
              : [],
          party:
            input.parties?.find((p) => p.id === source.party_id)?.name ?? null,
          from,
          siteId: site.id,
          site: site.name,
          date: source.expected_date,
          poDate: null,
          so: null,
          expected: units.length,
          received,
          remaining: units.length - received,
          issues: units.filter((u) => u.outcome === "received_with_issue")
            .length,
          products: projectProducts(input, units, []),
          identitiesMissing:
            unmappedReceipt ||
            links.length === 0 ||
            ids.size !== links.length ||
            units.length !== links.length,
          sessionId: sessions.at(-1)?.id ?? null,
          sessions: projectSessions(input, sessions),
          units,
        },
      ];
    });
  return [...poRows, ...otherRows].sort(
    (a, b) =>
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.id.localeCompare(b.id),
  );
}
export function inboundStatusMatches(r: InboundArrival, status: string | null) {
  return (
    !status ||
    status === "all" ||
    /* `open` = the arrangement still owes physical work: goods not fully
       received, or its records are incomplete. Progress and exceptions are
       never mutually exclusive — `with-issue` overlaps every other word. */
    (status === "open" && (r.remaining > 0 || r.identitiesMissing)) ||
    (status === "expected" && !r.identitiesMissing && r.received === 0) ||
    (status === "part-received" &&
      !r.identitiesMissing &&
      r.received > 0 &&
      r.remaining > 0) ||
    (status === "received" &&
      r.expected > 0 &&
      r.remaining === 0 &&
      !r.identitiesMissing) ||
    (status === "with-issue" && r.issues > 0)
  );
}
export function filterInbound(
  rows: InboundArrival[],
  p: URLSearchParams,
  omit?: string,
) {
  const q = (p.get("q") ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (omit !== "status" && !inboundStatusMatches(r, p.get("status")))
      return false;
    if (omit !== "site" && p.get("site") && p.get("site") !== r.siteId)
      return false;
    if (
      omit !== "sourceType" &&
      p.get("sourceType") &&
      p.get("sourceType") !== r.sourceType
    )
      return false;
    if (p.get("source") && p.get("source") !== r.sourceId) return false;
    const start = p.get("date") || p.get("from");
    const end = p.get("to") || start;
    if (
      (start || end) &&
      (!r.date || (start && r.date < start) || (end && r.date > end))
    )
      return false;
    return (
      !q ||
      [
        r.sourceId,
        r.sourceNo,
        r.party,
        r.site,
        r.so,
        ...r.units.map((u) => u.code),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  });
}

export interface InboundRegisterFacets {
  status: Record<string, number>;
  sourceType: Record<string, number>;
  site: Record<string, number>;
}

/** One server-paged Inbound Register view. Facet counts always describe the
 * complete result set after the other filters are applied; they are never
 * calculated from the current browser page. */
export function buildInboundRegisterView(
  rows: InboundArrival[],
  p: URLSearchParams,
  offset = 0,
  limit = 50,
) {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.floor(limit));
  const statusRows = filterInbound(rows, p, "status");
  const sourceTypeRows = filterInbound(rows, p, "sourceType");
  const siteRows = filterInbound(rows, p, "site");
  const statusWords = [
    "all",
    "open",
    "expected",
    "part-received",
    "received",
    "with-issue",
  ];
  const facets: InboundRegisterFacets = {
    status: Object.fromEntries(
      statusWords.map((word) => [
        word,
        statusRows.filter((row) => inboundStatusMatches(row, word)).length,
      ]),
    ),
    sourceType: {},
    site: {},
  };
  for (const row of sourceTypeRows)
    facets.sourceType[row.sourceType] =
      (facets.sourceType[row.sourceType] ?? 0) + 1;
  for (const row of siteRows)
    facets.site[row.siteId] = (facets.site[row.siteId] ?? 0) + 1;

  const filtered = filterInbound(rows, p);
  return {
    rows: filtered.slice(safeOffset, safeOffset + safeLimit),
    total: filtered.length,
    facets,
  };
}
/** Monitor deep-link contract: exact date, governed Site ID, source type and source record. */
export function inboundHref(r: InboundArrival) {
  const p = new URLSearchParams({
    tab: "warehouse-inbound",
    site: r.siteId,
    sourceType: r.sourceType,
    source: r.sourceId,
  });
  if (r.date) p.set("date", r.date);
  return `/operation?${p}`;
}
