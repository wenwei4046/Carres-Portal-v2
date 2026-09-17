/**
 * THE ONE OPEN WORK SET.
 *
 * Since 2026-09-06 the browser no longer composes module work. It reads the
 * server contract once; Work and Quick Rail consume this same cached query.
 */
import { useMemo } from "react";
import {
  workFocusDay,
  type OperationWorkItem,
  type OperationWorkModule,
  type OpsStaffMember,
  type WorkItem,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
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
  /** Workspace MASTER §5.1: `generatedOn` if a working day, else the next one. */
  focusDay: string;
  /**
   * THE ONE IDENTITY (HF-3, 2026-09-17): the signed-in account id. Work owner
   * ids and staff `userId` are both account ids, so no email is ever matched —
   * a staff email that differs from the login email is still the same person.
   */
  myUserId: string | null;
  complete: boolean;
  failedSources: string[];
  /** Non-healthy sources with their last successful observation. */
  sourceHealth: { key: OperationWorkModule; lastSuccessfulAt: string | null }[];
  /** A safe response exists (possibly from before a failed refresh). */
  hasData: boolean;
  /** The latest refresh failed while an earlier response is still held. */
  refreshFailed: boolean;
  /** When the held response was received (ms), or null. */
  lastUpdatedAt: number | null;
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
  const myUserId = useAuth((s) => s.session?.user?.id ?? s.user?.id ?? null);
  const generatedOn = query.data?.generatedOn ?? "";
  const focusDay = useMemo(() => (generatedOn ? workFocusDay(generatedOn) : ""), [generatedOn]);
  const unhealthy = (query.data?.sources ?? []).filter((source) => source.state !== "healthy");
  return {
    items,
    generatedOn,
    focusDay,
    myUserId,
    complete: query.data?.complete ?? false,
    sourceHealth: unhealthy.map((source) => ({ key: source.key, lastSuccessfulAt: source.lastSuccessfulAt })),
    hasData: Boolean(query.data),
    refreshFailed: query.isError && Boolean(query.data),
    lastUpdatedAt: query.data && query.dataUpdatedAt ? query.dataUpdatedAt : null,
    failedSources: unhealthy.map((source) => source.key),
    staff,
    staffById,
    loading: !query.isError && (query.isLoading || !query.data),
    error: query.isError,
    retry: () => { void query.refetch(); },
  };
}
