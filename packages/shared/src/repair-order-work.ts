/**
 * ⭐ REPAIR ORDER WORK — the RO-owned obligations projected into the ONE Work
 * engine (Purchasing MASTER §9.7 "Workspace path" and §10 · Workspace MASTER §6).
 *
 * Read-time, like every Purchasing projection beside it: each occurrence is
 * DERIVED from facts the RO already keeps — the send ledger, the evidenced
 * Supplier receipt with its snapshotted Carres return target, Receiving's
 * return GRN per Unit, and the append-only owner consents. There is no task
 * store and no Done button; the owning fact removes the occurrence.
 *
 *   repair_order.issue               not confirmed sent        → confirmed send of the current version
 *   repair_order.confirm_receipt     sent, receipt not recorded → evidenced Supplier receipt
 *   repair_order.return_date_passed  Carres target passed,       → every Unit received back (GRN) or the
 *                                    a Unit still out             RO cancelled. A Supplier reply or a new
 *                                                                 Supplier date NEVER closes it (2026-09-28)
 *   repair_order.owner_consent       non-Carres-owned Unit       → `given` consent recorded for it; a
 *                                    without a `given` consent     refusal leaves it open with its scope
 *
 * Owner: the current PO Duty through the Shared Duty Resolver, on the Office
 * calendar. Owner consent has no governed date (Workspace §6: never invent one).
 */
import { REPAIR_ORDER_ABSENT, repairOrderConsentOutstanding, type RepairOrderDetail } from "./repair-order";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { myHolidaySet } from "./my-holidays";
import { addWorkingDays, countWorkingDays, type IsoDate } from "./working-days";
import type { WorkItem } from "./work-engine";
import { operationWorkItemFromProjection, type OperationWorkItem } from "./operation-work";
import type { WorkspaceDutyResolution } from "./workspace-duty";

export const REPAIR_ORDER_WORK_RULE = {
  issue: "repair_order.issue",
  confirmReceipt: "repair_order.confirm_receipt",
  returnDatePassed: "repair_order.return_date_passed",
  ownerConsent: "repair_order.owner_consent",
} as const;
export type RepairOrderWorkRule = (typeof REPAIR_ORDER_WORK_RULE)[keyof typeof REPAIR_ORDER_WORK_RULE];

/** The occurrence plus the words its card prints (COPY-STANDARD "Repair Orders Work"). */
export interface RepairOrderWorkOccurrence {
  item: WorkItem;
  problem: string;
  requiredResult: string;
}

/** The RO facts Work reads — the object page's own shape. */
export type RepairOrderWorkSource = Pick<
  RepairOrderDetail,
  | "id" | "ro_no" | "ro_doc_date" | "version" | "supplier_name" | "issued" | "supplier_received_at"
  | "return_target_date" | "cancelled_at" | "units" | "sends" | "consents"
>;

/** `U1-000-001` · `U1-000-001 + 2 more` — the governed `{first} + {n} more`. */
export function repairOrderUnitsPhrase(unitIds: readonly string[]): string {
  const ids = [...unitIds].sort();
  if (ids.length === 0) return REPAIR_ORDER_ABSENT;
  return ids.length === 1 ? ids[0]! : `${ids[0]} + ${ids.length - 1} more`;
}

function klDateOf(iso: string): IsoDate {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type RepairOrderReturnWorkSource = Pick<RepairOrderWorkSource,
  "id" | "ro_no" | "supplier_name" | "supplier_received_at" | "return_target_date" | "cancelled_at"> & {
  units: ReadonlyArray<Pick<RepairOrderWorkSource["units"][number], "unit_id" | "goods_received_date">>;
};

function repairOrderWorkItemFactory(
  ro: Pick<RepairOrderWorkSource,"id"|"ro_no">, owner: WorkspaceDutyResolution | null,
  today: IsoDate, holidays: ReadonlySet<string>,
) {
  const office = { offDays: PURCHASING_OFFICE_OFF_DAYS, holidays };
  const late = (due: IsoDate | null) => (due && due < today ? countWorkingDays(due, today, office) : 0);
  return (ruleKey: RepairOrderWorkRule, action: string, dueIso: IsoDate | null): WorkItem => ({
    ruleKey,
    module: "purchasing",
    soRef: ro.ro_no,
    orderId: ro.id,
    action,
    ownerRule: "po_duty",
    ownerDutyKey: "po_duty",
    normalOwner: owner?.normalOwner ?? null,
    activeCover: owner?.activeCover ?? null,
    actingPerson: owner?.actingPerson ?? null,
    ownerState: owner?.state ?? "not_assigned",
    ownerName: owner?.actingPerson?.name ?? null,
    ownerUserId: owner?.actingPerson?.userId ?? null,
    ...(owner?.actingPerson ? {} : { ownerDuty: "PO Duty" }),
    tone: late(dueIso) > 0 ? "warning" : "info",
    locked: false,
    broken: false,
    dueIso,
    workingDaysLate: late(dueIso),
  });
}

/** The same return obligation for Work and a server-only receipt completion probe. */
export function repairOrderReturnWorkItems(ro: RepairOrderReturnWorkSource,
  owner: WorkspaceDutyResolution | null, today: IsoDate, holidays: ReadonlySet<string> = myHolidaySet(),
): RepairOrderWorkOccurrence[] {
  if (ro.cancelled_at || !ro.supplier_received_at || !ro.return_target_date || ro.return_target_date >= today) return [];
  const outstanding = ro.units.filter(unit => !unit.goods_received_date).map(unit => unit.unit_id);
  if (!outstanding.length) return [];
  const make = repairOrderWorkItemFactory(ro, owner, today, holidays);
  return [{item: make(REPAIR_ORDER_WORK_RULE.returnDatePassed,
    `Ask ${ro.supplier_name ?? "the Supplier"} when ${repairOrderUnitsPhrase(outstanding)} will return`, ro.return_target_date),
    problem: "The repair return date has passed", requiredResult: "The Units are received back"}];
}

export function repairOrderWorkItems(
  ro: RepairOrderWorkSource,
  owner: WorkspaceDutyResolution | null,
  today: IsoDate,
  holidays: ReadonlySet<string> = myHolidaySet(),
): RepairOrderWorkOccurrence[] {
  if (ro.cancelled_at) return [];
  const office = { offDays: PURCHASING_OFFICE_OFF_DAYS, holidays };
  const supplier = ro.supplier_name ?? "the Supplier";
  const make = repairOrderWorkItemFactory(ro, owner, today, holidays);

  const out: RepairOrderWorkOccurrence[] = [];

  // (a) Issue — due the next Office working day after the RO Doc Date.
  if (!ro.issued) {
    out.push({
      item: make(REPAIR_ORDER_WORK_RULE.issue, `Issue repair order to ${supplier}`, addWorkingDays(ro.ro_doc_date, 1, office)),
      problem: "Sending not confirmed",
      requiredResult: "The current repair order version is marked as sent",
    });
  } else if (!ro.supplier_received_at) {
    // (b) Supplier receipt — due the next Office working day after the send.
    const sends = ro.sends.filter((s) => s.version === ro.version).map((s) => s.sent_at).sort();
    const sentOn = sends.length ? klDateOf(sends[0]!) : null;
    out.push({
      item: make(
        REPAIR_ORDER_WORK_RULE.confirmReceipt,
        `Ask ${supplier} to confirm they received ${ro.ro_no}`,
        sentOn ? addWorkingDays(sentOn, 1, office) : null,
      ),
      problem: "Awaiting Supplier receipt of RO",
      requiredResult: "Supplier receipt of the repair order is recorded",
    });
  }

  out.push(...repairOrderReturnWorkItems(ro, owner, today, holidays));

  // (d) Owner consent for non-Carres-owned Units — never an Issue gate, no date.
  const consent = repairOrderConsentOutstanding(ro);
  if (consent.length > 0) {
    const owners = [...new Set(consent.map((u) => u.owner_name).filter((n): n is string => Boolean(n)))];
    const who = owners.length === 1 ? owners[0]! : "the owner";
    out.push({
      item: make(
        REPAIR_ORDER_WORK_RULE.ownerConsent,
        `Ask ${who} to agree to repair ${repairOrderUnitsPhrase(consent.map((u) => u.unit_id))}`,
        null,
      ),
      problem: "Owner consent not recorded",
      requiredResult: "The owner's consent is recorded",
    });
  }
  return out;
}

export const repairOrderDestination = (id: string) => `/operation?tab=repair-orders&ro=${encodeURIComponent(id)}`;

/** Every open RO's occurrences on the Work feed's transport contract — the
 *  one mapping the API feed, the completion probe and the dev preview run. */
export function projectRepairOrderWork(input: {
  repairOrders: readonly RepairOrderWorkSource[];
  poDuty: WorkspaceDutyResolution | null;
  today: IsoDate;
  observedAt?: string;
  holidays?: ReadonlySet<string>;
}): OperationWorkItem[] {
  const holidays = input.holidays ?? myHolidaySet();
  return input.repairOrders.flatMap((ro) =>
    repairOrderWorkItems(ro, input.poDuty, input.today, holidays).map(occurrence =>
      repairOrderOccurrenceToWork(ro, occurrence, input.today, input.observedAt)),
  );
}

function repairOrderOccurrenceToWork(ro: Pick<RepairOrderWorkSource,"id"|"ro_no"|"supplier_name">,
  {item,problem,requiredResult}: RepairOrderWorkOccurrence, today: IsoDate, observedAt?: string,
): OperationWorkItem {
  return operationWorkItemFromProjection(item, {
        object: { kind: "repair_order", id: ro.id, label: ro.ro_no },
        problem,
        recipient: item.ruleKey === REPAIR_ORDER_WORK_RULE.ownerConsent ? null : ro.supplier_name,
        requiredResult,
        destination: repairOrderDestination(ro.id),
        today: today,
        ...(observedAt ? { observedAt: observedAt } : {}),
      });
}

export function projectRepairOrderReturnWork(input: {
  repairOrder: RepairOrderReturnWorkSource; today: IsoDate; observedAt?: string;
}): OperationWorkItem[] {
  return repairOrderReturnWorkItems(input.repairOrder,null,input.today).map(occurrence =>
    repairOrderOccurrenceToWork(input.repairOrder,occurrence,input.today,input.observedAt));
}

/** Physical return completion only; cancellation belongs to the RO's own door. */
export function repairOrderReturnReceiptResult(ro: {
  cancelled_at: string | null;
  units: ReadonlyArray<{goods_received_date: string | null; grn_no: string | null}>;
}): string | null {
  if (ro.cancelled_at || !ro.units.length || ro.units.some(unit=>!unit.goods_received_date)) return null;
  const grns=[...new Set(ro.units.map(unit=>unit.grn_no).filter((grn): grn is string=>Boolean(grn)))].sort();
  return `grn=${grns.join(",") || "posted"}`;
}
