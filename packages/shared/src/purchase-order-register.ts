/**
 * Purchase Order Register facts from persisted document, send and receiving
 * evidence. Opening an external app is history; only `confirmed_sent` for the
 * current version proves that the supplier has the current official PDF.
 */
import { addWorkingDays, isWorkingDay, type IsoDate } from "./working-days";

export type PurchaseOrderRegisterFilter =
  | "pdf_not_sent"
  | "supplier_date_missing"
  | "supplier_date_passed"
  | "supplier_update_required"
  | "partly_received"
  | "completed"
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
  placedAt?: string | null;
  poDeliveryDate?: string | null;
  supplierDeliveryDate?: string | null;
  /** @deprecated Transitional wire alias; no approved UI may print `Supplier Date`. */
  supplierDate?: string | null;
  expectedReadyDate?: string | null;
  lines: readonly {
    qty: number;
    receivedQty: number;
    damagedQty?: number | null;
    wrongItemQty?: number | null;
  }[];
  sends: readonly PurchaseOrderRegisterSend[];
}

export interface PurchaseOrderRegisterFacts {
  version: number;
  quantities: {
    orderQty: number;
    receivedQty: number;
    damagedQty: number;
    wrongItemQty: number;
    pendingDeliveryQty: number;
    /** @deprecated Transitional aliases for the first-build browser. */
    ordered: number;
    received: number;
    open: number;
  };
  currentSend: PurchaseOrderRegisterSend | null;
  latestConfirmedSend: PurchaseOrderRegisterSend | null;
  /** @deprecated Evidence detail only; never an approved Register field. */
  supplierHas: string;
  documentState: "The PO PDF has not been sent" | "Issued" | "Completed" | "Cancelled";
  operationStatus: PurchaseOrderOperationStatus | null;
  filters: PurchaseOrderRegisterFilter[];
}

export function purchaseOrderIdentity(id: string, version: number): string {
  const current = Math.max(1, Number(version) || 1);
  return current > 1 ? `${id} · Version ${current}` : id;
}

function confirmedVersion(send: PurchaseOrderRegisterSend): number {
  return send.kind === "confirmed_sent" ? Number(send.poVersion ?? 0) : 0;
}

export function purchaseOrderRegisterFacts(
  input: PurchaseOrderRegisterInput,
  todayIso: string,
): PurchaseOrderRegisterFacts {
  const version = Math.max(1, Number(input.version ?? 1));
  const orderQty = input.lines.reduce((sum, line) => sum + Math.max(0, Number(line.qty) || 0), 0);
  const receivedQty = input.lines.reduce(
    (sum, line) => sum + Math.max(0, Math.min(Number(line.qty) || 0, Number(line.receivedQty) || 0)),
    0,
  );
  const damagedQty = input.lines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.damagedQty) || 0),
    0,
  );
  const wrongItemQty = input.lines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.wrongItemQty) || 0),
    0,
  );
  const pendingDeliveryQty = Math.max(0, orderQty - receivedQty);
  const supplierDeliveryDate = input.supplierDeliveryDate ?? input.supplierDate ?? null;
  const confirmed = input.sends
    .filter((send) => send.kind === "confirmed_sent" && confirmedVersion(send) > 0)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const currentSend = confirmed.find((send) => confirmedVersion(send) === version) ?? null;
  const latestConfirmedSend = confirmed[0] ?? null;
  const supplierVersion = latestConfirmedSend ? confirmedVersion(latestConfirmedSend) : null;
  const cancelled = input.status === "cancelled";
  const completed = !cancelled && (input.status === "received" || (orderQty > 0 && pendingDeliveryQty === 0));
  const filters: PurchaseOrderRegisterFilter[] = [];

  if (!cancelled && !completed && !currentSend) filters.push("pdf_not_sent");
  if (!cancelled && !completed && version > 1 && supplierVersion !== version) {
    filters.push("supplier_update_required");
  }
  if (!cancelled && !completed && currentSend && pendingDeliveryQty > 0 && !supplierDeliveryDate) {
    filters.push("supplier_date_missing");
  }
  if (
    !cancelled &&
    !completed &&
    currentSend &&
    pendingDeliveryQty > 0 &&
    !!supplierDeliveryDate &&
    supplierDeliveryDate < todayIso
  ) {
    filters.push("supplier_date_passed");
  }
  if (!cancelled && !completed && receivedQty > 0 && pendingDeliveryQty > 0) filters.push("partly_received");
  if (completed) filters.push("completed");
  if (cancelled) filters.push("cancelled");

  const operationStatus: PurchaseOrderOperationStatus | null = cancelled
    ? "Cancelled"
    : completed
      ? "Completed"
      : receivedQty > 0
        ? "Receiving"
        : currentSend && (supplierDeliveryDate || input.expectedReadyDate)
          ? "In Production"
          : currentSend
            ? "Issued"
            : null;

  return {
    version,
    quantities: {
      orderQty,
      receivedQty,
      damagedQty,
      wrongItemQty,
      pendingDeliveryQty,
      ordered: orderQty,
      received: receivedQty,
      open: pendingDeliveryQty,
    },
    currentSend,
    latestConfirmedSend,
    supplierHas: supplierVersion == null ? "No current PDF" : `Version ${supplierVersion}`,
    documentState: cancelled
      ? "Cancelled"
      : completed
        ? "Completed"
        : currentSend
          ? "Issued"
          : "The PO PDF has not been sent",
    operationStatus,
    filters,
  };
}

export interface PurchaseOrderWorkCopy {
  kind: "issue" | "supplier_date" | "supplier_date_passed";
  problem: string;
  action: string;
  dueOn: IsoDate | null;
}

const OPERATION_OFF_DAYS = [0, 6] as const;

function operationDayOnOrAfter(
  date: string | null | undefined,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): IsoDate | null {
  if (!date) return null;
  const iso = date.slice(0, 10);
  const opts = { offDays: OPERATION_OFF_DAYS, holidays };
  return isWorkingDay(iso, opts) ? iso : addWorkingDays(iso, 1, opts);
}

export function purchaseOrderWork(
  input: PurchaseOrderRegisterInput,
  facts: PurchaseOrderRegisterFacts,
  options: { holidays?: ReadonlySet<IsoDate> | readonly IsoDate[] } = {},
): PurchaseOrderWorkCopy | null {
  if (facts.operationStatus === "Completed" || facts.operationStatus === "Cancelled") return null;
  if (facts.filters.includes("supplier_update_required")) {
    return {
      kind: "issue",
      problem: `Version ${facts.version} has not been sent`,
      action: `Issue Version ${facts.version}`,
      dueOn: operationDayOnOrAfter(input.placedAt, options.holidays),
    };
  }
  if (facts.filters.includes("pdf_not_sent")) {
    return {
      kind: "issue",
      problem: "The PO PDF has not been sent",
      action: "Issue PO",
      dueOn: operationDayOnOrAfter(input.placedAt, options.holidays),
    };
  }
  if (facts.filters.includes("supplier_date_missing")) {
    return {
      kind: "supplier_date",
      problem: "The supplier delivery date is missing",
      action: "Ask for the delivery date",
      dueOn: facts.currentSend
        ? addWorkingDays(facts.currentSend.sentAt.slice(0, 10), 1, {
            offDays: OPERATION_OFF_DAYS,
            holidays: options.holidays,
          })
        : null,
    };
  }
  if (facts.filters.includes("supplier_date_passed")) {
    return {
      kind: "supplier_date_passed",
      problem: `The supplier delivery date has passed and ${facts.quantities.pendingDeliveryQty} are still due`,
      action: "Ask when the goods will arrive",
      dueOn: (input.supplierDeliveryDate ?? input.supplierDate)?.slice(0, 10) ?? null,
    };
  }
  return null;
}
