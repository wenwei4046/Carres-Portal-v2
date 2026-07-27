import { describe, expect, it } from "vitest";

import {
  displayOrderAction,
  openOrderActions,
  orderActionsInDisplayOrder,
  type OrderActionSignals,
} from "./order-actions";

/** A live in-pipeline order with nothing wrong: goods in, logistics picked,
 *  the customer confirmed a future day, paid. Every test names only the signal
 *  it is about, so a fixture change can never silently carry a rung. */
const BASE: OrderActionSignals = {
  completed: false,
  goodsReady: true,
  goodsUnordered: false,
  stockEtaIso: null,
  promisedDateIso: "2026-08-20",
  daysToDue: 20,
  stockWindowDays: 7,
  hasLogistics: true,
  bookingConfirmed: true,
  confirmedDateIso: "2026-08-20",
  todayIso: "2026-07-27",
  photoOnFile: null,
  moneyOwing: false,
};
const sig = (o: Partial<OrderActionSignals> = {}): OrderActionSignals => ({
  ...BASE,
  ...o,
});
const keys = (s: OrderActionSignals) => openOrderActions(s).map((a) => a.key);
const first = (s: OrderActionSignals) => displayOrderAction(openOrderActions(s))?.key ?? null;

// ── LAYER 1 · nothing may be hidden ──────────────────────────────────────────

describe("openOrderActions — one track never suppresses another", () => {
  it("the card's own example: no PO + owing + no logistics → THREE open actions", () => {
    // The old ladder showed `Send PO` and swallowed the other two.
    const s = sig({
      goodsReady: false,
      goodsUnordered: true,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    expect(keys(s)).toEqual(["send_po", "assign_logistics", "collect"]);
  });

  it("goods still coming does not hide the delivery work", () => {
    // 51 of 56 live orders have logistics assigned and NONE has a confirmed
    // booking, so this is the shape most of the board is in today.
    const s = sig({
      goodsReady: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
    });
    expect(keys(s)).toEqual(["confirm_ready_date", "confirm_delivery_date"]);
  });

  it("money is open on its own, never folded into the goods answer", () => {
    const s = sig({ goodsReady: false, moneyOwing: true });
    expect(keys(s)).toContain("collect");
    expect(keys(s)).toContain("confirm_ready_date");
  });

  it("at most ONE action per track — the rungs inside a track are states, not parallel work", () => {
    const everythingWrong = sig({
      completed: false,
      goodsReady: false,
      goodsUnordered: true,
      stockEtaIso: "2026-09-30",
      daysToDue: -5,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    const tracks = openOrderActions(everythingWrong).map((a) => a.track);
    expect(new Set(tracks).size).toBe(tracks.length);
  });

  it("an order with nothing open returns an empty list (the caller says Done)", () => {
    expect(openOrderActions(sig({ completed: true, photoOnFile: true }))).toEqual([]);
    expect(displayOrderAction([])).toBeNull();
  });
});

// ── LAYER 1 · the goods track ────────────────────────────────────────────────

describe("goods track", () => {
  const waiting = { goodsReady: false } as const;

  it("nothing ordered → Send PO", () => {
    expect(keys(sig({ ...waiting, goodsUnordered: true }))).toContain("send_po");
  });

  it("ready date overshoots the promise → agree a new date, not another supplier call", () => {
    const s = sig({ ...waiting, stockEtaIso: "2026-08-21" });
    expect(keys(s)).toContain("agree_new_delivery_date");
    expect(keys(s)).not.toContain("confirm_ready_date");
  });

  it("a ready date landing exactly ON the promise is not a delay", () => {
    expect(keys(sig({ ...waiting, stockEtaIso: "2026-08-20" }))).toContain(
      "confirm_ready_date",
    );
  });

  it("no promised date → the radar cannot fire (nothing to overshoot)", () => {
    const s = sig({
      ...waiting,
      promisedDateIso: null,
      daysToDue: null,
      stockEtaIso: "2099-01-01",
    });
    expect(keys(s)).toContain("confirm_ready_date");
  });

  it("inside the arrival window turns the supplier call red; outside it stays amber", () => {
    const inside = openOrderActions(sig({ ...waiting, daysToDue: 5 }))[0];
    const outside = openOrderActions(sig({ ...waiting, daysToDue: 10 }))[0];
    expect(inside).toMatchObject({ key: "confirm_ready_date", tone: "danger" });
    expect(outside).toMatchObject({ key: "confirm_ready_date", tone: "warning" });
  });

  it("a sofa's shorter window is the caller's number, not a second rule here", () => {
    expect(openOrderActions(sig({ ...waiting, daysToDue: 6, stockWindowDays: 5 }))[0])
      .toMatchObject({ tone: "warning" });
    expect(openOrderActions(sig({ ...waiting, daysToDue: 3, stockWindowDays: 5 }))[0])
      .toMatchObject({ tone: "danger" });
  });

  it("delivered orders never carry a goods action (guardrail #2)", () => {
    const s = sig({ completed: true, goodsReady: false, goodsUnordered: true });
    expect(keys(s)).not.toContain("send_po");
  });
});

// ── LAYER 1 · the delivery track ─────────────────────────────────────────────

describe("delivery track", () => {
  const unbooked = { bookingConfirmed: false, confirmedDateIso: null } as const;

  it("no logistics company → Assign logistics", () => {
    expect(keys(sig({ ...unbooked, hasLogistics: false }))).toContain(
      "assign_logistics",
    );
  });

  it("assigned but the customer has not confirmed → call them for the date", () => {
    expect(keys(sig(unbooked))).toContain("confirm_delivery_date");
  });

  it("past the promised date, unconfirmed → BROKEN, and it ranks first", () => {
    const s = sig({ ...unbooked, daysToDue: -2 });
    const a = openOrderActions(s).find((x) => x.track === "delivery");
    expect(a).toMatchObject({
      key: "confirm_delivery_date",
      tone: "danger",
      broken: true,
    });
    // The goods action is still OPEN — the escalation ranks above it, it does
    // not delete it. That distinction is the whole card.
    expect(keys(sig({ ...unbooked, daysToDue: -2, goodsReady: false }))).toContain(
      "confirm_ready_date",
    );
    expect(first(sig({ ...unbooked, daysToDue: -2, goodsReady: false }))).toBe(
      "confirm_delivery_date",
    );
  });

  it("past the deadline with NOTHING ordered stays headlined by Send PO (Loo's freeze gate)", () => {
    const s = sig({
      ...unbooked,
      daysToDue: -2,
      goodsReady: false,
      goodsUnordered: true,
    });
    expect(first(s)).toBe("send_po");
    // and the delivery track is the plain amber call, not the red escalation
    expect(openOrderActions(s).find((a) => a.track === "delivery")).toMatchObject({
      key: "confirm_delivery_date",
      tone: "info",
    });
  });

  it("past the deadline with no logistics company → no escalation (nobody to call)", () => {
    const s = sig({ ...unbooked, daysToDue: -2, hasLogistics: false });
    expect(openOrderActions(s).find((a) => a.track === "delivery")).toMatchObject({
      key: "assign_logistics",
    });
  });

  it("confirmed for today → Deliver today", () => {
    expect(keys(sig({ confirmedDateIso: "2026-07-27" }))).toContain("deliver_today");
  });

  it("a confirmed date that passed with no delivery → BROKEN, back to the logistics call", () => {
    const a = openOrderActions(sig({ confirmedDateIso: "2026-07-20" }))[0];
    expect(a).toMatchObject({ key: "confirm_delivery_date", broken: true });
  });

  it("arranged for a future day and paid → Confirm delivery (green)", () => {
    expect(openOrderActions(sig())[0]).toMatchObject({
      key: "confirm_delivery",
      tone: "success",
    });
  });

  it("money owing HOLDS the confirm — the lock the card says to keep", () => {
    expect(openOrderActions(sig({ moneyOwing: true }))[0]).toMatchObject({
      key: "confirm_delivery",
      locked: true,
    });
  });

  it("the hold beats today's run — you do not deliver what you may not deliver", () => {
    const s = sig({ confirmedDateIso: "2026-07-27", moneyOwing: true });
    expect(first(s)).toBe("confirm_delivery");
  });

  it("booked for a future day while the goods are still out → no Confirm delivery", () => {
    // "Everything ready, confirm" may not be said over goods that are not in.
    // The goods action is what is open, and it is still listed.
    const s = sig({ goodsReady: false });
    expect(keys(s)).toEqual(["confirm_ready_date"]);
  });

  it("delivered with an empty photo ledger → Upload delivery photo (amber, never red)", () => {
    expect(openOrderActions(sig({ completed: true, photoOnFile: false }))[0])
      .toMatchObject({ key: "upload_delivery_photo", tone: "warning" });
  });

  it("delivered with an UNKNOWN photo ledger accuses nobody", () => {
    expect(keys(sig({ completed: true, photoOnFile: null }))).toEqual([]);
  });
});

// ── LAYER 1 · the money track ────────────────────────────────────────────────

describe("money track", () => {
  it("outstanding money is an action, and it survives delivery", () => {
    const s = sig({ completed: true, photoOnFile: true, moneyOwing: true });
    expect(keys(s)).toEqual(["collect"]);
  });

  it("a delivered order owing money AND missing its photo keeps both", () => {
    const s = sig({ completed: true, photoOnFile: false, moneyOwing: true });
    expect(keys(s)).toEqual(["upload_delivery_photo", "collect"]);
  });

  it("money nobody has priced is not owing — the caller's rule, honoured as given", () => {
    expect(keys(sig({ moneyOwing: false }))).not.toContain("collect");
  });
});

// ── LAYER 2 · display priority ───────────────────────────────────────────────

describe("displayOrderAction — Law 4's priority, and only that", () => {
  it("today's run outranks goods, delivery preparation and money", () => {
    const s = sig({
      confirmedDateIso: "2026-07-27",
      goodsReady: true,
      moneyOwing: false,
    });
    expect(first(s)).toBe("deliver_today");
  });

  it("the customer-must-be-told call outranks goods and money", () => {
    const s = sig({
      goodsReady: false,
      stockEtaIso: "2026-08-21",
      bookingConfirmed: false,
      confirmedDateIso: null,
      hasLogistics: false,
      moneyOwing: true,
    });
    expect(first(s)).toBe("agree_new_delivery_date");
  });

  it("goods outrank delivery preparation", () => {
    const s = sig({
      goodsReady: false,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
    });
    expect(first(s)).toBe("confirm_ready_date");
  });

  it("money shows LAST and is never lost — it is still in the list", () => {
    const s = sig({
      goodsReady: false,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    expect(first(s)).not.toBe("collect");
    expect(keys(s)).toContain("collect");
  });

  it("money leads only when it is the last thing left", () => {
    const s = sig({ completed: true, photoOnFile: true, moneyOwing: true });
    expect(first(s)).toBe("collect");
  });

  it("a broken commitment jumps every rung", () => {
    const s = sig({
      goodsReady: false,
      stockEtaIso: "2026-08-21", // would otherwise headline (rung 2)
      bookingConfirmed: false,
      confirmedDateIso: null,
      daysToDue: -2,
      moneyOwing: true,
    });
    expect(first(s)).toBe("confirm_delivery_date");
  });

  it("the order of the input list never changes the answer", () => {
    const s = sig({
      goodsReady: false,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    const open = openOrderActions(s);
    const reversed = [...open].reverse();
    expect(displayOrderAction(reversed)?.key).toBe(displayOrderAction(open)?.key);
  });
});

describe("orderActionsInDisplayOrder — the drawer's list", () => {
  it("starts with the row's own headline, so the two surfaces cannot disagree", () => {
    const s = sig({
      goodsReady: false,
      goodsUnordered: true,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    const list = orderActionsInDisplayOrder(s);
    expect(list.map((a) => a.key)).toEqual([
      "send_po",
      "assign_logistics",
      "collect",
    ]);
    expect(list[0].key).toBe(first(s));
  });

  it("holds exactly the open set — the drawer adds nothing and drops nothing", () => {
    const s = sig({ goodsReady: false, moneyOwing: true });
    expect(new Set(orderActionsInDisplayOrder(s).map((a) => a.key))).toEqual(
      new Set(keys(s)),
    );
  });
});
