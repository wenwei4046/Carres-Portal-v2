/**
 * DELIVERY ORDERS REGISTER — the arithmetic behind the document register.
 * Owner UI correction 2026-09-06 · `docs/delivery/MASTER.md` §8.
 *
 * PURE. No React, no I/O. The register's rows, its WORK TO DO queues, its
 * DOCUMENT STATUS counts and the trip-scope goods derivation all live here so
 * the rail count and the listing it filters cannot be two different numbers
 * (Architecture Law D), and so the page component stays composition.
 *
 * ── WHAT THE QUEUES ARE, AND WHAT THEY ARE NOT ──────────────────────────────
 *
 * A WORK TO DO row is a lens over CANONICAL recorded facts only:
 *
 *   Record delivery result       derived `Out for delivery` — the §4 chain's
 *                                Received by Logistics with no result yet
 *   Upload delivery photo        a recorded Delivered/Partially Delivered
 *                                result whose T6 photo ledger is KNOWN and
 *                                empty (an unknown ledger claims nothing)
 *   Upload signed Delivery Order the same recorded result with no signed
 *                                document on file (`orders.do_file_path`)
 *
 * `Check delivery proof` (Operations' Proof Accepted / More Proof Required /
 * Proof Rejected review, MASTER §6) has NO canonical record yet — no table
 * stores a proof review — so that queue is deliberately not implemented
 * rather than faked. It joins when the review record exists.
 *
 * One document sits in at most ONE primary queue (the order above); completed
 * work leaves the queue but the document stays in the status views forever.
 */

import {
  deliveryGroupOf,
  deliveryOrderStatusOf,
  type DeliveryHandoverKind,
  type DeliveryOrderStatus,
} from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import type { DeliveryOrderAttemptRow, DeliveryOrderRow } from "@/lib/queries";
import { conciseLocality, requestedDeliveryOf } from "./sales-order-columns";
import { lineName } from "./sales-order-facts";

/** ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD, Delivery section). */
export const DOR_COPY = {
  page: "Delivery Orders",
  docTitle: "Delivery Orders — Carres",
  search: "Search delivery orders…",
  railWork: "WORK TO DO",
  railStatus: "DOCUMENT STATUS",
  allDocuments: "All",
  recordResult: "Record delivery result",
  uploadPhoto: "Upload delivery photo",
  uploadSignedDo: "Upload signed Delivery Order",
  loadFailed: "The register could not be loaded",
  tryAgain: "Try again",
  /** Governed absences — muted, never a dash (COPY-STANDARD 2026-08-15). */
  noConfirmedDate: "No confirmed date",
  noTime: "No time agreed",
  noLogistics: "No logistics picked",
  notDelivered: "Not delivered yet",
  noPhoto: "No delivery photo yet",
  photoSaved: "Delivery photo saved",
  noSignedDo: "No signed document yet",
  signedDoOnFile: "Signed document on file",
  noGoods: "No items on this trip",
  emptyRegister:
    "No delivery orders yet — the system issues one when a trip's goods, logistics and date are ready. The Order Route on each Sales Order shows what is still open.",
  emptyFiltered: "No matching delivery orders.",
} as const;

/** The result an attempt records, in the governed three words (MASTER §6). */
export const DELIVERY_RESULT_LABEL: Record<"delivered" | "partial" | "failed", string> = {
  delivered: "Delivered",
  partial: "Partially Delivered",
  failed: "Failed Delivery",
};

export type DoWorkQueue = "record_result" | "upload_photo" | "upload_signed_do";

export const DO_WORK_QUEUES: readonly DoWorkQueue[] = [
  "record_result",
  "upload_photo",
  "upload_signed_do",
];

export const DO_QUEUE_LABEL: Record<DoWorkQueue, string> = {
  record_result: DOR_COPY.recordResult,
  upload_photo: DOR_COPY.uploadPhoto,
  upload_signed_do: DOR_COPY.uploadSignedDo,
};

/** The document ladder's five kinds, in register reading order. */
export const DO_STATUS_KEYS: readonly DeliveryOrderStatus["kind"][] = [
  "created",
  "out_for_delivery",
  "delivered",
  "exception",
  "cancelled",
];

export interface DoRegisterRow {
  id: string;
  doNumber: string;
  orderId: string;
  so: number;
  customer: string;
  /** The SO's promise to the customer — `Requested Delivery Date`. */
  requestedDelivery: string | null;
  requestedTbd: boolean;
  /** This trip's confirmed operational date — `Confirmed Delivery`. */
  confirmedDelivery: string | null;
  confirmedTime: string | null;
  location: string;
  /** The partner named on the document. */
  logisticsPartner: string | null;
  status: DeliveryOrderStatus;
  issuedAt: string;
  /** The LATEST recorded result, or null while none exists. */
  latestResult: "delivered" | "partial" | "failed" | null;
  /** The T6 photo ledger: null = unknown (older payload); else its length>0. */
  photosPresent: boolean | null;
  /** `orders.do_file_path` — the signed document on file. */
  signedDoPresent: boolean;
  /** THIS TRIP's goods lines (trip_groups NULL = the whole order). */
  lines: Array<{ id?: string; sku: string; qty: number; attrs?: Record<string, unknown> | null }>;
  goodsSummary: string;
  /** The ONE primary work queue this document sits in, or null. */
  queue: DoWorkQueue | null;
}

/**
 * THIS TRIP's goods — the SAME derivation the DO object page and the print
 * path run (Law D — one arithmetic): trip_groups NULL/empty = the whole
 * order; a split trip carries only its groups' lines.
 */
export function tripLinesOf<T extends { sku: string }>(
  lines: readonly T[],
  tripGroups: readonly string[] | null | undefined,
): T[] {
  if (!tripGroups || tripGroups.length === 0) return [...lines];
  const scope = new Set(tripGroups);
  return lines.filter((l) => {
    const g = deliveryGroupOf(l.sku);
    return g !== null && scope.has(g);
  });
}

/** Two named items and a truthful tail — the register summary shape. */
function goodsSummaryOf(
  lines: readonly { sku: string; qty: number; attrs?: Record<string, unknown> | null }[],
): string {
  if (lines.length === 0) return "";
  const named = lines.slice(0, 2).map((l) => `${lineName(l)} ×${l.qty}`);
  const rest = lines.length - 2;
  return rest > 0 ? `${named.join(" · ")} · +${rest} more` : named.join(" · ");
}

/**
 * THE MISSING EVIDENCE of a recorded delivered result — the ONE arithmetic
 * (Architecture Law D) behind this register's two upload queues AND Monitor's
 * `Upload delivery proof` queue (owner correction 2026-09-07). A result that
 * has not reached the customer needs no proof; an UNKNOWN photo ledger
 * (older payload) claims nothing; the signed document is `orders.do_file_path`.
 */
export interface MissingDeliveryProof {
  photo: boolean;
  signedDo: boolean;
}

export function missingDeliveryProofOf(row: {
  latestResult: DoRegisterRow["latestResult"];
  photosPresent: boolean | null;
  signedDoPresent: boolean;
}): MissingDeliveryProof {
  const reached = row.latestResult === "delivered" || row.latestResult === "partial";
  if (!reached) return { photo: false, signedDo: false };
  return {
    /* photosPresent === null is UNKNOWN — never a missing photo. */
    photo: row.photosPresent === false,
    signedDo: !row.signedDoPresent,
  };
}

/** The ONE primary queue (priority order; a voided document queues nowhere). */
export function doWorkQueueOf(row: {
  status: DeliveryOrderStatus;
  latestResult: DoRegisterRow["latestResult"];
  photosPresent: boolean | null;
  signedDoPresent: boolean;
}): DoWorkQueue | null {
  if (row.status.kind === "cancelled") return null;
  if (row.status.kind === "out_for_delivery") return "record_result";
  const missing = missingDeliveryProofOf(row);
  if (missing.photo) return "upload_photo";
  if (missing.signedDo) return "upload_signed_do";
  return null;
}

/** PostgREST may embed a to-one overlay as an object or a one-row array. */
function overlayOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function buildDoRegisterRow(
  r: DeliveryOrderRow,
  attemptsByDo: ReadonlyMap<string, DeliveryOrderAttemptRow[]>,
  handoverByDoId: ReadonlyMap<string, DeliveryHandoverKind[]>,
): DoRegisterRow {
  const attempts = attemptsByDo.get(r.do_number) ?? [];
  const status = deliveryOrderStatusOf({
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    attempts: attempts.map((a) => ({
      result: a.result,
      reasonKey: a.reason_key,
      recordedAt: a.recorded_at,
    })),
    handoverEvents: (handoverByDoId.get(r.id) ?? []).map((kind) => ({ kind })),
  });
  const latest = [...attempts].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  const control = overlayOf(r.orders.ops_order_control);
  const photos = control?.delivery_photos;
  const lines = tripLinesOf(r.orders.order_lines ?? [], r.trip_groups);
  const base = {
    status,
    latestResult: (latest?.result ?? null) as DoRegisterRow["latestResult"],
    photosPresent: photos === undefined || photos === null ? null : photos.length > 0,
    signedDoPresent: Boolean(r.orders.do_file_path),
  };
  return {
    id: r.id,
    doNumber: r.do_number,
    orderId: r.orders.id,
    so: r.orders.so,
    customer: displayCustomerName(r.orders.customer_name ?? "") || "No customer name",
    /* The SAME `Requested Delivery Date` arithmetic Monitor and the Sales
       Orders register read — never a second copy of the tbd guard. */
    requestedDelivery: requestedDeliveryOf(r.orders).iso,
    requestedTbd: requestedDeliveryOf(r.orders).tbd,
    confirmedDelivery: r.delivery_date ? r.delivery_date.slice(0, 10) : null,
    confirmedTime: r.time_slot,
    location: conciseLocality(
      r.orders.customer_address_city,
      r.orders.customer_address_state,
    ),
    logisticsPartner: r.logistics_partner,
    issuedAt: r.issued_at,
    lines,
    goodsSummary: goodsSummaryOf(lines),
    queue: doWorkQueueOf(base),
    ...base,
  };
}

export interface DoRegisterFilters {
  queue: DoWorkQueue | null;
  status: DeliveryOrderStatus["kind"] | null;
}

export function matchesDoFilters(row: DoRegisterRow, f: DoRegisterFilters): boolean {
  return (
    (f.queue === null || row.queue === f.queue) &&
    (f.status === null || row.status.kind === f.status)
  );
}

export interface DoRegisterRails {
  work: Record<DoWorkQueue, number>;
  status: Record<DeliveryOrderStatus["kind"], number>;
  total: number;
}

/**
 * Each group's counts are computed over the rows the OTHER group has already
 * narrowed — a count is always what clicking that row will actually show.
 */
export function buildDoRegisterRails(
  rows: readonly DoRegisterRow[],
  f: DoRegisterFilters,
): DoRegisterRails {
  const forWork = rows.filter((r) => f.status === null || r.status.kind === f.status);
  const forStatus = rows.filter((r) => f.queue === null || r.queue === f.queue);
  const work = { record_result: 0, upload_photo: 0, upload_signed_do: 0 };
  for (const r of forWork) if (r.queue) work[r.queue] += 1;
  const status: DoRegisterRails["status"] = {
    created: 0,
    out_for_delivery: 0,
    delivered: 0,
    exception: 0,
    cancelled: 0,
  };
  for (const r of forStatus) status[r.status.kind] += 1;
  return { work, status, total: forStatus.length };
}

/** The footer sentence — documents, counted truthfully. */
export function doRegisterFooter(shown: number, total: number): string {
  const word = total === 1 ? "delivery order" : "delivery orders";
  return shown === total ? `${shown} ${word}` : `${shown} of ${total} delivery orders`;
}
