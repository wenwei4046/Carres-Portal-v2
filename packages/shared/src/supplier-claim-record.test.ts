import { describe, expect, it } from "vitest";
import {
  SUPPLIER_CLAIM_COLUMN_ORDER,
  SUPPLIER_CLAIM_WORK_RULE,
  projectSupplierClaimWork,
  supplierClaimAnswerParts,
  supplierClaimCurrentAction,
  supplierClaimFooter,
  supplierClaimItemsLine,
  supplierClaimReplyDates,
  supplierClaimReplyMissing,
  supplierClaimReplyState,
  supplierClaimStatusWord,
  supplierClaimUnitLine,
  type SupplierClaimFacts,
} from "./supplier-claim-record";
import { WORK_RULES } from "./work-engine";

const NO_HOLIDAYS = new Set<string>();
// Monday 28 Sep 2026, 10:00 KL.
const ASKED = "2026-09-28T02:00:00Z";
const claim = (over: Partial<SupplierClaimFacts> = {}): SupplierClaimFacts => ({
  id: "c1", claim_no: "SC-1019", status: "open", supplier_name: "Hooka",
  requested_action: "replace", requested_at: ASKED, supplier_response: null, sent: true, ...over,
});
const person = { userId: "00000000-0000-4000-8000-000000000001", name: "Shasha" };
const duty = { dutyKey: "po_duty", onDate: "2026-09-28", state: "primary", normalOwner: person, buddy: null, activeCover: null, actingPerson: person, assignmentId: "00000000-0000-4000-8000-000000000002" } as never;

describe("Supplier Claims register cells (§9.5, 2026-09-18)", () => {
  it("keeps the confirmed twelve-column order", () => {
    expect(SUPPLIER_CLAIM_COLUMN_ORDER).toEqual(["select", "expand", "status", "claim", "reported", "supplier", "po", "grn", "items", "qty", "problem", "response"]);
  });
  it("displays In progress for open; stored words stay", () => {
    expect(["open", "closed", "cancelled"].map(supplierClaimStatusWord)).toEqual(["In progress", "Closed", "Cancelled"]);
  });
  it("prints the five-way Unit line and never invents a Unit ID", () => {
    const u = (code: string | null, scope = "unit") => ({ id: code ?? "q", unit_code: code, identity_scope: scope, qty: 1 });
    expect(supplierClaimUnitLine(null)).toBe("Units could not be loaded");
    expect(supplierClaimUnitLine([])).toBe("Unit not recorded");
    expect(supplierClaimUnitLine([u("U1-000-075")])).toBe("U1-000-075");
    expect(supplierClaimUnitLine([u("U1-000-075"), u("U1-000-076")])).toBe("2 Units");
    expect(supplierClaimUnitLine([u(null, "quantity")])).toBe("Counted stock");
  });
  it("reads {first} + {n} more for more than one model", () => {
    expect(supplierClaimItemsLine(["Jager", "Jager"])).toBe("Jager");
    expect(supplierClaimItemsLine(["Jager", "Ohana", "Mira"])).toBe("Jager + 2 more");
    expect(supplierClaimItemsLine([])).toBeNull();
  });
  it("counts claims only in the footer", () => {
    expect(supplierClaimFooter(1, 1)).toBe("1 Supplier Claim");
    expect(supplierClaimFooter(71, 71)).toBe("71 Supplier Claims");
    expect(supplierClaimFooter(5, 71)).toBe("5 of 71 Supplier Claims");
  });
});

describe("the reply form names what is missing", () => {
  const draft = { response: "repair", scope: "claim" as const, unitIds: [], supplierDate: null, note: "", evidenceCount: 1, spokeWith: "", spokenAt: null };
  it("is saveable with an answer, a scope and one file", () => {
    expect(supplierClaimReplyMissing(draft)).toEqual([]);
  });
  it("names the answer, the Units, the evidence and the note", () => {
    expect(supplierClaimReplyMissing({ ...draft, response: null, scope: null })).toEqual(["Supplier's answer", "Applies to"]);
    expect(supplierClaimReplyMissing({ ...draft, scope: "units" })).toEqual(["These Units"]);
    expect(supplierClaimReplyMissing({ ...draft, evidenceCount: 0 })).toEqual(["Evidence"]);
    expect(supplierClaimReplyMissing({ ...draft, evidenceCount: 0, spokeWith: "Mr Tan" })).toEqual(["Evidence"]);
    expect(supplierClaimReplyMissing({ ...draft, evidenceCount: 0, spokeWith: "Mr Tan", spokenAt: "2026-09-28T10:00" })).toEqual([]);
    expect(supplierClaimReplyMissing({ ...draft, response: "reject" })).toEqual(["Note"]);
    expect(supplierClaimReplyMissing({ ...draft, response: "other_agreement", note: "New cushion" })).toEqual([]);
  });
});

describe("reply timing: 2 + 2 Office working days from the ask", () => {
  it("dates Reply expected and escalation on the Office calendar", () => {
    expect(supplierClaimReplyDates(ASKED, undefined, NO_HOLIDAYS)).toEqual({ askedOn: "2026-09-28", replyExpected: "2026-09-30", escalateOn: "2026-10-02" });
    // Asked Thursday: the weekend does not count.
    expect(supplierClaimReplyDates("2026-10-01T02:00:00Z", undefined, NO_HOLIDAYS).replyExpected).toBe("2026-10-05");
  });
  it("walks Not recorded → Reply expected → Reply overdue → Escalated → answered", () => {
    expect(supplierClaimReplyState({ requested_at: null, supplier_response: null }, "2026-09-28", NO_HOLIDAYS)).toEqual({ kind: "not_recorded" });
    expect(supplierClaimReplyState(claim(), "2026-09-30", NO_HOLIDAYS)).toEqual({ kind: "expected", date: "2026-09-30" });
    expect(supplierClaimReplyState(claim(), "2026-10-01", NO_HOLIDAYS)).toEqual({ kind: "overdue", date: "2026-09-30" });
    expect(supplierClaimReplyState(claim(), "2026-10-02", NO_HOLIDAYS)).toEqual({ kind: "escalated", date: "2026-10-02" });
    expect(supplierClaimReplyState(claim({ supplier_response: "repair" }), "2026-10-09", NO_HOLIDAYS)).toEqual({ kind: "answered" });
  });
  it("reads the timing the ask SNAPSHOTTED, never a live setting (0607)", () => {
    const snap = claim({ reply_waiting_days: 3, escalation_extra_days: 1 });
    expect(supplierClaimReplyState(snap, "2026-10-01", NO_HOLIDAYS)).toEqual({ kind: "expected", date: "2026-10-01" });
    expect(supplierClaimReplyState(snap, "2026-10-02", NO_HOLIDAYS)).toEqual({ kind: "escalated", date: "2026-10-02" });
    // Asked before 0607: no snapshot → the governed starting values 2 and 2.
    expect(supplierClaimReplyState(claim({ reply_waiting_days: null }), "2026-09-30", NO_HOLIDAYS)).toEqual({ kind: "expected", date: "2026-09-30" });
    const items = projectSupplierClaimWork({ claims: [snap], poDuty: duty, approver: duty, today: "2026-10-01", holidays: NO_HOLIDAYS });
    expect(items.map((i) => [i.ruleKey, i.timing.actionOn])).toEqual([["claims.obtain_reply", "2026-10-01"]]);
  });
});

describe("scope honesty in the answer line", () => {
  it("prints a whole-claim answer as the claim's, and exact Units as their IDs", () => {
    expect(supplierClaimAnswerParts({ response: "repair", scope: "claim", unitCodes: [] })).toEqual({ answer: "Repair", scope: "Whole claim" });
    expect(supplierClaimAnswerParts({ response: "repair", scope: "units", unitCodes: ["U1-000-075", "U1-000-076"] }).scope).toBe("U1-000-075 + 1 more");
    expect(supplierClaimAnswerParts({ response: "repair", scope: null, unitCodes: [] }).scope).toBe("Not recorded");
  });
});

describe("the record's ONE current action", () => {
  it("leads from the ask, to the send, to the reply", () => {
    expect(supplierClaimCurrentAction(claim({ requested_at: null, requested_action: null, sent: false }), NO_HOLIDAYS)?.button).toBe("Record what we asked");
    const notSent = supplierClaimCurrentAction(claim({ sent: false }), NO_HOLIDAYS);
    expect(notSent).toMatchObject({ fact: "The supplier claim is not issued", instruction: "Share the claim with Hooka and record the actual message sent", button: "Claim sent to supplier", date: "2026-09-29" });
    expect(supplierClaimCurrentAction(claim(), NO_HOLIDAYS)).toMatchObject({ fact: "Hooka has not replied", instruction: "Ask Hooka to reply to the supplier claim", button: "Record supplier reply", date: "2026-09-30" });
    expect(supplierClaimCurrentAction(claim({ supplier_response: "reject" }), NO_HOLIDAYS)).toMatchObject({ fact: "The supplier refused the claim", button: null });
    expect(supplierClaimCurrentAction(claim({ supplier_response: "repair" }), NO_HOLIDAYS)).toBeNull();
    expect(supplierClaimCurrentAction(claim({ status: "closed" }), NO_HOLIDAYS)).toBeNull();
  });
});

describe("Supplier Claim Work (one engine, own projector)", () => {
  const run = (c: SupplierClaimFacts, today: string) =>
    projectSupplierClaimWork({ claims: [c], poDuty: duty, approver: duty, today, holidays: NO_HOLIDAYS });
  it("registers its three rules", () => {
    for (const key of Object.values(SUPPLIER_CLAIM_WORK_RULE)) expect(WORK_RULES.some((r) => r.key === key)).toBe(true);
  });
  it("asks for the send when an ask has no send evidence", () => {
    const items = run(claim({ sent: false }), "2026-09-28");
    expect(items.map((i) => [i.ruleKey, i.action, i.timing.actionOn])).toEqual([["claims.issue_claim", "Share the claim with Hooka and record the actual message sent", "2026-09-29"]]);
    expect(items[0]!.destination).toBe("/operation?tab=claims&claim=c1");
  });
  it("chases the reply from Reply expected, and raises the approver after the extra days", () => {
    expect(run(claim(), "2026-09-30").map((i) => [i.ruleKey, i.timing.actionOn])).toEqual([["claims.obtain_reply", "2026-09-30"]]);
    const late = run(claim(), "2026-10-02");
    expect(late.map((i) => [i.ruleKey, i.action])).toEqual([
      ["claims.obtain_reply", "Ask Hooka to reply to the supplier claim"],
      ["claims.no_reply_decision", "Decide how Carres will resolve the item problem"],
    ]);
  });
  it("projects nothing once the reply is recorded, before any ask, or on a closed claim", () => {
    expect(run(claim({ supplier_response: "replacement" }), "2026-10-09")).toEqual([]);
    expect(run(claim({ requested_at: null, requested_action: null }), "2026-10-09")).toEqual([]);
    expect(run(claim({ status: "cancelled" }), "2026-10-09")).toEqual([]);
  });
});
