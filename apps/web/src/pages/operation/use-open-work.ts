/**
 * THE ONE OPEN WORK SET.
 *
 * Since 2026-09-06 the browser no longer composes module work. It reads the
 * server contract once; Work and Quick Rail consume this same cached query.
 */
import { useMemo } from "react";
import type {
  OperationWorkItem,
  OperationWorkModule,
  OpsStaffMember,
  WorkItem,
} from "@carres/shared";
import { useOperationWork } from "@/lib/queries";

export interface WorkRow extends Omit<WorkItem, "module"> {
  module: OperationWorkModule;
  id: string;
  problem: string;
  recipient: string | null;
  requiredResult: string;
  completionFact: string;
  destination: string;
  line: string;
  customer: string | null;
  ownerId: string | null;
  normalOwnerId: string | null;
  deliveryDoNumber: string | null;
  timingBucket: OperationWorkItem["timing"]["bucket"];
}

export interface OpenWorkSet {
  items: WorkRow[];
  staff: OpsStaffMember[];
  staffById: Map<string, OpsStaffMember>;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

function toWorkRow(item: OperationWorkItem): WorkRow {
  return {
    id: item.id,
    ruleKey: item.ruleKey,
    module: item.module,
    soRef: item.object.label,
    orderId: item.object.id,
    action: item.action,
    ownerRule: item.owner.rule as WorkItem["ownerRule"],
    ownerDutyKey: item.owner.dutyKey,
    normalOwner: item.owner.normal,
    activeCover: item.owner.activeCover,
    actingPerson: item.owner.acting,
    ownerState: item.owner.state,
    ownerName: item.owner.acting?.name ?? item.owner.normal?.name ?? null,
    ownerUserId: item.owner.acting?.userId ?? null,
    ...(!item.owner.acting && item.owner.dutyKey
      ? { ownerDuty: item.owner.dutyKey }
      : {}),
    tone: item.tone,
    locked: item.locked,
    broken: item.broken,
    dueIso: item.timing.dueOn,
    workingDaysLate: item.timing.workingDaysLate,
    problem: item.problem,
    recipient: item.recipient,
    requiredResult: item.requiredResult,
    completionFact: item.completionFact,
    destination: item.destination,
    line: item.action,
    customer: item.module === "orders" ? item.recipient : null,
    ownerId: item.owner.acting?.userId ?? null,
    normalOwnerId: item.owner.normal?.userId ?? null,
    deliveryDoNumber: null,
    timingBucket: item.timing.bucket,
  };
}

export function useOpenWorkSet(): OpenWorkSet {
  const query = useOperationWork();
  const items = useMemo(
    () => (query.data?.items ?? []).map(toWorkRow),
    [query.data?.items],
  );
  const staff = useMemo(
    () =>
      (query.data?.staff ?? []).map(
        (member): OpsStaffMember => ({
          user_id: member.userId,
          name: member.name,
          email: member.email,
          pooled: false,
          available: true,
          note: null,
          last_seen_at: null,
          duties: [],
        }),
      ),
    [query.data?.staff],
  );
  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.user_id, member])),
    [staff],
  );
  return {
    items,
    staff,
    staffById,
    loading: !query.isError && (query.isLoading || !query.data),
    error: query.isError,
    retry: () => { void query.refetch(); },
  };
}
