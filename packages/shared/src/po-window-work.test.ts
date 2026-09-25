import { describe, expect, it } from "vitest";
import { poSendActOf, poSendChannelOf, poWindowWork, type PoWindowDemandRow, type PoWindowPoFact } from "./po-window-work";

const row = (id: string, orderId: string, supplierId: string, supplier: string, toBuy: number, poWindow: string | null = "2026-09-25T11:30"): PoWindowDemandRow =>
  ({ id, orderId, so: null, supplierId, supplier, toBuy, poWindow });
const po = (poId: string, supplierId: string, supplierName: string, sent: boolean, poWindow = "2026-09-25T11:30", version = 1): PoWindowPoFact =>
  ({ poId, version, supplierId, supplierName, sentCurrentVersion: sent, poWindow });
const channels: Record<string, "whatsapp" | "email" | null> = { ohana: "whatsapp", hookka: "email", dorsett: null };
const channelOf = (id: string | null) => channels[id ?? ""] ?? null;

describe("poWindowWork — one occurrence per PO window, never one per Sales Order", () => {
  it("before issue: counts the items and the Sales Orders, and names the window's time", () => {
    const [w, ...rest] = poWindowWork({
      rows: [
        row("r1", "o1", "ohana", "Ohana", 2),
        row("r2", "o1", "hookka", "Hookka", 1),
        row("r3", "o2", "ohana", "Ohana", 3),
        row("r4", "o3", "ohana", "Ohana", 1),
      ],
      pos: [],
      channelOf,
    });
    expect(rest).toEqual([]);
    expect(w!.key).toBe("2026-09-25T11:30");
    expect(w!.dueAt).toBe("2026-09-25T11:30:00+08:00");
    expect(w!.card).toEqual({
      objectLabel: "11:30 AM PO window",
      problem: "Buy 7 items for 3 Sales Orders",
      action: "Issue the POs by 11:30 AM",
      recipient: "2 suppliers",
      requiredResult: "Every PO issued and marked as sent",
    });
    expect(w!.demand.suppliers).toEqual([
      { supplierId: "hookka", supplier: "Hookka", items: 1, orders: 1 },
      { supplierId: "ohana", supplier: "Ohana", items: 6, orders: 3 },
    ]);
  });

  it("after issue: counts issued and unsent POs, and speaks Jess's send line by channel", () => {
    const [w] = poWindowWork({
      rows: [],
      pos: [po("PO250925-4827", "ohana", "Ohana", false), po("PO250925-4828", "hookka", "Hookka", false), po("PO250925-4829", "dorsett", "Dorsett", true)],
      channelOf,
    });
    expect(w!.card.problem).toBe("3 POs issued · 2 not sent yet");
    expect(w!.card.action).toBe("Click WhatsApp, send PO250925-4827(1) to Ohana");
    expect(w!.pos.map((p) => [p.documentNo, p.sent, p.act])).toEqual([
      ["PO250925-4827(1)", false, "Click WhatsApp, send PO250925-4827(1) to Ohana"],
      ["PO250925-4828(1)", false, "Click Email, send PO250925-4828(1) to Hookka"],
      ["PO250925-4829(1)", true, null],
    ]);
  });

  it("one unsent PO: the card carries its send line itself", () => {
    const [w] = poWindowWork({ rows: [], pos: [po("PO250925-4827", "dorsett", "Dorsett", false, "2026-09-25T11:30", 2)], channelOf });
    expect(w!.card.action).toBe("Send PO250925-4827(2) to Dorsett");
    expect(w!.card.recipient).toBe("Dorsett");
  });

  it("demand left beside unsent POs: buying leads, the POs wait in the panel", () => {
    const [w] = poWindowWork({ rows: [row("r1", "o1", "ohana", "Ohana", 1)], pos: [po("PO250925-4827", "ohana", "Ohana", false)], channelOf });
    expect(w!.card.problem).toBe("Buy 1 item for 1 Sales Order");
    expect(w!.unsent).toBe(1);
  });

  it("closes: every PO sent and no demand left yields no occurrence", () => {
    expect(poWindowWork({ rows: [], pos: [po("PO250925-4827", "ohana", "Ohana", true)], channelOf })).toEqual([]);
  });

  it("a PO serving two windows is counted once, in the EARLIEST", () => {
    const out = poWindowWork({
      rows: [row("r9", "o9", "ohana", "Ohana", 1, "2026-09-25T16:00")],
      pos: [po("PO250925-4827", "ohana", "Ohana", false, "2026-09-25T16:00"), po("PO250925-4827", "ohana", "Ohana", false, "2026-09-25T11:30")],
      channelOf,
    });
    expect(out.map((w) => [w.key, w.pos.map((p) => p.poId)])).toEqual([
      ["2026-09-25T11:30", ["PO250925-4827"]],
      ["2026-09-25T16:00", []],
    ]);
  });

  it("windows stay apart, and a row with no admission time is not guessed into one", () => {
    const out = poWindowWork({
      rows: [row("r1", "o1", "ohana", "Ohana", 1, "2026-09-25T10:00"), row("r2", "o1", "hookka", "Hookka", 1, "2026-09-25T11:30"), row("r3", "o2", "ohana", "Ohana", 1, null)],
      pos: [],
      channelOf,
    });
    expect(out.map((w) => [w.key, w.demand.rowIds])).toEqual([
      ["2026-09-25T10:00", ["r1"]],
      ["2026-09-25T11:30", ["r2"]],
    ]);
  });
});

describe("the supplier's recorded channel", () => {
  it("group link or chat number → WhatsApp; email only → Email; nothing → none", () => {
    expect(poSendChannelOf({ whatsappGroupUrl: "https://chat.whatsapp.com/x" })).toBe("whatsapp");
    expect(poSendChannelOf({ contact: "+60 12-345 6789", contactEmail: "a@b.c" })).toBe("whatsapp");
    expect(poSendChannelOf({ contact: "Mr Tan", contactEmail: "a@b.c" })).toBe("email");
    expect(poSendChannelOf({})).toBeNull();
    expect(poSendActOf("PO250925-4827(1)", "Ohana", null)).toBe("Send PO250925-4827(1) to Ohana");
  });
});
