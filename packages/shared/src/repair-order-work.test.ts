import { describe, expect, it } from "vitest";
import { myHolidaySet } from "./my-holidays";
import type { RepairOrderDetail, RepairOrderUnitRow } from "./repair-order";
import { REPAIR_ORDER_WORK_RULE, repairOrderWorkItems, projectRepairOrderWork, projectRepairOrderReturnWork } from "./repair-order-work";
import { WORK_RULES } from "./work-engine";
import type { WorkspaceDutyResolution } from "./workspace-duty";

const HOLS = myHolidaySet();
const DUTY: WorkspaceDutyResolution = {
  dutyKey: "po_duty",
  onDate: "2026-10-01",
  normalOwner: { userId: "u-po", name: "PO Duty holder" },
  buddy: null,
  activeCover: null,
  actingPerson: { userId: "u-po", name: "PO Duty holder" },
  state: "primary",
  assignmentId: null,
};

const unit = (over: Partial<RepairOrderUnitRow> = {}): RepairOrderUnitRow => ({
  stock_item_id: "si-1", unit_id: "U1-000-001", po_no: "PO260901-1111", sku: "SKU", category: "Sofa", item: "Model",
  item_spec: null, ownership: "carres_owned", display: false, problem: "damaged", problem_note: "Torn seat",
  repair_requirement: "Replace the seat fabric", evidence: [], collected_by: null, actual_pickup_date: null,
  goods_received_date: null, grn_no: null, return_proof: null, pickup_proof: null, inspected: false, ...over,
});

const ro = (over: Partial<RepairOrderDetail> = {}): RepairOrderDetail => ({
  id: "ro-1", ro_no: "RO260928-4827", ro_doc_date: "2026-09-28", version: 1, supplier_id: "s-1", supplier_name: "Hooka",
  claim_id: null, claim_no: null, cost_responsibility: "not_decided", price: null, pickup_site_id: "w-1",
  pickup_site_name: "Carres Klang", return_site_id: "w-1", return_site_name: "Carres Klang", issued: false,
  supplier_received_at: null, return_target_date: null, cancelled_at: null, latest_reply: null, units: [unit()],
  quotation_path: null, supplier_received_source: null, supplier_received_evidence: null, return_target_working_days: null,
  return_target_calendar: null, cancel_reason: null, created_by: null, created_at: "2026-09-28T02:00:00Z",
  sends: [], replies: [], consents: [], pickup_source_id: null, ...over,
});

const keys = (r: RepairOrderDetail, today: string) => repairOrderWorkItems(r, DUTY, today, HOLS).map((o) => o.item.ruleKey);

describe("Repair Order Work — the four RO-owned obligations (Purchasing §9.7 · §10 · Workspace §6)", () => {
  it("every RO rule is registered with its five parts and a PO Duty owner", () => {
    for (const key of Object.values(REPAIR_ORDER_WORK_RULE)) {
      const rule = WORK_RULES.find((r) => r.key === key);
      expect(rule, key).toBeDefined();
      expect(rule!.module).toBe("purchasing");
      expect(rule!.ownerRule).toBe("po_duty");
      expect(rule!.completionFact.toLowerCase()).not.toContain("supplier reply");
    }
  });

  it("(a) an RO not confirmed sent asks PO Duty to issue it, due the next Office working day", () => {
    const [occ] = repairOrderWorkItems(ro(), DUTY, "2026-09-28", HOLS);
    expect(occ!.item.ruleKey).toBe(REPAIR_ORDER_WORK_RULE.issue);
    expect(occ!.item.action).toBe("Issue repair order to Hooka");
    expect(occ!.item.dueIso).toBe("2026-09-29");
    expect(occ!.item.ownerUserId).toBe("u-po");
    expect(occ!.item.soRef).toBe("RO260928-4827");
  });

  it("(b) sent but no Supplier receipt asks the supplier to confirm, and (a) is gone", () => {
    const sent = ro({ issued: true, sends: [{ version: 1, recipient: "Hooka group", channel: "whatsapp", sent_by: null, sent_at: "2026-09-29T03:00:00Z" }] });
    const items = repairOrderWorkItems(sent, DUTY, "2026-09-30", HOLS);
    expect(items.map((o) => o.item.ruleKey)).toEqual([REPAIR_ORDER_WORK_RULE.confirmReceipt]);
    expect(items[0]!.item.action).toBe("Ask Hooka to confirm they received RO260928-4827");
    expect(items[0]!.item.dueIso).toBe("2026-09-30");
    // A recorded receipt closes it.
    expect(keys({ ...sent, supplier_received_at: "2026-09-30T02:00:00Z", return_target_date: "2026-10-20" }, "2026-10-01")).toEqual([]);
  });

  it("(c) opens only once the Carres return target has PASSED and a Unit is still out", () => {
    const out = ro({
      issued: true, supplier_received_at: "2026-09-30T02:00:00Z", return_target_date: "2026-10-20",
      units: [unit({ actual_pickup_date: "2026-10-01T02:00:00Z" })],
    });
    expect(keys(out, "2026-10-20")).toEqual([]);
    const [occ] = repairOrderWorkItems(out, DUTY, "2026-10-21", HOLS);
    expect(occ!.item.ruleKey).toBe(REPAIR_ORDER_WORK_RULE.returnDatePassed);
    expect(occ!.item.action).toBe("Ask Hooka when U1-000-001 will return");
    expect(occ!.item.dueIso).toBe("2026-10-20");
    expect(occ!.item.workingDaysLate).toBe(1);
  });

  it("(c) a Supplier reply with a new date NEVER closes it; the return GRN does", () => {
    const base = ro({
      issued: true, supplier_received_at: "2026-09-30T02:00:00Z", return_target_date: "2026-10-20",
      units: [unit(), unit({ stock_item_id: "si-2", unit_id: "U1-000-002" })],
    });
    const replied = {
      ...base,
      latest_reply: { id: "r1", expected_return_date: "2026-11-30", reason: "Fabric shortage", note: null, reference: "WA", recorded_by: null, recorded_at: "2026-10-21T02:00:00Z" },
    };
    const [occ] = repairOrderWorkItems(replied, DUTY, "2026-10-22", HOLS);
    expect(occ!.item.action).toBe("Ask Hooka when U1-000-001 + 1 more will return");
    const partly = { ...replied, units: [unit({ goods_received_date: "2026-10-22T02:00:00Z", grn_no: "GRN-1" }), unit({ stock_item_id: "si-2", unit_id: "U1-000-002" })] };
    expect(repairOrderWorkItems(partly, DUTY, "2026-10-22", HOLS)[0]!.item.action).toBe("Ask Hooka when U1-000-002 will return");
    const back = { ...replied, units: replied.units.map((u) => ({ ...u, goods_received_date: "2026-10-23T02:00:00Z", grn_no: "GRN-1" })) };
    expect(keys(back, "2026-10-23")).toEqual([]);
  });

  it("(d) a non-Carres-owned Unit without a given consent keeps a no-date follow-up; refusal leaves it open", () => {
    const consign = ro({ units: [unit({ ownership: "supplier_consignment", owner_name: "Dorsettloft" })] });
    const found = repairOrderWorkItems(consign, DUTY, "2026-09-28", HOLS).find((o) => o.item.ruleKey === REPAIR_ORDER_WORK_RULE.ownerConsent);
    expect(found!.item.action).toBe("Ask Dorsettloft to agree to repair U1-000-001");
    expect(found!.item.dueIso).toBeNull();
    const refused = { ...consign, consents: [{ id: "c1", stock_item_ids: ["si-1"], outcome: "refused" as const, evidence: "WA", note: null, recorded_by: null, recorded_at: "2026-09-28T03:00:00Z" }] };
    expect(keys(refused, "2026-09-28")).toContain(REPAIR_ORDER_WORK_RULE.ownerConsent);
    const given = { ...consign, consents: [{ ...refused.consents[0]!, outcome: "given" as const }] };
    expect(keys(given, "2026-09-28")).not.toContain(REPAIR_ORDER_WORK_RULE.ownerConsent);
  });

  it("a cancelled RO raises nothing", () => {
    expect(keys(ro({ cancelled_at: "2026-09-28T05:00:00Z", units: [unit({ ownership: "supplier_consignment" })] }), "2026-09-28")).toEqual([]);
  });

  it("an unresolved PO Duty stays honestly unassigned under the duty word", () => {
    const [occ] = repairOrderWorkItems(ro(), null, "2026-09-28", HOLS);
    expect(occ!.item.ownerState).toBe("not_assigned");
    expect(occ!.item.ownerDuty).toBe("PO Duty");
  });
});

it("the minimal receipt probe projects the exact same return occurrence as the full Work feed",()=>{
  const source=ro({supplier_received_at:"2026-09-29T01:00:00Z",return_target_date:"2026-09-30"});
  const full=projectRepairOrderWork({repairOrders:[source],poDuty:null,today:"2026-10-05"})
    .filter(item=>item.ruleKey===REPAIR_ORDER_WORK_RULE.returnDatePassed);
  expect(projectRepairOrderReturnWork({repairOrder:source,today:"2026-10-05"})).toEqual(full);
});
