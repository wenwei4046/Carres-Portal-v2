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
  OperationWorkSourceHealth,
  OpsStaffMember,
  WorkItem,
} from "@carres/shared";
import { useOperationWork } from "@/lib/queries";

export interface WorkRow extends Omit<WorkItem, "module"> {
  source: OperationWorkItem;
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
  timingBucket: "overdue" | "today" | "later" | "no_date";
}

export interface OpenWorkSet {
  items: WorkRow[];
  generatedOn: string;
  complete: boolean;
  failedSources: string[];
  /** Health of every source that is not current, with its last good read. */
  unhealthySources: OperationWorkSourceHealth[];
  staff: OpsStaffMember[];
  staffById: Map<string, OpsStaffMember>;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

function toWorkRow(item: OperationWorkItem, generatedOn: string): WorkRow {
  const dueIso = item.timing.actionOn;
  const workingDaysLate = item.timing.missedAge.state === "counted"
    ? item.timing.missedAge.workingDays
    : 0;
  const timingBucket: WorkRow["timingBucket"] = item.timing.placement === "missed"
    ? "overdue"
    : dueIso === null
      ? "no_date"
      : dueIso === generatedOn
        ? "today"
        : "later";
  return {
    source: item,
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
    dueIso,
    workingDaysLate,
    problem: item.problem,
    recipient: item.recipient,
    requiredResult: item.requiredResult,
    completionFact: item.completionPredicate,
    destination: item.destination,
    line: item.action,
    customer: item.module === "orders" ? item.recipient : null,
    ownerId: item.owner.acting?.userId ?? null,
    normalOwnerId: item.owner.normal?.userId ?? null,
    deliveryDoNumber: null,
    timingBucket,
  };
}

export function useOpenWorkSet(): OpenWorkSet {
  const query = useOperationWork();
  const items = useMemo(
    () => (query.data?.items ?? []).map((item) => toWorkRow(item, query.data?.generatedOn ?? "")),
    [query.data?.generatedOn, query.data?.items],
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
    generatedOn: query.data?.generatedOn ?? "",
    complete: query.data?.complete ?? false,
    failedSources: (query.data?.sources ?? []).filter((source) => source.state !== "healthy").map((source) => source.key),
    unhealthySources: (query.data?.sources ?? []).filter((source) => source.state !== "healthy"),
    staff,
    staffById,
    loading: !query.isError && (query.isLoading || !query.data),
    error: query.isError,
    retry: () => { void query.refetch(); },
  };
}
