import { describe, expect, it } from "vitest";

import {
  displayOrderAction,
  openOrderActions,
  orderActionsInDisplayOrder,
  orderIsDelivering,
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
    // The old ladder showed the purchasing act alone and swallowed the other two.
    const s = sig({
      goodsReady: false,
      goodsUnordered: true,
      hasLogistics: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      moneyOwing: true,
    });
    expect(keys(s)).toEqual(["prepare_po", "assign_logistics", "collect"]);
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

  it("nothing ordered and no draft → Prepare PO (act one)", () => {
    expect(keys(sig({ ...waiting, goodsUnordered: true }))).toContain(
      "prepare_po",
    );
  });

  // P7A · the split. Raising a purchase order is TWO acts with two different
  // completions, and this is the only signal that tells them apart.
  it("a draft PO covers it → Issue PO (act two), never Prepare PO again", () => {
    const s = sig({ ...waiting, goodsUnordered: true, draftPoExists: true });
    expect(keys(s)).toContain("issue_po");
    expect(keys(s)).not.toContain("prepare_po");
  });

  it("an ABSENT draft signal reproduces the pre-split behaviour exactly", () => {
    // No writer exists yet, so every live order takes this branch: `undefined`
    // and `null` are UNKNOWN-as-no, and UNKNOWN never accuses.
    for (const draftPoExists of [undefined, null, false] as const)
      expect(
        keys(sig({ ...waiting, goodsUnordered: true, draftPoExists })),
      ).toContain("prepare_po");
  });

  it("both acts are ONE goods action, never two at once", () => {
    for (const draftPoExists of [undefined, true] as const) {
      const goods = openOrderActions(
        sig({ ...waiting, goodsUnordered: true, draftPoExists }),
      ).filter((a) => a.track === "goods");
      expect(goods).toHaveLength(1);
    }
  });

  it("issuing beats preparing, and a broken supplier promise beats both (Law 4 rung 3)", () => {
    // The rung is ordered inside itself, commitment descending. Only one is
    // ever open per order, so the proof is the RANK, taken through the same
    // Layer 2 the row uses.
    const rank = (key: string, extra: Partial<OrderActionSignals>) =>
      first(sig({ ...waiting, ...extra }));
    expect(rank("prepare", { goodsUnordered: true })).toBe("prepare_po");
    expect(rank("issue", { goodsUnordered: true, draftPoExists: true })).toBe(
      "issue_po",
    );
    // Ranked against a MONEY action, which Law 4 puts last either way.
    expect(
      first(sig({ ...waiting, goodsUnordered: true, moneyOwing: true })),
    ).toBe("prepare_po");
    expect(
      first(
        sig({
          ...waiting,
          goodsUnordered: true,
          draftPoExists: true,
          moneyOwing: true,
        }),
      ),
    ).toBe("issue_po");
  });

  it("ready date overshoots the promise → DELAY PLANNING, not another supplier call", () => {
    // C8 — and emphatically not a call to anybody yet. Before this card the
    // radar opened a customer call on the spot.
    const s = sig({ ...waiting, stockEtaIso: "2026-08-21" });
    expect(keys(s)).toContain("delay_planning");
    expect(keys(s)).not.toContain("confirm_ready_date");
    expect(keys(s)).not.toContain("arrange_new_delivery_date");
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
    expect(keys(s)).not.toContain("prepare_po");
    expect(keys(s)).not.toContain("issue_po");
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

  it("past the deadline with NOTHING ordered stays headlined by the purchasing act (Loo's freeze gate)", () => {
    const s = sig({
      ...unbooked,
      daysToDue: -2,
      goodsReady: false,
      goodsUnordered: true,
    });
    expect(first(s)).toBe("prepare_po");
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

  // ── C3 · "everything ready, the day has not come" is NOT an action ────────
  // Jess 2026-07-27 (`docs/ORDERS-WORKING-FLOW.md` §8): it was the one row in
  // the drawer no button in the portal could close, and a row with no button
  // teaches a new hire that they have missed something.

  it("arranged for a future day and paid → NO action at all, and the FACT instead", () => {
    expect(keys(sig())).toEqual([]);
    expect(orderIsDelivering(sig())).toBe(true);
  });

  it("money owing HOLDS the delivery — the lock the card says to keep, on the action that clears it", () => {
    const s = sig({ moneyOwing: true });
    // The delivery track says nothing (PayHold: you do not arrange a delivery
    // you may not make), the money track carries the row, and it carries the 🔒.
    expect(keys(s)).toEqual(["collect"]);
    expect(openOrderActions(s)[0]).toMatchObject({ key: "collect", locked: true });
    // And it is NOT the quiet fact: printing "Delivering 27 Jul" over an order
    // the server will refuse to send would be the screen telling a lie.
    expect(orderIsDelivering(s)).toBe(false);
  });

  it("the hold beats today's run — you do not deliver what you may not deliver", () => {
    const s = sig({ confirmedDateIso: "2026-07-27", moneyOwing: true });
    expect(first(s)).toBe("collect");
    expect(keys(s)).not.toContain("deliver_today");
  });

  it("the hold needs the goods in — an unpaid order whose goods are out is not held, it is late", () => {
    // Exact parity with the pre-C3 lock, which also required `goodsReady`.
    const s = sig({ goodsReady: false, confirmedDateIso: "2026-07-27", moneyOwing: true });
    expect(keys(s)).toContain("deliver_today");
    expect(openOrderActions(s).find((a) => a.key === "collect")?.locked).toBeUndefined();
  });

  // C9 — the lock and the money action stop being the same question. C3 moved
  // the 🔒 onto `collect`, so a RELEASE now reads as the lock simply coming off
  // an action that stays open, which is exactly what a release means.
  it("a RELEASED order unlocks the delivery and keeps its Collect action", () => {
    // The manager let the goods go over an uncollected storage fee. The 🔒
    // comes off; the money is still ours, so the money track is untouched.
    const s = sig({ moneyOwing: true, moneyHolds: false });
    const list = openOrderActions(s);
    // The delivery track raises nothing: the goods are going on their booked
    // day and there is no human step before it (C3's FACT covers that state).
    expect(list.find((a) => a.track === "delivery")).toBeUndefined();
    expect(list.find((a) => a.track === "money")).toMatchObject({ key: "collect" });
    expect(list.find((a) => a.track === "money")?.locked).toBeUndefined();
    // The trip IS going ahead — a release is a release — but the row never
    // prints the quiet fact, because an open action always outranks it.
    expect(orderIsDelivering(s)).toBe(true);
    expect(first(s)).toBe("collect");
  });

  it("omitting moneyHolds reproduces the pre-C9 lock exactly", () => {
    const s = sig({ moneyOwing: true });
    expect(s.moneyHolds).toBeUndefined();
    expect(openOrderActions(s)[0]).toMatchObject({ key: "collect", locked: true });
  });

  it("booked for a future day while the goods are still out → no delivering fact either", () => {
    // The fact says "everything is ready"; it may not be said over goods that
    // are not in. The goods action is what is open, and it is still listed.
    const s = sig({ goodsReady: false });
    expect(keys(s)).toEqual(["confirm_ready_date"]);
    expect(orderIsDelivering(s)).toBe(false);
  });

  it("the delivering fact ends the moment the day arrives or passes", () => {
    expect(orderIsDelivering(sig({ confirmedDateIso: "2026-07-27" }))).toBe(false);
    expect(orderIsDelivering(sig({ confirmedDateIso: "2026-07-20" }))).toBe(false);
    expect(orderIsDelivering(sig({ completed: true }))).toBe(false);
    expect(orderIsDelivering(sig({ hasLogistics: false }))).toBe(false);
    expect(orderIsDelivering(sig({ bookingConfirmed: false }))).toBe(false);
  });

  it("delivered with an empty photo ledger → Upload delivery photo (amber, never red)", () => {
    expect(openOrderActions(sig({ completed: true, photoOnFile: false }))[0])
      .toMatchObject({ key: "upload_delivery_photo", tone: "warning" });
  });

  it("delivered with an UNKNOWN photo ledger accuses nobody", () => {
    expect(keys(sig({ completed: true, photoOnFile: null }))).toEqual([]);
  });

  // ── C7 · the delivery order ───────────────────────────────────────────────
  // Jess 2026-07-27: logistics ring to say they are delivering tomorrow and an
  // operator has to produce the paper by hand. Once the customer's date is
  // confirmed, the SYSTEM produces it and the operator presses one button.

  it("arranged, paid, and no delivery order yet → Issue delivery order, not the quiet fact", () => {
    const s = sig({ deliveryOrderIssued: false });
    expect(keys(s)).toEqual(["issue_delivery_order"]);
    // The fact means "nothing for a human to do". Issuing IS something to do.
    expect(orderIsDelivering(s)).toBe(false);
  });

  it("issued → back to the quiet fact, exactly as before C7", () => {
    const s = sig({ deliveryOrderIssued: true });
    expect(keys(s)).toEqual([]);
    expect(orderIsDelivering(s)).toBe(true);
  });

  it("UNKNOWN never accuses — an older Worker behaves byte-for-byte as pre-C7", () => {
    const s = sig({ deliveryOrderIssued: null });
    expect(keys(s)).toEqual([]);
    expect(orderIsDelivering(s)).toBe(true);
    // And the default (the signal simply absent) is the same answer.
    expect(sig().deliveryOrderIssued).toBeUndefined();
    expect(keys(sig())).toEqual([]);
  });

  it("goods still out → the goods call, never a delivery order for goods we do not have", () => {
    // §3's trigger names FOUR conditions and "core goods ready" is one of them.
    const s = sig({ goodsReady: false, deliveryOrderIssued: false });
    expect(keys(s)).toEqual(["confirm_ready_date"]);
  });

  it("money still holds → no delivery order, and the 🔒 stays on the money", () => {
    const s = sig({ moneyOwing: true, deliveryOrderIssued: false });
    expect(keys(s)).toEqual(["collect"]);
    expect(openOrderActions(s)[0]).toMatchObject({ key: "collect", locked: true });
  });

  it("a manager's release lets the document be issued — that is what a release IS", () => {
    const s = sig({ moneyOwing: true, moneyHolds: false, deliveryOrderIssued: false });
    expect(keys(s)).toEqual(["issue_delivery_order", "collect"]);
    // Money still displays last (Law 4), so the row leads with the document.
    expect(first(s)).toBe("issue_delivery_order");
  });

  it("on the day itself `Deliver today` leads — rung 1 beats rung 4", () => {
    const s = sig({ confirmedDateIso: "2026-07-27", deliveryOrderIssued: false });
    expect(keys(s)).toEqual(["deliver_today"]);
  });

  it("no confirmed date on a confirmed booking (a pre-0277 row) issues nothing — and still reads as delivering", () => {
    // A row with no date cannot have a trip to paper. The FACT must survive it:
    // refusing both would print `Done` on an order that is nothing of the sort.
    const s = sig({ confirmedDateIso: null, deliveryOrderIssued: false });
    expect(keys(s)).toEqual([]);
    expect(orderIsDelivering(s)).toBe(true);
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

  it("the delay rung outranks goods and money — before AND after the decision", () => {
    const base = {
      goodsReady: false,
      stockEtaIso: "2026-08-21",
      bookingConfirmed: false,
      confirmedDateIso: null,
      hasLogistics: false,
      moneyOwing: true,
    } as const;
    expect(first(sig(base))).toBe("delay_planning");
    expect(
      first(
        sig({
          ...base,
          delayDecision: "new_date",
          delayDecisionEtaIso: "2026-08-21",
        }),
      ),
    ).toBe("arrange_new_delivery_date");
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
      "prepare_po",
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

// ── C8 · Delay planning, and the gate before the customer ────────────────────

describe("C8 · the delay gate — the customer is the LAST to know", () => {
  /** A delayed order: goods still coming, the factory's date overshoots the day
   *  we sold. Every test names only the signal it is about. */
  const delayed = (o: Partial<OrderActionSignals> = {}): OrderActionSignals =>
    sig({
      goodsReady: false,
      goodsUnordered: false,
      stockEtaIso: "2026-08-30",
      promisedDateIso: "2026-08-20",
      bookingConfirmed: false,
      confirmedDateIso: null,
      ...o,
    });

  it("STAGE 1 opens by itself, and it is a DECISION — no call to anybody", () => {
    expect(keys(delayed())).toContain("delay_planning");
    expect(keys(delayed())).not.toContain("arrange_new_delivery_date");
  });

  it("STAGE 2 cannot open before the decision is recorded (§3 invariant 3)", () => {
    // The card: "Stage 2 cannot open before the decision is recorded, and never
    // opens at all when the answer is YES."
    expect(keys(delayed({ delayDecision: null }))).not.toContain(
      "arrange_new_delivery_date",
    );
  });

  it("YES — we can still make it — never reaches the customer, ever", () => {
    const s = delayed({
      delayDecision: "keep",
      delayDecisionEtaIso: "2026-08-30",
    });
    expect(keys(s)).not.toContain("arrange_new_delivery_date");
    expect(keys(s)).not.toContain("delay_planning");
    // The goods are still not in, so the ordinary supplier call carries on —
    // which is the truth about this order, and the only honest thing to show.
    expect(keys(s)).toContain("confirm_ready_date");
  });

  it("NO opens EXACTLY ONE logistics action, and it names logistics", () => {
    const s = delayed({
      delayDecision: "new_date",
      delayDecisionEtaIso: "2026-08-30",
    });
    const goods = openOrderActions(s).filter((a) => a.track === "goods");
    expect(goods.map((a) => a.key)).toEqual(["arrange_new_delivery_date"]);
  });

  it("a decision made about an OLDER supplier date does not silence a NEW delay", () => {
    // The factory slipped again. The old answer was about 30 Aug; this is a
    // different delay and it gets its own decision (S4's rule: an event names
    // the thing it was made about).
    const s = delayed({
      stockEtaIso: "2026-09-15",
      delayDecision: "keep",
      delayDecisionEtaIso: "2026-08-30",
    });
    expect(keys(s)).toContain("delay_planning");
  });

  it("STAGE 2 closes when a customer-confirmed date the goods can make is on file", () => {
    const open = delayed({
      delayDecision: "new_date",
      delayDecisionEtaIso: "2026-08-30",
      bookingConfirmed: true,
      // A booking made BEFORE the slip — earlier than the goods can arrive, so
      // nothing has actually been arranged and the action stays open.
      confirmedDateIso: "2026-08-20",
    });
    expect(keys(open)).toContain("arrange_new_delivery_date");

    const closed = delayed({
      delayDecision: "new_date",
      delayDecisionEtaIso: "2026-08-30",
      bookingConfirmed: true,
      confirmedDateIso: "2026-09-02",
    });
    expect(keys(closed)).not.toContain("arrange_new_delivery_date");
    expect(keys(closed)).toContain("confirm_ready_date");
  });

  it("THE PROMISED DATE IS THE YARDSTICK — a new booking never becomes the new promise", () => {
    // Invariant 1, as behaviour rather than as a comment. The customer accepted
    // 2 Sep, so a naive implementation would start measuring delays against
    // THAT. It must not: `orders.delivery_date` stays at what was sold, so a
    // factory date of 25 Aug — comfortably before the arranged booking, and
    // after the promise — is still a delay and still needs its own decision.
    const arranged = {
      delayDecision: "new_date",
      delayDecisionEtaIso: "2026-08-30",
      bookingConfirmed: true,
      confirmedDateIso: "2026-09-02",
      hasLogistics: true,
    } as const;
    expect(
      keys(delayed({ ...arranged, stockEtaIso: "2026-08-25" })),
    ).toContain("delay_planning");
    expect(
      keys(delayed({ ...arranged, stockEtaIso: "2026-09-20" })),
    ).toContain("delay_planning");
    // And the day it was SOLD is what the overdue escalation counts on: the
    // promise passed, nobody has confirmed, so the commitment reads broken —
    // with a rearranged date on file it would not.
    const overdue = delayed({
      delayDecision: "new_date",
      delayDecisionEtaIso: "2026-08-30",
      hasLogistics: true,
      daysToDue: -5,
    });
    expect(openOrderActions(overdue).some((a) => a.broken === true)).toBe(true);
  });

  it("no decision recorded reproduces the pre-C8 trigger exactly", () => {
    // An older Worker that does not select the two columns: the radar still
    // fires on the same condition it always did, and it opens stage 1.
    const s = delayed({ delayDecision: undefined, delayDecisionEtaIso: undefined });
    expect(keys(s)).toContain("delay_planning");
  });

  it("the delay flow raises at most ONE goods action, whatever the combination", () => {
    for (const delayDecision of [null, "keep", "new_date"] as const)
      for (const etaIso of ["2026-08-30", "2026-09-15"])
        for (const bookingConfirmed of [false, true]) {
          const s = delayed({
            stockEtaIso: etaIso,
            delayDecision,
            delayDecisionEtaIso: "2026-08-30",
            bookingConfirmed,
            confirmedDateIso: bookingConfirmed ? "2026-09-02" : null,
          });
          expect(
            openOrderActions(s).filter((a) => a.track === "goods"),
          ).toHaveLength(1);
        }
  });
});
