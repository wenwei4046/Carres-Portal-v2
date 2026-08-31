import { addWorkingDays, countWorkingDays, isWorkingDay } from "./working-days";
import { myHolidaySet } from "./my-holidays";
import {
  receivingProblemCopy,
  type WarehouseReceiptStatus,
} from "./warehouse-receipt";

export type ReceivingRegisterFilter = "late" | "later" | "none" | string;

export interface ReceivingRegisterSourceLine {
  id: string;
  sku: string;
  orderQty: number;
  receivedQty: number;
}

export interface ReceivingRegisterSource {
  id: string;
  kind: "purchase_order" | "consignment_order";
  version: number;
  issuedAt: string | null;
  supplier: string;
  deliverTo: string;
  poDeliveryDate: string | null;
  lines: readonly ReceivingRegisterSourceLine[];
}

export interface ReceivingRegisterPromise {
  sourceId: string;
  deliveryDate: string | null;
  recordedAt: string;
}

export interface ReceivingRegisterSessionLine {
  poLineId: string;
  sku: string;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  unitIds: readonly string[];
  damagedPhotos: readonly string[];
  wrongItemPhotos: readonly string[];
  extraEvidence: readonly string[];
  wrongItemReason: string | null;
}

export interface ReceivingRegisterSession {
  id: string;
  sourceId: string;
  status: WarehouseReceiptStatus;
  grnNumber: string | null;
  goodsReceivedAt: string | null;
  supplierDoNo: string | null;
  signedDoPath: string | null;
  returnReason: string | null;
  lines: readonly ReceivingRegisterSessionLine[];
}

export interface ReceivingRegisterChild {
  id: string;
  grnNumber: string | null;
  sourceNumber: string;
  poIssuedAt: string | null;
  supplier: string;
  deliverTo: string;
  poDeliveryDate: string | null;
  supplierDeliveryDate: string | null;
  sameAsPo: boolean;
  goodsReceivedAt: string | null;
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  pendingDeliveryQty: number;
  supplierDoNo: string | null;
  unitIds: string[];
  status: WarehouseReceiptStatus;
  signedDoPath: string | null;
  returnReason: string | null;
  lines: readonly ReceivingRegisterSessionLine[];
}

export interface ReceivingRegisterParent {
  id: string;
  sourceKind: "purchase_order" | "consignment_order";
  sourceNumber: string;
  sourceVersion: number;
  grnNumber: null;
  poIssuedAt: string | null;
  supplier: string;
  deliverTo: string;
  poDeliveryDate: string | null;
  supplierDeliveryDate: string | null;
  sameAsPo: boolean;
  receivingDate: string | null;
  goodsReceivedAt: string | null;
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  pendingDeliveryQty: number;
  supplierDoNo: null;
  unitIds: string[];
  /** Frozen source-line keys needed to start the one persistent session. */
  lines: ReceivingRegisterSourceLine[];
  children: ReceivingRegisterChild[];
}

export interface ReceivingDateRailRow {
  key: "late" | "later" | "none" | string;
  label: string;
  count: number;
}

export interface ReceivingRegisterInput {
  today: string;
  holidays?: readonly string[];
  filter?: ReceivingRegisterFilter | null;
  sources: readonly ReceivingRegisterSource[];
  supplierPromises: readonly ReceivingRegisterPromise[];
  sessions: readonly ReceivingRegisterSession[];
  authority?: ReceivingRegisterAuthority | null;
}

export interface ReceivingRegisterResult {
  parents: ReceivingRegisterParent[];
  rail: ReceivingDateRailRow[];
  authority: ReceivingRegisterAuthority | null;
}

export interface ReceivingAuthorityPerson {
  userId: string;
  name: string;
}

export interface ReceivingRegisterAuthority {
  normalGrnDuty: ReceivingAuthorityPerson | null;
  datedCover: ReceivingAuthorityPerson | null;
}

export interface ReceivingRegisterWorkItem {
  id: string;
  kind: "start" | "evidence" | "review" | "returned";
  sourceId: string;
  sessionId: string | null;
  fact: string;
  action: string;
  dueIso: string | null;
  workingDaysLate: number;
  destination: string;
  owner: ReceivingAuthorityPerson | null;
  normalOwner: ReceivingAuthorityPerson | null;
  datedCover: ReceivingAuthorityPerson | null;
  completionFact: string;
}

function sum(lines: readonly ReceivingRegisterSessionLine[], key: "receivedQty" | "damagedQty" | "wrongItemQty" | "extraQty"): number {
  return lines.reduce((total, line) => total + Math.max(0, Number(line[key]) || 0), 0);
}

function warehouseDates(today: string, holidays: readonly string[]): string[] {
  const options = { holidays };
  const first = isWorkingDay(today, options) ? today : addWorkingDays(today, 1, options);
  return Array.from({ length: 6 }, (_, index) =>
    index === 0 ? first : addWorkingDays(first, index, options),
  );
}

function bucketFor(date: string | null, dates: readonly string[]): "late" | "later" | "none" | string {
  if (!date) return "none";
  if (date < dates[0]!) return "late";
  if (dates.includes(date)) return date;
  return "later";
}

export function receivingDateRail(
  today: string,
  parents: readonly Pick<ReceivingRegisterParent, "receivingDate">[],
  holidays: readonly string[] = [...myHolidaySet()],
): ReceivingDateRailRow[] {
  const dates = warehouseDates(today, holidays);
  const keys = ["late", ...dates, "later", "none"];
  const counts = new Map(keys.map((key) => [key, 0]));
  for (const parent of parents) {
    const key = bucketFor(parent.receivingDate, dates);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({
    key,
    label: key === "late"
      ? "Late"
      : key === "later"
        ? "Later"
        : key === "none"
          ? "No delivery date"
          : key,
    count: counts.get(key) ?? 0,
  }));
}

export function buildReceivingRegister(input: ReceivingRegisterInput): ReceivingRegisterResult {
  const latestPromise = new Map<string, ReceivingRegisterPromise>();
  for (const promise of input.supplierPromises) {
    const current = latestPromise.get(promise.sourceId);
    if (!current || promise.recordedAt > current.recordedAt) {
      latestPromise.set(promise.sourceId, promise);
    }
  }
  const sessionsBySource = new Map<string, ReceivingRegisterSession[]>();
  for (const session of input.sessions) {
    const rows = sessionsBySource.get(session.sourceId) ?? [];
    rows.push(session);
    sessionsBySource.set(session.sourceId, rows);
  }

  const allParents = input.sources.map((source): ReceivingRegisterParent => {
    const promise = latestPromise.get(source.id);
    const supplierDeliveryDate = promise?.deliveryDate ?? source.poDeliveryDate;
    const sameAsPo = supplierDeliveryDate === source.poDeliveryDate;
    const orderQty = source.lines.reduce((total, line) => total + Math.max(0, line.orderQty), 0);
    const receivedQty = source.lines.reduce((total, line) => total + Math.max(0, line.receivedQty), 0);
    const sessions = (sessionsBySource.get(source.id) ?? [])
      .slice()
      .sort((a, b) => (b.goodsReceivedAt ?? "").localeCompare(a.goodsReceivedAt ?? ""));
    const damagedQty = sessions.reduce((total, row) => total + sum(row.lines, "damagedQty"), 0);
    const wrongItemQty = sessions.reduce((total, row) => total + sum(row.lines, "wrongItemQty"), 0);
    const extraQty = sessions.reduce((total, row) => total + sum(row.lines, "extraQty"), 0);
    const pendingDeliveryQty = Math.max(0, orderQty - receivedQty);
    const children = sessions.map((session): ReceivingRegisterChild => ({
      id: session.id,
      grnNumber: session.grnNumber,
      sourceNumber: source.id,
      poIssuedAt: source.issuedAt,
      supplier: source.supplier,
      deliverTo: source.deliverTo,
      poDeliveryDate: source.poDeliveryDate,
      supplierDeliveryDate,
      sameAsPo,
      goodsReceivedAt: session.goodsReceivedAt,
      orderQty,
      receivedQty: sum(session.lines, "receivedQty"),
      damagedQty: sum(session.lines, "damagedQty"),
      wrongItemQty: sum(session.lines, "wrongItemQty"),
      extraQty: sum(session.lines, "extraQty"),
      pendingDeliveryQty,
      supplierDoNo: session.supplierDoNo,
      unitIds: session.lines.flatMap((line) => [...line.unitIds]),
      status: session.status,
      signedDoPath: session.signedDoPath,
      returnReason: session.returnReason,
      lines: session.lines,
    }));
    return {
      id: source.id,
      sourceKind: source.kind,
      sourceNumber: source.id,
      sourceVersion: source.version,
      grnNumber: null,
      poIssuedAt: source.issuedAt,
      supplier: source.supplier,
      deliverTo: source.deliverTo,
      poDeliveryDate: source.poDeliveryDate,
      supplierDeliveryDate,
      sameAsPo,
      receivingDate: supplierDeliveryDate ?? source.poDeliveryDate,
      goodsReceivedAt: children[0]?.goodsReceivedAt ?? null,
      orderQty,
      receivedQty,
      damagedQty,
      wrongItemQty,
      extraQty,
      pendingDeliveryQty,
      supplierDoNo: null,
      unitIds: [],
      lines: source.lines.map((line) => ({ ...line })),
      children,
    };
  });

  const holidays = input.holidays ?? [...myHolidaySet()];
  const rail = receivingDateRail(input.today, allParents, holidays);
  const dates = rail.slice(1, 7).map((row) => row.key);
  const filter = input.filter;
  const parents = allParents
    .filter((parent) => !filter || bucketFor(parent.receivingDate, dates) === filter)
    .sort((a, b) => {
      if (a.receivingDate == null) return b.receivingDate == null ? a.sourceNumber.localeCompare(b.sourceNumber) : 1;
      if (b.receivingDate == null) return -1;
      return a.receivingDate.localeCompare(b.receivingDate) || a.sourceNumber.localeCompare(b.sourceNumber);
    });
  return { parents, rail, authority: input.authority ?? null };
}

function missingSessionWork(child: ReceivingRegisterChild): { fact: string; action: string } | null {
  if (!child.supplierDoNo || child.supplierDoNo.trim().length < 3) {
    return receivingProblemCopy("supplier_do_missing");
  }
  if (!child.signedDoPath?.trim()) return receivingProblemCopy("signed_do_missing");
  if (!child.goodsReceivedAt) return receivingProblemCopy("goods_received_at_missing");
  for (const line of child.lines) {
    const physical = Math.max(0, line.receivedQty)
      + Math.max(0, line.damagedQty)
      + Math.max(0, line.wrongItemQty)
      + Math.max(0, line.extraQty);
    if (line.unitIds.length < physical) {
      return receivingProblemCopy("unit_id_missing", {
        item: line.sku,
        document: child.sourceNumber,
      });
    }
    if (line.damagedQty > 0 && line.damagedPhotos.length === 0) {
      return receivingProblemCopy("damage_evidence_missing");
    }
    if (
      line.wrongItemQty > 0
      && (line.wrongItemPhotos.length === 0 || !line.wrongItemReason?.trim())
    ) {
      return receivingProblemCopy("wrong_item_details_missing");
    }
    if (line.extraQty > 0 && line.extraEvidence.length === 0) {
      return receivingProblemCopy("extra_goods_found");
    }
  }
  return null;
}

/**
 * Receiving owns the trigger and completion fact; central Work only renders
 * this projection. Ownership uses today's dated cover when present while Team
 * supervision keeps the normal GRN Duty separately.
 */
export function receivingWorkItems(
  register: ReceivingRegisterResult,
  today: string,
  holidays: readonly string[] = [...myHolidaySet()],
): ReceivingRegisterWorkItem[] {
  const authority = register.authority;
  const owner = authority?.datedCover ?? authority?.normalGrnDuty ?? null;
  const normalOwner = authority?.normalGrnDuty ?? null;
  const datedCover = authority?.datedCover ?? null;
  const out: ReceivingRegisterWorkItem[] = [];
  for (const parent of register.parents) {
    const active = parent.children.find((child) =>
      child.status === "draft" || child.status === "returned" || child.status === "submitted",
    );
    const destination = `/operation?tab=receiving&po=${encodeURIComponent(parent.id)}${active ? `&receipt=${encodeURIComponent(active.id)}` : ""}`;
    const base = {
      sourceId: parent.id,
      sessionId: active?.id ?? null,
      dueIso: parent.receivingDate,
      workingDaysLate: parent.receivingDate && today > parent.receivingDate
        ? countWorkingDays(parent.receivingDate, today, { offDays: [0], holidays })
        : 0,
      destination,
      owner,
      normalOwner,
      datedCover,
    };
    if (active?.status === "submitted") {
      out.push({
        ...base,
        id: `receiving:${active.id}:review`,
        kind: "review",
        fact: "The warehouse count is ready",
        action: `Check in ${parent.sourceNumber} from ${parent.supplier}`,
        completionFact: "The same Receiving Session has a stored formal GRN number",
      });
      continue;
    }
    if (active?.status === "returned") {
      const copy = receivingProblemCopy("count_needs_changes");
      out.push({
        ...base,
        id: `receiving:${active.id}:returned`,
        kind: "returned",
        ...copy,
        completionFact: "The same Receiving Session is corrected and resubmitted",
      });
      continue;
    }
    if (active?.status === "draft") {
      const missing = missingSessionWork(active);
      if (missing) {
        out.push({
          ...base,
          id: `receiving:${active.id}:evidence`,
          kind: "evidence",
          ...missing,
          completionFact: "The missing evidence is stored on the same Receiving Session",
        });
      }
      continue;
    }
    if (
      parent.pendingDeliveryQty > 0
      && parent.receivingDate
      && parent.receivingDate <= today
    ) {
      out.push({
        ...base,
        id: `receiving:${parent.id}:start`,
        kind: "start",
        fact: "The goods are due",
        action: `Check in ${parent.sourceNumber} from ${parent.supplier}`,
        completionFact: "A Receiving Session records the physical outcome and stored formal GRN",
      });
    }
  }
  return out;
}
