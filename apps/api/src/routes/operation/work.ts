import {
  operationWorkItemFromProjection,
  operationWorkResponseSchema,
  manualPurchaseWorkItems,
  receivingWorkItems,
  workItemsForOrder,
  type DeliveryQueueLeads,
  type ManualPurchaseWorkInput,
  type OrderOpenAction,
  type OrderWorkContext,
  type ReceivingWorkSource,
  type OperationWorkItem,
  type OperationWorkResponse,
  type WorkItem,
  type WorkspaceDutyResolution,
  type WorkingDayOptions,
} from "@carres/shared";

export interface OperationWorkStaff {
  userId: string;
  name: string | null;
  email: string;
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
