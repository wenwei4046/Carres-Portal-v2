import { describe, it, expect } from "vitest";
import {
  PO_DELAY_REASONS,
  PO_STATE_ACTION_SHORT,
  PO_STATE_ACTION_WORD,
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
  it("a quiet PO with no date says Confirm Goods Arriving Date", () => {
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
