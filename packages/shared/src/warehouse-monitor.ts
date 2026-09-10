import type { IsoDate } from "./working-days";
import type { WarehouseOutboundCard } from "./warehouse-outbound";

/**
 * WAREHOUSE MONITOR — the one projection of the module's dated work
 * (owner replacement Card 2026-09-06; docs/stock/MASTER.md §2).
 *
 * Monitor is the ONLY Warehouse Calendar-summary page. It projects both
 * directions of physical work — ARRIVAL and PICKUP — from their owning
 * modules' authoritative facts. It is read-only: nothing here completes
 * receiving, inventory, loading or delivery, and nothing here stores a
 * second copy of a date, a time or a status.
 *
 * ── EVERY TIME SAYS WHAT IT MEANS ───────────────────────────────────────────
 * A bare `09:00` on a calendar card is a guess wearing a clock. The governed
 * sentence is `<meaning> <time>` — `Supplier arrival 09:00–10:00`,
 * `Driver pickup 14:30` — and when the owning workflow recorded no time the
 * card says exactly `Time not provided`, never an invented hour.
 */

// ── The event taxonomy ───────────────────────────────────────────────────────

export type WarehouseMonitorEventKind =
  // ARRIVAL
  | "supplier_arrival"
  | "transfer_arrival"
  | "customer_return"
  | "repair_return"
  // PICKUP
  | "customer_delivery_pickup"
  | "transfer_pickup"
  | "supplier_return_pickup"
  | "repair_pickup";

export type WarehouseMonitorGroup = "arrival" | "pickup";

export const WAREHOUSE_MONITOR_EVENT_LABEL: Record<
  WarehouseMonitorEventKind,
  string
> = {
  supplier_arrival: "Supplier arrival",
  transfer_arrival: "Transfer arrival",
  customer_return: "Customer/failed-delivery return",
  repair_return: "Return from repair",
  customer_delivery_pickup: "Customer-delivery pickup",
  transfer_pickup: "Transfer pickup",
  supplier_return_pickup: "Supplier-return pickup",
  repair_pickup: "Repair pickup",
};

export function warehouseMonitorGroupOf(
  kind: WarehouseMonitorEventKind,
): WarehouseMonitorGroup {
  switch (kind) {
    case "supplier_arrival":
    case "transfer_arrival":
    case "customer_return":
    case "repair_return":
      return "arrival";
    default:
      return "pickup";
  }
}

/** The two group headings a Monitor day prints. */
export const WAREHOUSE_MONITOR_GROUP_LABEL: Record<
  WarehouseMonitorGroup,
  string
> = {
  arrival: "ARRIVAL",
  pickup: "PICKUP",
};

// ── The event ────────────────────────────────────────────────────────────────

export interface WarehouseMonitorEvent {
  kind: WarehouseMonitorEventKind;
  group: WarehouseMonitorGroup;
  /** The event name the card prints — `Supplier arrival`, … */
  label: string;
  eventDate: IsoDate;
  /** The governed time sentence — `Driver pickup 14:30` · `Time not provided`. */
  timeSentence: string;
  /** `hh:mm` when a time exists; `~` sorts every untimed event last. */
  timeSortKey: string;
  /** The governed Site the work happens at ("" when not recorded). */
  site: string;
  /** The source document identity — `PO-…` · `DO-… · SO-…`. */
  sourceLabel: string;
  /** Who the warehouse deals with — the supplier, or the Logistics Partner. */
  party: string;
  /** One plain line of what moves — counts from the owning module's rows. */
  detail: string;
  /** The deep-link scope the card opens, already filtered (card §4). */
  open:
    | { tab: "warehouse-inbound"; date: IsoDate; site: string | null; po: string }
    | { tab: "warehouse-outbound"; date: IsoDate; site: string | null; do: string };
  /** Read-only source-document door (the formal DO), when one exists. */
  sourceHref: string | null;
}

/**
 * `<meaning> <time>` when the owning workflow recorded a time; the exact
 * `Time not provided` when it did not. Never a bare clock.
 */
export function warehouseMonitorTimeSentence(
  meaning: string,
  time: string | null | undefined,
): string {
  const t = (time ?? "").trim();
  return t ? `${meaning} ${t}` : "Time not provided";
}

/** The governed empty-date sentence — Monitor covers both directions. */
export function warehouseMonitorEmptyDaySentence(dateLabel: string): string {
  return `No arrivals or pickups on ${dateLabel}. Choose another date.`;
}

// ── PICKUP events — projected from the Delivery schedule feed ────────────────

/**
 * One PICKUP event per active customer-DO card. The time meaning is the
 * DRIVER's pickup: the arranged collection window when Delivery recorded
 * one, else `Time not provided`.
 */
export function warehouseMonitorPickupEvents(
  cards: readonly WarehouseOutboundCard[],
): WarehouseMonitorEvent[] {
  return cards.map((card) => {
    const window = card.expectedCollectionWindow;
    return {
      kind: "customer_delivery_pickup",
      group: "pickup",
      label: WAREHOUSE_MONITOR_EVENT_LABEL.customer_delivery_pickup,
      eventDate: card.eventDate,
      timeSentence: warehouseMonitorTimeSentence("Driver pickup", window),
      timeSortKey: timeSortKeyOf(window),
      site: card.fromLocation,
      sourceLabel: `${card.doNumber} · ${card.source}`,
      party: card.logisticsPartner,
      detail: `${card.unitsRequired} Unit${card.unitsRequired === 1 ? "" : "s"} to ${card.toCustomer}`,
      open: {
        tab: "warehouse-outbound",
        date: card.eventDate,
        site: card.fromLocation || null,
        do: card.doNumber,
      },
      sourceHref: card.deliveryOrderHref,
    };
  });
}

// ── ARRIVAL events — projected from Purchasing's expected arrivals ───────────

/**
 * One expected supplier arrival, as Purchasing's PO row states it. Pure
 * input: the caller resolves supplier and Site names from its own reads.
 * A PO with no `eta_date` or nothing still owed projects no event —
 * an absent fact is absent, never invented.
 */
export interface WarehouseExpectedArrival {
  poId: string;
  supplierName: string | null;
  /** The governed Site the PO is bound for (null when not resolvable). */
  siteName: string | null;
  /** The governed Site ID — the exact value Inbound's `site` filter takes.
   *  Names collide and get renamed; the ID is the deep-link contract. */
  siteId?: string | null;
  /** Purchasing's expected arrival date (date only — no time exists). */
  etaDate: IsoDate | null;
  /** Pending Delivery Qty — what the supplier still owes. */
  pendingQty: number;
}

export function warehouseMonitorArrivalEvents(
  arrivals: readonly WarehouseExpectedArrival[],
): WarehouseMonitorEvent[] {
  const out: WarehouseMonitorEvent[] = [];
  for (const a of arrivals) {
    if (!a.etaDate || a.pendingQty <= 0) continue;
    out.push({
      kind: "supplier_arrival",
      group: "arrival",
      label: WAREHOUSE_MONITOR_EVENT_LABEL.supplier_arrival,
      eventDate: a.etaDate,
      /* Purchasing stores an arrival DATE; no workflow records an arrival
         time today, so every supplier arrival honestly reads the same. */
      timeSentence: warehouseMonitorTimeSentence("Supplier arrival", null),
      timeSortKey: timeSortKeyOf(null),
      site: a.siteName ?? "",
      sourceLabel: a.poId,
      party: a.supplierName ?? "Supplier not recorded",
      detail: `Pending Delivery Qty ${a.pendingQty}`,
      open: {
        tab: "warehouse-inbound",
        date: a.etaDate,
        site: a.siteId ?? null,
        po: a.poId,
      },
      sourceHref: null,
    });
  }
  return out;
}

// ── Day ordering ─────────────────────────────────────────────────────────────

/**
 * The events of one date, arranged by actual time: timed events first in
 * clock order, untimed after them (arrivals before pickups, then by source)
 * — so the operator reads the day top-to-bottom as it will happen.
 */
export function warehouseMonitorDayEvents(
  events: readonly WarehouseMonitorEvent[],
  date: IsoDate,
): WarehouseMonitorEvent[] {
  return events
    .filter((e) => e.eventDate === date)
    .sort((a, b) => {
      /* Code-point order, deliberately: ICU collation sorts the untimed
         sentinel `~` BEFORE digits, which would put unknown times first. */
      if (a.timeSortKey !== b.timeSortKey)
        return a.timeSortKey < b.timeSortKey ? -1 : 1;
      if (a.group !== b.group) return a.group === "arrival" ? -1 : 1;
      return a.sourceLabel.localeCompare(b.sourceLabel);
    });
}

/** `hh:mm` from the first clock inside a stored window/time; `~` when none. */
function timeSortKeyOf(time: string | null | undefined): string {
  const m = /(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return "~";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// ── Pickup identities and the two evidence records (card §8) ────────────────

/** Never a combined "NETS driver" — the company and the person are
 *  separate stored facts, displayed separately. */
export function warehouseAssignedDriverLine(
  partner: string,
  driverName: string | null | undefined,
): string {
  const d = (driverName ?? "").trim();
  return d || `Waiting for ${partner} to assign a driver`;
}

/**
 * The loading act's own name — `Record 2 Units loaded to Ahmad Rahman`.
 * Falls back to the Logistics Partner when no driver is assigned yet;
 * the actual receiver is still named on the record itself.
 */
export function warehouseRecordLoadedSentence(
  count: number,
  receiver: string,
): string {
  return `Record ${count} Unit${count === 1 ? "" : "s"} loaded to ${receiver}`;
}

/**
 * The two evidence records, kept separate forever (card §8):
 *
 *   Warehouse loaded    what the identified operator scanned and submitted
 *   Driver collected    what the driver independently confirmed
 *
 * Only matching exact-Unit evidence changes `Who has it` — the server's
 * rule; these lines merely refuse to blur the two facts into one.
 */
export function warehouseLoadedLine(card: {
  handedOver: number;
  unitsRequired: number;
}): string {
  if (card.handedOver === 0) return "Warehouse loaded — nothing yet";
  return `Warehouse loaded ${card.handedOver} of ${card.unitsRequired} Units`;
}

export function driverCollectedLine(card: {
  logisticsPartner: string;
  driverName: string | null;
  actualCollectionAt: string | null;
}): string {
  const who = (card.driverName ?? "").trim() || card.logisticsPartner;
  return card.actualCollectionAt
    ? `${who} confirmed collection`
    : `${who} has not confirmed collection yet`;
}

/**
 * The specific per-Unit consequence when a loaded batch and the collection
 * do not match — never a generic "Needs checking". `holder` is where the
 * Unit factually remains (its current Site).
 */
export function warehouseUnitNotCollectedSentence(
  unitId: string,
  confirmer: string,
  holder: string,
): string {
  return `${unitId} was not confirmed by ${confirmer}. It remains with ${holder}.`;
}
