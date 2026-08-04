import { describe, it, expect } from "vitest";
import {
  comparePoRisk,
  ordinalLabel,
  poDateHistoryOf,
  poRiskRungOf,
  type PoRiskRow,
  PO_DELAY_REASONS,
  PO_STATE_ACTION_SHORT,
  PO_STATE_ACTION_WORD,
  poArrivalGapOf,
  poCurrentActionOf,
  poOverdueDays,
  poWorkStateOf,
} from "./po-workspace";
import type { SupplierCallPo } from "./purchasing-supplier-calls";

/**
 * The Supplier Workspace's ONE action source (Jess, 2026-08-02).
 * Law 7 negative control: the engine's call must ALWAYS beat the state word —
 * flip that priority and the header would tell a quieter story than the
 * engine while a call is overdue.
 */

const TODAY = "2026-08-05"; // a Wednesday
import { PO_WORK_STATE_LABEL } from "./po-workspace";
const PO_WORK_STATE_LABEL_NEED = PO_WORK_STATE_LABEL.need_confirmation;

function po(over: Partial<SupplierCallPo> = {}): SupplierCallPo {
  return {
    poId: "PO-1",
    supplierId: "sup-1",
    status: "open",
    etaDateIso: null,
    tomorrowAnswerAboutDateIso: null,
    lines: [
      {
        id: "l1",
        sku: "SKU-A",
        qty: 2,
        receivedQty: 0,
        shortSinceIso: null,
        balanceAnswerAboutQty: null,
      },
    ],
    ...over,
  };
}

describe("poWorkStateOf — the SUPPLIER PROGRESS vocabulary", () => {
  it("no supplier date → Waiting Supplier Date", () => {
    expect(poWorkStateOf(po(), TODAY)).toBe("need_confirmation");
    expect(PO_WORK_STATE_LABEL_NEED).toBe("Waiting Supplier Date");
  });

  it("a future supplier date → Waiting for Goods", () => {
    expect(poWorkStateOf(po({ etaDateIso: "2026-09-01" }), TODAY)).toBe("waiting");
  });

  it("READY means goods ARRIVED — a date merely passing is NOT arrival", () => {
    // Jess's state machine (2026-08-02): the day passing without goods is
    // OVERDUE, a sub-state of waiting — never Ready.
    expect(poWorkStateOf(po({ etaDateIso: "2026-08-01" }), TODAY)).toBe("waiting");
    const partial = po({ etaDateIso: "2026-09-01" });
    partial.lines[0].receivedQty = 1;
    expect(poWorkStateOf(partial, TODAY)).toBe("ready");
  });

  it("poOverdueDays counts only a PASSED date with nothing arrived", () => {
    expect(poOverdueDays(po({ etaDateIso: "2026-08-01" }), TODAY)).toBe(4);
    expect(poOverdueDays(po({ etaDateIso: TODAY }), TODAY)).toBeNull();
    expect(poOverdueDays(po({ etaDateIso: "2026-09-01" }), TODAY)).toBeNull();
    expect(poOverdueDays(po(), TODAY)).toBeNull();
    const arrived = po({ etaDateIso: "2026-08-01" });
    arrived.lines[0].receivedQty = 2;
    expect(poOverdueDays(arrived, TODAY)).toBeNull();
  });

  it("everything received → Completed; cancelled stays its own bucket", () => {
    const done = po({ etaDateIso: "2026-08-01" });
    done.lines[0].receivedQty = 2;
    expect(poWorkStateOf(done, TODAY)).toBe("completed");
    expect(poWorkStateOf(po({ status: "cancelled" }), TODAY)).toBe("cancelled");
  });
});

describe("poCurrentActionOf — ONE action, engine first", () => {
  it("a quiet PO with no date says Confirm Goods Arrival Date", () => {
    const a = poCurrentActionOf(po(), { todayIso: TODAY });
    expect(a).toEqual({
      kind: "state",
      key: "need_confirmation",
      word: PO_STATE_ACTION_WORD.need_confirmation,
    });
  });

  it("waiting says itself why there is nothing to phone about", () => {
    const a = poCurrentActionOf(po({ etaDateIso: "2026-09-01" }), {
      todayIso: TODAY,
    });
    expect(a).toEqual({
      kind: "state",
      key: "waiting",
      word: "Waiting for Goods",
    });
  });

  it("ready hands over with Open Receiving — the system is not a person", () => {
    // Quiet-ready: goods partially in AND the balance answer still names the
    // current received qty (call closed). An unanswered shortfall keeps the
    // BALANCE call open and outranks the handover word — Law 7 working.
    const ready = po({ etaDateIso: "2026-09-01" });
    ready.lines[0].receivedQty = 1;
    ready.lines[0].balanceAnswerAboutQty = 1;
    const a = poCurrentActionOf(ready, { todayIso: TODAY });
    expect(a).toEqual({ kind: "state", key: "ready", word: "Open Receiving" });
  });

  it("OVERDUE outranks everything — the confirmed date is spent, so the word is Contact Supplier", () => {
    // The date passed, nothing arrived: even though the engine's late call is
    // open, the cycle's word is Contact Supplier — never Confirm again.
    const a = poCurrentActionOf(po({ etaDateIso: "2026-08-01" }), {
      todayIso: TODAY,
    });
    expect(a).toEqual({
      kind: "state",
      key: "overdue",
      word: "Contact Supplier",
    });
  });

  it("LAW 7 — the engine's open call BEATS the quiet state word", () => {
    // Arriving tomorrow → the tomorrow's-delivery call is open; the header
    // must carry the CALL, never the quieter Waiting for Goods.
    const a = poCurrentActionOf(po({ etaDateIso: "2026-08-06" }), {
      todayIso: TODAY,
    });
    expect(a?.kind).toBe("call");
  });

  it("completed and cancelled carry no hero — the work is over", () => {
    const done = po({ etaDateIso: "2026-08-01" });
    done.lines[0].receivedQty = 2;
    expect(poCurrentActionOf(done, { todayIso: TODAY })).toBeNull();
    expect(
      poCurrentActionOf(po({ status: "cancelled" }), { todayIso: TODAY }),
    ).toBeNull();
  });
});

describe("the listing's short spellings", () => {
  it("every state action has a short word, and none of them says ETA", () => {
    for (const key of Object.keys(PO_STATE_ACTION_WORD) as Array<
      keyof typeof PO_STATE_ACTION_WORD
    >) {
      expect(PO_STATE_ACTION_SHORT[key]).toBeTruthy();
      // The Business Date Dictionary bans "ETA" on any screen.
      expect(PO_STATE_ACTION_SHORT[key]).not.toMatch(/\bETA\b/i);
      expect(PO_STATE_ACTION_WORD[key]).not.toMatch(/\bETA\b/i);
    }
    expect(PO_STATE_ACTION_SHORT.need_confirmation).toBe("Confirm Arrival");
    expect(PO_STATE_ACTION_SHORT.overdue).toBe("Contact Supplier");
  });

  it("the delay-reason dropdown is Jess's six, and Remarks is NOT one of them", () => {
    expect([...PO_DELAY_REASONS]).toEqual([
      "Production Delay",
      "Material Shortage",
      "Transport Delay",
      "Waiting Customer Confirmation",
      "Factory Closed",
      "Other",
    ]);
  });
});

describe("poDateHistoryOf — the supplier's numbered dates (SAP's shape)", () => {
  const P = (answer: string, about: string, nd: string | null, at: string, reason: string | null = null) => ({
    kind: "tomorrow_delivery",
    answer,
    about_date: about,
    previous_date: nd ? about : null,
    new_date: nd,
    reason,
    recorded_at: at,
  });

  it("numbers oldest first and measures the slip from the FIRST promise", () => {
    const h = poDateHistoryOf([
      P("delayed", "2026-10-31", "2026-11-05", "2026-04-09T00:00:00Z", "Production Delay"),
      P("shipping", "2026-10-31", null, "2026-04-02T00:00:00Z"),
      P("delayed", "2026-11-05", "2026-11-11", "2026-04-16T00:00:00Z", "Transport Delay"),
    ]);
    expect(h.entries.map((e) => [e.ordinal, e.date])).toEqual([
      [1, "2026-10-31"],
      [2, "2026-11-05"],
      [3, "2026-11-11"],
    ]);
    expect(h.firstDate).toBe("2026-10-31");
    expect(h.currentDate).toBe("2026-11-11");
    expect(h.slipDays).toBe(11);
  });

  it("a repeated confirmation of the SAME date is not a new date", () => {
    const h = poDateHistoryOf([
      P("shipping", "2026-10-31", null, "2026-04-02T00:00:00Z"),
      P("shipping", "2026-10-31", null, "2026-04-05T00:00:00Z"),
    ]);
    expect(h.entries).toHaveLength(1);
    expect(h.slipDays).toBe(0);
  });

  it("no answers = no history, and nothing invented", () => {
    const h = poDateHistoryOf([]);
    expect(h.entries).toHaveLength(0);
    expect(h.firstDate).toBeNull();
    expect(h.slipDays).toBeNull();
  });

  /**
   * Q5 — THE READY DATE HAS ITS OWN RUN. Before Q5 this function filtered the
   * `ready_date` kind OUT, so the first ready date an operator recorded would
   * have been silently swallowed by the history sitting beside the field.
   */
  const R = (nd: string, at: string, reason: string | null = null) => ({
    kind: "ready_date",
    answer: "ready_date",
    about_date: null,
    previous_date: null,
    new_date: nd,
    reason,
    recorded_at: at,
  });

  it("a ready date is kept, numbered in its OWN run", () => {
    const h = poDateHistoryOf([
      R("2026-09-10", "2026-08-01T00:00:00Z"),
      R("2026-09-15", "2026-08-08T00:00:00Z", "Production Delay"),
    ]);
    expect(h.readyEntries.map((e) => [e.ordinal, e.date])).toEqual([
      [1, "2026-09-10"],
      [2, "2026-09-15"],
    ]);
    expect(h.readyCurrentDate).toBe("2026-09-15");
    expect(h.readySlipDays).toBe(5);
  });

  it("the two kinds never merge — one numbered run each, one slip each", () => {
    // A ready date and an arrival date are different FACTS (§12.2), and every
    // supplier here carries transit days, so a `2nd` counted across both would
    // number two questions and measure a slip between a ready date and an
    // arrival date.
    const h = poDateHistoryOf([
      P("shipping", "2026-10-31", null, "2026-04-02T00:00:00Z"),
      R("2026-09-10", "2026-04-03T00:00:00Z"),
      P("delayed", "2026-10-31", "2026-11-05", "2026-04-09T00:00:00Z"),
    ]);
    expect(h.entries.map((e) => e.date)).toEqual(["2026-10-31", "2026-11-05"]);
    expect(h.readyEntries.map((e) => e.date)).toEqual(["2026-09-10"]);
    expect(h.currentDate).toBe("2026-11-05");
    expect(h.readyCurrentDate).toBe("2026-09-10");
    // One ready answer earns no slip — there is nothing to compare it to.
    expect(h.readySlipDays).toBe(0);
  });

  it("a PO with only arrival answers has an EMPTY ready run, never a guess", () => {
    const h = poDateHistoryOf([P("shipping", "2026-10-31", null, "2026-04-02T00:00:00Z")]);
    expect(h.readyEntries).toHaveLength(0);
    expect(h.readyCurrentDate).toBeNull();
    expect(h.readySlipDays).toBeNull();
  });

  it("ordinalLabel speaks English, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinalLabel)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st",
    ]);
  });
});

/**
 * The gap against the CUSTOMER's date (Jess, 2026-08-03). The register held
 * both dates and said nothing about the distance between them.
 */
describe("poArrivalGapOf", () => {
  it("the goods land after the promise — it says how many days", () => {
    expect(poArrivalGapOf("2026-08-17", "2026-08-25")).toEqual({
      days: 8,
      tone: "late",
      label: "8d late",
    });
  });

  it("one day late is still late, and reads singular-safe", () => {
    expect(poArrivalGapOf("2026-08-17", "2026-08-18")?.label).toBe("1d late");
  });

  it("the same day is NOT fine — no room for one hiccup", () => {
    expect(poArrivalGapOf("2026-08-18", "2026-08-18")).toEqual({
      days: 0,
      tone: "tight",
      label: "same day",
    });
  });

  it("room to spare says nothing at all — silence has to mean fine", () => {
    expect(poArrivalGapOf("2026-08-22", "2026-08-15")).toBeNull();
  });

  it("a missing date on either side can prove nothing, so it says nothing", () => {
    expect(poArrivalGapOf(null, "2026-08-15")).toBeNull();
    expect(poArrivalGapOf("2026-08-15", null)).toBeNull();
    expect(poArrivalGapOf(null, null)).toBeNull();
  });

  it("counts CALENDAR days — a customer does not care that it is a Sunday", () => {
    // 31 Aug → 1 Sep crosses a month end; the arithmetic must not care.
    expect(poArrivalGapOf("2026-08-31", "2026-09-02")?.days).toBe(2);
  });
});

/**
 * RISK ORDER (Loo, 2026-08-04) — which purchase order to touch FIRST.
 *
 * The register opened on `PO Issued` oldest first, which sorts by how long the
 * DOCUMENT has waited. Measured live: `PO-2038`'s customer was expecting goods
 * that same day, the factory had never given a date, and it sat at row 8.
 */
describe("comparePoRisk — the register's default order", () => {
  const row = (over: Partial<PoRiskRow> = {}): PoRiskRow => ({
    poId: "PO-1",
    state: "need_confirmation",
    calls: [],
    customerDeliveryIso: null,
    arrivalIso: null,
    placedAtIso: "2026-05-01T08:00:00Z",
    ...over,
  });

  it("the five rungs, in order", () => {
    // 1 — an open engine call that is already LATE.
    expect(poRiskRungOf(row({ calls: [{ late: true }] }))).toBe(1);
    // 2 — the goods land AFTER what we promised the customer.
    expect(
      poRiskRungOf(
        row({ customerDeliveryIso: "2026-08-17", arrivalIso: "2026-08-25" }),
      ),
    ).toBe(2);
    // 3 — they land ON the customer's own day: no room for one hiccup.
    expect(
      poRiskRungOf(
        row({ customerDeliveryIso: "2026-08-18", arrivalIso: "2026-08-18" }),
      ),
    ).toBe(3);
    // 4 — an open call that is not late yet.
    expect(poRiskRungOf(row({ calls: [{ late: false }] }))).toBe(4);
    // 5 — nothing to say.
    expect(poRiskRungOf(row())).toBe(5);
  });

  it("a LATE call outranks goods landing after the promise", () => {
    const late = row({ poId: "PO-LATE", calls: [{ late: true }] });
    const after = row({
      poId: "PO-AFTER",
      customerDeliveryIso: "2026-08-17",
      arrivalIso: "2026-08-25",
    });
    expect([after, late].sort(comparePoRisk).map((r) => r.poId)).toEqual([
      "PO-LATE",
      "PO-AFTER",
    ]);
  });

  it("a FINISHED or CANCELLED PO never rises, however late its goods were", () => {
    // The gap is history, not work — the same silence the Goods Arrival cell
    // already keeps for a PO whose work is over.
    const done = row({
      poId: "PO-DONE",
      state: "completed",
      customerDeliveryIso: "2026-05-10",
      arrivalIso: "2026-05-20",
      calls: [{ late: true }],
    });
    const cancelled = row({ poId: "PO-CANX", state: "cancelled" });
    expect(poRiskRungOf(done)).toBe(5);
    expect(poRiskRungOf(cancelled)).toBe(5);
    const quiet = row({ poId: "PO-QUIET", calls: [{ late: false }] });
    expect([done, quiet, cancelled].sort(comparePoRisk).map((r) => r.poId)[0]).toBe(
      "PO-QUIET",
    );
  });

  it("inside a rung the NEAREST customer date leads, and no date sorts LAST", () => {
    const near = row({ poId: "PO-NEAR", calls: [{ late: true }], customerDeliveryIso: "2026-08-04" });
    const far = row({ poId: "PO-FAR", calls: [{ late: true }], customerDeliveryIso: "2026-09-30" });
    const none = row({ poId: "PO-NONE", calls: [{ late: true }], customerDeliveryIso: null });
    expect([none, far, near].sort(comparePoRisk).map((r) => r.poId)).toEqual([
      "PO-NEAR",
      "PO-FAR",
      "PO-NONE",
    ]);
  });

  it("Jess's PO Issued rule survives as the TIE-BREAKER, oldest first", () => {
    const old = row({ poId: "PO-OLD", placedAtIso: "2026-01-05T08:00:00Z" });
    const recent = row({ poId: "PO-NEW", placedAtIso: "2026-07-05T08:00:00Z" });
    expect([recent, old].sort(comparePoRisk).map((r) => r.poId)).toEqual([
      "PO-OLD",
      "PO-NEW",
    ]);
  });

  it("the order is TOTAL — two identical rows still cannot swap between renders", () => {
    const a = row({ poId: "PO-2001" });
    const b = row({ poId: "PO-2002" });
    expect(comparePoRisk(a, b)).toBeLessThan(0);
    expect(comparePoRisk(b, a)).toBeGreaterThan(0);
    expect(comparePoRisk(a, a)).toBe(0);
  });

  it("PO-2038's own shape: an ESTIMATE that lands after the promise still rises", () => {
    // The live case this card exists for — the factory has said nothing, so
    // there is no call at all and the only signal is our own estimate.
    const p2038 = row({
      poId: "PO-2038",
      customerDeliveryIso: "2026-08-04",
      arrivalIso: "2026-08-11",
    });
    const quiet = row({ poId: "PO-QUIET", placedAtIso: "2026-01-01T08:00:00Z" });
    expect(poRiskRungOf(p2038)).toBe(2);
    expect([quiet, p2038].sort(comparePoRisk).map((r) => r.poId)).toEqual([
      "PO-2038",
      "PO-QUIET",
    ]);
  });
});
