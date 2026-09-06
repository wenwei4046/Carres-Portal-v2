import {
  operationWorkItemFromProjection,
  operationWorkResponseSchema,
  receivingWorkItems,
  type ReceivingWorkSource,
  type OperationWorkItem,
  type OperationWorkResponse,
  type WorkItem,
  type WorkspaceDutyResolution,
} from "@carres/shared";

export interface OperationWorkStaff {
  userId: string;
  name: string | null;
  email: string;
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
