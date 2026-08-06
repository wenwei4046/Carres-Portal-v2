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
    expect(counts).toEqual({ readyDate: 0, tomorrow: 1, balance: 2, balancePos: 1 });
  });
});

/* ── Slice 1 · `Call {supplier} — confirm ready date` (Loo, 2026-08-06) ──── */

import { readyDateCallOf } from "./purchasing-supplier-calls";

/** A PO that CARRIES the ready-date facts (the opt-in) with nothing answered. */
function readyPo(over: Partial<SupplierCallPo> = {}): SupplierCallPo {
  return po({
    etaDateIso: null,
    expectedReadyDateIso: null,
    supplierArrivalDateIso: null,
    customerDeliveryIso: "2026-07-31", // Fri
    readyDateDue: {
      productionWorkingDays: 2,
      factoryOffDays: [0], // Mon–Sat factory (Ohana-like)
      bufferDays: 1,
    },
    ...over,
  });
}

describe("readyDateCallOf — the queue the door never had", () => {
  it("does NOT exist for a caller that never carried the facts (opt-in)", () => {
    // `po()` has no `expectedReadyDateIso` at all — Receiving's own mapping.
    expect(readyDateCallOf(po(), on("2026-07-27"))).toBeNull();
    expect(
      purchasingSupplierCallsOf(po({ etaDateIso: null }), on("2026-07-27")),
    ).toEqual([]);
  });

  it("opens on an open PO owing goods with no ready date and no arrival answer", () => {
    const a = readyDateCallOf(readyPo(), on("2026-07-27"));
    expect(a).not.toBeNull();
    expect(a!.key).toBe("confirm_ready_date");
    // due = Fri 31 − 1 buffer (office) = Thu 30, − 2 production (Mon–Sat
    // factory) = Tue 28. Not late on Mon 27.
    expect(a!.dueIso).toBe("2026-07-28");
    expect(a!.late).toBe(false);
  });

  it("turns late the working day after its due", () => {
    const a = readyDateCallOf(readyPo(), on("2026-07-29"));
    expect(a!.late).toBe(true);
  });

  it("counts production on the FACTORY's week, not the office's", () => {
    // Same PO, but a Mon–Fri factory: Thu 30 − 2 = Tue 28 either way here, so
    // anchor on a Monday customer date where the weeks diverge:
    // customer Mon 08-03 − 1 buffer (office) = Fri 31.
    //   Mon–Sat factory: 31 − 2 = Wed 29… no — Thu 30, Wed 29 → Wed 29? walk:
    //   Fri31 −1 → Thu30, −2 → Wed29.  Mon–Fri factory: identical mid-week.
    // Diverge across a weekend instead: customer Tue 07-28, buffer 0 →
    //   Tue 28 − 2 on Mon–Sat = Sat 07-25? no: Mon 27, Sat 25 → Sat 07-25.
    //   Tue 28 − 2 on Mon–Fri = Fri 07-24.
    const sat = readyDateCallOf(
      readyPo({
        customerDeliveryIso: "2026-07-28",
        readyDateDue: { productionWorkingDays: 2, factoryOffDays: [0], bufferDays: 0 },
      }),
      on("2026-07-20"),
    );
    const weekdayOnly = readyDateCallOf(
      readyPo({
        customerDeliveryIso: "2026-07-28",
        readyDateDue: { productionWorkingDays: 2, factoryOffDays: [0, 6], bufferDays: 0 },
      }),
      on("2026-07-20"),
    );
    expect(sat!.dueIso).toBe("2026-07-25");
    expect(weekdayOnly!.dueIso).toBe("2026-07-24");
  });

  it("a standing ready date closes it; one that slipped past re-opens it", () => {
    const standing = readyPo({ expectedReadyDateIso: "2026-07-30" });
    expect(readyDateCallOf(standing, on("2026-07-27"))).toBeNull();
    // The 30th passed, goods still owed → the answer names a dead fact.
    expect(readyDateCallOf(standing, on("2026-07-31"))).not.toBeNull();
  });

  it("a standing ARRIVAL promise makes the question moot; a stale one does not", () => {
    const standing = readyPo({ supplierArrivalDateIso: "2026-07-30" });
    expect(readyDateCallOf(standing, on("2026-07-27"))).toBeNull();
    expect(readyDateCallOf(standing, on("2026-07-31"))).not.toBeNull();
  });

  it("no production number, or no customer date → the call opens with NO due and is never late (P1/T7)", () => {
    const unrated = readyDateCallOf(
      readyPo({
        readyDateDue: { productionWorkingDays: null, factoryOffDays: [0], bufferDays: 1 },
      }),
      on("2026-07-27"),
    );
    expect(unrated).not.toBeNull();
    expect(unrated!.dueIso).toBeNull();
    expect(unrated!.late).toBe(false);
    const dateless = readyDateCallOf(
      readyPo({ customerDeliveryIso: null }),
      on("2026-07-27"),
    );
    expect(dateless).not.toBeNull();
    expect(dateless!.dueIso).toBeNull();
  });

  it("a settled or non-open PO has nothing to ask", () => {
    expect(
      readyDateCallOf(
        readyPo({ lines: [line({ qty: 3, receivedQty: 3 })] }),
        on("2026-07-27"),
      ),
    ).toBeNull();
    expect(readyDateCallOf(readyPo({ status: "received" }), on("2026-07-27"))).toBeNull();
  });

  it("rides purchasingSupplierCallsOf after the tomorrow call, and the counts see it", () => {
    // Tomorrow call open (eta tomorrow, no answer) AND ready-date facts stale.
    const both = readyPo({ etaDateIso: "2026-07-28" });
    const calls = purchasingSupplierCallsOf(both, on("2026-07-27"));
    expect(calls.map((c) => c.key)).toEqual([
      "confirm_tomorrows_delivery",
      "confirm_ready_date",
    ]);
    const counts = purchasingSupplierCallCounts([both, po()], on("2026-07-27"));
    expect(counts.readyDate).toBe(1);
  });
});

describe("provenance never gates the TOMORROW call (the po-workspace ruling, now a test)", () => {
  it("fires on our own estimate even when the arrival provenance field rides along", () => {
    // eta is OUR stamp (no supplier answer) and the provenance field is
    // present-and-null; the call must open exactly as it always has.
    const a = tomorrowDeliveryCallOf(
      po({ etaDateIso: "2026-07-28", supplierArrivalDateIso: null, expectedReadyDateIso: null }),
      on("2026-07-27"),
    );
    expect(a).not.toBeNull();
    // And a STANDING supplier arrival suppresses only the READY call — the
    // tomorrow call still runs on its own answer test, nothing else.
    const b = tomorrowDeliveryCallOf(
      po({ etaDateIso: "2026-07-28", supplierArrivalDateIso: "2026-07-28", expectedReadyDateIso: null }),
      on("2026-07-27"),
    );
    expect(b).not.toBeNull();
  });
});

/* ── T2 · The CALLS calendar (frozen with Loo, 2026-08-06) ────────────────── */

import {
  callCalendarBucketOf,
  purchasingCallCalendarDays,
  purchasingCallCalendarOf,
  type PurchasingOpenCall,
} from "./purchasing-supplier-calls";

/** A hand-made open call — the calendar is pure arithmetic over dues, so the
 *  tests state the due directly and one test proves the end-to-end seam. */
function call(over: Partial<PurchasingOpenCall> = {}): PurchasingOpenCall {
  return {
    key: "confirm_tomorrows_delivery",
    poId: "PO-1",
    supplierId: "sup-1",
    dueIso: null,
    late: false,
    ...over,
  };
}

describe("purchasingCallCalendarDays — five rows, today always first", () => {
  it("rolls over a weekend: Thu 6 Aug starts Thu·Fri·Mon·Tue·Wed (the frozen sketch)", () => {
    expect(purchasingCallCalendarDays(on("2026-08-06"))).toEqual([
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("skips a public holiday inside the window exactly as a weekend", () => {
    // Mon 24 Aug 26, with Tue 25 (Maulidur Rasul) and Mon 31 (Merdeka) as
    // holidays: both vanish from the window like the weekend between them.
    const days = purchasingCallCalendarDays({
      todayIso: "2026-08-24",
      holidays: new Set(["2026-08-25", "2026-08-31"]),
    });
    expect(days).toEqual([
      "2026-08-24",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-09-01",
    ]);
  });

  it("reads the LIVE Malaysian set when none is injected (Merdeka, certain:true)", () => {
    // Thu 27 Aug 26 → Mon 31 Aug is National Day in `myHolidaySet()`.
    const days = purchasingCallCalendarDays({ todayIso: "2026-08-27" });
    expect(days).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("a non-working today is STILL the first row — dues cannot hide overnight", () => {
    expect(purchasingCallCalendarDays(on("2026-08-02"))).toEqual([
      "2026-08-02", // Sunday — the operator opened the page on it
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
  });
});

describe("callCalendarBucketOf — a due files under exactly one row", () => {
  const opts = on("2026-08-06"); // Thu
  const days = purchasingCallCalendarDays(opts);

  it("late → Overdue, whatever the due says", () => {
    expect(
      callCalendarBucketOf(call({ dueIso: "2026-08-05", late: true }), days, "2026-08-06"),
    ).toEqual({ kind: "overdue" });
  });

  it("due today → today's row; due at the window edge → the last row", () => {
    expect(
      callCalendarBucketOf(call({ dueIso: "2026-08-06" }), days, "2026-08-06"),
    ).toEqual({ kind: "day", dayIso: "2026-08-06" });
    expect(
      callCalendarBucketOf(call({ dueIso: "2026-08-12" }), days, "2026-08-06"),
    ).toEqual({ kind: "day", dayIso: "2026-08-12" });
  });

  it("beyond the window → Later", () => {
    expect(
      callCalendarBucketOf(call({ dueIso: "2026-08-13" }), days, "2026-08-06"),
    ).toEqual({ kind: "later" });
  });

  it("no due → NO row (P1/T7): a call that cannot be late plans no day", () => {
    expect(callCalendarBucketOf(call(), days, "2026-08-06")).toBeNull();
  });

  it("a FACTORY-Saturday due files under the office's last day before it, never after", () => {
    // The ready-date due walks the factory's own week, so an Ohana (Mon–Sat)
    // due can be Sat 8 Aug — a day this office rail does not print. Filing it
    // under Mon 10 would surface it when it is already late; Fri 7 is the
    // office's final working day to make that call.
    expect(
      callCalendarBucketOf(call({ key: "confirm_ready_date", dueIso: "2026-08-08" }), days, "2026-08-06"),
    ).toEqual({ kind: "day", dayIso: "2026-08-07" });
  });
});

describe("purchasingCallCalendarOf — the rail's own numbers", () => {
  it("counts calls per row, keeps zero-count days, and totals Overdue/Later", () => {
    const cal = purchasingCallCalendarOf(
      [
        call({ poId: "A", dueIso: "2026-08-04", late: true }),
        call({ poId: "B", dueIso: "2026-08-05", late: true }),
        call({ poId: "C", dueIso: "2026-08-06" }),
        call({ poId: "D", dueIso: "2026-08-07" }),
        call({ poId: "E", dueIso: "2026-08-07", key: "confirm_balance_delivery_date" }),
        call({ poId: "F", dueIso: "2026-08-20" }),
        call({ poId: "G", dueIso: null }), // dueless — no row anywhere
      ],
      on("2026-08-06"),
    );
    expect(cal.overdue).toBe(2);
    expect(cal.later).toBe(1);
    expect(cal.days).toEqual([
      { dayIso: "2026-08-06", count: 1 },
      { dayIso: "2026-08-07", count: 2 },
      { dayIso: "2026-08-10", count: 0 }, // zero-count day rows still exist
      { dayIso: "2026-08-11", count: 0 },
      { dayIso: "2026-08-12", count: 0 },
    ]);
  });

  it("end to end through the engine: an eta-tomorrow PO's call lands on today's row", () => {
    // Thu 30 Jul eta, asked on Wed 29 → the tomorrow call is due Wed 29.
    const calls = purchasingSupplierCallsOf(po({ etaDateIso: "2026-07-30" }), on("2026-07-29"));
    expect(calls).toHaveLength(1);
    const cal = purchasingCallCalendarOf(calls, on("2026-07-29"));
    expect(cal.days[0]).toEqual({ dayIso: "2026-07-29", count: 1 });
    expect(cal.overdue).toBe(0);
  });
});
