/**
 * ⏳ TEMPORARY — the Warehouse Schedule data contract, mirrored locally so the
 * UI (BUILD A) could be written while the projection (BUILD B) was still being
 * built in a parallel worktree.
 *
 * **BUILD B owns the real file** — `packages/shared/src/warehouse-schedule.ts`.
 * The moment its branch lands this module becomes a pure re-export and then
 * disappears; nothing here may grow a field, a default or a rule of its own.
 * A view helper belongs in `warehouse-schedule-view.ts`, never in this file:
 * its whole job is to be deletable.
 *
 * The shapes below are the card's contract verbatim. They are NOT a second
 * opinion about the data — where this file and the shared module disagree, the
 * shared module is right and this file is stale.
 */

/** Which half of the day's physical work a card belongs to. */
export type ScheduleDirection = "arrival" | "pickup";

/**
 * Whether the date is merely the portal's expectation or a date somebody
 * actually agreed to. `null` is a real answer — "nobody has said" — and never
 * upgrades to `scheduled` just because a date exists.
 */
export type ScheduleDateStatus = "expected" | "scheduled";

/** One ORIGINAL product line of the owning record. Never merged, never capped. */
export interface WarehouseScheduleLine {
  id: string;
  /** The goods category key. `null` when the owning record does not state one. */
  categoryKey: string | null;
  modelLabel: string | null;
  /** Physical Units this line expects. */
  plannedQty: number;
  /** Arrivals only. `null` = no owning record states it — NOT zero. */
  receivedQty: number | null;
  /** Pickups only. `null` = no owning record states it — NOT zero. */
  loadedQty: number | null;
  /** A SUBSET of `receivedQty`. Damaged goods arrived; they are never added on top. */
  damagedQty: number | null;
}

/** One dated piece of physical work, owned by exactly one source record. */
export interface WarehouseScheduleCard {
  id: string;
  direction: ScheduleDirection;
  /** The owning record's own stored type. A raw key never reaches the screen. */
  kind: string;
  sourceId: string;
  sourceRef: string;
  soRef: string | null;
  doRef: string | null;
  partyName: string | null;
  siteId: string | null;
  date: string | null;
  dateStatus: ScheduleDateStatus | null;
  lines: WarehouseScheduleLine[];
  /** The LOGISTICS side's own count. Never the warehouse's loading count. */
  driverConfirmedQty: number | null;
  logisticsName: string | null;
  relatedRecords: { id: string; ref: string; href: string }[];
  /** Opens receiving/loading work. It never posts a result by itself. */
  openHref: string | null;
  detailHref: string | null;
  overdue: boolean;
}

export interface WarehouseScheduleResult {
  cards: WarehouseScheduleCard[];
  /** The governed calendar window. The UI applies NO off-day rule of its own. */
  operatingDates: string[];
  loading: boolean;
  /** Non-empty means a feed FAILED — which is never the same as "nothing scheduled". */
  errors: { direction: ScheduleDirection; message: string }[];
}

export interface WarehouseScheduleInput {
  direction: ScheduleDirection;
  siteId: string | null;
  from: string;
}
