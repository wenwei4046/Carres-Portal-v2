import { addWorkingDays, countWorkingDays } from "./working-days";
import {
  PURCHASING_OFFICE_OFF_DAYS,
  tomorrowDeliveryCallOf,
  type SupplierCallPo,
} from "./purchasing-supplier-calls";
import { myHolidaySet } from "./my-holidays";
import { purchasingActionLine } from "./order-action-words";
import type { WorkspaceDutyResolution } from "./workspace-duty";
import type { WorkItem } from "./work-engine";

/**
 * Purchase Order Register facts from persisted document, send and receiving
 * evidence. Opening an external app is history; only `confirmed_sent` for the
 * current version proves that the supplier has the current official PDF.
 */
export type PurchaseOrderRegisterFilter =
  | "pdf_not_sent"
  | "supplier_date_missing"
  | "supplier_date_passed"
  /** The supplier's evidenced date for the CURRENT version differs from the
   *  original PO Delivery Date (Purchasing MASTER §9.3 rail, Jess 2026-09-17). */
  | "supplier_date_changed"
  | "supplier_update_required"
  | "partly_received"
  | "completed"
  /**
   * ⭐ CANCELLED IS A STATE THE REGISTER KEEPS (YH, 2026-09-01, defect 27).
   * Cancelled POs are deliberately never deleted, and until now the ONLY way
   * to find one was the `PO Issued` column's funnel — a control that offered
   * document states on a column showing a timestamp. Giving that funnel the
   * date filter it should always have had would have removed the only door to
   * these rows, so the rail gains the row first.
   */
  | "cancelled";

export type PurchaseOrderOperationStatus =
  | "Issued"
  | "In Production"
  | "Receiving"
  | "Completed"
  | "Cancelled";

export interface PurchaseOrderRegisterSend {
  kind?: "external_open" | "confirmed_sent" | null;
  channel: string;
  recipient?: string | null;
  sentAt: string;
  poVersion?: number | null;
  sentByName?: string | null;
  dutyName?: string | null;
  actingName?: string | null;
}

export interface PurchaseOrderRegisterInput {
  id: string;
  supplierName: string;
  status: "open" | "received" | "cancelled";
  version?: number | null;
  supplierDate?: string | null;
  /** The immutable original PO Delivery Date (`official_delivery_date`);
   *  null when the original is genuinely unknown. */
  originalDate?: string | null;
  expectedReadyDate?: string | null;
  /** `null` = the line quantities could not be read. An unknown read is never
   *  zero and never Completed (Purchasing MASTER §5.8 / §9.3). */
  lines: readonly { qty: number | null; receivedQty: number | null }[] | null;
  sends: readonly PurchaseOrderRegisterSend[];
}

/** The four listing groups, classified Cancelled → Completed → Waiting for
 *  goods from supplier → Confirm PO sent to supplier so each PO belongs to
 *  exactly one (MASTER §5.8). The keys are internal state names; the visible
 *  headings are `Confirm PO sent to supplier` (`not_marked_as_sent`) and
 *  `Waiting for goods from supplier` (`issued`). */
export type PurchaseOrderRegisterGroup = "not_marked_as_sent" | "issued" | "completed" | "cancelled";

export interface PurchaseOrderExpectedDelivery {
  /** The supplier's evidenced current-version date, else the original PO
   *  Delivery Date, else null (`Not recorded` — never invented). */
  date: string | null;
  supplier: "not_confirmed" | "confirmed" | "changed";
  /** The original date the supplier moved away from, when `changed`. */
  changedFrom: string | null;
}

export interface PurchaseOrderRegisterFacts {
  version: number;
  /** Known only when every line quantity was read. */
  quantitiesKnown: boolean;
  quantities: { ordered: number; received: number; open: number };
  currentSend: PurchaseOrderRegisterSend | null;
  latestConfirmedSend: PurchaseOrderRegisterSend | null;
  /** The latest PO version with a sent mark — `PO V{n}`, or `Sending not
   *  confirmed` when no version was ever marked. A PO that received goods without a
   *  mark stays honestly unmarked; missing evidence is never fabricated. */
  sentToSupplier: string;
  documentState: "Sending not confirmed" | "Waiting for goods from supplier" | "Completed" | "Cancelled";
  group: PurchaseOrderRegisterGroup;
  expected: PurchaseOrderExpectedDelivery;
  operationStatus: PurchaseOrderOperationStatus | null;
  filters: PurchaseOrderRegisterFilter[];
}

function confirmedVersion(send: PurchaseOrderRegisterSend): number {
  return send.kind === "confirmed_sent" ? Number(send.poVersion ?? 0) : 0;
}

export function purchaseOrderRegisterFacts(
  input: PurchaseOrderRegisterInput,
  todayIso: string,
): PurchaseOrderRegisterFacts {
  const version = Math.max(1, Number(input.version ?? 1));
  const lines = input.lines ?? [];
  const quantitiesKnown =
    input.lines != null &&
    lines.every(
      (line) =>
        line.qty != null && Number.isFinite(Number(line.qty)) &&
        line.receivedQty != null && Number.isFinite(Number(line.receivedQty)),
    );
  const ordered = lines.reduce((sum, line) => sum + Math.max(0, Number(line.qty) || 0), 0);
  const received = lines.reduce(
    (sum, line) => sum + Math.max(0, Math.min(Number(line.qty) || 0, Number(line.receivedQty) || 0)),
    0,
  );
  const open = Math.max(0, ordered - received);
  /* Goods are known to be pending only when the read succeeded. */
  const pending = quantitiesKnown && open > 0;
  const confirmed = input.sends
    .filter((send) => send.kind === "confirmed_sent" && confirmedVersion(send) > 0)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const currentSend = confirmed.find((send) => confirmedVersion(send) === version) ?? null;
  const latestConfirmedSend = confirmed[0] ?? null;
  const supplierVersion = latestConfirmedSend ? confirmedVersion(latestConfirmedSend) : null;
  const cancelled = input.status === "cancelled";
  /* A failed quantity read can never make a PO Completed; only the
     authoritative `received` status still can. */
  const completed =
    !cancelled && (input.status === "received" || (quantitiesKnown && ordered > 0 && open === 0));
  const filters: PurchaseOrderRegisterFilter[] = [];

  if (!cancelled && !completed && !currentSend) filters.push("pdf_not_sent");
  if (!cancelled && !completed && version > 1 && supplierVersion !== version) {
    filters.push("supplier_update_required");
  }
  /* SUPPLIER REPLY facets: only a current version marked as sent with goods
     pending (MASTER §9.3). */
  const replyOpen = !cancelled && !completed && !!currentSend && pending;
  if (replyOpen && !input.supplierDate) {
    filters.push("supplier_date_missing");
  }
  if (
    replyOpen &&
    !!input.supplierDate &&
    !!input.originalDate &&
    input.supplierDate !== input.originalDate
  ) {
    filters.push("supplier_date_changed");
  }
  if (replyOpen && !!input.supplierDate && input.supplierDate < todayIso) {
    filters.push("supplier_date_passed");
  }
  if (!cancelled && !completed && quantitiesKnown && received > 0 && open > 0) filters.push("partly_received");
  if (completed) filters.push("completed");
  if (cancelled) filters.push("cancelled");

  const operationStatus: PurchaseOrderOperationStatus | null = cancelled
    ? "Cancelled"
    : completed
      ? "Completed"
      : received > 0
        ? "Receiving"
        : currentSend && (input.supplierDate || input.expectedReadyDate)
          ? "In Production"
          : currentSend
            ? "Issued"
            : null;

  const group: PurchaseOrderRegisterGroup = cancelled
    ? "cancelled"
    : completed
      ? "completed"
      : currentSend
        ? "issued"
        : "not_marked_as_sent";
  const supplierDate = input.supplierDate ?? null;
  const originalDate = input.originalDate ?? null;
  const expected: PurchaseOrderExpectedDelivery = supplierDate
    ? originalDate && supplierDate !== originalDate
      ? { date: supplierDate, supplier: "changed", changedFrom: originalDate }
      : { date: supplierDate, supplier: "confirmed", changedFrom: null }
    : { date: originalDate, supplier: "not_confirmed", changedFrom: null };

  return {
    version,
    quantitiesKnown,
    quantities: { ordered, received, open },
    currentSend,
    latestConfirmedSend,
    sentToSupplier: supplierVersion == null ? "Sending not confirmed" : `PO V${supplierVersion}`,
    documentState: cancelled
      ? "Cancelled"
      : completed
        ? "Completed"
        : currentSend
          ? "Waiting for goods from supplier"
          : "Sending not confirmed",
    group,
    expected,
    operationStatus,
    filters,
  };
}

export interface PurchaseOrderWorkCopy {
  problem: string;
  action: string;
}

export function purchaseOrderWork(
  input: PurchaseOrderRegisterInput,
  facts: PurchaseOrderRegisterFacts,
): PurchaseOrderWorkCopy | null {
  if (facts.operationStatus === "Completed" || facts.operationStatus === "Cancelled") return null;
  if (facts.filters.includes("supplier_update_required")) {
    return {
      problem: `PO V${facts.version} has not been sent`,
      action: `Issue PO V${facts.version} to ${input.supplierName}`,
    };
  }
  if (facts.filters.includes("pdf_not_sent")) {
    return {
      problem: "The PO PDF has not been sent",
      action: `Issue the purchase order to ${input.supplierName}`,
    };
  }
  if (facts.filters.includes("supplier_date_missing")) {
    return {
      problem: "Supplier has not confirmed the PO date",
      action: `Ask ${input.supplierName} to confirm the PO delivery date`,
    };
  }
  if (facts.filters.includes("supplier_date_passed")) {
    return {
      problem: "Supplier delivery date passed",
      action: `Ask ${input.supplierName} when the goods will arrive`,
    };
  }
  return null;
}

/** Purchasing supplies the same reply facts to central Work; no local queue. */
export function purchaseOrderReplyWorkItems(
  input: PurchaseOrderRegisterInput,
  owner: WorkspaceDutyResolution | null,
  today: string,
  holidays: ReadonlySet<string> = myHolidaySet(),
): WorkItem[] {
  const facts = purchaseOrderRegisterFacts(input, today);
  const missing = facts.filters.includes("supplier_date_missing");
  const passed = facts.filters.includes("supplier_date_passed");
  if (!missing && !passed) return [];
  const copy = purchaseOrderWork(input, facts)!;
  const firstSend = input.sends.filter(send => send.kind === "confirmed_sent" && send.poVersion === facts.version)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0];
  // Reply work starts on the sent day; a passed promise starts on that date.
  // Move only the computed work day to the next Office working day.
  let due = passed ? input.supplierDate ?? null : firstSend
    ? new Date(Date.parse(firstSend.sentAt) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
  const options = { offDays: PURCHASING_OFFICE_OFF_DAYS, holidays };
  if (due && (PURCHASING_OFFICE_OFF_DAYS.includes(new Date(`${due}T00:00:00Z`).getUTCDay()) || holidays.has(due))) {
    due = addWorkingDays(due, 1, options);
  }
  return [{
    ruleKey: passed ? "purchasing.supplier_date_passed" : "purchasing.supplier_reply",
    module: "purchasing", soRef: input.id, orderId: input.id,
    action: copy.action,
    ownerRule: "po_duty", ownerDutyKey: "po_duty",
    normalOwner: owner?.normalOwner ?? null,
    activeCover: owner?.activeCover ?? null,
    actingPerson: owner?.actingPerson ?? null,
    ownerState: owner?.state ?? "not_assigned",
    ownerName: owner?.actingPerson?.name ?? null,
    ownerUserId: owner?.actingPerson?.userId ?? null,
    ...(owner?.actingPerson ? {} : { ownerDuty: "PO Duty" }),
    tone: passed ? "warning" : "info", locked: false, broken: false,
    dueIso: due, workingDaysLate: due && due < today ? countWorkingDays(due, today, options) : 0,
  }];
}

/**
 * ⭐ THE ADVANCE ARRIVAL CHECK, IN SHARED WORK (owner ruling 2026-09-10).
 *
 * `purchasing.confirm_tomorrows_delivery` has been a defined rule
 * (`work-engine.ts`) with a real engine (`tomorrowDeliveryCallOf`) since it
 * was written, and the only thing that ever read that engine was the Purchase
 * Orders PAGE. So the obligation existed, computed correctly, and reached
 * nobody's Work list: the duty holder had to open one register to discover a
 * call that the shared projection never told them about.
 *
 * This is the missing consumer, and deliberately nothing more. The trigger,
 * the due and the reopen-on-a-moved-date behaviour are NOT restated here —
 * `tomorrowDeliveryCallOf` owns that arithmetic and this function calls it
 * (Law D: a derived fact has ONE arithmetic). What is added is the half the
 * page never needed: the resolved PO Duty owner, so the row reaches the
 * person whose duty it is rather than whoever happens to open the register.
 *
 * A MISSING CRON IS NOT WHAT WAS WRONG. Shared Work derives at READ time, the
 * same as every sibling projection; there was simply no projection for this
 * rule.
 */
export function purchaseOrderArrivalCheckWorkItems(
  input: {
    id: string;
    supplierId: string;
    supplierName: string;
    status: "open" | "received" | "cancelled";
    /** OUR predicted arrival — `expectedArrivalOf`'s production + transit
     *  result, as persisted on `purchase_orders.eta_date`. No anchor, no
     *  call: nothing is invented to stand in for it. */
    etaDateIso: string | null;
    /** The date the latest recorded arrival answer was ABOUT. A factory that
     *  moves the day again makes the old answer an answer about nothing, and
     *  the call reopens — that rule lives in `tomorrowDeliveryCallOf`. */
    tomorrowAnswerAboutDateIso: string | null;
    lines: readonly { qty: number; receivedQty: number }[];
  },
  owner: WorkspaceDutyResolution | null,
  today: string,
  holidays: ReadonlySet<string> = myHolidaySet(),
): WorkItem[] {
  /* The call engine reads only status, the anchor, the answer's about-date
   * and each line's outstanding quantity. The remaining `SupplierCallLine`
   * fields belong to the per-LINE balance call, which this projection does
   * not raise, so they are filled with their own "nothing recorded" values
   * rather than invented identifiers. */
  const po: SupplierCallPo = {
    poId: input.id,
    supplierId: input.supplierId,
    status: input.status,
    etaDateIso: input.etaDateIso,
    tomorrowAnswerAboutDateIso: input.tomorrowAnswerAboutDateIso,
    lines: input.lines.map((line, i) => ({
      id: `${input.id}#${i}`,
      sku: "",
      qty: line.qty,
      receivedQty: line.receivedQty,
      shortSinceIso: null,
      balanceAnswerAboutQty: null,
    })),
  };
  const call = tomorrowDeliveryCallOf(po, { todayIso: today, holidays });
  if (!call) return [];
  const options = { offDays: PURCHASING_OFFICE_OFF_DAYS, holidays };
  return [{
    ruleKey: "purchasing.confirm_tomorrows_delivery",
    module: "purchasing",
    soRef: input.id,
    orderId: input.id,
    /* The governed row line, from the ONE dictionary that owns it. Spelling
     * this sentence here would be the second spelling the dictionary exists
     * to prevent — and it would disagree with `party()` the moment a supplier
     * name is missing. */
    action: purchasingActionLine("confirm_tomorrows_delivery", {
      supplier: input.supplierName,
    }),
    ownerRule: "po_duty",
    ownerDutyKey: "po_duty",
    normalOwner: owner?.normalOwner ?? null,
    activeCover: owner?.activeCover ?? null,
    actingPerson: owner?.actingPerson ?? null,
    ownerState: owner?.state ?? "not_assigned",
    ownerName: owner?.actingPerson?.name ?? null,
    ownerUserId: owner?.actingPerson?.userId ?? null,
    ...(owner?.actingPerson ? {} : { ownerDuty: "PO Duty" }),
    /* Late only once the check day has passed — `late` is the call engine's
     * own verdict, so the row and the register can never disagree. */
    tone: call.late ? "warning" : "info",
    locked: false,
    broken: false,
    dueIso: call.dueIso,
    workingDaysLate:
      call.dueIso && call.dueIso < today
        ? countWorkingDays(call.dueIso, today, options)
        : 0,
  }];
}
