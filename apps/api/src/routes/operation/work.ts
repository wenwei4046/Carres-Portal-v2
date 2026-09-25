import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  countWorkingDays,
  myHolidaySet,
  operationWorkItemFromProjection,
  projectIssueActionWork,
  operationWorkResponseSchema,
  poSupplierDeliveryDateOf,
  purchaseOrderReplyWorkItems,
  purchaseOrderArrivalCheckWorkItems,
  demandPurposeLabelOf,
  manualPurchaseForOf,
  manualPurchaseLineRemainingOf,
  manualPurchaseOrderByOf,
  manualPurchaseStatusOf,
  manualPurchaseSupplierSummary,
  manualPurchaseWorkContext,
  manualPurchaseWorkItems,
  orderActionsInDisplayOrder,
  receivingWorkItems,
  salesOrderActionSignalsFromFacts,
  invoiceStorageSumOf,
  storageHold,
  storageObligation,
  workItemsForOrder,
  type DeliveryQueueLeads,
  type ManualPurchaseWorkInput,
  type OrderOpenAction,
  type OrderWorkContext,
  type ReceivingWorkSource,
  type OperationWorkItem,
  type OperationWorkResponse,
  type OperationWorkSourceHealth,
  type WorkItem,
  type WorkOwnerRule,
  type WorkspaceDutyResolution,
  type WorkingDayOptions,
  WAREHOUSE_OFF_DAYS,
  orderActionLines,
  type OrderActionKey,
} from "@carres/shared";
import { collectionOwnerResolution, customerWaitingOf, type CollectionOwnerContextRow } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { chunk } from "../../lib/purchase-demand-read";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import operationOrdersRouter from "./orders";
import operationStockRouter from "./stock";
import manualPurchaseRouter from "./manual-purchase";
import warehouseReceiptsRouter from "./warehouse-receipts";
import operationPosRouter from "./pos";
import operationSuppliersRouter from "./suppliers";
import workspaceDutiesRouter from "./workspace-duties";
import opsStaffRouter from "./staff";
import financeInvoicesRouter from "../finance/invoices";
import issuesRouter from "../ops/issues";
import {
  invoiceNeeded,
  invoicePaymentTiming,
  soRemaining,
  type InvoiceRegisterPage,
  type InvoiceRegisterRow,
} from "@carres/shared/payment-invoice-register";
import {
  collectionTimingFor,
  type CollectionTimingRule,
} from "@carres/shared/collection-clock";
import {
  latestOutcomeOf,
  missedPromise,
  type CollectionOutcomeRow,
} from "@carres/shared/payment-collection-outcome";
import { storageCheckDue } from "@carres/shared/payment-storage";
import { todayIsoMYT } from "../../lib/today";
import {
  latestEvidenceAtOf,
  proofReviewStateOf,
  type ProofDecisionKey,
} from "@carres/shared/delivery-proof";

export interface OperationWorkStaff {
  userId: string;
  name: string | null;
  email: string;
}

interface SalesOrderModuleRow {
  id: string;
  so: number;
  status: string;
  operation_stage: string | null;
  customer_name: string;
  delivery_date: string | null;
  delivery_date_tbd?: boolean | null;
  placed_at: string;
  delivered_at?: string | null;
  do_number?: string | null;
  /** The signed paper on file and its clock (0087) — one of the §6.1 proof
   *  files whose arrival can reopen the review question. */
  do_uploaded_at?: string | null;
  paid?: number | string | null;
  ops_assigned_logistic?: string | null;
  delivery_partner_id?: string | null;
  salesperson_id?: string | null;
  salespersons?: { name: string | null } | null;
  po_skus?: string[] | null;
  order_lines?: Array<{ sku: string; qty: number; unit_price?: number | string | null }>;
  order_addons?: Array<{ qty: number; unit_price?: number | string | null }>;
  order_supplier_threads?: Array<{ purchase_orders?: { placed_at?: string | null } | null }>;
  order_finance_exceptions?: Array<{ status: string }>;
  ops_sofa_loans?: Array<{ status: string }>;
  ops_order_control?: SalesOrderControlFacts | SalesOrderControlFacts[] | null;
}

interface SalesOrderControlFacts {
  assigned_staff?: string | null;
  booking_stage?: string | null;
  confirmed_date?: string | null;
  delivery_photos?: unknown[] | null;
  line_etas?: Record<string, string> | null;
  line_stock_status?: Record<string, string> | null;
  delay_decision?: "keep" | "new_date" | null;
  delay_decision_eta?: string | null;
  delay_decision_at?: string | null;
  delay_detected_at?: string | null;
  storage_from?: string | null;
  storage_fee_override?: number | string | null;
  storage_fee_msbf?: number | string | null;
  storage_fee_sof?: number | string | null;
  storage_collected_at?: string | null;
  storage_waiver_status?: string | null;
}

/** §6.1 (0489) — what Operation has said about a document's proof, and when
 *  files last arrived for it. Keyed by DO number. */
export interface ProofFactsByDo {
  reviews: ReadonlyMap<string, Array<{ decision: ProofDecisionKey; reviewed_at: string }>>;
  evidenceAt: ReadonlyMap<string, string[]>;
}

/** The engine's two composed §6.1 flags — ONE arithmetic with the Monitor and
 *  the register (`proofReviewStateOf` over `latestEvidenceAtOf`). Only a
 *  delivered or partially delivered order can owe a review. */
export function proofReviewFlagsOf(
  row: SalesOrderModuleRow,
  control: SalesOrderControlFacts | null,
  facts: ProofFactsByDo | null,
): { proofReviewPending: boolean; proofReopened: boolean } {
  const none = { proofReviewPending: false, proofReopened: false };
  const doNumber = row.do_number?.trim();
  if (!facts || !doNumber) return none;
  const reached = row.status === "delivered" || row.operation_stage === "delivered" || Boolean(row.delivered_at);
  if (!reached) return none;
  const latestEvidenceAt = latestEvidenceAtOf({
    ledger: (control?.delivery_photos ?? []) as Array<{ doNumber?: string | null; at: string }>,
    doNumber,
    attemptEvidence: (facts.evidenceAt.get(doNumber) ?? []).map((recorded_at) => ({ recorded_at })),
    signedDoUploadedAt: row.do_uploaded_at ?? null,
  });
  const { state } = proofReviewStateOf({
    latestEvidenceAt,
    reviews: facts.reviews.get(doNumber) ?? [],
  });
  return {
    proofReviewPending: state === "pending",
    proofReopened: state === "rejected" || state === "more_required",
  };
}

function orderControl(row: SalesOrderModuleRow): SalesOrderControlFacts | null {
  const raw = row.ops_order_control;
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

export function projectSalesOrdersFromModuleFacts(input: {
  orders: SalesOrderModuleRow[];
  stock: Array<{ sku: string; available: number }>;
  staff: Array<{ user_id: string; name: string | null; email: string }>;
  dutyResolutions: Partial<Record<WorkOwnerRule, WorkspaceDutyResolution>>;
  /** 0489 — the order's stable collection owner, per order; absent ⇒ the
   *  `collect` rule fails closed under the Delivery Duty word. */
  collectionOwnerFor?: (orderId: string) => WorkspaceDutyResolution | null;
  /** Owner ruling 2026-09-17 — the order's responsible Operation person (the
   *  individual it was dealt to, with buddy cover), from the SAME 0504 read.
   *  Routine Delivery work is theirs; absent or unassigned ⇒ Delivery Duty. */
  responsibleOperationFor?: (orderId: string) => WorkspaceDutyResolution | null;
  /** Logistics Partner names by id — `Call NETS`, never `Call logistics`,
   *  wherever the order names its company. */
  partnerNameById?: ReadonlyMap<string, string>;
  today: string;
  safetyDays: number | null;
  /** Gate convergence (2026-09-07): Σ live ISSUED storage papers per order —
   *  the canonical §2 storage obligation. Absent ⇒ legacy C9 only. */
  invoiceStorageByOrder?: ReadonlyMap<string, number>;
  /** 0486 — the effective collection timing for the SO ladder's DO clock. */
  timingRules?: readonly CollectionTimingRule[] | null;
  /** §6.1 (0489) — the proof reviews and attempt evidence per document
   *  number, read once. Absent ⇒ no review work is composed. */
  proofFacts?: ProofFactsByDo | null;
  /** Delivery's latest customer contact per order — the Waiting tab's fact. */
  customerContacts?: ReadonlyMap<string, LatestCustomerContact> | null;
}): OperationWorkItem[] {
  const availableBySku = Object.fromEntries(
    input.stock.map((row) => [row.sku, row.available]),
  );
  const staff = new Map(input.staff.map((row) => [row.user_id, row]));
  return input.orders.flatMap((row) => {
    const control = orderControl(row);
    const lineTotal = row.order_lines
      ? row.order_lines.reduce(
          (total, line) => total + Number(line.unit_price ?? 0) * Number(line.qty),
          0,
        )
      : null;
    const addonTotal = row.order_addons
      ? row.order_addons.reduce(
          (total, line) => total + Number(line.unit_price ?? 0) * Number(line.qty),
          0,
        )
      : null;
    const hold = storageHold({
      storageFrom: control?.storage_from ?? null,
      override: control?.storage_fee_override ?? null,
      importedMsbf: control?.storage_fee_msbf ?? null,
      importedSof: control?.storage_fee_sof ?? null,
      skus: (row.order_lines ?? []).map((line) => line.sku),
      asOf: input.today,
      collectedAt: control?.storage_collected_at ?? null,
      waiverStatus: control?.storage_waiver_status ?? null,
    });
    // Gate convergence (2026-09-07): invoice-backed storage beats legacy C9
    // when papers exist, netted so `paid` subtracts once — the ONE
    // `storageObligation` precedence law the Delivery gate reads too.
    const storage = storageObligation({
      invoiceStorageSum: input.invoiceStorageByOrder?.get(row.id) ?? 0,
      goodsTotal: lineTotal == null || addonTotal == null ? null : lineTotal + addonTotal,
      paid: row.paid ?? null,
      legacyOwing: hold.owing,
      legacyReleased: hold.released,
    });
    const signals = salesOrderActionSignalsFromFacts({
      status: row.status,
      operationStage: row.operation_stage,
      lines: row.order_lines ?? [],
      availableBySku,
      purchaseOrderSkus: row.po_skus ?? null,
      stockEtaByLine: control?.line_etas ?? null,
      stockStatusByLine: control?.line_stock_status ?? null,
      deliveryDate: row.delivery_date,
      deliveryDateTbd: row.delivery_date_tbd === true,
      logisticsAssigned: Boolean(row.delivery_partner_id || row.ops_assigned_logistic),
      bookingStage: control?.booking_stage ?? null,
      confirmedDate: control?.confirmed_date ?? null,
      deliveryOrderNumber: row.do_number,
      deliveryPhotos: control?.delivery_photos,
      lineTotal,
      addonTotal,
      paid: row.paid == null ? null : Number(row.paid),
      storageOwing: storage.owing,
      delayDecision: control?.delay_decision ?? null,
      delayDecisionEta: control?.delay_decision_eta ?? null,
      today: input.today,
      safetyDays: input.safetyDays,
      financeExceptionHolds: (row.order_finance_exceptions ?? []).some(
        (exception) => exception.status === "open",
      ),
    });
    const picId = control?.assigned_staff ?? null;
    const pic = picId ? staff.get(picId) : null;
    const poDates = (row.order_supplier_threads ?? [])
      .map((thread) => thread.purchase_orders?.placed_at ?? null)
      .filter((date): date is string => Boolean(date))
      .sort();
    return projectSalesOrderWork({
      open: orderActionsInDisplayOrder(signals),
      context: {
        orderId: row.id,
        so: row.so,
        picName: pic?.name ?? pic?.email ?? null,
        picUserId: picId,
        dutyResolutions: {
          ...input.dutyResolutions,
          ...(input.collectionOwnerFor?.(row.id) ? { collection_owner: input.collectionOwnerFor(row.id)! } : {}),
          ...(input.responsibleOperationFor?.(row.id)
            ? { responsible_operation: input.responsibleOperationFor(row.id)! }
            : {}),
        },
        salespersonName: row.salespersons?.name ?? null,
        askDeliveryDate:
          !row.delivery_date &&
          row.delivery_date_tbd !== true &&
          row.status !== "delivered",
        promisedDateIso: row.delivery_date_tbd ? null : row.delivery_date,
        confirmedDateIso: control?.confirmed_date ?? null,
        deliveredAtIso: row.delivered_at ?? null,
        delayDetectedAtIso: control?.delay_detected_at ?? null,
        delayDecisionAtIso: control?.delay_decision_at ?? null,
        poIssuedAtIso: poDates[0] ?? null,
        placedAtIso: row.placed_at,
        financeExceptionHolds: signals.financeExceptionHolds,
        loanOutstanding: (row.ops_sofa_loans ?? []).some(
          (loan) => loan.status === "on_loan",
        ),
        ...proofReviewFlagsOf(row, control, input.proofFacts ?? null),
      },
      customer: row.customer_name,
      logistics:
        input.partnerNameById?.get(row.delivery_partner_id ?? row.ops_assigned_logistic ?? "") ?? null,
      deliveryOrderNumber: row.do_number ?? null,
      latestCustomerContact: input.customerContacts?.get(row.id) ?? null,
      today: input.today,
    });
  });
}

interface ManualPurchaseRegisterSource {
  requests: Array<{
    id: string;
    purpose: string;
    destination_id: string | null;
    why: string | null;
    approval_required: boolean;
    approved_at: string | null;
    refused_at: string | null;
    /** 0522 — absent on an older API: read as not withdrawn / not sent back. */
    withdrawn_at?: string | null;
    sent_back_at?: string | null;
    refuse_reason: string | null;
    for_service_case_id: string | null;
    for_staff_user_id: string | null;
    for_subsidiary_name: string | null;
  }>;
  lines: Array<{
    request_id: string;
    qty: number;
    approved_qty: number | null;
    issued_qty: number;
    cancelled_at: string | null;
    po_id: string | null;
    po_ids?: string[];
    received?: boolean;
    supplier_id: string | null;
    order_by: string | null;
  }>;
  destinations: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string | null }>;
  serviceCases: Array<{ id: string; case_no: string }>;
  pos: Array<{ id: string; sent: boolean }>;
}

/** The advance arrival check's own extra facts, both already returned by the
 *  internal `/pos` read — no new query, no second arithmetic. */
interface PurchaseOrderArrivalSource extends PurchaseOrderWorkSource {
  tomorrow_answer_about_date?: string | null;
}

interface PurchaseOrderWorkSource {
  id: string;
  supplier_id: string;
  status: "open" | "received" | "cancelled";
  version?: number | null;
  /** OUR predicted arrival (production + transit) — the advance check's one
   *  anchor. Already selected by the internal `/pos` read. */
  eta_date?: string | null;
  expected_ready_date?: string | null;
  promises?: Parameters<typeof poSupplierDeliveryDateOf>[0];
  sends?: Array<{
    kind?: "external_open" | "confirmed_sent" | null;
    channel: string;
    recipient?: string | null;
    sent_at: string;
    po_version?: number | null;
    sent_by_name?: string | null;
    duty_name?: string | null;
    acting_name?: string | null;
  }>;
  purchase_order_lines: Array<{ qty: number; received_qty: number }>;
}

export function projectPurchaseOrderReplyWork(input: {
  pos: readonly PurchaseOrderWorkSource[];
  suppliers: readonly { id: string; name: string | null }[];
  poDuty: WorkspaceDutyResolution | null;
  today: string;
}): OperationWorkItem[] {
  const supplierById = new Map(input.suppliers.map((row) => [row.id, row.name]));
  const holidays = myHolidaySet();
  return input.pos.flatMap((po) => {
    const version = po.version ?? 1;
    const supplierName = supplierById.get(po.supplier_id) || "Supplier";
    const items = purchaseOrderReplyWorkItems({
      id: po.id,
      supplierName,
      status: po.status,
      version,
      supplierDate: poSupplierDeliveryDateOf(po.promises, version),
      expectedReadyDate: po.expected_ready_date ?? null,
      lines: po.purchase_order_lines.map((line) => ({
        qty: line.qty,
        receivedQty: line.received_qty,
      })),
      sends: (po.sends ?? []).map((send) => ({
        kind: send.kind,
        channel: send.channel,
        recipient: send.recipient,
        sentAt: send.sent_at,
        poVersion: send.po_version,
        sentByName: send.sent_by_name,
        dutyName: send.duty_name,
        actingName: send.acting_name,
      })),
    }, input.poDuty, input.today, holidays);
    return items.map((item) => operationWorkItemFromProjection(item, {
      object: { kind: "purchase_order", id: po.id, label: po.id },
      problem: item.ruleKey === "purchasing.supplier_date_passed"
        ? "Supplier delivery date passed"
        : "Supplier has not confirmed the PO date",
      recipient: supplierName,
      requiredResult: item.ruleKey === "purchasing.supplier_date_passed"
        ? "New evidenced supplier delivery date recorded"
        : "Evidenced supplier delivery date recorded",
      destination: `/operation?tab=purchase-orders&po=${encodeURIComponent(po.id)}`,
      today: input.today,
    }));
  });
}

/**
 * THE ADVANCE ARRIVAL CHECK, one working day before the planned arrival.
 *
 * Read-time, like every projection beside it: the obligation is DERIVED from
 * `purchase_orders.eta_date` plus the promise ledger's latest answer, so no
 * cron has to have run for the duty holder to see it. The trigger, due and
 * reopen rules stay in `tomorrowDeliveryCallOf`; this only resolves the owner
 * and gives the row its destination.
 */
export function projectPurchaseOrderArrivalCheckWork(input: {
  pos: readonly PurchaseOrderArrivalSource[];
  suppliers: readonly { id: string; name: string | null }[];
  poDuty: WorkspaceDutyResolution | null;
  today: string;
}): OperationWorkItem[] {
  const supplierById = new Map(input.suppliers.map((row) => [row.id, row.name]));
  const holidays = myHolidaySet();
  return input.pos.flatMap((po) => {
    const supplierName = supplierById.get(po.supplier_id) || "Supplier";
    const items = purchaseOrderArrivalCheckWorkItems({
      id: po.id,
      supplierId: po.supplier_id,
      supplierName,
      status: po.status,
      etaDateIso: po.eta_date ?? null,
      tomorrowAnswerAboutDateIso: po.tomorrow_answer_about_date ?? null,
      lines: po.purchase_order_lines.map((line) => ({
        qty: line.qty,
        receivedQty: line.received_qty,
      })),
    }, input.poDuty, input.today, holidays);
    return items.map((item) => operationWorkItemFromProjection(item, {
      object: { kind: "purchase_order", id: po.id, label: po.id },
      problem: "The goods are expected and the supplier has not confirmed the day",
      recipient: supplierName,
      requiredResult: "Supplier answer recorded about this arrival date",
      destination: `/operation?tab=purchase-orders&po=${encodeURIComponent(po.id)}`,
      today: input.today,
    }));
  });
}

export function projectPaymentCollectionWork(input: {
  invoices: readonly InvoiceRegisterRow[];
  /** 0489 — the order's stable collection owner (Responsible Delivery
   *  Operation). Called once per admitted order, so a caller may also use
   *  it to LEARN which orders are actionable today. */
  ownerFor: (orderId: string) => WorkspaceDutyResolution | null;
  today: string;
  /** §10 row 2 (0446): the recorded conversations. A promise the customer has
   *  already broken outranks the delivery window — the item then hangs off the
   *  day the CUSTOMER chose, not the day the clock would have chosen. */
  outcomes?: readonly CollectionOutcomeRow[];
  /** `Settings → Payments → Collection timing` (0486). The clock an invoice
   *  runs under is the rule in force on its issue day — a snapshot by
   *  construction. Absent ⇒ the ruled default (3 · 2). */
  timingRules?: readonly CollectionTimingRule[] | null;
}): OperationWorkItem[] {
  const holidays = myHolidaySet();
  return input.invoices.flatMap((invoice) => {
    if (invoice.status !== "issued" || !invoice.orders) return [];
    const timingRule = collectionTimingFor(input.timingRules, invoice.issued_at?.slice(0, 10) ?? input.today);
    const { timing, clock } = invoicePaymentTiming(invoice, input.today, { holidays }, undefined, timingRule);
    const money = invoiceNeeded(invoice);
    const owing = money.known && money.outstanding > 0;
    const latest = latestOutcomeOf(input.outcomes, invoice.order_id);
    const broken = missedPromise(latest, input.today, owing);
    // A broken promise raises the work even outside the collection window, and
    // REPLACES the window item for that invoice — one act, one row.
    if (!broken && timing.kind !== "due" && timing.kind !== "late") return [];
    if (!owing) return [];
    const promisedIso = broken ? latest!.promised_date! : null;
    // The item is due the day the OWNER acts (their working day on or before
    // the company-calendar deadline — owner ruling 2026-09-13); a promise is
    // the customer's own day.
    const dueIso = promisedIso ?? clock.actionDueIso;
    const late = broken || timing.kind === "late";
    const owner = input.ownerFor(invoice.order_id);
    const workItem: WorkItem = {
      ruleKey: broken ? "payment.missed_promise" : "payment.collect_customer_balance",
      module: "payment",
      soRef: invoice.invoice_no ?? `SO-${invoice.orders.so}`,
      orderId: invoice.id,
      action: "Ask customer to pay",
      ownerRule: "collection_owner",
      ownerDutyKey: "delivery_duty",
      normalOwner: owner?.normalOwner ?? null,
      activeCover: owner?.activeCover ?? null,
      actingPerson: owner?.actingPerson ?? null,
      ownerState: owner?.state ?? "not_assigned",
      ownerName: owner?.actingPerson?.name ?? null,
      ownerUserId: owner?.actingPerson?.userId ?? null,
      ...(owner?.actingPerson ? {} : { ownerDuty: "Delivery Duty" }),
      tone: late ? "danger" : "warning",
      locked: false,
      broken: false,
      dueIso,
      workingDaysLate: late && dueIso
        ? countWorkingDays(dueIso, input.today, { holidays })
        : 0,
    };
    return [operationWorkItemFromProjection(workItem, {
      object: {
        kind: "invoice",
        id: invoice.id,
        label: invoice.invoice_no ?? `SO-${invoice.orders.so} invoice`,
      },
      problem: broken
        ? "Customer promise was missed"
        : timing.kind === "late" ? "Customer payment should have been received" : "Customer balance due",
      recipient: invoice.orders.customer_name,
      requiredResult: `Outstanding balance reduced from RM ${money.outstanding.toFixed(2)} to RM 0`,
      destination: `/finance/monitor?invoice=${encodeURIComponent(invoice.id)}`,
      today: input.today,
    })];
  });
}

/**
 * §10 — `Storage invoice live | responsible Delivery Operation | Send the
 * invoice and collect payment | invoice fully paid` (owner ruling 2026-09-12).
 *
 * One item per SO whose live ISSUED storage papers still ask for money — the
 * figure is the shared `soRemaining().storageOwing`, so this raises exactly
 * what the Monitor's Storage cell and the DO gate read. The due is the same
 * collection deadline the balance item uses (one clock); an order with no
 * delivery anchor carries the governed `No date`.
 */
export function projectStorageInvoiceWork(input: {
  invoices: readonly InvoiceRegisterRow[];
  today: string;
  timingRules?: readonly CollectionTimingRule[] | null;
  /** 0489 — the SAME stable collection owner the ordinary balance uses
   *  (owner ruling 2026-09-13). Absent or unassigned ⇒ the Delivery Duty
   *  word stands; never the PIC. */
  ownerFor: (orderId: string) => WorkspaceDutyResolution | null;
}): OperationWorkItem[] {
  const holidays = myHolidaySet();
  const seen = new Set<string>();
  return input.invoices.flatMap((invoice) => {
    if (invoice.kind === "sales" || invoice.status !== "issued" || !invoice.orders) return [];
    if (seen.has(invoice.order_id)) return [];
    const money = soRemaining(input.invoices as InvoiceRegisterRow[], invoice.order_id);
    if (!money.known || money.storageOwing <= 0 || money.outstanding <= 0) return [];
    seen.add(invoice.order_id);
    const timingRule = collectionTimingFor(input.timingRules, invoice.issued_at?.slice(0, 10) ?? input.today);
    const { clock } = invoicePaymentTiming(invoice, input.today, { holidays }, undefined, timingRule);
    const dueIso = clock.actionDueIso;
    const late = !!clock.dueIso && input.today > clock.dueIso;
    const owner = input.ownerFor(invoice.order_id);
    const workItem: WorkItem = {
      ruleKey: "payment.send_storage_invoice",
      module: "payment",
      soRef: invoice.invoice_no ?? `SO-${invoice.orders.so}`,
      orderId: invoice.id,
      action: "Send the invoice and collect payment",
      ownerRule: "collection_owner",
      ownerDutyKey: "delivery_duty",
      normalOwner: owner?.normalOwner ?? null,
      activeCover: owner?.activeCover ?? null,
      actingPerson: owner?.actingPerson ?? null,
      ownerState: owner?.state ?? "not_assigned",
      ownerName: owner?.actingPerson?.name ?? null,
      ownerUserId: owner?.actingPerson?.userId ?? null,
      ...(owner?.actingPerson ? {} : { ownerDuty: "Delivery Duty" }),
      tone: late ? "danger" : "warning",
      locked: false,
      broken: false,
      dueIso,
      workingDaysLate: late && dueIso ? countWorkingDays(dueIso, input.today, { holidays }) : 0,
    };
    return [operationWorkItemFromProjection(workItem, {
      object: { kind: "invoice", id: invoice.id, label: invoice.invoice_no ?? `SO-${invoice.orders.so} storage invoice` },
      problem: "Storage Invoice not paid",
      recipient: invoice.orders.customer_name,
      requiredResult: `Storage owing reduced from RM ${money.storageOwing.toFixed(2)} to RM 0`,
      destination: `/finance/monitor?invoice=${encodeURIComponent(invoice.id)}`,
      today: input.today,
    })];
  });
}

/**
 * §10 — `Overpaid/unallocated money | Payment Approver | Review RM {amount}`.
 *
 * The overpaid figure is the ONE shared `soRemaining` answer, per Sales Order
 * and across every live invoice kind, so this raises the same number the
 * Invoice object, the Reports listing and the statement show.
 *
 * It closes the way §10 says: ALLOCATED — the excess is moved onto a valid
 * obligation and the figure reaches RM 0 — or CLASSIFIED, which is the
 * exceptional refund §13 already allows. Neither ending invents a word, and no
 * Customer Credit is implied: none exists anywhere in the system.
 */
export function projectOverpaymentReviewWork(input: {
  invoices: readonly InvoiceRegisterRow[];
  /** Live refund records for these orders — an approved or paid one covering
   *  the excess is the CLASSIFIED ending, and closes the item. */
  refunds: readonly { order_id: string; amount: number; status: string }[];
  approver: WorkspaceDutyResolution | null;
  today: string;
}): OperationWorkItem[] {
  const seen = new Set<string>();
  const coveredByRefund = new Map<string, number>();
  for (const r of input.refunds) {
    if (r.status !== "approved" && r.status !== "paid") continue;
    coveredByRefund.set(r.order_id, (coveredByRefund.get(r.order_id) ?? 0) + Number(r.amount));
  }
  return input.invoices.flatMap((invoice) => {
    const orderId = invoice.order_id;
    if (seen.has(orderId) || !invoice.orders) return [];
    seen.add(orderId);
    const money = soRemaining(input.invoices as InvoiceRegisterRow[], orderId);
    const excess = money.overpaid;
    if (excess <= 0) return [];
    if ((coveredByRefund.get(orderId) ?? 0) >= excess) return [];
    const owner = input.approver;
    const amount = `RM ${excess.toFixed(2)}`;
    const workItem: WorkItem = {
      ruleKey: "payment.review_overpayment",
      module: "payment",
      soRef: `SO-${invoice.orders.so}`,
      orderId,
      action: `Review ${amount}`,
      ownerRule: "payment_approver_duty",
      ownerDutyKey: "payment_approver",
      normalOwner: owner?.normalOwner ?? null,
      activeCover: owner?.activeCover ?? null,
      actingPerson: owner?.actingPerson ?? null,
      ownerState: owner?.state ?? "not_assigned",
      ownerName: owner?.actingPerson?.name ?? null,
      ownerUserId: owner?.actingPerson?.userId ?? null,
      ...(owner?.actingPerson ? {} : { ownerDuty: "Payment Approver" }),
      tone: "warning",
      locked: false,
      broken: false,
      // §10 gives this row no clock: it opens with the overpayment and is due
      // the day it is seen. Inventing a deadline would invent a rule.
      dueIso: input.today,
      workingDaysLate: 0,
    };
    return [operationWorkItemFromProjection(workItem, {
      object: { kind: "invoice", id: invoice.id, label: `SO-${invoice.orders.so}` },
      problem: "The order holds more money than it asks for",
      recipient: invoice.orders.customer_name,
      requiredResult: `${amount} allocated to a valid obligation, or an approved refund`,
      destination: `/finance/invoices?invoice=${encodeURIComponent(invoice.id)}`,
      today: input.today,
    })];
  });
}

export function receivingWorkSourceFromModuleFacts(data: {
  receipts: Array<{
    id: string;
    po_id: string;
    supplier_name: string | null;
    status: string;
    goods_received_at?: string;
    submitted_at: string;
  }>;
  pos: Array<{
    id: string;
    status: string;
    supplier_id: string | null;
    eta_date: string | null;
    purchase_order_lines?: Array<{ qty: number; received_qty: number }>;
  }>;
  suppliers: Array<{ id: string; name: string | null }>;
}): ReceivingWorkSource {
  const supplier = new Map(data.suppliers.map((row) => [row.id, row.name]));
  return {
    submitted: data.receipts
      .filter((row) => row.status === "submitted")
      .map((row) => ({
        id: row.id,
        po_id: row.po_id,
        supplier_name: row.supplier_name,
        goods_received_at: row.goods_received_at,
        submitted_at: row.submitted_at,
      })),
    arrivalsDue: data.pos
      .filter((row) => row.status === "open")
      .map((row) => ({
        po_id: row.id,
        supplier_name: row.supplier_id
          ? (supplier.get(row.supplier_id) ?? null)
          : null,
        eta_date: row.eta_date,
        pending_qty: (row.purchase_order_lines ?? []).reduce(
          (total, line) =>
            total + Math.max(0, Number(line.qty) - Number(line.received_qty)),
          0,
        ),
      })),
  };
}

export function manualPurchaseWorkInputsFromRegister(
  data: ManualPurchaseRegisterSource,
): Array<ManualPurchaseWorkInput & { recipient: string | null }> {
  const destination = new Map(data.destinations.map((row) => [row.id, row.name]));
  const supplier = new Map(data.suppliers.map((row) => [row.id, row.name]));
  const user = new Map(data.users.map((row) => [row.id, row.name]));
  const serviceCase = new Map(data.serviceCases.map((row) => [row.id, row.case_no]));
  const sent = new Map(data.pos.map((row) => [row.id, row.sent]));
  return data.requests.map((request) => {
    const lines = data.lines.filter((line) => line.request_id === request.id);
    const live = lines.filter((line) => line.cancelled_at === null);
    const poIds = [...new Set(live.flatMap((line) => line.po_ids ?? (line.po_id ? [line.po_id] : [])))];
    const supplierNames = live.map((line) =>
      line.supplier_id ? (supplier.get(line.supplier_id) ?? "") : "",
    );
    return {
      requestId: request.id,
      context: manualPurchaseWorkContext({
        purposeLabel: demandPurposeLabelOf(request.purpose) ?? request.purpose,
        forText: manualPurchaseForOf({
          purpose: request.purpose,
          destinationName: request.destination_id
            ? (destination.get(request.destination_id) ?? null)
            : null,
          serviceCaseNo: request.for_service_case_id
            ? (serviceCase.get(request.for_service_case_id) ?? null)
            : null,
          staffName: request.for_staff_user_id
            ? (user.get(request.for_staff_user_id) ?? null)
            : null,
          subsidiaryName: request.for_subsidiary_name,
          why: request.why,
        }),
        supplierSummary: manualPurchaseSupplierSummary(supplierNames),
      }),
      status: manualPurchaseStatusOf({
        approvedAt: request.approved_at,
        refusedAt: request.refused_at,
        withdrawnAt: request.withdrawn_at ?? null,
        sentBackAt: request.sent_back_at ?? null,
        refuseReason: request.refuse_reason,
        lines: lines.map((line) => ({
          qty: line.qty,
          approvedQty: line.approved_qty,
          issuedQty: line.issued_qty,
          cancelledAt: line.cancelled_at,
          poId: line.po_id,
          received: line.received ?? false,
        })),
      }).kind,
      remainingQty: live.reduce(
        (total, line) =>
          total +
          manualPurchaseLineRemainingOf({
            qty: line.qty,
            approvedQty: line.approved_qty,
            issuedQty: line.issued_qty,
          }),
        0,
      ),
      orderBy: manualPurchaseOrderByOf(live.map((line) => line.order_by)),
      hasPos: poIds.length > 0,
      posAllSent: poIds.length > 0 && poIds.every((id) => sent.get(id) === true),
      recipient: manualPurchaseSupplierSummary(supplierNames),
    };
  });
}

const ORDER_PROBLEM: Record<string, string> = {
  issue_po: "Goods not covered by a purchase order",
  confirm_ready_date: "Supplier date missing",
  delay_planning: "Supplier date misses the customer commitment",
  arrange_new_delivery_date: "New delivery date required",
  assign_logistics: "Delivery company not assigned",
  confirm_delivery_date: "Customer delivery booking not confirmed",
  deliver_today: "Delivery due today",
  upload_delivery_photo: "Delivery proof missing",
  check_delivery_proof: "Delivery proof not reviewed",
  collect: "Customer balance due",
  collect_loan_item: "Loan item still out",
  resolve_payment_exception: "Finance exception holding delivery",
  ask_delivery_date: "No delivery date",
};

const ORDER_RESULT: Record<string, string> = {
  issue_po: "Purchase order covers the demand",
  confirm_ready_date: "Supplier promise recorded",
  delay_planning: "Delivery decision recorded",
  arrange_new_delivery_date: "Customer-confirmed delivery booking recorded",
  assign_logistics: "Delivery company recorded",
  confirm_delivery_date: "Customer-confirmed date and slot recorded",
  deliver_today: "Delivery result recorded",
  upload_delivery_photo: "Delivery photo recorded",
  check_delivery_proof: "Proof Accepted, More Proof Required or Proof Rejected recorded with its reason",
  collect: "Outstanding balance is RM 0",
  collect_loan_item: "Loan item recorded as returned",
  resolve_payment_exception: "Finance exception cleared with evidence",
  ask_delivery_date: "Customer Delivery exists or Not yet is recorded",
};

/**
 * THE WAITING TAB'S FACT (Workspace §5.9). Only the customer's delivery-date
 * items carry it, and only a RECORDED result says waiting — silence never
 * does (0487). The follow-up day is `customerFollowUpIso` via the shared
 * `customerWaitingOf`, the same answer the Customer card prints (Law D).
 */
export function customerCommunicationOf(
  ruleKey: string,
  latest: LatestCustomerContact | null,
  customer: string | null,
  today: string,
): OperationWorkItem["communication"] {
  if (!latest || (ruleKey !== "confirm_delivery_date" && ruleKey !== "arrange_new_delivery_date")) return null;
  const { waiting, followUpIso } = customerWaitingOf({
    latest: { atIso: latest.contacted_at, result: latest.result_key as never },
    todayIso: today,
    holidays: myHolidaySet(),
  });
  const replied = !["waiting_for_customer_reply", "no_answer"].includes(latest.result_key);
  return {
    channel: latest.channel,
    recipient: customer?.trim() || "Customer",
    sentAt: new Date(latest.contacted_at).toISOString(),
    replyState: waiting ? "waiting" : replied ? "replied" : "not_sent",
    replyDueOn: followUpIso,
  };
}

export function projectSalesOrderWork(input: {
  open: readonly OrderOpenAction[];
  context: OrderWorkContext;
  customer: string | null;
  /** The order's Logistics Partner, by name, for the Delivery lines. */
  logistics?: string | null;
  deliveryOrderNumber?: string | null;
  /** Delivery's latest customer contact (0487) — Workspace §5.9 Waiting. */
  latestCustomerContact?: LatestCustomerContact | null;
  today: string;
  workingDays?: WorkingDayOptions;
  queueLeads?: DeliveryQueueLeads;
}): OperationWorkItem[] {
  return workItemsForOrder(
    input.open,
    input.context,
    input.today,
    input.workingDays,
    input.queueLeads,
  ).map((item) => {
    const deliveryOwned = item.module === "delivery";
    const deliveryOrder = input.deliveryOrderNumber ?? null;
    /* ⭐ A DELIVERY WORK SENTENCE IS TWO STRUCTURED LINES (owner ruling
       2026-09-13, Delivery MASTER §10): the act with its recipient, then the
       required result. The words come from the one word module; the day of
       `Deliver on {weekday, date}` is spelled by the web, because the engine
       spells no dates. */
    const lines = deliveryOwned
      ? orderActionLines(item.ruleKey as OrderActionKey, {
          logistics: input.logistics ?? null,
          dayAgreed: Boolean(input.context.confirmedDateIso),
        })
      : null;
    const destination = deliveryOwned
      ? deliveryOrder &&
        (item.ruleKey === "deliver_today" ||
          item.ruleKey === "upload_delivery_photo" ||
          item.ruleKey === "check_delivery_proof")
        ? `/operation/delivery-orders/${encodeURIComponent(deliveryOrder)}`
        : `/operation?tab=delivery&view=all&open=${encodeURIComponent(input.context.orderId)}`
      : `/operation/orders/so/${encodeURIComponent(input.context.orderId)}`;
    return operationWorkItemFromProjection(lines ? { ...item, action: lines.act } : item, {
      object: deliveryOwned
        ? {
            kind: deliveryOrder ? "delivery_order" : "delivery_scope",
            id: deliveryOrder ?? input.context.orderId,
            label: deliveryOrder ?? `SO-${input.context.so}`,
          }
        : {
            kind: "sales_order",
            id: input.context.orderId,
            label: `SO-${input.context.so}`,
          },
      problem: ORDER_PROBLEM[item.ruleKey] ?? "Action required",
      recipient:
        item.ruleKey === "ask_delivery_date" ||
        item.ruleKey === "confirm_delivery_date" ||
        item.ruleKey === "collect"
          ? input.customer
          : null,
      requiredResult:
        lines?.result ?? ORDER_RESULT[item.ruleKey] ?? "Owning module fact recorded",
      destination,
      communication: customerCommunicationOf(item.ruleKey, input.latestCustomerContact ?? null, input.customer, input.today),
      interaction: item.ruleKey === "check_delivery_proof" && deliveryOrder
        ? {
            mode: "embedded",
            actionKey: "delivery.proof_review",
            componentKey: "delivery.proof_review",
            capability: "POST /api/operation/delivery-orders/:doNumber/proof-review",
            inputContract: "ProofReviewInput",
            evidenceContract: "Latest governed Delivery proof package",
            idempotencyKey: "ProofReviewInput.idempotencyKey",
            staleVersion: "ProofReviewInput.sourceVersion",
            staleRefusal: "stale_proof_evidence",
            successReceipt: "Delivery proof review result, actor, time and source version",
            fallbackDestination: destination,
          }
        : undefined,
      today: input.today,
    });
  });
}

export function projectManualPurchaseWork(input: {
  requests: readonly (ManualPurchaseWorkInput & { recipient?: string | null })[];
  approver: { userId: string; name: string | null } | null;
  poDuty: WorkspaceDutyResolution | null;
  today: string;
}): OperationWorkItem[] {
  return input.requests.flatMap((request) =>
    manualPurchaseWorkItems(
      request,
      {
        approver: input.approver,
        poDuty: input.poDuty?.normalOwner ?? null,
        poDutyResolution: input.poDuty,
      },
      input.today,
    ).map((item) => {
      const approval = item.ruleKey === "manual_purchase.approve";
      return operationWorkItemFromProjection(item, {
        object: {
          kind: "manual_purchase",
          id: request.requestId,
          label: request.context,
        },
        problem: approval ? "Approval required" : "Purchase order required",
        recipient: request.recipient ?? null,
        /* ⭐ THE ISSUE ACTION'S RESULT IS AN ISSUED PO (owner ruling
           2026-09-11). It read "Current PO version sent to supplier" while
           the rule kept the action open on a fully ordered request with no
           confirmed-sent row — a confirmation chore. That rule is gone
           (`manualPurchaseWorkItems`), so the result is the act itself. */
        requiredResult: approval
          ? "Purchase decision recorded"
          : "Purchase order issued",
        /* ⭐ THE APPROVER LANDS ON THE APPROVAL SECTION, not at the top of a
           six-section object they then have to scroll (owner ruling
           2026-09-11). `Issue PO` has no such section — its act is the
           Register's selected action — so it opens the object plainly. */
        destination: `/operation?tab=manual-purchase&mp=${encodeURIComponent(request.requestId)}${approval ? "&section=approval" : ""}`,
        today: input.today,
      });
    }),
  );
}

export function projectReceivingWork(input: {
  source: ReceivingWorkSource;
  duty: WorkspaceDutyResolution | null;
  today: string;
  workingDaysLate: (dueIso: string) => number;
}): OperationWorkItem[] {
  const acting = input.duty?.actingPerson ?? null;
  const projected = receivingWorkItems(
    input.source,
    { grnDuty: acting },
    input.today,
    input.workingDaysLate,
  );
  const supplierByPo = new Map<string, string | null>([
    ...input.source.submitted.map((row) => [row.po_id, row.supplier_name] as const),
    ...input.source.arrivalsDue.map((row) => [row.po_id, row.supplier_name] as const),
  ]);
  return projected.map((item) => {
    const workItem: WorkItem = {
      ruleKey: item.ruleKey,
      module: item.module,
      soRef: item.soRef,
      orderId: item.orderId,
      action: item.action,
      ownerRule: "grn_duty",
      ownerDutyKey: "grn_duty",
      normalOwner: input.duty?.normalOwner ?? null,
      activeCover: input.duty?.activeCover ?? null,
      actingPerson: acting,
      ownerState: input.duty?.state ?? "not_assigned",
      ownerName: item.ownerName,
      ownerUserId: item.ownerUserId,
      ...(item.ownerDuty ? { ownerDuty: item.ownerDuty } : {}),
      tone: item.tone,
      locked: item.locked,
      broken: item.broken,
      dueIso: item.dueIso,
      workingDaysLate: item.workingDaysLate,
    };
    const supplier = supplierByPo.get(item.poId) ?? null;
    return operationWorkItemFromProjection(workItem, {
      object: {
        kind: "receiving",
        id: item.receiptId ?? item.poId,
        label: item.poId,
      },
      problem: "Goods arrived · GRN not posted",
      recipient: supplier,
      requiredResult: "GRN posted",
      destination: item.receiptId
        ? `/operation?tab=receiving&session=${encodeURIComponent(item.receiptId)}`
        : `/operation?tab=receiving&po=${encodeURIComponent(item.poId)}`,
      today: input.today,
    });
  });
}

/**
 * 0486 — `Settings → Payments → Collection timing`, every effective row. The
 * shared `collectionTimingFor` picks the rule in force on a clock's start day,
 * so a read here is the snapshot every Payment item runs under. A read
 * failure throws — a clock that silently fell back to the default would be a
 * second arithmetic the Monitor does not run.
 */
async function readCollectionTimingRules(c: Context<AppEnv>): Promise<CollectionTimingRule[]> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("payment_collection_timing_rules")
    .select("ask_days_before,deadline_days_before,effective_from")
    .order("effective_from", { ascending: false });
  if (error) throw new Error("Workspace collection-timing source could not be read");
  return ((data ?? []) as Array<{ ask_days_before: number; deadline_days_before: number; effective_from: string }>)
    .map((r) => ({
      askDaysBefore: r.ask_days_before,
      deadlineDaysBefore: r.deadline_days_before,
      effectiveFrom: r.effective_from,
    }));
}

/** The one response boundary. Module loaders remain responsible for producing
 * valid projections; invalid input fails the request instead of presenting a
 * false clear desk. Stable identity is the only deduplication key. */
export interface OperationWorkSourceResult {
  health: OperationWorkSourceHealth;
  items: readonly OperationWorkItem[];
}

type OperationWorkSourceKey = OperationWorkSourceHealth["key"];

const WORK_SOURCE_LABEL: Record<OperationWorkSourceKey, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

export async function loadWorkSource(
  key: OperationWorkSourceKey,
  observedAt: string,
  loader: () => Promise<readonly OperationWorkItem[]>,
): Promise<OperationWorkSourceResult> {
  try {
    const items = await loader();
    return {
      health: {
        key,
        state: "healthy",
        observedAt,
        lastSuccessfulAt: observedAt,
        errorLabel: null,
      },
      items,
    };
  } catch (error) {
    if (error instanceof HTTPException && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    return {
      health: {
        key,
        state: "failed",
        observedAt: null,
        lastSuccessfulAt: null,
        errorLabel: `Could not refresh ${WORK_SOURCE_LABEL[key]}`,
      },
      items: [],
    };
  }
}

export function composeOperationWorkResponse(
  sourceResults: readonly OperationWorkSourceResult[],
  staff: readonly OperationWorkStaff[],
  generatedOn: string,
  closureReceipt: OperationWorkResponse["closureReceipt"] = null,
): OperationWorkResponse {
  const byId = new Map<string, OperationWorkItem>();
  for (const source of sourceResults) {
    for (const item of source.items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  const items = [...byId.values()];
  return operationWorkResponseSchema.parse({
    contractVersion: 2,
    complete: sourceResults.every((source) => source.health.state === "healthy"),
    items,
    staff: [...staff],
    generatedOn,
    closureReceipt,
    sources: sourceResults.map((source) => source.health),
  });
}

function dutyResolution(
  payload: Record<string, unknown>,
  key: string,
  today: string,
): WorkspaceDutyResolution | null {
  const duties = payload.duties as Array<Record<string, unknown>> | undefined;
  const duty = duties?.find((row) => row.key === key);
  const raw = duty?.resolution as Record<string, unknown> | undefined;
  if (!raw) return null;
  const person = (idKey: string, nameKey: string) => {
    const userId = raw[idKey];
    if (typeof userId !== "string" || userId.length === 0) return null;
    return {
      userId,
      name: typeof raw[nameKey] === "string" ? raw[nameKey] as string : null,
    };
  };
  const normalOwner = person("normal_user_id", "normal_user_name");
  const acting = person("actor_user_id", "acting_user_name") ??
    person("acting_user_id", "acting_user_name") ??
    normalOwner;
  const activeCover = raw.is_cover === true
    ? person("acting_user_id", "acting_user_name")
    : null;
  return {
    dutyKey: key,
    onDate: today,
    normalOwner,
    buddy: activeCover,
    activeCover,
    actingPerson: acting,
    state: normalOwner ? (activeCover ? "covered" : "primary") : "not_assigned",
    assignmentId: null,
  };
}

async function readInternal<T>(
  app: Hono<AppEnv>,
  path: string,
  c: Context<AppEnv>,
): Promise<T> {
  const response = await app.request(`http://workspace.internal${path}`, {}, c.env);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Workspace source ${path} failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

async function readAllInvoices(app: Hono<AppEnv>, c: Context<AppEnv>): Promise<InvoiceRegisterRow[]> {
  const rows: InvoiceRegisterRow[] = [];
  let total: number | null = null;
  do {
    const page = await readInternal<InvoiceRegisterPage>(
      app,
      `/finance-invoices/register?offset=${rows.length}&limit=1000`,
      c,
    );
    if (!Number.isInteger(page.total) || page.total < 0 || (total !== null && total !== page.total)) {
      throw new Error("Workspace invoice source changed while loading");
    }
    total = page.total;
    if (page.rows.length === 0 && rows.length < total) {
      throw new Error("Workspace invoice source ended before its reported total");
    }
    rows.push(...page.rows);
  } while (rows.length < total);
  if (rows.length !== total || new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error("Workspace invoice source is inconsistent");
  }
  return rows;
}

/**
 * The recorded collection conversations (0446), newest last. Read straight
 * from the append-only ledger under the caller's own RLS — there is no
 * whole-ledger route, and inventing one for Work would be a second door onto
 * a table that already has an owner. Only the fields the §10 promise rule
 * needs are selected, and a read failure yields NOTHING rather than a
 * fabricated empty answer: a missed promise that cannot be read must not
 * quietly turn back into an ordinary balance.
 */
/**
 * 0489/0504 — establish the stable collection owner of every order whose
 * collection is actionable today, then read the responsible Operation person
 * of every order that has collection OR routine Delivery work (owner ruling
 * 2026-09-17). `establish` is idempotent and writes nothing for an order with
 * no responsible person; `context` returns normal owner · today's cover ·
 * acting person · history from `delivery_responsible_operation`. Both are the
 * ONE door; no owner is computed here.
 */
async function establishAndReadCollectionOwners(
  c: Context<AppEnv>,
  establishIds: readonly string[],
  readIds: readonly string[],
  today: string,
): Promise<Map<string, CollectionOwnerContextRow>> {
  const orderIds = [...new Set([...establishIds, ...readIds])];
  if (orderIds.length === 0) return new Map();
  const sb = userClient(c.env, c.var.auth.jwt);
  if (establishIds.length > 0) {
    const established = await sb.rpc("payment_collection_owner_establish", {
      p_order_ids: [...establishIds], p_on: today,
    });
    if (established.error) throw new Error("Workspace collection-owner source could not be established");
  }
  const context = await sb.rpc("payment_collection_owner_context", {
    p_order_ids: orderIds, p_on: today,
  });
  if (context.error) throw new Error("Workspace collection-owner source could not be read");
  const rows = (context.data ?? []) as CollectionOwnerContextRow[];
  return new Map(rows.map((row) => [row.order_id, row]));
}

async function readCollectionOutcomes(c: Context<AppEnv>): Promise<CollectionOutcomeRow[]> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("payment_collection_outcomes")
    .select("id, order_id, invoice_id, outcome, promised_date, note, recorded_at")
    .eq("outcome", "will_pay_on_date")
    .order("recorded_at", { ascending: true });
  if (error) throw new Error("Workspace collection-outcome source could not be read");
  return (data ?? []) as CollectionOutcomeRow[];
}

/**
 * Live refund records (0345). An APPROVED or PAID refund covering an
 * overpayment is §10's "classified" ending; without this read the review item
 * would stay open forever after the decision that settled it. A read failure
 * throws rather than yielding an empty list — an unreadable refund must not
 * silently reopen a settled review.
 */
async function readRefunds(c: Context<AppEnv>): Promise<Array<{
  order_id: string; amount: number; status: string;
}>> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("order_refunds")
    .select("order_id,amount,status")
    .in("status", ["approved", "paid"]);
  if (error) throw new Error("Workspace refund source could not be read");
  return (data ?? []) as Array<{ order_id: string; amount: number; status: string }>;
}

/**
 * The §6 storage-check facts (0452): every OPEN case with its start, the day it
 * was last looked at, and the interval configured for its product group. Read
 * under the caller's own RLS. A read failure throws — a case nobody can read is
 * not a case that needs no check, and silently dropping the work would hide
 * furniture nobody has looked at for a month.
 */
export interface StorageCheckSource {
  caseId: string;
  orderId: string;
  so: number | null;
  productGroup: string;
  storageStart: string;
  lastCheckedOn: string | null;
  inspectionDays: number;
}

/**
 * §6.1 (0489) — every proof review and every attempt-evidence clock, read
 * under the caller's own RLS. Both tables are append-only records; a read
 * failure throws (Work that silently forgot a review would hide a delivered
 * order whose proof nobody has looked at).
 */
async function readProofFacts(c: Context<AppEnv>): Promise<ProofFactsByDo> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [reviewsRes, evidenceRes] = await Promise.all([
    sb.from("delivery_proof_reviews").select("do_number, decision, reviewed_at"),
    sb.from("delivery_attempt_evidence").select("do_number, recorded_at"),
  ]);
  if (reviewsRes.error) throw new Error("Workspace proof-review source could not be read");
  if (evidenceRes.error) throw new Error("Workspace attempt-evidence source could not be read");
  const reviews = new Map<string, Array<{ decision: ProofDecisionKey; reviewed_at: string }>>();
  for (const r of (reviewsRes.data ?? []) as Array<{ do_number: string; decision: ProofDecisionKey; reviewed_at: string }>) {
    reviews.set(r.do_number, [...(reviews.get(r.do_number) ?? []), { decision: r.decision, reviewed_at: r.reviewed_at }]);
  }
  const evidenceAt = new Map<string, string[]>();
  for (const e of (evidenceRes.data ?? []) as Array<{ do_number: string | null; recorded_at: string }>) {
    if (!e.do_number) continue;
    evidenceAt.set(e.do_number, [...(evidenceAt.get(e.do_number) ?? []), e.recorded_at]);
  }
  return { reviews, evidenceAt };
}

/** A customer's latest delivery contact, per order (leg 0) — Delivery's
 *  `ops_delivery_contacts` (0487). It answers ONLY the Waiting tab; a failed
 *  read leaves every item in To do (never hides work). */
export type LatestCustomerContact = { contacted_at: string; result_key: string; channel: string };
async function readLatestCustomerContacts(
  c: Context<AppEnv>,
  orderIds: readonly string[],
): Promise<Map<string, LatestCustomerContact>> {
  const sb = userClient(c.env, c.var.auth.jwt);
  const latest = new Map<string, LatestCustomerContact>();
  /* Only the orders this feed carries, 100 at a time — never the whole table,
     so no row cap can silently drop a Waiting item back into To do. */
  for (const batch of chunk([...orderIds], 100)) {
    const { data, error } = await sb
      .from("ops_delivery_contacts")
      .select("order_id, contacted_at, result_key, channel")
      .eq("contacted_person", "customer")
      .eq("leg", 0)
      .in("order_id", batch)
      .order("contacted_at", { ascending: false });
    if (error) return new Map();
    for (const row of (data ?? []) as Array<LatestCustomerContact & { order_id: string }>) {
      if (!latest.has(row.order_id)) latest.set(row.order_id, row);
    }
  }
  return latest;
}

/**
 * §6 — `Check the stored furniture`, every configured interval.
 *
 * The clock restarts at each recorded check, so a case checked on time never
 * builds a backlog of missed intervals: one open item at a time, which is what
 * an operator can act on. The due date and the lateness come from the ONE
 * shared `storageCheckDue`, so the Work item and the Storage section cannot
 * disagree about the day.
 */
export function projectStorageCheckWork(input: {
  cases: readonly StorageCheckSource[];
  today: string;
}): OperationWorkItem[] {
  return input.cases.flatMap((s) => {
    const due = storageCheckDue({
      storageStart: s.storageStart,
      lastCheckedOn: s.lastCheckedOn,
      inspectionDays: s.inspectionDays,
    }, input.today);
    if (!due.due) return [];
    const soRef = s.so != null ? `SO-${s.so}` : s.orderId;
    const workItem: WorkItem = {
      ruleKey: "payment.check_stored_furniture",
      module: "payment",
      soRef,
      orderId: s.caseId,
      action: "Check the stored furniture",
      ownerRule: "warehouse_duty",
      // No warehouse duty roster exists (§6 names none), so there is no duty
      // KEY to resolve — the word stands.
      ownerDutyKey: null,
      normalOwner: null,
      activeCover: null,
      actingPerson: null,
      ownerState: "not_assigned",
      ownerName: null,
      ownerUserId: null,
      ownerDuty: "Warehouse",
      tone: due.daysLate > 0 ? "danger" : "warning",
      locked: false,
      broken: false,
      dueIso: due.dueIso,
      workingDaysLate: due.daysLate,
    };
    return [operationWorkItemFromProjection(workItem, {
      // The CASE is the object: one order can hold a mattress case and a sofa
      // case, and they are two different lots of furniture to look at.
      object: { kind: "storage_case", id: s.caseId, label: soRef },
      problem: "Stored furniture has not been checked",
      recipient: null,
      requiredResult: "A storage check recorded with its photo",
      destination: `/finance/invoices?order=${encodeURIComponent(s.orderId)}`,
      today: input.today,
    })];
  });
}

/** Reuse the existing module read routes inside the Worker. This avoids a
 * second set of table queries while keeping Work a single browser request. */
export async function loadOperationWork(c: Context<AppEnv>): Promise<OperationWorkResponse> {
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => {
    child.set("auth", c.var.auth);
    await next();
  });
  internal.route("/orders", operationOrdersRouter);
  internal.route("/stock", operationStockRouter);
  internal.route("/manual-purchase", manualPurchaseRouter);
  internal.route("/warehouse-receipts", warehouseReceiptsRouter);
  internal.route("/pos", operationPosRouter);
  internal.route("/suppliers", operationSuppliersRouter);
  internal.route("/workspace-duties", workspaceDutiesRouter);
  internal.route("/staff", opsStaffRouter);
  internal.route("/finance-invoices", financeInvoicesRouter);
  internal.route("/issues", issuesRouter);

  const [orders, stock, manual, receipts, pos, suppliers, duties, staff, purchasingSettings,
         invoices, outcomes, refunds, issueSource, timingRules, proofFacts] =
    await Promise.all([
      readInternal<{ orders: SalesOrderModuleRow[] }>(internal, "/orders", c),
      readInternal<{ skus: Array<{ sku: string; available: number }> }>(internal, "/stock", c),
      readInternal<ManualPurchaseRegisterSource & {
        approvers?: Array<{ id: string; name: string | null }>;
        todayIso?: string;
      }>(internal, "/manual-purchase", c),
      readInternal<{ receipts: Parameters<typeof receivingWorkSourceFromModuleFacts>[0]["receipts"] }>(
        internal,
        "/warehouse-receipts?status=submitted",
        c,
      ),
      readInternal<{ pos: Parameters<typeof receivingWorkSourceFromModuleFacts>[0]["pos"] }>(
        internal,
        "/pos?status=all",
        c,
      ),
      readInternal<{ suppliers: Parameters<typeof receivingWorkSourceFromModuleFacts>[0]["suppliers"] }>(
        internal,
        "/suppliers",
        c,
      ),
      readInternal<Record<string, unknown>>(internal, "/workspace-duties", c),
      readInternal<{ staff: Array<{ user_id: string; name: string | null; email: string }> }>(
        internal,
        "/staff",
        c,
      ),
      loadPurchasingSettings(userClient(c.env, c.var.auth.jwt)),
      readAllInvoices(internal, c),
      readCollectionOutcomes(c),
      readRefunds(c),
      readInternal<{ actions: Parameters<typeof projectIssueActionWork>[0]["actions"] }>(internal, "/issues/work-source", c),
      readCollectionTimingRules(c),
      readProofFacts(c),
    ]);
  const customerContacts = await readLatestCustomerContacts(c, orders.orders.map((row) => row.id));
  const today = manual.todayIso ?? todayIsoMYT();
  const poDuty = dutyResolution(duties, "po_duty", today);
  const grnDuty = dutyResolution(duties, "grn_duty", today);
  // §12 gives overpayment review to the Payment Approver, never to Payment
  // Duty — an unassigned approver leaves the item honestly ownerless.
  const paymentApprover = dutyResolution(duties, "payment_approver", today);
  const issueTriageDuty = dutyResolution(duties, "issue_triage_duty", today);
  const issueReviewApprover = dutyResolution(duties, "issue_review_approver", today);
  // Delivery Duty — since the owner ruling of 2026-09-17 only the fallback for
  // an order with NO responsible Operation person (see below).
  const deliveryDuty = dutyResolution(duties, "delivery_duty", today);
  const dutyResolutions = {
    ...(poDuty ? { po_duty: poDuty } : {}),
    ...(deliveryDuty ? { delivery_duty: deliveryDuty } : {}),
  };
  // Gate convergence (2026-09-07): the same invoices read that feeds the
  // collection work also answers the §2 storage obligation per order.
  const invoiceStorageByOrder = new Map<string, number>();
  for (const inv of invoices) {
    if (!invoiceStorageByOrder.has(inv.order_id)) {
      invoiceStorageByOrder.set(
        inv.order_id,
        invoiceStorageSumOf(invoices.filter((i) => i.order_id === inv.order_id)),
      );
    }
  }
  // 0489 — which orders' collection is actionable today is the projections'
  // own admission; a probe pass learns the set, the door establishes the
  // owner for any newcomer (the person the order was dealt to) and the read
  // answers the same stable owner for every later pass.
  const actionable = new Set<string>();
  const probe = (orderId: string) => { actionable.add(orderId); return null; };
  projectPaymentCollectionWork({ invoices, ownerFor: probe, today, outcomes, timingRules });
  projectStorageInvoiceWork({ invoices, today, timingRules, ownerFor: probe });
  const orderFacts = {
    orders: orders.orders,
    stock: stock.skus,
    staff: staff.staff,
    dutyResolutions,
    partnerNameById: new Map((purchasingSettings.deliveryPartners ?? []).map((p) => [p.id, p.name])),
    today,
    safetyDays: purchasingSettings.orderByBufferDays,
    invoiceStorageByOrder,
    timingRules,
    proofFacts,
    customerContacts,
  };
  // Owner ruling 2026-09-17 — routine Delivery work is the order's responsible
  // Operation person. A probe pass per order learns which orders carry a
  // `responsible_operation` item today, so the one read covers exactly them.
  const deliveryOwned = orders.orders
    .filter((row) =>
      projectSalesOrdersFromModuleFacts({ ...orderFacts, orders: [row] })
        .some((item) => item.owner.rule === "responsible_operation"))
    .map((row) => row.id);
  const ownerRows = await establishAndReadCollectionOwners(c, [...actionable], deliveryOwned, today);
  const collectionOwnerFor = (orderId: string) =>
    collectionOwnerResolution(ownerRows.get(orderId) ?? null, today);
  const orderItems = projectSalesOrdersFromModuleFacts({
    ...orderFacts,
    collectionOwnerFor,
    responsibleOperationFor: collectionOwnerFor,
  });
  const manualItems = projectManualPurchaseWork({
    requests: manualPurchaseWorkInputsFromRegister(manual),
    approver: manual.approvers?.[0]
      ? { userId: manual.approvers[0].id, name: manual.approvers[0].name }
      : null,
    poDuty,
    today,
  });
  const receivingSource = receivingWorkSourceFromModuleFacts({
    receipts: receipts.receipts,
    pos: pos.pos,
    suppliers: suppliers.suppliers,
  });
  const holidays = myHolidaySet();
  const receivingItems = projectReceivingWork({
    source: receivingSource,
    duty: grnDuty,
    today,
    workingDaysLate: (dueIso) =>
      countWorkingDays(dueIso, today, { holidays, offDays: WAREHOUSE_OFF_DAYS }),
  });
  const purchaseOrderItems = projectPurchaseOrderReplyWork({
    pos: pos.pos as PurchaseOrderWorkSource[],
    suppliers: suppliers.suppliers,
    poDuty,
    today,
  });
  const arrivalCheckItems = projectPurchaseOrderArrivalCheckWork({
    pos: pos.pos as PurchaseOrderArrivalSource[],
    suppliers: suppliers.suppliers,
    poDuty,
    today,
  });
  const paymentItems = projectPaymentCollectionWork({ invoices, ownerFor: collectionOwnerFor, today, outcomes, timingRules });
  const storageInvoiceItems = projectStorageInvoiceWork({ invoices, today, timingRules, ownerFor: collectionOwnerFor });
  const overpaymentItems = projectOverpaymentReviewWork({
    invoices, refunds, approver: paymentApprover, today,
  });
  const observedAt = new Date().toISOString();
  const issueItems = projectIssueActionWork({
    actions: issueSource.actions,
    dutyResolutions: {
      ...(issueTriageDuty ? { issue_triage_duty: issueTriageDuty } : {}),
      ...(issueReviewApprover ? { issue_review_approver: issueReviewApprover } : {}),
    },
    today,
    observedAt,
  });
  const sourceResults = await Promise.all([
    loadWorkSource("orders", observedAt, async () =>
      orderItems.filter((item) => item.module === "orders" && item.ruleKey !== "collect")),
    loadWorkSource("purchasing", observedAt, async () => [
      ...manualItems,
      ...purchaseOrderItems,
      ...arrivalCheckItems,
    ]),
    loadWorkSource("receiving", observedAt, async () => receivingItems),
    loadWorkSource("delivery", observedAt, async () =>
      orderItems.filter((item) => item.module === "delivery")),
    loadWorkSource("payment", observedAt, async () => [
      ...paymentItems,
      ...storageInvoiceItems,
      ...overpaymentItems,
    ]),
    loadWorkSource("issue_tracker", observedAt, async () => issueItems),
  ]);
  return composeOperationWorkResponse(
    sourceResults,
    staff.staff.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
    })),
    today,
  );
}

export function createOperationWorkRouter(
  loader: (c: Context<AppEnv>) => Promise<OperationWorkResponse> = loadOperationWork,
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.get("/", requireOperation, async (c) => c.json(await loader(c)));
  return router;
}

const operationWorkRouter = createOperationWorkRouter();

export default operationWorkRouter;
