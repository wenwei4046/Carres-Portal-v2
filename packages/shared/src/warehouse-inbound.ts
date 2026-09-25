import { arrivalHandoverDifferences } from "./arrival-source";
import type {
  ArrivalSource,
  ArrivalSourceUnit,
  ArrivalSourceType,
} from "./arrival-source";
import { poSupplierDeliveryDateOf, type PoDatePromise } from "./po-workspace";
import { receivingSummaryOf } from "./warehouse-receipt";
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
    /* The governed receiving columns. Inbound READS them; the receiving
       engine is the only thing that writes them. */
    received_qty?: number | null;
    damaged_qty?: number | null;
    wrong_item_qty?: number | null;
    /** `exact_unit` mints a Unit ID per piece; `quantity` is counted stock
     *  and mints none. A quantity line missing Unit IDs is CORRECT. */
    identity_mode?: "exact_unit" | "quantity" | null;
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
  destinations: Array<{
    id: string;
    warehouse_id: string | null;
    name?: string | null;
  }>;
  units: Array<{
    id: string;
    unit_code: string;
    po_no: string | null;
    qty: number;
    sku?: string | null;
  }>;
  /** SKU → operator product name (product_skus.variant). Display only. */
  skuNames?: Array<{ sku: string; name: string | null; category?: string | null }>;
  receipts: Array<{
    id: string;
    po_id: string | null;
    arrival_source_id?: string | null;
    actual_site_id?: string | null;
    status: string;
    posted_at: string | null;
    grn_no?: string | null;
    goods_received_at?: string | null;
    /** The number on the SUPPLIER's own delivery note. Theirs, never ours. */
    do_number?: string | null;
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
  category?: string | null;
  sku: string | null;
  name: string | null;
  qty: number;
  received: number;
}
/**
 * THE FIVE GOVERNED RECEIVING QUANTITIES (COPY-STANDARD §"Receiving
 * quantities"), plus the physical one Inbound alone needs.
 *
 * PHYSICAL ARRIVAL AND ACCEPTED FULFILMENT ARE DIFFERENT FACTS, and Inbound
 * used to answer both with one number. Order Qty 10 — six correct, two
 * damaged, two never sent — reads:
 *
 * ```
 * arrivedQty           8   what came off the truck (custody)
 * receivedQty          6   correct goods accepted
 * damagedQty           2   present, unavailable
 * pendingDeliveryQty   4   what the supplier STILL owes
 * ```
 *
 * `damaged` and `wrong` never reduce `pendingDeliveryQty` — the supplier owes
 * a replacement, so the debt stands. FULLY ARRIVED IS NOT FULLY FULFILLED.
 *
 * Every number here comes from `receivingSummaryOf`, the one receiving
 * arithmetic the PO workspace and the Receiving Session already use. Inbound
 * adds no second subtraction engine.
 */
export interface InboundQuantities {
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  pendingDeliveryQty: number;
  /** Physical custody — `receivedQty + damagedQty + wrongItemQty`. */
  arrivedQty: number;
  /** FALSE when a posted receipt carries no readable result. An unknown
   *  quantity is never printed as a zero. */
  known: boolean;
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
  /** The governed Site that receives these goods — `""` when the purchasing
   *  destination has no warehouse linked. */
  siteId: string;
  site: string;
  /** FALSE when the destination is not linked to a governed Site. The row is
   *  still produced: an unlinked destination is a MAPPING GAP, never a
   *  statement that no goods are coming. */
  siteMapped: boolean;
  destinationId: string | null;
  /** The purchasing destination's own recorded name. Never an invented
   *  address, never a hardcoded partner name. */
  destinationName: string | null;
  /** The effective expected arrival — the supplier's evidenced answer where
   *  one exists, else the PO's own date. Filters and the Schedule read this. */
  date: string | null;
  /** @deprecated Use `poIssued`. Kept only so an older consumer still reads. */
  poDate: string | null;
  /* THREE DATES, THREE QUESTIONS (COPY-STANDARD).
     `PO Issued`             when Carres committed to the supplier
     `PO Delivery Date`      the original official date ON the PO
     `Supplier Delivery Date` the supplier's own evidenced answer, or none
     They were one column reading `Expected arrival`, which meant nobody could
     see whether a date was Carres's plan or the supplier's promise. */
  poIssued: string | null;
  poDeliveryDate: string | null;
  supplierDeliveryDate: string | null;
  so: number | null;
  /* ── PHYSICAL unit facts ────────────────────────────────────────────────
     These four count exact UNITS and answer "what physically happened to the
     pieces". `received` INCLUDES a damaged piece, because a damaged piece
     arrived. The Warehouse Schedule reads them and they are unchanged.
     What the SUPPLIER still owes is a different question, answered by
     `quantities` below — never by these. */
  expected: number;
  received: number;
  remaining: number;
  issues: number;
  /** The governed commercial answer: Order · Received · Damaged · Wrong ·
   *  Pending Delivery. This is what the Register prints. */
  quantities: InboundQuantities;
  /** Every product of this arrangement, by name — never `+N more`. */
  products: InboundProduct[];
  identitiesMissing: boolean;
  sessionId: string | null;
  /** Every posted Receiving Session of this arrangement, oldest first —
   *  actual receipt evidence stays viewable per session. */
  sessions: Array<{
    id: string;
    grnNo: string | null;
    /** The supplier's own delivery-note number for THIS receipt. */
    doNumber: string | null;
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
export function inboundDocumentWordOf(
  kind: ArrivalSourceType,
  source?: Pick<ArrivalSource, "attempt_id"> | null,
): string {
  /* 0490 — goods coming back from a failed Delivery Visit are named by the
     Delivery Order they went out on; no Case exists for them. */
  if (kind === "failed-delivery-return" && source?.attempt_id) return "DO No";
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
  r: Pick<InboundArrival, "identitiesMissing" | "quantities">,
): string {
  if (r.identitiesMissing || !r.quantities.known) return "Records incomplete";
  if (r.quantities.arrivedQty === 0) return "Not received yet";
  /* Everything may have ARRIVED and the supplier still owe correct goods —
     ten pieces on the floor with two damaged is `Part received`, because
     `Pending Delivery Qty` is 2. Arrival is not fulfilment. */
  if (r.quantities.pendingDeliveryQty > 0) return "Part received";
  return "Received";
}

/**
 * THE THREE ARRIVAL FILTERS (owner ruling 2026-09-15). One consistent model:
 *
 * ```
 * open      Not finished    correct goods are still owed
 * received  Received        the required correct goods are accepted
 * all       All arrivals    both
 * ```
 *
 * The five overlapping words this replaced (`Expected` · `Part received` ·
 * `With issue` beside the other two) asked the operator to hold a Venn
 * diagram in their head to find one pallet. Partial quantities and receipt
 * issues are FACTS ON THE ROW; they were never a way to slice the list.
 *
 * The keys keep their existing spelling so every Monitor and Schedule deep
 * link already in the wild still lands. A retired key falls back to `open` —
 * an old link shows the work, never an empty page.
 */
export const INBOUND_STATUS_FILTERS = [
  ["open", "Awaiting receipt"],
  ["received", "Fully received"],
  ["all", "All arrivals"],
] as const;

/** Rows whose purchasing destination has no governed Site. Asked for by
 *  name — never mixed into a Site's own list. */
export const INBOUND_UNMAPPED_SITE = "unmapped";

/** The row's exception lines — each one a specific fact with its Unit or
 * record named, never a generic flag. `todayIso` decides overdue honestly. */
export function inboundExceptionLines(
  r: InboundArrival,
  todayIso: string,
  fmt: (iso: string) => string = (iso) => iso,
): string[] {
  const lines: string[] = [];
  const q = r.quantities;
  if (r.identitiesMissing)
    lines.push("Unit IDs or Receiving results are not fully recorded");
  if (r.date && r.date < todayIso && q.known && q.pendingDeliveryQty > 0)
    lines.push(
      `Expected arrival was ${fmt(r.date)}. Pending Delivery Qty ${q.pendingDeliveryQty}`,
    );
  for (const u of r.units)
    if (u.outcome === "received_with_issue")
      lines.push(
        `${u.code} · ${u.issue === "wrong_item" ? "Wrong item" : "Damaged"}`,
      );
  /* COUNTED STOCK has no Unit ID to name, so its damage would have gone
     unsaid. The quantity speaks instead — and only for the pieces no Unit row
     above already accounted for, so nothing is reported twice. */
  const namedDamaged = r.units.filter(
    (u) => u.outcome === "received_with_issue" && u.issue !== "wrong_item",
  ).length;
  const namedWrong = r.units.filter(
    (u) => u.outcome === "received_with_issue" && u.issue === "wrong_item",
  ).length;
  if (q.known && q.damagedQty > namedDamaged)
    lines.push(`Damaged Qty ${q.damagedQty - namedDamaged} · counted stock`);
  if (q.known && q.wrongItemQty > namedWrong)
    lines.push(`Wrong Item Qty ${q.wrongItemQty - namedWrong} · counted stock`);
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
  const keyOf = (sku: string | null) => sku ?? " no-sku";
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
  return [...bySku.values()].map((product) => ({ ...product, category: input.skuNames?.find((row) => row.sku === product.sku)?.category ?? null })).sort((a, b) =>
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
    doNumber: s.do_number ?? null,
    postedAt: s.posted_at ?? null,
    receivedAt: s.goods_received_at ?? null,
    actualSite:
      input.sites.find((site) => site.id === s.actual_site_id)?.name ?? null,
  }));
}

/** An arrangement whose quantities cannot be read. Printed as absences, never
 *  as zeros — `0 received` and `not recorded` are different sentences. */
const UNKNOWN_QUANTITIES: InboundQuantities = {
  orderQty: 0,
  receivedQty: 0,
  damagedQty: 0,
  wrongItemQty: 0,
  pendingDeliveryQty: 0,
  arrivedQty: 0,
  known: false,
};

/** Wrap the ONE receiving arithmetic. Nothing here subtracts. */
function quantitiesFrom(
  lines: ReadonlyArray<{
    qty: number;
    received_qty: number;
    damaged_qty?: number | null;
    wrong_item_qty?: number | null;
  }>,
  known: boolean,
): InboundQuantities {
  if (!known) return UNKNOWN_QUANTITIES;
  const s = receivingSummaryOf(lines);
  return {
    ...s,
    arrivedQty: s.receivedQty + s.damagedQty + s.wrongItemQty,
    known: true,
  };
}

/** A source with no ordered-line document — a transfer, a return, a repair.
 *  Each exact Unit becomes one single-piece line, so the SAME arithmetic
 *  answers it. `unknown` outcomes make the whole tally unknown. */
function quantitiesFromUnits(
  units: InboundArrival["units"],
  known: boolean,
): InboundQuantities {
  return quantitiesFrom(
    units.map((u) => ({
      qty: 1,
      received_qty: u.outcome === "received" ? 1 : 0,
      damaged_qty:
        u.outcome === "received_with_issue" && u.issue !== "wrong_item" ? 1 : 0,
      wrong_item_qty:
        u.outcome === "received_with_issue" && u.issue === "wrong_item" ? 1 : 0,
    })),
    known,
  );
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
/** What the `To` cell prints when no governed Site owns the destination. The
 *  destination's OWN recorded name, said plainly — never an invented address
 *  and never a blank that reads as "nothing coming here". */
function destinationName(
  destination: { name?: string | null } | undefined,
): string {
  return destination?.name
    ? `${destination.name} — no Site linked`
    : "Destination not linked to a Site";
}

export function inboundArrivals(input: InboundInput): InboundArrival[] {
  const unresolved = new Set(inboundUnresolvedSources(input));
  const poRows = input.pos
    .filter((p) => p.status !== "cancelled" && !unresolved.has(p.id))
    .flatMap((p) => {
      /* AN UNLINKED DESTINATION IS A MAPPING GAP, NOT AN EMPTY SHELF.
         This returned `[]` until 2026-09-15, and 14 live purchase orders
         pointing at the `Ohana` destination — 39 minted Units between them —
         were simply absent from Inbound with nothing on screen to say so.
         The row is produced either way; `siteMapped` carries the truth. */
      const destination = p.destination_id
        ? input.destinations.find((d) => d.id === p.destination_id)
        : undefined;
      const siteId = p.destination_id ? destination?.warehouse_id : p.warehouse_id;
      const site = input.sites.find((s) => s.id === siteId);
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
      /* Only `exact_unit` lines promise a Unit ID per piece. A `quantity`
         line is COUNTED STOCK and mints none — calling that arrangement
         `Records incomplete` accused the operator of a gap that does not
         exist. A line whose mode was never recorded is not judged either. */
      const exactUnitQty = poLines
        .filter((l) => l.identity_mode === "exact_unit")
        .reduce((n, l) => n + l.qty, 0);
      const identityModesKnown =
        poLines.length > 0 && poLines.every((l) => l.identity_mode != null);
      /* Purchasing's ONE authority on what the supplier actually answered. */
      const supplierDate = poSupplierDeliveryDateOf(
        input.promises?.filter((r) => r.po_id === p.id),
        p.version ?? 1,
      );
      return [
        {
          id: p.id,
          sourceId: p.id,
          sourceType: "supplier-delivery" as const,
          documentWord: inboundDocumentWordOf("supplier-delivery"),
          documentNo: p.id,
          party: supplierName,
          from: supplierName ?? "Origin not recorded",
          siteId: site?.id ?? "",
          site: site?.name ?? destinationName(destination),
          siteMapped: Boolean(site),
          destinationId: p.destination_id,
          destinationName: destination?.name ?? null,
          date: supplierDate ?? p.official_delivery_date ?? p.eta_date,
          poDate: p.placed_at,
          poIssued: p.placed_at,
          poDeliveryDate: p.official_delivery_date,
          supplierDeliveryDate: supplierDate,
          so: p.so,
          expected: units.length,
          received,
          remaining: units.length - received,
          issues: units.filter((u) => u.outcome === "received_with_issue")
            .length,
          products: projectProducts(input, units, poLines),
          quantities: quantitiesFrom(
            poLines.map((l) => ({
              qty: l.qty,
              received_qty: l.received_qty ?? 0,
              damaged_qty: l.damaged_qty,
              wrong_item_qty: l.wrong_item_qty,
            })),
            !unmappedReceipt && poLines.length > 0,
          ),
          identitiesMissing:
            unmappedReceipt ||
            (identityModesKnown
              ? exactUnitQty !== units.length
              : sourceUnits.length === 0 ||
                sourceUnits.some((u) => u.qty !== 1) ||
                (input.lines !== undefined &&
                  poLines.reduce((n, l) => n + l.qty, 0) !== units.length)),
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
      /* A transfer/return/repair names its destination Site DIRECTLY — there
         is no purchasing destination in between, so there is no mapping gap
         this row could have. */
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
          documentWord: inboundDocumentWordOf(source.kind, source),
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
          siteMapped: true,
          destinationId: null,
          destinationName: null,
          date: source.expected_date,
          poDate: null,
          poIssued: null,
          poDeliveryDate: null,
          supplierDeliveryDate: null,
          so: null,
          expected: units.length,
          received,
          remaining: units.length - received,
          issues: units.filter((u) => u.outcome === "received_with_issue")
            .length,
          products: projectProducts(input, units, []),
          quantities: quantitiesFromUnits(units, !unmappedReceipt),
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
/** `Received` = the required CORRECT goods are accepted. Damaged and wrong
 *  goods leave the arrangement unfinished, because the supplier still owes a
 *  replacement — `Pending Delivery Qty` is the one number that decides. */
function inboundFulfilled(r: InboundArrival): boolean {
  return (
    !r.identitiesMissing &&
    r.quantities.known &&
    r.quantities.orderQty > 0 &&
    r.quantities.pendingDeliveryQty === 0
  );
}

export function inboundStatusMatches(r: InboundArrival, status: string | null) {
  if (!status || status === "all") return true;
  if (status === "received") return inboundFulfilled(r);
  /* `open` and every retired key: the arrangement still owes correct goods,
     or its records cannot answer. */
  return !inboundFulfilled(r);
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
    /* SITE IS A TAB, AND AN UNMAPPED ROW BELONGS TO NO TAB.
       It is reachable only by asking for it by name (`site=unmapped`), so a
       Site's own list never silently gains goods bound somewhere else — and
       the Schedule, which asks by Site or not at all, is untouched. */
    if (omit !== "site") {
      const site = p.get("site");
      if (site === INBOUND_UNMAPPED_SITE) {
        if (r.siteMapped) return false;
      } else if (site) {
        if (site !== r.siteId || !r.siteMapped) return false;
      } else if (!r.siteMapped) return false;
    }
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
  const statusWords = INBOUND_STATUS_FILTERS.map(([key]) => key);
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
  for (const row of siteRows) {
    const key = row.siteMapped ? row.siteId : INBOUND_UNMAPPED_SITE;
    facets.site[key] = (facets.site[key] ?? 0) + 1;
  }

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
