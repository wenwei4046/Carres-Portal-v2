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
  lines?: Array<{ po_id: string; qty: number; destination_id: string | null }>;
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
  }>;
  receipts: Array<{
    id: string;
    po_id: string | null;
    arrival_source_id?: string | null;
    actual_site_id?: string | null;
    status: string;
    posted_at: string | null;
  }>;
  results: Array<{
    receipt_id: string;
    stock_item_id: string;
    outcome: string;
    issue_kind: string | null;
  }>;
}
export interface InboundArrival {
  id: string;
  sourceId: string;
  sourceType: ArrivalSourceType;
  sourceNo?: string;
  handoverGaps?: ReturnType<typeof arrivalHandoverDifferences>;
  party: string | null;
  siteId: string;
  site: string;
  date: string | null;
  poDate: string | null;
  so: number | null;
  expected: number;
  received: number;
  remaining: number;
  issues: number;
  identitiesMissing: boolean;
  sessionId: string | null;
  units: Array<{
    id: string;
    code: string;
    outcome: string;
    issue: string | null;
    receivedSite?: string | null;
  }>;
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
  const units = sourceUnits
    .filter((u) => u.qty === 1)
    .map((u) => ({
      id: u.id,
      code: u.unit_code,
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
      return [
        {
          id: p.id,
          sourceId: p.id,
          sourceType: "supplier-delivery" as const,
          party:
            input.suppliers.find((s) => s.id === p.supplier_id)?.name ?? null,
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
          identitiesMissing:
            unmappedReceipt ||
            sourceUnits.length === 0 ||
            sourceUnits.some((u) => u.qty !== 1) ||
            (input.lines !== undefined &&
              input.lines
                .filter((l) => l.po_id === p.id)
                .reduce((n, l) => n + l.qty, 0) !== units.length),
          sessionId: sessions.at(-1)?.id ?? null,
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
      return [
        {
          id: source.id,
          sourceId: source.id,
          sourceNo: source.source_no,
          sourceType: source.kind,
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
          identitiesMissing:
            unmappedReceipt ||
            links.length === 0 ||
            ids.size !== links.length ||
            units.length !== links.length,
          sessionId: sessions.at(-1)?.id ?? null,
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
