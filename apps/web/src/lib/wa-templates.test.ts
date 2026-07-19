import { describe, it, expect } from "vitest";
import {
  buildCustomerReminder,
  buildCustomerChase,
  buildCustomerFinalReminder,
  buildLogisticReminder,
  buildLogisticChase,
  buildSupplierReminder,
  buildSupplierChase,
  buildPartnerGroupMessage,
  itemsBlock,
  rmAmount,
  salutationOf,
  titleCaseName,
  waEncode,
} from "./wa-templates";

describe("wa-templates (two-tone locked copy, 2026-07-13)", () => {
  const oneLine = [{ sku: "Lumi FirmCare-L1201F-K", qty: 1 }];
  const multi = [
    { sku: "Lumi FirmCare-L1201F-K", qty: 2 },
    { sku: "Essential Memory Pillow(L)", qty: 3 },
  ];

  it("itemsBlock — ONE line per item, {qty}× {model}", () => {
    expect(itemsBlock(oneLine)).toBe("1× Lumi FirmCare-L1201F-K");
    expect(itemsBlock(multi)).toBe(
      "2× Lumi FirmCare-L1201F-K\n3× Essential Memory Pillow(L)",
    );
    expect(itemsBlock([])).toBe("—");
  });

  it("rmAmount — thousands-separated, no prefix", () => {
    expect(rmAmount(1749)).toBe("1,749");
    expect(rmAmount(0)).toBe("0");
    expect(rmAmount(1234567.4)).toBe("1,234,567");
  });

  it("salutation — preferred field wins; else Title-Case name; NEVER auto Mr/Ms", () => {
    expect(salutationOf("Ms Lee", "LEE WEI YANG")).toBe("Ms Lee");
    expect(salutationOf("", "LEE WEI YANG")).toBe("Lee Wei Yang");
    expect(salutationOf(null, null)).toBe("there");
    expect(titleCaseName("LEE WEI YANG")).toBe("Lee Wei Yang");
    // no auto-inferred title anywhere
    expect(salutationOf(null, "LEE WEI YANG")).not.toMatch(/\b(Mr|Ms|Mrs)\b/);
  });

  it("customer Reminder — exact locked copy, multi-line, no delivery date", () => {
    const t = buildCustomerReminder({
      salutation: "Lee Wei Yang",
      ref: "CR0902",
      outstanding: "1,749",
      lines: oneLine,
    });
    expect(t).toBe(
      "Hi Lee Wei Yang,\n" +
        "Just a friendly reminder regarding your order.\n" +
        "\n" +
        "REF: CR0902\n" +
        "Outstanding: RM 1,749\n" +
        "Item: 1× Lumi FirmCare-L1201F-K\n" +
        "\n" +
        "Do let us know once arranged. Thank you!",
    );
  });

  it("customer Chase — exact locked copy, firmer but no pressure phrasing", () => {
    const t = buildCustomerChase({
      salutation: "Lee Wei Yang",
      ref: "CR0902",
      outstanding: "1,749",
      lines: multi,
    });
    expect(t).toContain(
      "Following up on your order — the balance below is still outstanding.",
    );
    expect(t).toContain("REF: CR0902\nOutstanding: RM 1,749");
    expect(t).toContain(
      "Item: 2× Lumi FirmCare-L1201F-K\n3× Essential Memory Pillow(L)",
    );
    expect(t).toContain("Kindly arrange payment so we can proceed. Thank you!");
    // NO delivery date / pressure phrasing in ANY customer message.
    for (const msg of [
      t,
      buildCustomerReminder({ salutation: "X", ref: null, outstanding: "0", lines: oneLine }),
    ]) {
      expect(msg).not.toMatch(/deadline|deliver on time|settle by/i);
      expect(msg).not.toMatch(/SO-\d+/);
    }
  });

  it("customer FINAL reminder (delivery-eve, page-rebuild §3.2) — carries the when, still REF-led", () => {
    const t = buildCustomerFinalReminder({
      salutation: "Lee Wei Yang",
      ref: "CR0902",
      outstanding: "1,749",
      lines: oneLine,
      when: "tomorrow",
    });
    expect(t).toContain(
      "Final reminder — your delivery is arranged for tomorrow and the balance below is still outstanding.",
    );
    expect(t).toContain("REF: CR0902\nOutstanding: RM 1,749");
    expect(t).toContain(
      "Kindly settle before delivery so everything can proceed as planned. Thank you!",
    );
    expect(t).not.toMatch(/SO-\d+/);
    // "today" variant reads through verbatim.
    expect(
      buildCustomerFinalReminder({
        salutation: "X",
        ref: null,
        outstanding: "0",
        lines: oneLine,
        when: "today",
      }),
    ).toContain("arranged for today");
  });

  it("logistic Reminder + Chase — REF-led, never SO; Chase carries overdue", () => {
    const base = {
      logistic: "NETS",
      ref: "CR0902",
      customer: "LEE WEI YANG",
      region: "Puchong",
      lines: oneLine,
      deadline: "6 Jul 26",
      overdue: true,
    };
    const r = buildLogisticReminder(base);
    const c = buildLogisticChase(base);
    for (const t of [r, c]) {
      expect(t).toContain("Hi NETS,");
      expect(t).toContain("REF: CR0902");
      expect(t).toContain("Customer: LEE WEI YANG (Puchong)");
      expect(t).toContain("Item: 1× Lumi FirmCare-L1201F-K");
      expect(t).not.toMatch(/SO-\d+/);
    }
    expect(r).toContain("Friendly reminder");
    expect(r).not.toContain("overdue");
    expect(c).toContain("the deadline has passed");
    expect(c).toContain("Deadline: 6 Jul 26 — overdue");
  });

  it("supplier Reminder + Chase — PO-led, never SO", () => {
    const base = {
      poNo: "PO/2607-019",
      ref: "CR0902",
      lines: oneLine,
      deadline: "6 Jul 26",
    };
    const r = buildSupplierReminder(base);
    const c = buildSupplierChase(base);
    for (const t of [r, c]) {
      expect(t).toContain("PO: PO/2607-019");
      expect(t).toContain("Our ref: CR0902");
      expect(t).toContain("Needed by: 6 Jul 26");
      expect(t).not.toMatch(/SO-\d+/);
    }
    expect(r).toContain("Friendly reminder");
    expect(c).toContain("Following up");
  });

  it("waEncode is wa.me-ready — real line breaks become %0A", () => {
    expect(waEncode("a b\nc")).toBe("a%20b%0Ac");
  });

  it("partner GROUP message — one message covers many deliveries, REF-led", () => {
    const rows = [
      {
        ref: "CR0902",
        customer: "Lee Wei Yang",
        region: "Puchong",
        deadline: "6 Jul 26",
        overdue: false,
        items: [{ sku: "L1201F-K", qty: 1 }],
      },
      {
        ref: "TCF0544",
        customer: "Tan",
        region: "Johor",
        deadline: "2 Jul 26",
        overdue: true,
        items: [{ sku: "SOF-3RA", qty: 2 }],
      },
    ];
    const r = buildPartnerGroupMessage("remind", "NETS", rows);
    const c = buildPartnerGroupMessage("chase", "NETS", rows);
    for (const t of [r, c]) {
      expect(t).toContain("Hi NETS 👋");
      // Each delivery is its own block — REF-led, never the SO.
      expect(t).toContain("_CR0902_ — Lee Wei Yang (Puchong)");
      expect(t).toContain("_TCF0544_ — Tan (Johor)");
      expect(t).toContain("1× L1201F-K");
      expect(t).toContain("2× SOF-3RA");
      expect(t).toContain("2 deliveries.");
      expect(t).not.toMatch(/SO-\d+/);
    }
    // The overdue delivery is tagged only on that block.
    expect(r).toContain("by 6 Jul 26\n");
    expect(c).toContain("by 2 Jul 26 — overdue");
    expect(r).toContain("please confirm the delivery date");
    expect(c).toContain("following up");
  });
});
