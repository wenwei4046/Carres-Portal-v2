/**
 * Purchase Order Register facts from persisted document, send and receiving
 * evidence. Opening an external app is history; only `confirmed_sent` for the
 * current version proves that the supplier has the current official PDF.
 */
export type PurchaseOrderRegisterFilter =
  | "pdf_not_sent"
  | "supplier_date_missing"
  | "supplier_date_passed"
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
  expectedReadyDate?: string | null;
  lines: readonly { qty: number; receivedQty: number }[];
  sends: readonly PurchaseOrderRegisterSend[];
}

export interface PurchaseOrderRegisterFacts {
  version: number;
  quantities: { ordered: number; received: number; open: number };
  currentSend: PurchaseOrderRegisterSend | null;
  latestConfirmedSend: PurchaseOrderRegisterSend | null;
  /** The latest PO version with confirmed-send evidence — `PO V{n}`, or `Not
   *  sent` when no version has ever been confirmed sent. A PO that received
   *  goods without a send record stays honestly `Not sent`; missing evidence
   *  is never fabricated. */
  sentToSupplier: string;
  documentState: "Not sent to supplier" | "Issued" | "Completed" | "Cancelled";
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
  const ordered = input.lines.reduce((sum, line) => sum + Math.max(0, Number(line.qty) || 0), 0);
  const received = input.lines.reduce(
    (sum, line) => sum + Math.max(0, Math.min(Number(line.qty) || 0, Number(line.receivedQty) || 0)),
    0,
  );
  const open = Math.max(0, ordered - received);
  const confirmed = input.sends
    .filter((send) => send.kind === "confirmed_sent" && confirmedVersion(send) > 0)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const currentSend = confirmed.find((send) => confirmedVersion(send) === version) ?? null;
  const latestConfirmedSend = confirmed[0] ?? null;
  const supplierVersion = latestConfirmedSend ? confirmedVersion(latestConfirmedSend) : null;
  const cancelled = input.status === "cancelled";
  const completed = !cancelled && (input.status === "received" || (ordered > 0 && open === 0));
  const filters: PurchaseOrderRegisterFilter[] = [];

  if (!cancelled && !completed && !currentSend) filters.push("pdf_not_sent");
  if (!cancelled && !completed && version > 1 && supplierVersion !== version) {
    filters.push("supplier_update_required");
  }
  if (!cancelled && !completed && currentSend && open > 0 && !input.supplierDate) {
    filters.push("supplier_date_missing");
  }
  if (
    !cancelled &&
    !completed &&
    currentSend &&
    open > 0 &&
    !!input.supplierDate &&
    input.supplierDate < todayIso
  ) {
    filters.push("supplier_date_passed");
  }
  if (!cancelled && !completed && received > 0 && open > 0) filters.push("partly_received");
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

  return {
    version,
    quantities: { ordered, received, open },
    currentSend,
    latestConfirmedSend,
    sentToSupplier: supplierVersion == null ? "Not sent" : `PO V${supplierVersion}`,
    documentState: cancelled
      ? "Cancelled"
      : completed
        ? "Completed"
        : currentSend
          ? "Issued"
          : "Not sent to supplier",
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
      problem: "The supplier date is missing",
      action: `Ask ${input.supplierName} for the delivery date`,
    };
  }
  if (facts.filters.includes("supplier_date_passed")) {
    return {
      problem: `The supplier date has passed and ${facts.quantities.open} are still open`,
      action: `Ask ${input.supplierName} when the goods will arrive`,
    };
  }
  return null;
}
