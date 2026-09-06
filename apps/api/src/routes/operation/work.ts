import {
  operationWorkItemFromProjection,
  operationWorkResponseSchema,
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
  storageHold,
  workItemsForOrder,
  type DeliveryQueueLeads,
  type ManualPurchaseWorkInput,
  type OrderOpenAction,
  type OrderWorkContext,
  type ReceivingWorkSource,
  type OperationWorkItem,
  type OperationWorkResponse,
  type WorkItem,
  type WorkOwnerRule,
  type WorkspaceDutyResolution,
  type WorkingDayOptions,
} from "@carres/shared";

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
  do_number?: string | null;
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

function orderControl(row: SalesOrderModuleRow): SalesOrderControlFacts | null {
  const raw = row.ops_order_control;
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

export function projectSalesOrdersFromModuleFacts(input: {
  orders: SalesOrderModuleRow[];
  stock: Array<{ sku: string; available: number }>;
  staff: Array<{ user_id: string; name: string | null; email: string }>;
  dutyResolutions: Partial<Record<WorkOwnerRule, WorkspaceDutyResolution>>;
  today: string;
  safetyDays: number | null;
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
    const storage = storageHold({
      storageFrom: control?.storage_from ?? null,
      override: control?.storage_fee_override ?? null,
      importedMsbf: control?.storage_fee_msbf ?? null,
      importedSof: control?.storage_fee_sof ?? null,
      skus: (row.order_lines ?? []).map((line) => line.sku),
      asOf: input.today,
      collectedAt: control?.storage_collected_at ?? null,
      waiverStatus: control?.storage_waiver_status ?? null,
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
        dutyResolutions: input.dutyResolutions,
        salespersonName: row.salespersons?.name ?? null,
        askDeliveryDate:
          !row.delivery_date &&
          row.delivery_date_tbd !== true &&
          row.status !== "delivered",
        promisedDateIso: row.delivery_date_tbd ? null : row.delivery_date,
        confirmedDateIso: control?.confirmed_date ?? null,
        deliveredAtIso: row.status === "delivered" ? row.placed_at : null,
        delayDetectedAtIso: control?.delay_detected_at ?? null,
        delayDecisionAtIso: control?.delay_decision_at ?? null,
        poIssuedAtIso: poDates[0] ?? null,
        placedAtIso: row.placed_at,
        financeExceptionHolds: signals.financeExceptionHolds,
        loanOutstanding: (row.ops_sofa_loans ?? []).some(
          (loan) => loan.status === "on_loan",
        ),
      },
      customer: row.customer_name,
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
        approvalRequired: request.approval_required,
        approvedAt: request.approved_at,
        refusedAt: request.refused_at,
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
  collect: "Outstanding balance is RM 0",
  collect_loan_item: "Loan item recorded as returned",
  resolve_payment_exception: "Finance exception cleared with evidence",
  ask_delivery_date: "Customer Delivery exists or Not yet is recorded",
};

export function projectSalesOrderWork(input: {
  open: readonly OrderOpenAction[];
  context: OrderWorkContext;
  customer: string | null;
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
  ).map((item) =>
    operationWorkItemFromProjection(item, {
      object: {
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
      requiredResult: ORDER_RESULT[item.ruleKey] ?? "Owning module fact recorded",
      destination: `/operation/orders/so/${encodeURIComponent(input.context.orderId)}`,
      today: input.today,
    }),
  );
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
        requiredResult: approval
          ? "Purchase decision recorded"
          : "Current PO version sent to supplier",
        destination: `/operation?tab=manual-purchase&mp=${encodeURIComponent(request.requestId)}`,
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

/** The one response boundary. Module loaders remain responsible for producing
 * valid projections; invalid input fails the request instead of presenting a
 * false clear desk. Stable identity is the only deduplication key. */
export function composeOperationWorkResponse(
  moduleItems: readonly (readonly OperationWorkItem[])[],
  staff: readonly OperationWorkStaff[],
  generatedOn: string,
): OperationWorkResponse {
  const byId = new Map<string, OperationWorkItem>();
  for (const items of moduleItems) {
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return operationWorkResponseSchema.parse({
    items: [...byId.values()],
    staff: [...staff],
    generatedOn,
  });
}
