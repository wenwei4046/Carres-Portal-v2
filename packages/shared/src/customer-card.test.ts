import { describe, expect, it } from "vitest";
import { customerCardModel, mytDayOf, type CustomerCardInput, type CustomerContactFact } from "./customer-card";

const spell = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

function input(over: Partial<CustomerCardInput> = {}): CustomerCardInput {
  return {
    todayIso: "2026-10-22",
    companyName: "AL Logistics",
    requestedIso: "2026-10-27",
    scheduledIso: null,
    deliveredIso: null,
    contactCheck: { dueIso: "2026-10-24", state: "not_open" },
    contacts: [],
    partnerAnswer: null,
    delayNoticeRequired: false,
    settled: false,
    spell,
    ...over,
  };
}

const contact = (over: Partial<CustomerContactFact>): CustomerContactFact => ({
  atIso: "2026-10-21T03:00:00Z",
  purpose: "confirm_delivery_date",
  channel: "call",
  result: "no_answer",
  person: "customer",
  evidencePath: null,
  note: null,
  by: "Shasha",
  ...over,
});

describe("owner correction 2026-09-25 — the logistics company contacts the customer", () => {
  it("normal partner scheduling: read-only, the company's deadline, NO Carres act", () => {
    const m = customerCardModel(input());
    expect(m.status).toEqual({ text: "AL Logistics contacts the customer · by 24 Oct", tone: "future" });
    expect(m.action).toBeNull();
    expect(m.exception).toBeNull();
  });

  it("even on the deadline day and after it, there is no routine Carres contact act", () => {
    expect(customerCardModel(input({ todayIso: "2026-10-24", contactCheck: { dueIso: "2026-10-24", state: "open" } })).action).toBeNull();
    expect(customerCardModel(input({ todayIso: "2026-10-26", contactCheck: { dueIso: "2026-10-24", state: "missed" } })).action).toBeNull();
    expect(customerCardModel(input({ contacts: [contact({ result: "no_answer", person: "partner" })] })).action).toBeNull();
  });

  it("after the arrangement: Scheduled {date}", () => {
    expect(customerCardModel(input({ scheduledIso: "2026-10-27" })).status).toEqual({ text: "Scheduled 27 Oct", tone: "neutral" });
  });

  it("no company: Logistics not assigned — never a guessed partner", () => {
    expect(customerCardModel(input({ companyName: null })).status.text).toBe("Logistics not assigned");
  });
});

describe("the four Carres exceptions, each through its owner's door", () => {
  it("1 · a known delay → Tell the customer the new date, in the Sales Order", () => {
    const m = customerCardModel(input({ delayNoticeRequired: true }));
    expect(m.status).toEqual({ text: "Delivery delayed · customer notice required", tone: "missed" });
    expect(m.action).toMatchObject({ act: "Tell the customer the new date", door: "sales_order" });
  });

  it("2 · Logistics recorded another date → Decide the next step, in Delivery", () => {
    const m = customerCardModel(input({ partnerAnswer: { kind: "another_date", proposedIso: "2026-10-30", atIso: "2026-10-22T02:00:00Z" } }));
    expect(m.status.text).toBe("Customer requested another date · 30 Oct");
    expect(m.action).toMatchObject({ act: "Decide the next step for this delivery", result: "The customer asked for 30 Oct", door: "delivery" });
  });

  it("3 · a refusal → Decide the next step, in Delivery", () => {
    const m = customerCardModel(input({ contacts: [contact({ result: "customer_refused_delivery", person: "partner" })] }));
    expect(m.status).toEqual({ text: "Customer refused delivery", tone: "missed" });
    expect(m.action?.door).toBe("delivery");
  });

  it("4 · wrong contact details → Correct the phone number, in the Sales Order", () => {
    const m = customerCardModel(input({ contacts: [contact({ result: "contact_details_incorrect" })] }));
    expect(m.status.text).toBe("Phone number is wrong");
    expect(m.action).toMatchObject({ act: "Correct the phone number", door: "sales_order" });
  });

  it("a Scheduled date settles another-date; delivered ends every exception", () => {
    expect(customerCardModel(input({ scheduledIso: "2026-10-30", partnerAnswer: { kind: "another_date", proposedIso: "2026-10-30", atIso: "2026-10-22T02:00:00Z" } })).action).toBeNull();
    const done = customerCardModel(input({ deliveredIso: "2026-10-27", delayNoticeRequired: true }));
    expect(done.status.text).toBe("Delivered · 27 Oct");
    expect(done.action).toBeNull();
  });
});

describe("the Carres business day", () => {
  it("07:30 MYT Fri 23 Oct stored as 22 Oct 23:30Z is the 23rd", () => {
    expect(mytDayOf("2026-10-22T23:30:00Z")).toBe("2026-10-23");
    expect(mytDayOf("2026-10-23")).toBe("2026-10-23");
  });
});
