import { describe, it, expect } from "vitest";
import {
  CASE_STEP_ORDER,
  caseCloseBlockerMessage,
  caseFollowUpPlan,
  caseMayClose,
  caseNextStep,
  caseOpenSteps,
  caseTimeline,
  type CaseProgressEntry,
} from "./service-case-plan";
import { CASE_WANTS } from "./service-case-intake";

const PARTIES = { customerName: "Ryan Chong", supplierName: "Ohana" };

function recorded(step: string, on = "2026-07-27"): CaseProgressEntry {
  return { step, on, at: "2026-07-27T02:00:00Z", by: "u1", byRole: "operation" };
}

function keys(steps: { key: string }[]): string[] {
  return steps.map((s) => s.key);
}

describe("caseFollowUpPlan — what the customer asked for decides what happens", () => {
  it("gives a repair the full chain: date · collect · out · back · redeliver", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["repair"] });
    expect(keys(plan)).toEqual([
      "supplier_date",
      "collect",
      "at_supplier",
      "back_from_supplier",
      "redeliver",
      "customer_confirmed",
    ]);
  });

  it("does not send a REPLACEMENT to the factory — the old item comes back, a new one goes out", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["replace"] });
    expect(keys(plan)).toEqual(["supplier_date", "collect", "redeliver", "customer_confirmed"]);
  });

  it("collects nothing for missing parts — there is nothing wrong with what the customer has", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["missing_parts"] });
    expect(keys(plan)).toEqual(["supplier_date", "redeliver", "customer_confirmed"]);
    expect(plan.find((s) => s.key === "redeliver")?.label).toBe(
      "Deliver the missing parts to Ryan Chong",
    );
  });

  it("asks the factory for nothing when the customer only wants a look", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["inspection"] });
    expect(keys(plan)).toEqual(["inspect", "customer_confirmed"]);
  });

  it("brings the item back for a refund but sends nothing out again", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["refund"] });
    expect(keys(plan)).toEqual(["collect", "customer_confirmed"]);
  });

  it("merges two wants into ONE chain, never two collections", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["repair", "replace"] });
    expect(keys(plan).filter((k) => k === "collect")).toHaveLength(1);
    expect(keys(plan).filter((k) => k === "redeliver")).toHaveLength(1);
  });

  it("names what we are asking the factory for, in the card's own order", () => {
    const ask = (w: Parameters<typeof caseFollowUpPlan>[0]["customerWants"]) =>
      caseFollowUpPlan({ ...PARTIES, customerWants: w }).find((s) => s.key === "supplier_date")
        ?.label;

    expect(ask(["replace", "repair"])).toBe("Call Ohana — confirm the replacement date");
    expect(ask(["missing_parts", "repair"])).toBe("Call Ohana — confirm the parts date");
    expect(ask(["repair"])).toBe("Call Ohana — confirm the repair date");
  });

  it("always ends with the customer, whatever was asked for — including nothing", () => {
    for (const w of CASE_WANTS) {
      const plan = caseFollowUpPlan({ ...PARTIES, customerWants: [w.key] });
      expect(plan[plan.length - 1].key).toBe("customer_confirmed");
    }
    // A case filed before the wizard has no answers at all. It still cannot be
    // closed without the customer saying so.
    expect(keys(caseFollowUpPlan({}))).toEqual(["customer_confirmed"]);
  });

  it("runs in the chain's order, never the order the wants were ticked in", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["refund", "inspection", "repair"] });
    const order = CASE_STEP_ORDER as readonly string[];
    const positions = keys(plan).map((k) => order.indexOf(k));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("uses the role word only where no name is stored", () => {
    const plan = caseFollowUpPlan({ customerWants: ["repair"] });
    expect(plan.find((s) => s.key === "supplier_date")?.label).toBe(
      "Call the supplier — confirm the repair date",
    );
    expect(plan.find((s) => s.key === "collect")?.label).toBe(
      "Collect the item from the customer",
    );
  });

  it("keeps every label inside the 10-word action line", () => {
    const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["repair", "inspection"] });
    for (const s of plan) expect(s.label.split(/\s+/).length).toBeLessThanOrEqual(10);
  });
});

describe("the close gate — the card's acceptance", () => {
  const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["replace"] });

  it("refuses to close while any step is still open", () => {
    expect(caseMayClose(plan, [])).toBe(false);
    expect(caseMayClose(plan, [recorded("supplier_date"), recorded("collect")])).toBe(false);
  });

  it("refuses to close on the customer's step alone — the work still has to have happened", () => {
    expect(caseMayClose(plan, [recorded("customer_confirmed")])).toBe(false);
  });

  it("refuses to close on the work alone — the customer has the last word", () => {
    expect(
      caseMayClose(plan, [recorded("supplier_date"), recorded("collect"), recorded("redeliver")]),
    ).toBe(false);
  });

  it("closes once every step of the chain has an outcome on file", () => {
    expect(caseMayClose(plan, plan.map((s) => recorded(s.key)))).toBe(true);
  });

  it("names what is still open, so the refusal tells the reader what to do", () => {
    const open = caseOpenSteps(plan, [recorded("supplier_date")]);
    const msg = caseCloseBlockerMessage(open);
    expect(msg).toContain("Collect the item from Ryan Chong");
    expect(msg).toContain("Call Ryan Chong — confirm the problem is solved");
    expect(msg).not.toContain("confirm the replacement date");
  });

  it("ignores a recorded step the plan does not ask for", () => {
    // Recording something outside the plan must not buy a close.
    expect(caseMayClose(plan, [recorded("at_supplier"), recorded("back_from_supplier")])).toBe(
      false,
    );
  });
});

describe("caseNextStep — which one the list row shows", () => {
  const plan = caseFollowUpPlan({ ...PARTIES, customerWants: ["repair"] });

  it("shows the first step with nothing recorded against it", () => {
    expect(caseNextStep(plan, [])?.key).toBe("supplier_date");
    expect(caseNextStep(plan, [recorded("supplier_date")])?.key).toBe("collect");
  });

  it("does not skip a gap — an out-of-order record leaves the earlier step showing", () => {
    expect(caseNextStep(plan, [recorded("redeliver")])?.key).toBe("supplier_date");
  });

  it("shows nothing at all once the chain is complete", () => {
    expect(caseNextStep(plan, plan.map((s) => recorded(s.key)))).toBeNull();
  });
});

describe("caseTimeline", () => {
  const repair = { ...PARTIES, customerWants: ["repair"] as const };

  it("reads as the action while open and as the fact once done", () => {
    const rows = caseTimeline(repair, [recorded("supplier_date")]);
    expect(rows[0].label).toBe("Ohana gave a date");
    expect(rows[1].label).toBe("Collect the item from Ryan Chong");
  });

  it("keeps a recorded step the plan no longer asks for, and still names the factory", () => {
    // The intake answers stay editable; history does not.
    const thin = { ...PARTIES, customerWants: ["refund"] as const };
    const rows = caseTimeline(thin, [recorded("at_supplier")]);
    expect(rows.map((r) => r.key)).toContain("at_supplier");
    expect(rows.find((r) => r.key === "at_supplier")?.label).toBe("At Ohana");
  });

  it("carries the recorded outcome so the screen never re-reads the ledger", () => {
    const rows = caseTimeline(repair, [recorded("collect", "2026-07-20")]);
    expect(rows.find((r) => r.key === "collect")?.entry).toMatchObject({
      on: "2026-07-20",
      byRole: "operation",
    });
  });
});
