import { describe, it, expect } from "vitest";
import {
  PO_STATE_ACTION_SHORT,
  PO_STATE_ACTION_WORD,
  poCurrentActionOf,
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
  it("no supplier date → Need Confirmation", () => {
    expect(poWorkStateOf(po(), TODAY)).toBe("need_confirmation");
  });

  it("a future supplier date → Waiting Goods", () => {
    expect(poWorkStateOf(po({ etaDateIso: "2026-09-01" }), TODAY)).toBe("waiting");
  });

  it("the day came, or something checked in → Ready to Receive", () => {
    expect(poWorkStateOf(po({ etaDateIso: TODAY }), TODAY)).toBe("ready");
    const partial = po({ etaDateIso: "2026-09-01" });
    partial.lines[0].receivedQty = 1;
    expect(poWorkStateOf(partial, TODAY)).toBe("ready");
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
    // The ONE quiet-ready shape: the day came AND the supplier already
    // answered about THIS date (call closed). A partial receipt instead
    // keeps the BALANCE call open — chasing the balance outranks the
    // handover word, and that is Law 7 working, not a gap.
    const a = poCurrentActionOf(
      po({ etaDateIso: TODAY, tomorrowAnswerAboutDateIso: TODAY }),
      { todayIso: TODAY },
    );
    expect(a).toEqual({ kind: "state", key: "ready", word: "Open Receiving" });
  });

  it("LAW 7 — the engine's open call BEATS the state word", () => {
    // Arriving today → the tomorrow's-delivery call is open; the header must
    // carry the CALL, never the quieter state word.
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
  });
});
