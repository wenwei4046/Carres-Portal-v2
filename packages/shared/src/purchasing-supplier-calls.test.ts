import { describe, it, expect } from "vitest";
import {
  PURCHASING_OFFICE_OFF_DAYS,
  balanceDeliveryCallsOf,
  purchasingSupplierCallCounts,
  purchasingSupplierCallsOf,
  tomorrowDeliveryCallOf,
  type SupplierCallLine,
  type SupplierCallPo,
} from "./purchasing-supplier-calls";
import { DEFAULT_OFF_DAYS, addWorkingDays } from "./working-days";

/**
 * P3 · The two supplier calls.
 *
 * Every date below is anchored on a real weekday: 2026-07-19 is a Sunday (it is
 * COPY-STANDARD's own `fmtDate` example, `Sun, 19 Jul 26`), so
 *   Mon 2026-07-27 · Tue 28 · Wed 29 · Thu 30 · Fri 31 · Sat 08-01 · Sun 08-02 · Mon 08-03.
 *
 * `holidays: new Set()` throughout, so a weekday assertion is about the WEEK and
 * never about whichever Malaysian holiday happens to land nearby. One test
 * feeds a holiday in on purpose.
 */

const NO_HOLIDAYS = new Set<string>();

function line(over: Partial<SupplierCallLine> = {}): SupplierCallLine {
  return {
    id: "line-1",
    sku: "BF-001",
    qty: 4,
    receivedQty: 0,
    shortSinceIso: null,
    balanceAnswerAboutQty: null,
    ...over,
  };
}

function po(over: Partial<SupplierCallPo> = {}): SupplierCallPo {
  return {
    poId: "PO-1",
    supplierId: "sup-1",
    status: "open",
    etaDateIso: "2026-07-30",
    tomorrowAnswerAboutDateIso: null,
    lines: [line()],
    ...over,
  };
}

const on = (todayIso: string) => ({ todayIso, holidays: NO_HOLIDAYS });

describe("the calendar is named, not inherited", () => {
  it("purchasing counts on the OFFICE week (Law 2A), which is NOT the engine default", () => {
    expect([...PURCHASING_OFFICE_OFF_DAYS]).toEqual([0, 6]);
    // The guard that matters: if somebody ever 'tidies' the engine default to
    // match, this fails and they find out here rather than on a live deadline.
    expect([...PURCHASING_OFFICE_OFF_DAYS]).not.toEqual([...DEFAULT_OFF_DAYS]);
  });

  it("Friday raises Monday's call, because Saturday is not an office working day", () => {
    // Under the engine default (Mon–Sat) the next working day from Friday is
    // SATURDAY, and a Monday arrival would raise nothing on Friday.
    expect(addWorkingDays("2026-07-31", 1, { offDays: DEFAULT_OFF_DAYS, holidays: NO_HOLIDAYS }))
      .toBe("2026-08-01");
    const a = tomorrowDeliveryCallOf(
      po({ etaDateIso: "2026-08-03" }),
      on("2026-07-31"),
    );
    expect(a).not.toBeNull();
    expect(a!.dueIso).toBe("2026-07-31");
    expect(a!.late).toBe(false);
  });

  it("a public holiday moves the window with it", () => {
    // Thu 30 Jul is a holiday → the next office working day from Wed 29 is Fri 31.
    const a = tomorrowDeliveryCallOf(
      po({ etaDateIso: "2026-07-31" }),
      { todayIso: "2026-07-29", holidays: new Set(["2026-07-30"]) },
    );
    expect(a).not.toBeNull();
    // and its Due is the working day BEFORE the arrival, which skips the holiday
    expect(a!.dueIso).toBe("2026-07-29");
  });
});

describe("Confirm tomorrow's delivery", () => {
  it("appears the working day before the expected arrival", () => {
    const a = tomorrowDeliveryCallOf(po(), on("2026-07-29"));
    expect(a?.key).toBe("confirm_tomorrows_delivery");
    expect(a?.dueIso).toBe("2026-07-29");
    expect(a?.late).toBe(false);
  });

  it("does not appear while the arrival is further out", () => {
    expect(tomorrowDeliveryCallOf(po({ etaDateIso: "2026-07-31" }), on("2026-07-29")))
      .toBeNull();
  });

  it("STAYS OPEN past its Due and turns late — it does not vanish at midnight", () => {
    // §3 calls it "a one-day action", which is about the DUE. An action leaves
    // when its COMPLETION becomes true and at no other moment (ACTION-FLOW).
    const a = tomorrowDeliveryCallOf(po({ etaDateIso: "2026-07-28" }), on("2026-07-29"));
    expect(a).not.toBeNull();
    expect(a!.dueIso).toBe("2026-07-27");
    expect(a!.late).toBe(true);
  });

  it("cannot appear without an expected arrival — nothing is invented to stand in", () => {
    expect(tomorrowDeliveryCallOf(po({ etaDateIso: null }), on("2026-07-29"))).toBeNull();
  });

  it("closes on an answer about THIS date", () => {
    expect(
      tomorrowDeliveryCallOf(
        po({ tomorrowAnswerAboutDateIso: "2026-07-30" }),
        on("2026-07-29"),
      ),
    ).toBeNull();
  });

  it("RE-OPENS when the factory moves the date again", () => {
    // The old answer was about 30 Jul. The PO now says 3 Aug, so the answer has
    // stopped being about anything (S4 / C8's delay_decision_eta, one module over).
    const a = tomorrowDeliveryCallOf(
      po({ etaDateIso: "2026-08-03", tomorrowAnswerAboutDateIso: "2026-07-30" }),
      on("2026-07-31"),
    );
    expect(a).not.toBeNull();
  });

  it("says nothing about a PO that is not open, or one that owes nothing", () => {
    expect(tomorrowDeliveryCallOf(po({ status: "received" }), on("2026-07-29"))).toBeNull();
    expect(
      tomorrowDeliveryCallOf(
        po({ lines: [line({ receivedQty: 4 })] }),
        on("2026-07-29"),
      ),
    ).toBeNull();
  });
});

describe("Confirm balance delivery date", () => {
  const short = () =>
    po({
      etaDateIso: null, // isolate: no tomorrow call in the way
      lines: [line({ receivedQty: 1, shortSinceIso: "2026-07-31" })],
    });

  it("appears on a part-received line, counted per LINE", () => {
    const calls = balanceDeliveryCallsOf(short(), on("2026-08-03"));
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("confirm_balance_delivery_date");
    expect(calls[0].poLineId).toBe("line-1");
    expect(calls[0].sku).toBe("BF-001");
    expect(calls[0].balanceQty).toBe(3);
  });

  it("is due the working day after the short delivery — on the OFFICE week", () => {
    // Short on Friday → due Monday, not Saturday.
    const calls = balanceDeliveryCallsOf(short(), on("2026-08-03"));
    expect(calls[0].dueIso).toBe("2026-08-03");
    expect(calls[0].late).toBe(false);
    const later = balanceDeliveryCallsOf(short(), on("2026-08-04"));
    expect(later[0].late).toBe(true);
  });

  it("says nothing about a line with nothing in, or a line that is complete", () => {
    expect(balanceDeliveryCallsOf(po({ etaDateIso: null }), on("2026-08-03"))).toHaveLength(0);
    expect(
      balanceDeliveryCallsOf(
        po({ etaDateIso: null, lines: [line({ receivedQty: 4 })] }),
        on("2026-08-03"),
      ),
    ).toHaveLength(0);
  });

  it("closes on an answer about THIS shortfall, and re-opens on the next one", () => {
    const answered = po({
      etaDateIso: null,
      lines: [line({ receivedQty: 1, shortSinceIso: "2026-07-31", balanceAnswerAboutQty: 1 })],
    });
    expect(balanceDeliveryCallsOf(answered, on("2026-08-03"))).toHaveLength(0);

    // A second short delivery: 2 of 4 in now, so the answer about 1 is spent.
    const again = po({
      etaDateIso: null,
      lines: [line({ receivedQty: 2, shortSinceIso: "2026-08-03", balanceAnswerAboutQty: 1 })],
    });
    expect(balanceDeliveryCallsOf(again, on("2026-08-04"))).toHaveLength(1);
  });

  it("with no recorded short day it raises the call with NO Due, and never late", () => {
    // A line short before 0306 stamped anything. A deadline nobody recorded may
    // not be invented, and a step that cannot be late is not urgent (T7).
    const legacy = po({
      etaDateIso: null,
      lines: [line({ receivedQty: 1, shortSinceIso: null })],
    });
    const calls = balanceDeliveryCallsOf(legacy, on("2026-09-30"));
    expect(calls).toHaveLength(1);
    expect(calls[0].dueIso).toBeNull();
    expect(calls[0].late).toBe(false);
  });

  it("one row per short LINE, not per PO", () => {
    const two = po({
      etaDateIso: null,
      lines: [
        line({ id: "a", sku: "BF-001", receivedQty: 1, shortSinceIso: "2026-07-31" }),
        line({ id: "b", sku: "MS-002", receivedQty: 2, qty: 5, shortSinceIso: "2026-07-31" }),
      ],
    });
    expect(balanceDeliveryCallsOf(two, on("2026-08-03")).map((a) => a.poLineId))
      .toEqual(["a", "b"]);
  });
});

describe("both at once — Law 1: one action never hides another", () => {
  it("a PO delivered short and expecting its balance van carries BOTH calls", () => {
    const p = po({
      etaDateIso: "2026-08-03",
      lines: [line({ receivedQty: 1, shortSinceIso: "2026-07-30" })],
    });
    const calls = purchasingSupplierCallsOf(p, on("2026-07-31"));
    expect(calls.map((a) => a.key)).toEqual([
      // §4's display order: today's run first, part-delivery cleanup after.
      "confirm_tomorrows_delivery",
      "confirm_balance_delivery_date",
    ]);
  });

  it("the counts say POs for one and LINES for the other", () => {
    const p = po({
      etaDateIso: "2026-08-03",
      lines: [
        line({ id: "a", receivedQty: 1, shortSinceIso: "2026-07-30" }),
        line({ id: "b", sku: "MS-002", qty: 5, receivedQty: 2, shortSinceIso: "2026-07-30" }),
      ],
    });
    const counts = purchasingSupplierCallCounts([p], on("2026-07-31"));
    expect(counts).toEqual({ tomorrow: 1, balance: 2, balancePos: 1 });
  });
});
