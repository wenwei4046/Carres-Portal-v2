import { describe, expect, it } from "vitest";
import {
  askedForNote,
  customerCardModel,
  customerFollowUpIso,
  customerWaitingOf,
  type CustomerCardInput,
  type CustomerContactFact,
} from "./customer-card";

const spell = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

function input(over: Partial<CustomerCardInput> = {}): CustomerCardInput {
  return {
    todayIso: "2026-10-24",
    holidays: [],
    contactBy: "operation",
    companyName: "AL Logistics",
    requestedIso: "2026-10-27",
    scheduledIso: null,
    deliveredIso: null,
    contactCheck: { dueIso: "2026-10-24", state: "open" },
    contacts: [],
    condoRequired: false,
    condoRecorded: false,
    settled: false,
    spell,
    ...over,
  };
}

const contact = (over: Partial<CustomerContactFact>): CustomerContactFact => ({
  atIso: "2026-10-23T03:00:00Z",
  purpose: "confirm_delivery_date",
  channel: "whatsapp",
  result: "waiting_for_customer_reply",
  evidencePath: null,
  note: null,
  by: "Shasha",
  ...over,
});

describe("the collapsed status line follows the governed precedence", () => {
  it("contact due today is the blue line when Carres contacts and nothing is recorded", () => {
    const m = customerCardModel(input());
    expect(m.status).toEqual({ text: "Contact due today", tone: "current" });
    expect(m.action?.act).toBe("Contact customer today");
    expect(m.action?.door).toBe("contact");
  });

  it("a future check reads its day, and the act names the day", () => {
    const m = customerCardModel(input({ todayIso: "2026-10-20", contactCheck: { dueIso: "2026-10-24", state: "not_open" } }));
    expect(m.status.text).toBe("Contact due 24 Oct");
    expect(m.action?.act).toBe("Contact customer by 24 Oct");
  });

  it("partner mode: the company contacts the customer and Carres has no routine act", () => {
    const m = customerCardModel(input({ contactBy: "partner" }));
    expect(m.mode).toBe("partner");
    expect(m.status.text).toBe("AL Logistics contacts the customer · by 24 Oct");
    expect(m.action).toBeNull();
  });

  it("no company assigned: Carres owns the contact even if the setting says partner", () => {
    const m = customerCardModel(input({ contactBy: "partner", companyName: null }));
    expect(m.mode).toBe("operation");
  });

  it("Record as sent → Waiting until the next Delivery working day; no act", () => {
    const m = customerCardModel(input({ todayIso: "2026-10-23", contactCheck: { dueIso: "2026-10-24", state: "not_open" }, contacts: [contact({})] }));
    expect(m.waiting).toBe(true);
    expect(m.followUpIso).toBe("2026-10-24");
    expect(m.status).toEqual({ text: "Waiting for customer", tone: "future" });
    expect(m.action).toBeNull();
  });

  it("on the follow-up day the row returns to To do: No answer · Follow up today", () => {
    const m = customerCardModel(input({ todayIso: "2026-10-24", contacts: [contact({ result: "no_answer" })] }));
    expect(m.waiting).toBe(false);
    expect(m.status.text).toBe("No answer — follow up");
    expect(m.action?.act).toBe("Contact customer today");
  });

  it("a missed deadline outranks waiting — Waiting never hides it", () => {
    const m = customerCardModel(
      input({ todayIso: "2026-10-26", contactCheck: { dueIso: "2026-10-24", state: "missed" }, contacts: [contact({ atIso: "2026-10-26T01:00:00Z" })] }),
    );
    expect(m.status).toEqual({ text: "Contact missed 24 Oct", tone: "missed" });
  });

  it("the customer asked for another date: amber line and the scheduled-delivery door", () => {
    const m = customerCardModel(
      input({ contacts: [contact({ result: "requested_another_date", note: askedForNote("2026-10-30"), evidencePath: "x.jpg" })] }),
    );
    expect(m.status).toEqual({ text: "Customer requested another date", tone: "attention" });
    expect(m.action).toMatchObject({ act: "Record scheduled delivery", result: "The customer asked for 30 Oct", door: "schedule" });
  });

  it("refusal and a wrong phone number send the operator to the Sales Order", () => {
    expect(customerCardModel(input({ contacts: [contact({ result: "customer_refused_delivery" })] })).status.tone).toBe("missed");
    const m = customerCardModel(input({ contacts: [contact({ result: "contact_details_incorrect" })] }));
    expect(m.status.text).toBe("Phone number is wrong");
    expect(m.action?.door).toBe("sales_order");
  });

  it("scheduled: the date is neutral; contact due today rides along only while the customer was never contacted", () => {
    const m = customerCardModel(input({ scheduledIso: "2026-10-27" }));
    expect(m.status).toEqual({ text: "Scheduled 27 Oct · Contact due today", tone: "current" });
    const later = customerCardModel(input({ scheduledIso: "2026-10-27", contacts: [contact({ result: "confirmed" })] }));
    expect(later.status).toEqual({ text: "Scheduled 27 Oct", tone: "neutral" });
    expect(later.action).toBeNull();
  });

  it("delivered wins over everything and closes the act", () => {
    const m = customerCardModel(input({ deliveredIso: "2026-10-27", contacts: [contact({ result: "no_answer" })] }));
    expect(m.status.text).toBe("Delivered 27 Oct");
    expect(m.action).toBeNull();
  });
});

describe("the three checks are stored facts", () => {
  it("contacted · agreed · address and access (condo registration included)", () => {
    const none = customerCardModel(input());
    expect(none.doneCount).toBe(0);
    const m = customerCardModel(
      input({
        scheduledIso: "2026-10-27",
        condoRequired: true,
        condoRecorded: false,
        contacts: [contact({ purpose: "confirm_delivery_address", result: "confirmed" })],
      }),
    );
    expect(m.checks.map((c) => c.done)).toEqual([true, true, false]);
    expect(customerCardModel({ ...input({ scheduledIso: "2026-10-27", condoRequired: true, condoRecorded: true, contacts: [contact({ purpose: "confirm_delivery_address", result: "confirmed" })] }) }).doneCount).toBe(3);
  });
});

describe("follow-up and message", () => {
  it("the follow-up day skips Sunday and public holidays (Delivery week)", () => {
    expect(customerFollowUpIso("2026-10-24T10:00:00Z")).toBe("2026-10-26");
    expect(customerFollowUpIso("2026-10-23T10:00:00Z", ["2026-10-24"])).toBe("2026-10-26");
  });

  it("silence is never waiting", () => {
    expect(customerWaitingOf({ latest: null, todayIso: "2026-10-23" })).toEqual({ waiting: false, followUpIso: null });
    expect(customerWaitingOf({ latest: { atIso: "2026-10-23T01:00:00Z", result: "confirmed" }, todayIso: "2026-10-23" }).waiting).toBe(false);
  });

});
