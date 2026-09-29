import { describe, expect, it } from "vitest";
import {
  SUPPLIER_CLAIM_DECISIONS,
  supplierClaimDecision,
  supplierClaimLegacyWords,
  PURCHASE_RETURN_WORK_RULE,
  WHAT_CARRES_DOES_NOT_RECORDED,
  carresNextWord,
  projectPurchaseReturnWork,
  purchaseReturnIssueMissing,
  purchaseReturnPickupState,
  purchaseReturnSendLine,
  purchaseReturnWorkItems,
  type PurchaseReturnDetail,
  type PurchaseReturnIssueSource,
} from "./purchase-return-record";

const NO_HOLIDAYS = new Set<string>();

const pr = (over: Partial<PurchaseReturnDetail> = {}): PurchaseReturnDetail => ({
  id: "pr-1",
  pr_no: "PR-20260929-1001",
  pr_doc_date: "2026-09-29T02:00:00Z",
  supplier_id: "s1",
  supplier_name: "Hooka",
  claim_no: "SC-1",
  supplier_claim_id: "c1",
  grn_no: null,
  sent_at: null,
  confirmed_pickup_date: null,
  units: [
    { unit_id: "U1-000-001", po_id: "PO-1", category: "Sofa", item: "Kaya", item_spec: null, pickup_location: "Carres Klang", return_to: "Lot 9, Muar", collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [] },
  ],
  sends: [],
  confirmations: [],
  ...over,
});

describe("Record what Carres does next — the three supplier-side decisions (owner ruling 2026-09-29)", () => {
  it("offers exactly Return to supplier · Repair · Replacement", () => {
    expect(SUPPLIER_CLAIM_DECISIONS.map((c) => c.label)).toEqual(["Return to supplier", "Repair", "Replacement"]);
    expect(SUPPLIER_CLAIM_DECISIONS.map((c) => c.key)).toEqual(["return_to_supplier", "repair", "replacement"]);
  });
  it("is ONE decision read from the facts the downstream doors read", () => {
    expect(supplierClaimDecision({ carres_execution: "return_to_supplier", customer_resolution: null })).toBe("return_to_supplier");
    expect(supplierClaimDecision({ carres_execution: null, customer_resolution: "repair" })).toBe("repair");
    expect(supplierClaimDecision({ carres_execution: null, customer_resolution: "replace" })).toBe("replacement");
    // A legacy customer movement or customer remedy is not a decision.
    expect(supplierClaimDecision({ carres_execution: "replace_first", customer_resolution: "accept_as_is" })).toBeNull();
  });
  it("keeps a legacy value readable as history, never translated", () => {
    expect(supplierClaimLegacyWords({ carres_execution: "collect_first", customer_resolution: "accept_as_is" })).toEqual(["Collect First", "Accept As-Is"]);
    expect(supplierClaimLegacyWords({ carres_execution: "return_to_supplier", customer_resolution: "repair" })).toEqual([]);
  });
  it("an unrecorded decision says so", () => {
    expect(carresNextWord(null)).toBe(WHAT_CARRES_DOES_NOT_RECORDED);
    expect(WHAT_CARRES_DOES_NOT_RECORDED).toBe("What Carres does · Not recorded");
    expect(carresNextWord("replacement")).toBe("Replacement");
  });
});

describe("the Purchase Return record states", () => {
  it("never says a document was not sent: an absent ledger row is `Sending not confirmed`", () => {
    expect(purchaseReturnSendLine(pr())).toEqual({ sent: false, text: "Sending not confirmed" });
    const sent = purchaseReturnSendLine(pr({ sends: [{ id: "d", channel: "whatsapp", recipient: "Ah Seng", sent_at: "2026-09-29T03:00:00Z", sent_by_name: "Mei" }] }));
    expect(sent).toEqual({ sent: true, text: "Return document sent · WhatsApp", date: "2026-09-29T03:00:00Z" });
  });
  it("reads Stock's pickup facts as Not / Partly / Fully picked up", () => {
    const two = pr().units.concat({ ...pr().units[0]!, unit_id: "U1-000-002" });
    expect(purchaseReturnPickupState(pr({ units: two }))).toBe("Not picked up");
    expect(purchaseReturnPickupState(pr({ units: [{ ...two[0]!, actual_pickup_date: "2026-10-01T02:00:00Z" }, two[1]!] }))).toBe("Partly picked up");
    expect(purchaseReturnPickupState(pr({ units: two.map((u) => ({ ...u, actual_pickup_date: "2026-10-01T02:00:00Z" })) }))).toBe("Fully picked up");
  });
});

describe("the Issue Purchase Return form", () => {
  const source: PurchaseReturnIssueSource = {
    claim_id: "c1", claim_no: "SC-1", supplier_name: "Hooka", return_address: null, grn_no: null,
    units: [{ stock_item_id: "a", unit_code: "U1-000-001", po_no: "PO-1", category: null, item: null, item_spec: null, pickup_location: "Carres Klang", seen: "t", refusal: null }],
  };
  it("names the missing return address in the approved words", () => {
    expect(purchaseReturnIssueMissing(source, ["a"])).toEqual(["Add the return address of Hooka"]);
  });
  it("asks for at least one Unit", () => {
    expect(purchaseReturnIssueMissing({ ...source, return_address: "Lot 9" }, [])).toEqual(["Tick the Units to return."]);
    expect(purchaseReturnIssueMissing({ ...source, return_address: "Lot 9" }, ["a"])).toEqual([]);
  });
});

describe("Purchase Return Work (PO Duty, Office calendar)", () => {
  const claim = { id: "c1", claim_no: "SC-1", supplier_name: "Hooka", carres_execution_at: "2026-09-29T02:00:00Z" };

  it("opens `Issue the purchase return to {Supplier}` on the claim, due the next Office working day", () => {
    const items = projectPurchaseReturnWork({ pendingIssue: [claim], returns: [], poDuty: null, today: "2026-09-29", holidays: NO_HOLIDAYS });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ruleKey: PURCHASE_RETURN_WORK_RULE.issue, action: "Issue the purchase return to Hooka", problem: "Not issued" });
    expect(items[0]!.timing.actionOn).toBe("2026-09-30");
    expect(items[0]!.destination).toBe("/operation?tab=claims&claim=c1");
  });

  it("asks for the send until the ledger has one", () => {
    const open = purchaseReturnWorkItems(pr(), null, "2026-09-29", NO_HOLIDAYS);
    expect(open.map((o) => o.item.ruleKey)).toContain(PURCHASE_RETURN_WORK_RULE.send);
    const sent = purchaseReturnWorkItems(pr({ sends: [{ id: "d", channel: "email", recipient: "x", sent_at: "2026-09-29T03:00:00Z", sent_by_name: null }] }), null, "2026-09-29", NO_HOLIDAYS);
    expect(sent.map((o) => o.item.ruleKey)).not.toContain(PURCHASE_RETURN_WORK_RULE.send);
  });

  it("`Confirm tomorrow's pickup · {Supplier}` (action · recipient) opens one Office working day before and closes on a confirmation for that date", () => {
    // Thu 1 Oct 2026 pickup → Wed 30 Sep is the day before.
    const planned = pr({ confirmed_pickup_date: "2026-10-01" });
    const rule = PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup;
    expect(purchaseReturnWorkItems(planned, null, "2026-09-29", NO_HOLIDAYS).map((o) => o.item.ruleKey)).not.toContain(rule);
    const due = purchaseReturnWorkItems(planned, null, "2026-09-30", NO_HOLIDAYS).find((o) => o.item.ruleKey === rule);
    expect(due?.item).toMatchObject({ action: "Confirm tomorrow's pickup", dueIso: "2026-09-30" });
    const card = projectPurchaseReturnWork({ pendingIssue: [], returns: [planned], poDuty: null, today: "2026-09-30", holidays: NO_HOLIDAYS }).find((i) => i.ruleKey === rule);
    expect(`${card?.action} · ${card?.recipient}`).toBe("Confirm tomorrow's pickup · Hooka");
    // A confirmation recorded at issue (before the day-before) does not close it.
    const early = pr({ confirmed_pickup_date: "2026-10-01", confirmations: [{ confirmed_pickup_date: "2026-10-01", evidence: "x", recorded_at: "2026-09-25T02:00:00Z", recorded_by_name: null }] });
    expect(purchaseReturnWorkItems(early, null, "2026-09-30", NO_HOLIDAYS).map((o) => o.item.ruleKey)).toContain(rule);
    const confirmed = pr({ confirmed_pickup_date: "2026-10-01", confirmations: [{ confirmed_pickup_date: "2026-10-01", evidence: "Ah Seng", recorded_at: "2026-09-30T01:00:00Z", recorded_by_name: null }] });
    expect(purchaseReturnWorkItems(confirmed, null, "2026-09-30", NO_HOLIDAYS).map((o) => o.item.ruleKey)).not.toContain(rule);
  });

  it("a passed date with nothing collected reads `Pickup missed · Follow up supplier` (fact · action); any collection closes it", () => {
    const passed = pr({ confirmed_pickup_date: "2026-10-01" });
    const missed = purchaseReturnWorkItems(passed, null, "2026-10-02", NO_HOLIDAYS).find((o) => o.item.ruleKey === PURCHASE_RETURN_WORK_RULE.pickupMissed);
    expect(`${missed?.problem} · ${missed?.item.action}`).toBe("Pickup missed · Follow up supplier");
    const collected = pr({ confirmed_pickup_date: "2026-10-01", units: [{ ...pr().units[0]!, actual_pickup_date: "2026-10-01T02:00:00Z" }] });
    expect(purchaseReturnWorkItems(collected, null, "2026-10-02", NO_HOLIDAYS)).toEqual([]);
  });

  it("every occurrence is PO Duty's and deep-links to its record", () => {
    const items = projectPurchaseReturnWork({ pendingIssue: [], returns: [pr({ confirmed_pickup_date: "2026-10-01" })], poDuty: null, today: "2026-09-30", holidays: NO_HOLIDAYS });
    for (const item of items) {
      expect(item.owner.rule).toBe("po_duty");
      expect(item.destination).toBe("/operation?tab=purchase-returns&pr=pr-1");
    }
  });
});

// ── §9.6 `Record supplier receipt` ──────────────────────────────────────────
import { purchaseReturnReceiptUnits, purchaseReturnReceiptMissing, RECORD_SUPPLIER_RECEIPT } from "./purchase-return-record";

describe("purchaseReturnReceiptUnits — only Units Stock picked up, each received once", () => {
  const unit = (unit_id: string, actual_pickup_date: string | null, supplier_received_date: string | null = null) =>
    ({ unit_id, stock_item_id: `s-${unit_id}`, po_id: null, category: null, item: null, item_spec: null, pickup_location: null, return_to: null, collected_by: null, actual_pickup_date, supplier_received_date, evidence: [] });
  it("offers a picked-up Unit, names the rest in the governed words, and never implies receipt from pickup", () => {
    const rows = purchaseReturnReceiptUnits({ units: [unit("U1", "2026-09-05T02:00:00Z"), unit("U2", null), unit("U3", "2026-09-05T02:00:00Z", "2026-09-07")] });
    expect(rows).toEqual([
      { stock_item_id: "s-U1", unit_id: "U1", refusal: null, pickedUpOn: "2026-09-05" },
      { stock_item_id: "s-U2", unit_id: "U2", refusal: "Not picked up", pickedUpOn: null },
      { stock_item_id: "s-U3", unit_id: "U3", refusal: "Already received 7 Sep 2026", pickedUpOn: "2026-09-05" },
    ]);
    expect(RECORD_SUPPLIER_RECEIPT).toBe("Record supplier receipt");
  });
  it("names what is missing before the door is asked", () => {
    expect(purchaseReturnReceiptMissing({ date: null, unitIds: [], files: 0, confirmedBy: "", confirmedAt: null })).toEqual([
      "Choose the Supplier Received Date.", "Tick the Units the supplier received.", "Add the evidence: a file, or who confirmed and when.",
    ]);
    expect(purchaseReturnReceiptMissing({ date: "2026-09-07", unitIds: ["s"], files: 0, confirmedBy: "Mr Tan", confirmedAt: null })).toEqual(["A confirmation needs who confirmed and when."]);
    expect(purchaseReturnReceiptMissing({ date: "2026-09-07", unitIds: ["s"], files: 1, confirmedBy: "", confirmedAt: null })).toEqual([]);
  });
});
