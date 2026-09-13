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
 *   Check delivery proof         a delivered/partially delivered result whose
 *                                newest file no review has judged yet — the
 *                                §6.1 review record (0489, Card 13). A later
 *                                upload reopens it; `Proof Rejected` / `More
 *                                Proof Required` reopen the UPLOAD queue with
 *                                the reason instead.
 *
 * One document sits in at most ONE primary queue (the order above); completed
 * work leaves the queue but the document stays in the status views forever.
 */

import {
  deliveryGroupOf,
  deliveryOrderStatusOf,
  signedDeliveryDocumentOf,
  latestEvidenceAtOf,
  proofDecisionLabel,
  proofReviewStateOf,
  type DeliveryAttemptEvidenceRow,
  type DeliveryHandoverKind,
  type DeliveryOrderStatus,
  type DeliveryProofReviewRow,
  type ProofReviewState,
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
  /** §6.1 — the review queue; the row's door is the DO object's Evidence
   *  section, where the three acts live. */
  checkProof: "Check delivery proof",
  loadFailed: "The register could not be loaded",
  tryAgain: "Try again",
  /** The register's own column words (owner ruling 2026-09-11). */
  driverSubmission: "Driver submission",
  photos: "Photos",
  videos: "Videos",
  signedDo: "Signed Delivery Order",
  openPhotos: "Open delivery photos",
  openVideos: "Open delivery videos",
  openSignedDo: "Open the signed Delivery Order",
  /** Governed absences — muted, never a dash (COPY-STANDARD 2026-08-15). */
  noConfirmedDate: "No confirmed date",
  noTime: "No time agreed",
  noLogistics: "No logistics picked",
  notDelivered: "Not delivered yet",
  noPhoto: "No delivery photo yet",
  /** A video is never automatically required (owner ruling 2026-09-11), so
   *  this absence is only ever stated inside the player a person opened. */
  noVideo: "No delivery video",
  photoSaved: "Delivery photo saved",
  noSignedDo: "No signed document yet",
  signedDoOnFile: "Signed document on file",
  notRecorded: "Not recorded",
  noGoods: "No items on this trip",
  /** An upload is an upload — never a verdict (owner ruling 2026-09-11). */
  submissionMeaning:
    "An uploaded file records what the driver sent. It is not proof accepted and not a successful delivery.",
  unboundNote:
    "delivery files on this Sales Order name no delivery order, so they are counted for none of them. Open the Sales Order to see them.",
  signedDoMissing: "This delivery order has no signed document on file.",
  signedDoFailed: "The signed Delivery Order could not be opened",
  mediaFailed: "The driver submission could not be loaded",
  loading: "Loading…",
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

/**
 * ⭐ DRIVER SUBMISSION — WHAT CAME BACK FROM **THIS** TRIP (owner ruling
 * 2026-09-11, replacing the default `Proof Status` column).
 *
 * THE DEFECT THIS EXISTS TO KILL. The register's media source is the SALES
 * ORDER's ledger (`ops_order_control.delivery_photos`). An order with two
 * Delivery Orders has ONE ledger, so counting it per row would have told an
 * operator that DO-A carried three photos when all three came back from DO-B —
 * and the warehouse's own handover evidence (`delivery_handover_evidence`)
 * describes a load leaving the warehouse, not goods reaching a customer. The
 * attach door now stamps the verified DO number on every new entry, and this
 * is the ONE place that reads the stamp.
 *
 * THE THREE ANSWERS ARE DIFFERENT, AND STAY DIFFERENT:
 *
 *   known === false   the ledger never reached this screen — UNKNOWN.
 *                     An unknown is printed as an unknown, never as `0`.
 *   photos/videos     files that name THIS document. A real count.
 *   unbound           files this order holds that name NO document. They
 *                     belong to no row's count — the Sales Order still shows
 *                     them, because that is the scope they actually prove.
 */
export interface DriverSubmissionFile {
  path: string;
  at: string;
  by?: string | null;
  doNumber?: string | null;
  kind?: "photo" | "video" | null;
  url?: string | null;
}

export interface DriverSubmission {
  known: boolean;
  photos: number;
  videos: number;
  unbound: number;
}

export const UNKNOWN_SUBMISSION: DriverSubmission = {
  known: false,
  photos: 0,
  videos: 0,
  unbound: 0,
};

export function driverSubmissionOf(
  ledger: readonly DriverSubmissionFile[] | null | undefined,
  doNumber: string,
): DriverSubmission {
  if (ledger == null) return UNKNOWN_SUBMISSION;
  let photos = 0;
  let videos = 0;
  let unbound = 0;
  for (const entry of ledger) {
    const named = (entry.doNumber ?? "").trim();
    if (!named) {
      unbound += 1;
      continue;
    }
    if (named !== doNumber) continue;
    /* The ledger was photo-only until videos existed, so a stamped entry with
       no kind is the photo it could only have been — never a guessed video. */
    if (entry.kind === "video") videos += 1;
    else photos += 1;
  }
  return { known: true, photos, videos, unbound };
}

/** This document's own files, in the order they were recorded. The gallery and
 *  the player read the SAME predicate the count does (Law D). */
export function submissionFilesOf<T extends DriverSubmissionFile>(
  ledger: readonly T[] | null | undefined,
  doNumber: string,
  kind: "photo" | "video",
): T[] {
  return (ledger ?? []).filter((entry) => {
    if ((entry.doNumber ?? "").trim() !== doNumber) return false;
    return (entry.kind === "video" ? "video" : "photo") === kind;
  });
}

export type DoWorkQueue = "record_result" | "upload_photo" | "upload_signed_do" | "check_proof";

export const DO_WORK_QUEUES: readonly DoWorkQueue[] = [
  "record_result",
  "upload_photo",
  "upload_signed_do",
  "check_proof",
];

export const DO_QUEUE_LABEL: Record<DoWorkQueue, string> = {
  record_result: DOR_COPY.recordResult,
  upload_photo: DOR_COPY.uploadPhoto,
  upload_signed_do: DOR_COPY.uploadSignedDo,
  check_proof: DOR_COPY.checkProof,
};

/**
 * §6.1 (0489) — what Operation has said about THIS document's proof, and
 * whether a newer file reopened the question. ONE arithmetic
 * (`proofReviewStateOf` over `latestEvidenceAtOf`), read by this register,
 * Monitor's status line and the DO object's Evidence section.
 */
export interface DoProofReview {
  state: ProofReviewState;
  /** The latest review's reason, when it asked for more or refused. */
  reason: string | null;
  reviewedAt: string | null;
  /** The governed word of the latest review, or null while none exists. */
  label: string | null;
}

export const NO_PROOF_REVIEW: DoProofReview = { state: "none", reason: null, reviewedAt: null, label: null };

export function proofReviewOf(input: {
  doNumber: string;
  ledger: readonly DriverSubmissionFile[] | null | undefined;
  signedDoUploadedAt: string | null | undefined;
  reviews: ReadonlyArray<Pick<DeliveryProofReviewRow, "decision" | "reason" | "reviewed_at">>;
  attemptEvidence: ReadonlyArray<Pick<DeliveryAttemptEvidenceRow, "recorded_at">>;
}): DoProofReview {
  const latestEvidenceAt = latestEvidenceAtOf({
    ledger: input.ledger,
    doNumber: input.doNumber,
    attemptEvidence: input.attemptEvidence,
    signedDoUploadedAt: input.signedDoUploadedAt,
  });
  const { state, reviewedAt } = proofReviewStateOf({ latestEvidenceAt, reviews: input.reviews });
  const latest = [...input.reviews].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0] ?? null;
  return {
    state,
    reason: state === "rejected" || state === "more_required" ? latest?.reason ?? null : null,
    reviewedAt,
    label: latest ? proofDecisionLabel(latest.decision) : null,
  };
}

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
  /** What the driver sent back from THIS document's trip. */
  submission: DriverSubmission;
  /** Every ledger entry of the owning Sales Order, so a viewer opened from
   *  this row can show THIS document's files without a second read. */
  submissionLedger: readonly DriverSubmissionFile[] | null;
  /** The T6 photo ledger, scoped to THIS document: null = unknown. */
  photosPresent: boolean | null;
  /** `orders.do_file_path` — the signed document on file. */
  signedDoPresent: boolean;
  /** §6.1 — Operation's review of this document's proof (0489). */
  proofReview: DoProofReview;
  /** 0491 — the Delivery scope: 0 the whole order, 1..n a Journey leg; the
   *  Journey's last leg; and the leg's route (`Klang WH → JB transit`). */
  leg: number;
  lastLeg: number;
  legRoute: string | null;
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

/** §6.1 — a review that asked for more, or refused, with nothing newer on
 *  record: the upload is reopened, and the row carries the reason. */
export function proofReopened(review: Pick<DoProofReview, "state"> | null | undefined): boolean {
  return review?.state === "rejected" || review?.state === "more_required";
}

/** The ONE primary queue (priority order; a voided document queues nowhere). */
export function doWorkQueueOf(row: {
  status: DeliveryOrderStatus;
  latestResult: DoRegisterRow["latestResult"];
  photosPresent: boolean | null;
  signedDoPresent: boolean;
  proofReview?: DoProofReview;
}): DoWorkQueue | null {
  if (row.status.kind === "cancelled") return null;
  if (row.status.kind === "out_for_delivery") return "record_result";
  const missing = missingDeliveryProofOf(row);
  if (missing.photo) return "upload_photo";
  if (missing.signedDo) return "upload_signed_do";
  /* §6.1 — a rejection reopens the upload with its reason; a file nobody has
     judged yet is the review's own queue. */
  if (proofReopened(row.proofReview)) return "upload_photo";
  if (row.proofReview?.state === "pending") return "check_proof";
  return null;
}

/** PostgREST may embed a to-one overlay as an object or a one-row array. */
function overlayOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** §6.1's records, keyed by document number, as the page groups them once. */
export interface DoProofRecords {
  reviewsByDo: ReadonlyMap<string, DeliveryProofReviewRow[]>;
  evidenceByDo: ReadonlyMap<string, DeliveryAttemptEvidenceRow[]>;
}

export function groupProofRecords(
  reviews: readonly DeliveryProofReviewRow[] | undefined,
  evidence: readonly DeliveryAttemptEvidenceRow[] | undefined,
): DoProofRecords {
  const reviewsByDo = new Map<string, DeliveryProofReviewRow[]>();
  for (const r of reviews ?? []) reviewsByDo.set(r.do_number, [...(reviewsByDo.get(r.do_number) ?? []), r]);
  const evidenceByDo = new Map<string, DeliveryAttemptEvidenceRow[]>();
  for (const e of evidence ?? []) {
    if (!e.do_number) continue;
    evidenceByDo.set(e.do_number, [...(evidenceByDo.get(e.do_number) ?? []), e]);
  }
  return { reviewsByDo, evidenceByDo };
}

export function buildDoRegisterRow(
  r: DeliveryOrderRow,
  attemptsByDo: ReadonlyMap<string, DeliveryOrderAttemptRow[]>,
  handoverByDoId: ReadonlyMap<string, DeliveryHandoverKind[]>,
  proofRecords?: DoProofRecords,
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
  /* ⭐ Scoped to THIS document (owner ruling 2026-09-11): the ledger belongs
     to the Sales Order, the count belongs to the trip. */
  const submission = driverSubmissionOf(photos, r.do_number);
  const signedDocument = signedDeliveryDocumentOf({
    documentNumber: r.do_number,
    order: r.orders,
    evidence: proofRecords?.evidenceByDo.get(r.do_number),
  });
  const reached = latest?.result === "delivered" || latest?.result === "partial";
  /* §6.1 — only a result that reached the customer has proof to review. */
  const proofReview = reached
    ? proofReviewOf({
        doNumber: r.do_number,
        ledger: photos,
        signedDoUploadedAt: signedDocument?.uploadedAt ?? null,
        reviews: proofRecords?.reviewsByDo.get(r.do_number) ?? [],
        attemptEvidence: proofRecords?.evidenceByDo.get(r.do_number) ?? [],
      })
    : NO_PROOF_REVIEW;
  const base = {
    status,
    latestResult: (latest?.result ?? null) as DoRegisterRow["latestResult"],
    submission,
    submissionLedger: (photos ?? null) as readonly DriverSubmissionFile[] | null,
    photosPresent: submission.known ? submission.photos > 0 : null,
    signedDoPresent: Boolean(signedDocument),
    proofReview,
  };
  const leg = r.leg ?? 0;
  const stops = r.orders.delivery_stops ?? [];
  const lastLeg = stops.reduce((max, stop) => Math.max(max, Number(stop.leg) || 0), 0);
  const stop = leg > 0 ? stops.find((s) => Number(s.leg) === leg) ?? null : null;
  return {
    id: r.id,
    doNumber: r.do_number,
    orderId: r.orders.id,
    leg,
    lastLeg,
    legRoute: stop ? [stop.from_loc, stop.to_loc].filter(Boolean).join(" → ") : null,
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
  const work = { record_result: 0, upload_photo: 0, upload_signed_do: 0, check_proof: 0 };
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
