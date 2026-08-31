import { addWorkingDays, isWorkingDay } from "./working-days";
import { myHolidaySet } from "./my-holidays";

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
}

export interface ReceivingRegisterSession {
  id: string;
  sourceId: string;
  grnNumber: string | null;
  goodsReceivedAt: string | null;
  supplierDoNo: string | null;
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
}

export interface ReceivingRegisterResult {
  parents: ReceivingRegisterParent[];
  rail: ReceivingDateRailRow[];
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
  return { parents, rail };
}
