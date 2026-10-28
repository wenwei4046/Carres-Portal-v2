import { z } from "zod";
import { addWorkingDays } from "./working-days";
import { myHolidaySet } from "./my-holidays";
import { purchasingOfficeDays, type PurchasingOfficeDays } from "./purchasing-supplier-calls";
import { PO_DELAY_REASONS } from "./po-workspace";
import { GOODS_CATEGORY_WORDS } from "./line-category";

/**
 * ⭐ REPAIR ORDERS — the owner-approved vocabulary, column order, rail
 * conditions and route stops. `docs/purchasing/MASTER.md` §9.7 (2026-09-18 /
 * 19 / 20 / 28) and `docs/COPY-STANDARD.md` "Repair Orders".
 *
 * ONE place: the API, the register, the object page and the tests all read
 * these words and this arithmetic from here (ERP-ARCHITECTURE law D).
 *
 * Nothing here stores or moves anything. Every stage is DERIVED from a fact
 * somebody else owns — a confirmed send, a recorded Supplier receipt, Stock's
 * pickup event, a posted GRN — and an unknown fact returns `null`, never a
 * guess and never a zero.
 */

export const REPAIR_ORDER_ABSENT = "Not recorded";
export const REPAIR_ORDER_NOT_ISSUED = "Not issued";
export const REPAIR_ORDER_SENDING_NOT_CONFIRMED = "Sending not confirmed";
export const REPAIR_ORDER_AWAITING_RECEIPT = "Awaiting Supplier receipt of RO";
export const REPAIR_ORDER_SUPPLIER_DATE_NOT_REPORTED = "Supplier date not reported";

// ── Cost Responsibility: a responsibility WORD, never money ─────────────────
export const REPAIR_COST_RESPONSIBILITIES = ["not_decided", "carres_pays", "supplier_pays"] as const;
export type RepairCostResponsibility = (typeof REPAIR_COST_RESPONSIBILITIES)[number];
export const REPAIR_COST_RESPONSIBILITY_LABEL: Record<RepairCostResponsibility, string> = {
  not_decided: "Not decided",
  carres_pays: "Carres pays",
  supplier_pays: "Supplier pays",
};

// ── the problem choices: the SAME words as Report a problem ──────────────────
/** §9.7 Create Repair Order: `Damaged` · `Missing component` · `Something else`
 *  — the values of `unitProblemChoices`, never a second vocabulary. */
export const REPAIR_PROBLEM_CHOICES = [
  { value: "damaged", label: "Damaged" },
  { value: "missing_component", label: "Missing component" },
  { value: "something_else", label: "Something else" },
] as const;
export type RepairProblem = (typeof REPAIR_PROBLEM_CHOICES)[number]["value"];
export function repairProblemLabel(value: string): string {
  return REPAIR_PROBLEM_CHOICES.find((c) => c.value === value)?.label ?? REPAIR_ORDER_ABSENT;
}

// ── the register: 17 columns, exactly in this order (§9.7, 2026-09-20) ───────
export const REPAIR_ORDER_COLUMN_ORDER = [
  "ro_doc_date",
  "ro_no",
  "supplier",
  "claim_no",
  "category",
  "po_unit",
  "items",
  "qty",
  "repair_requirement",
  "cost_responsibility",
  "pickup_location",
  "actual_pickup_date",
  "return_location",
  "expected_return_date",
  "returned_qty",
  "goods_received_date",
  "grn_no",
] as const;
export type RepairOrderColumnKey = (typeof REPAIR_ORDER_COLUMN_ORDER)[number];
export const REPAIR_ORDER_COLUMN_LABEL: Record<RepairOrderColumnKey, string> = {
  ro_doc_date: "RO Doc Date",
  ro_no: "RO No",
  supplier: "Supplier",
  claim_no: "Supplier Claim No",
  category: "Category",
  po_unit: "PO No / Unit ID",
  items: "Items",
  qty: "Qty",
  repair_requirement: "Repair Requirement",
  cost_responsibility: "Cost Responsibility",
  pickup_location: "Supplier Pickup Location",
  actual_pickup_date: "Actual Pickup Date",
  return_location: "Supplier Return Location",
  expected_return_date: "Expected Return Date",
  returned_qty: "Returned Qty",
  goods_received_date: "Goods Received Date",
  grn_no: "GRN No",
};

/** The read-only per-Unit inspector, exactly in this order. */
export const REPAIR_ORDER_UNIT_COLUMN_ORDER = [
  "category",
  "po_unit",
  "items",
  "qty",
  "problem",
  "evidence",
  "pickup_location",
  "collected_by",
  "actual_pickup_date",
  "return_location",
  "goods_received_date",
] as const;
export type RepairOrderUnitColumnKey = (typeof REPAIR_ORDER_UNIT_COLUMN_ORDER)[number];
export const REPAIR_ORDER_UNIT_COLUMN_LABEL: Record<RepairOrderUnitColumnKey, string> = {
  category: "Category",
  po_unit: "PO No / Unit ID",
  items: "Items",
  qty: "Qty",
  problem: "Problem",
  evidence: "Evidence",
  pickup_location: "Supplier Pickup Location",
  collected_by: "Collected By",
  actual_pickup_date: "Actual Pickup Date",
  return_location: "Supplier Return Location",
  goods_received_date: "Goods Received Date",
};

// ── rows ─────────────────────────────────────────────────────────────────────
export interface RepairOrderEvidenceFile {
  path: string;
  kind: "photo" | "video";
  source: "unit" | "claim";
}

export interface RepairOrderUnitRow {
  stock_item_id: string;
  unit_id: string;
  po_no: string | null;
  sku: string | null;
  category: string | null;
  item: string | null;
  item_spec: string | null;
  ownership: string | null;
  /** The recorded owner of a non-Carres-owned Unit (Stock's supplier on the
   *  Unit), read for the owner-consent follow-up; absent on older reads. */
  owner_name?: string | null;
  /** The Unit is Display goods at its site (second line under the location). */
  display: boolean;
  problem: string;
  problem_note: string;
  repair_requirement: string;
  evidence: RepairOrderEvidenceFile[];
  collected_by: string | null;
  actual_pickup_date: string | null;
  goods_received_date: string | null;
  grn_no: string | null;
  /** Receiving recorded evidence for the return leg. */
  return_proof: boolean | null;
  pickup_proof: boolean | null;
  /** Hold released after the return receipt: the inspection result exists. */
  inspected: boolean;
}

export interface RepairOrderReply {
  id: string;
  expected_return_date: string | null;
  reason: string;
  note: string | null;
  reference: string;
  recorded_by: string | null;
  recorded_at: string;
}

export interface RepairOrderConsent {
  id: string;
  stock_item_ids: string[];
  outcome: "given" | "refused";
  evidence: string;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface RepairOrderSend {
  version: number;
  recipient: string;
  channel: string;
  sent_by: string | null;
  sent_at: string;
}

export interface RepairOrderListRow {
  id: string;
  ro_no: string;
  ro_doc_date: string;
  version: number;
  supplier_id: string;
  supplier_name: string | null;
  claim_id: string | null;
  claim_no: string | null;
  cost_responsibility: RepairCostResponsibility;
  price: number | null;
  pickup_site_id: string;
  pickup_site_name: string | null;
  return_site_id: string;
  return_site_name: string | null;
  /** A confirmed send of the CURRENT version exists. */
  issued: boolean;
  supplier_received_at: string | null;
  return_target_date: string | null;
  cancelled_at: string | null;
  latest_reply: RepairOrderReply | null;
  units: RepairOrderUnitRow[];
}

export interface RepairOrderDetail extends RepairOrderListRow {
  quotation_path: string | null;
  supplier_received_source: string | null;
  supplier_received_evidence: string | null;
  return_target_working_days: number | null;
  return_target_calendar: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  sends: RepairOrderSend[];
  replies: RepairOrderReply[];
  consents: RepairOrderConsent[];
  /** Stock's repair-return arrival source for this RO, when planned. */
  pickup_source_id: string | null;
}

// ── derived facts: ONE arithmetic ────────────────────────────────────────────
export const repairOrderQty = (row: Pick<RepairOrderListRow, "units">) => row.units.length;
export const repairOrderPickedUp = (row: Pick<RepairOrderListRow, "units">) =>
  row.units.filter((u) => u.actual_pickup_date).length;
export const repairOrderReturnedQty = (row: Pick<RepairOrderListRow, "units">) =>
  row.units.filter((u) => u.goods_received_date).length;
export const repairOrderInspected = (row: Pick<RepairOrderListRow, "units">) =>
  row.units.filter((u) => u.goods_received_date && u.inspected).length;

function latest(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present.length ? present[present.length - 1]! : null;
}
export const repairOrderActualPickupDate = (row: RepairOrderListRow) =>
  latest(row.units.map((u) => u.actual_pickup_date));
export const repairOrderGoodsReceivedDate = (row: RepairOrderListRow) =>
  latest(row.units.map((u) => u.goods_received_date));

/** `GRN No`: one prints itself; several read `{n} GRNs`; none is blank. */
export function repairOrderGrnCell(row: RepairOrderListRow): string {
  const grns = [...new Set(row.units.map((u) => u.grn_no).filter((g): g is string => Boolean(g)))];
  if (grns.length === 0) return "";
  if (grns.length === 1) return grns[0]!;
  return `${grns.length} GRNs`;
}

/** Supplier-reported date: the latest reply's date, `Supplier date not
 *  reported` when a reply gave none, `Not recorded` when nobody replied. */
export function repairOrderExpectedReturn(row: Pick<RepairOrderListRow, "latest_reply">): string | null {
  return row.latest_reply?.expected_return_date ?? null;
}

/** `Repair Requirement`: several read `{first} + {n} more`. */
export function repairOrderRequirementCell(row: RepairOrderListRow): string {
  const reqs = [...new Set(row.units.map((u) => u.repair_requirement))];
  if (reqs.length === 0) return REPAIR_ORDER_ABSENT;
  return reqs.length === 1 ? reqs[0]! : `${reqs[0]} + ${reqs.length - 1} more`;
}

export function repairOrderPoNo(row: RepairOrderListRow): string | null {
  const pos = [...new Set(row.units.map((u) => u.po_no).filter((p): p is string => Boolean(p)))];
  if (pos.length === 0) return null;
  return pos.join(" · ");
}
/** Categories in the dictionary's display order (`Mattress` · `Bedframe` ·
 *  `Sofa` · `Pillow` · `Mattress protector` …), never first-seen order. */
export function repairOrderCategory(row: RepairOrderListRow): string | null {
  const rank = (c: string) => {
    const i = (GOODS_CATEGORY_WORDS as readonly string[]).indexOf(c);
    return i < 0 ? GOODS_CATEGORY_WORDS.length : i;
  };
  const cats = [...new Set(row.units.map((u) => u.category).filter((c): c is string => Boolean(c)))].sort((a, b) => rank(a) - rank(b));
  return cats.length ? cats.join(" · ") : null;
}
export function repairOrderItems(row: RepairOrderListRow): string | null {
  const items = [...new Set(row.units.map((u) => u.item).filter((c): c is string => Boolean(c)))];
  return items.length ? items.join(" · ") : null;
}
export function repairOrderItemSpec(row: RepairOrderListRow): string | null {
  const specs = [...new Set(row.units.map((u) => u.item_spec).filter((c): c is string => Boolean(c)))];
  return specs.length ? specs.join(" · ") : null;
}

// ── the rail: five groups, factual predicates, counts of DOCUMENTS ───────────
export const REPAIR_ORDER_RAIL_SECTIONS = [
  { key: "supplier", title: "Supplier" },
  { key: "document", title: "Repair order" },
  { key: "pickup", title: "Pickup" },
  { key: "return", title: "Return" },
  { key: "evidence", title: "Evidence" },
] as const;
export type RepairOrderRailSection = (typeof REPAIR_ORDER_RAIL_SECTIONS)[number]["key"];

export const REPAIR_ORDER_CONDITION_ORDER = [
  "Sending not confirmed",
  "Not picked up",
  "Partly picked up",
  "Fully picked up",
  "Not returned",
  "Partly returned",
  "Fully returned",
  "Pickup proof missing",
  "Return proof missing",
] as const;
export type RepairOrderCondition = (typeof REPAIR_ORDER_CONDITION_ORDER)[number];
export const REPAIR_ORDER_CONDITION_SECTION: Record<RepairOrderCondition, Exclude<RepairOrderRailSection, "supplier">> = {
  "Sending not confirmed": "document",
  "Not picked up": "pickup",
  "Partly picked up": "pickup",
  "Fully picked up": "pickup",
  "Not returned": "return",
  "Partly returned": "return",
  "Fully returned": "return",
  "Pickup proof missing": "evidence",
  "Return proof missing": "evidence",
};

export function repairOrderConditions(row: RepairOrderListRow): RepairOrderCondition[] {
  const out: RepairOrderCondition[] = [];
  const n = repairOrderQty(row);
  const picked = repairOrderPickedUp(row);
  const returned = repairOrderReturnedQty(row);
  if (!row.issued) out.push("Sending not confirmed");
  out.push(picked === 0 ? "Not picked up" : picked < n ? "Partly picked up" : "Fully picked up");
  out.push(returned === 0 ? "Not returned" : returned < n ? "Partly returned" : "Fully returned");
  if (row.units.some((u) => u.actual_pickup_date && u.pickup_proof === false)) out.push("Pickup proof missing");
  if (row.units.some((u) => u.goods_received_date && u.return_proof === false)) out.push("Return proof missing");
  return out;
}

export interface RepairOrderFilter {
  supplier?: string | null;
  condition?: RepairOrderCondition | null;
}
export function repairOrderMatches(row: RepairOrderListRow, f: RepairOrderFilter): boolean {
  if (f.supplier && (row.supplier_name ?? REPAIR_ORDER_ABSENT) !== f.supplier) return false;
  if (f.condition && !repairOrderConditions(row).includes(f.condition)) return false;
  return true;
}
export function repairOrderSupplierCounts(rows: readonly RepairOrderListRow[], f: Omit<RepairOrderFilter, "supplier"> = {}) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!repairOrderMatches(row, { condition: f.condition })) continue;
    const name = row.supplier_name ?? REPAIR_ORDER_ABSENT;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([supplier, count]) => ({ supplier, count })).sort((a, b) => a.supplier.localeCompare(b.supplier));
}
export function repairOrderConditionCounts(rows: readonly RepairOrderListRow[], f: Omit<RepairOrderFilter, "condition"> = {}) {
  return REPAIR_ORDER_CONDITION_ORDER.map((condition) => ({
    condition,
    count: rows.filter((row) => repairOrderMatches(row, { supplier: f.supplier }) && repairOrderConditions(row).includes(condition)).length,
  })).filter((c) => c.count > 0);
}

/** Footer: documents, never Units. */
export function repairOrderFooter(visible: number, total: number): string {
  if (visible !== total) return `${visible} of ${total} Repair Orders`;
  return total === 1 ? "1 Repair Order" : `${total} Repair Orders`;
}

// ── the route and the ONE current action (§9.7 RO object page, 2026-09-28) ───
export const REPAIR_ORDER_ROUTE_STOPS = ["Issue", "Supplier received RO", "Picked up", "Returned", "Inspected"] as const;
export type RepairOrderRouteStop = (typeof REPAIR_ORDER_ROUTE_STOPS)[number];

export type RepairOrderStage =
  | "not_issued"
  | "awaiting_receipt"
  | "waiting_pickup"
  | "out_for_repair"
  | "returned_not_inspected"
  | "complete"
  | "cancelled";

export function repairOrderStage(row: RepairOrderListRow): RepairOrderStage {
  if (row.cancelled_at) return "cancelled";
  if (!row.issued) return "not_issued";
  if (!row.supplier_received_at) return "awaiting_receipt";
  const n = repairOrderQty(row);
  if (repairOrderPickedUp(row) < n) return "waiting_pickup";
  if (repairOrderReturnedQty(row) < n) return "out_for_repair";
  if (repairOrderInspected(row) < n) return "returned_not_inspected";
  return "complete";
}

/** Each stop is done, current, or ahead. */
export function repairOrderRoute(row: RepairOrderListRow): { stop: RepairOrderRouteStop; state: "done" | "current" | "ahead" }[] {
  const stage = repairOrderStage(row);
  const index: Record<RepairOrderStage, number> = {
    not_issued: 0,
    awaiting_receipt: 1,
    waiting_pickup: 2,
    out_for_repair: 3,
    returned_not_inspected: 4,
    complete: 5,
    cancelled: -1,
  };
  const at = index[stage];
  return REPAIR_ORDER_ROUTE_STOPS.map((stop, i) => ({
    stop,
    state: at < 0 ? "ahead" : i < at ? "done" : i === at ? "current" : "ahead",
  }));
}

/** `1 Unit` · `{n} Units` — every RO sentence that counts Units. */
export function repairOrderUnitCount(n: number): string {
  return n === 1 ? "1 Unit" : `${n} Units`;
}

export type RepairOrderDoor = "issue" | "record_receipt" | "open_pickup" | "record_reply" | "open_receiving";

export interface RepairOrderCurrentAction {
  lineOne: string;
  lineTwo: string;
  door: RepairOrderDoor;
  button: string;
}

/** The exact owner-approved sentences, one primary door per stop. */
export function repairOrderCurrentAction(row: RepairOrderListRow, fmt: (iso: string) => string = (d) => d): RepairOrderCurrentAction | null {
  const supplier = row.supplier_name ?? "the Supplier";
  const n = repairOrderQty(row);
  switch (repairOrderStage(row)) {
    case "not_issued":
      return {
        lineOne: `Send ${row.ro_no} to ${supplier}`,
        lineTwo: `The 14 working days start when ${supplier} receives it.`,
        door: "issue",
        button: "Issue repair order",
      };
    case "awaiting_receipt":
      return {
        lineOne: `Ask ${supplier} to confirm they received ${row.ro_no}`,
        lineTwo: "Target starts when they confirm.",
        door: "record_receipt",
        button: "Record Supplier receipt",
      };
    case "waiting_pickup": {
      const left = n - repairOrderPickedUp(row);
      return {
        lineOne: `Hand ${repairOrderUnitCount(left)} to ${supplier}`,
        lineTwo: "Warehouse records who collected them.",
        door: "open_pickup",
        button: "Outbound",
      };
    }
    case "out_for_repair": {
      const left = n - repairOrderReturnedQty(row);
      return {
        lineOne: `Waiting for ${supplier} to return ${repairOrderUnitCount(left)}`,
        lineTwo: row.return_target_date ? `Carres return target ${fmt(row.return_target_date)}` : REPAIR_ORDER_AWAITING_RECEIPT,
        door: "record_reply",
        button: "Record Supplier reply",
      };
    }
    case "returned_not_inspected": {
      const left = repairOrderReturnedQty(row) - repairOrderInspected(row);
      return {
        lineOne: `Inspect ${left} returned ${left === 1 ? "Unit" : "Units"}`,
        lineTwo: "Available again only after inspection.",
        door: "open_receiving",
        button: "Receiving",
      };
    }
    default:
      return null;
  }
}

/** The header's document state word. */
export function repairOrderDocumentState(row: RepairOrderListRow): string {
  if (row.cancelled_at) return "Cancelled";
  return row.issued ? "Issued" : REPAIR_ORDER_NOT_ISSUED;
}

// ── the Carres return target: 14 OFFICE working days from Supplier receipt ───
/** The calendar the target is counted on, named (Law 2A: an action that does
 *  not name its calendar is not finished). Snapshotted onto the RO. Since
 *  9 Oct 2026 it is the STORED Office calendar (Settings → Office: its
 *  weekdays and its holidays; the built-in list for a year nobody recorded),
 *  which the 0678 door checks the target against. */
export const REPAIR_ORDER_TARGET_CALENDAR = "office-calendar";
export const REPAIR_ORDER_DEFAULT_WORKING_DAYS = 14;

/** The KL business date of an instant. */
export function klDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function repairOrderReturnTarget(
  receivedAtIso: string,
  workingDays: number = REPAIR_ORDER_DEFAULT_WORKING_DAYS,
  /** The stored Office calendar (`officeWorkingDayOptions`) or a holiday set. */
  holidays: PurchasingOfficeDays = myHolidaySet(),
): string {
  return addWorkingDays(klDate(receivedAtIso), workingDays, purchasingOfficeDays(holidays));
}

// ── inputs ───────────────────────────────────────────────────────────────────
const words = z.string().trim().min(1);
export const repairOrderEvidenceSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["photo", "video"]),
  source: z.enum(["unit", "claim"]),
}).strict();

export const repairOrderCreateInputSchema = z.object({
  request_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  supplier_claim_id: z.string().uuid().nullable().optional(),
  cost_responsibility: z.enum(REPAIR_COST_RESPONSIBILITIES),
  /** Optional; absent is unknown, never RM0. */
  price: z.number().nonnegative().nullable().optional(),
  quotation_path: z.string().trim().min(1).nullable().optional(),
  pickup_site_id: z.string().uuid(),
  return_site_id: z.string().uuid(),
  units: z.array(z.object({
    stock_item_id: z.string().uuid(),
    problem: z.enum(["damaged", "missing_component", "something_else"]),
    problem_note: z.string().trim().min(3).max(300),
    repair_requirement: z.string().trim().min(1).max(500),
    evidence: z.array(repairOrderEvidenceSchema).max(12).default([]),
  }).strict()).min(1).max(200),
}).strict();
export type RepairOrderCreateInput = z.infer<typeof repairOrderCreateInputSchema>;

export const repairOrderIssueInputSchema = z.object({
  channel: z.enum(["whatsapp", "email", "print"]),
  recipient: words.max(200),
  note: z.string().trim().max(500).nullable().optional(),
}).strict();

export const repairOrderReceiptInputSchema = z.object({
  received_at: z.string().datetime({ offset: true }),
  source: z.enum(["whatsapp", "email", "phone", "print"]),
  reference: words.max(300),
}).strict();

export const REPAIR_ORDER_REPLY_REASONS = PO_DELAY_REASONS;
export const repairOrderReplyInputSchema = z.object({
  expected_return_date: z.string().date().nullable().optional(),
  reason: z.enum(PO_DELAY_REASONS),
  note: z.string().trim().max(500).nullable().optional(),
  reference: words.max(300),
  stock_item_ids: z.array(z.string().uuid()).max(200).optional(),
}).strict().superRefine((v, c) => {
  if (v.reason === "Other" && !v.note) c.addIssue({ code: "custom", message: "Say what the other reason is." });
});

export const repairOrderConsentInputSchema = z.object({
  stock_item_ids: z.array(z.string().uuid()).min(1).max(200),
  outcome: z.enum(["given", "refused"]),
  evidence: words.max(300),
  note: z.string().trim().max(500).nullable().optional(),
}).strict();

export const repairOrderCancelInputSchema = z.object({ reason: words.max(300) }).strict();

/** Non-Carres-owned Units on the RO with no recorded `given` consent. */
export function repairOrderConsentOutstanding(detail: Pick<RepairOrderDetail, "units" | "consents">): RepairOrderUnitRow[] {
  const given = new Set(detail.consents.filter((c) => c.outcome === "given").flatMap((c) => c.stock_item_ids));
  return detail.units.filter((u) => (u.ownership ?? "carres_owned") !== "carres_owned" && !given.has(u.stock_item_id));
}

/** The eligible-Unit row the Add Units drawer lists. */
export interface RepairOrderEligibleUnit {
  id: string;
  unit_id: string;
  sku: string;
  item: string | null;
  po_no: string | null;
  site_id: string;
  site_name: string | null;
  display: boolean;
  ownership: string | null;
  /** NULL = can be ticked; otherwise the reason printed on the row. */
  refusal: string | null;
}

// ── the A4 REPAIR ORDER (docs/pdf/DOCUMENT-KIT.md §3 rules 11–12, §4) ────────
/**
 * What the paper prints — and nothing else. MONEY-FREE BY SHAPE: there is no
 * price, quotation or cost field here, so the template cannot print one
 * (DOCUMENT-KIT §4: a printed repair price reads as Carres accepting the
 * supplier's charge). `photos` are the Unit's and the Claim's own evidence,
 * read through (signed URLs from the API; the browser turns them into images).
 */
export interface RepairOrderPrintData {
  ro_no: string;
  version: number;
  ro_doc_date: string;
  supplier: { name: string; address: string | null; contact: string | null };
  /** Only when the RO came from a Supplier Claim. */
  claim_no: string | null;
  pickup: { name: string; address: string | null };
  return_to: { name: string; address: string | null };
  /** The RO's recording actor — the family footer's audit cell. */
  issued_by: string | null;
  units: Array<{
    unit_id: string;
    po_no: string | null;
    category: string | null;
    item: string | null;
    item_spec: string | null;
    /** The governed problem word (`Damaged` · `Missing component` · `Something else`). */
    problem: string;
    /** `What happened, in one sentence` — printed verbatim in the Reason box. */
    problem_note: string;
    repair_requirement: string;
    photos: string[];
  }>;
}
