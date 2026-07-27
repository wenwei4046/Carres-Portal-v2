import { describe, expect, it } from "vitest";
import {
  MIN_JUDGED_POS,
  SCORECARD_UNKNOWN_TEXT,
  computeSupplierScorecard,
  poVerdict,
  scorecardHeadline,
  type ScorecardClaim,
  type ScorecardLine,
  type ScorecardPo,
} from "./supplier-scorecard";

/**
 * R5 · the supplier scorecard.
 *
 * The tests that matter most here are the ones proving a number is NOT printed:
 * live prod holds 10 suppliers and zero purchase orders, so every one of these
 * rates is 0/0 on the day this shipped, and the failure mode the card must not
 * have is a screen that opens a negotiation with a percentage nobody earned.
 */

const ASOF = "2026-07-27";

function po(over: Partial<ScorecardPo> & { id: string }): ScorecardPo {
  return {
    supplier_id: "sup-1",
    eta_date: "2026-07-20",
    placed_at: "2026-07-01",
    received_on: null,
    ...over,
  };
}

function line(over: Partial<ScorecardLine> & { po_id: string }): ScorecardLine {
  return {
    qty: 10,
    received_qty: 10,
    damaged_qty: 0,
    wrong_item_qty: 0,
    ...over,
  };
}

function compute(
  pos: ScorecardPo[],
  lines: ScorecardLine[],
  claims: ScorecardClaim[] = [],
  asOf = ASOF,
) {
  return computeSupplierScorecard({
    supplier_id: "sup-1",
    pos,
    lines,
    claims,
    asOf,
  });
}

/** N POs delivered complete, on their promised day — the clean baseline. */
function cleanPos(n: number): { pos: ScorecardPo[]; lines: ScorecardLine[] } {
  const pos: ScorecardPo[] = [];
  const lines: ScorecardLine[] = [];
  for (let i = 0; i < n; i += 1) {
    pos.push(po({ id: `PO-${i}`, received_on: "2026-07-19" }));
    lines.push(line({ po_id: `PO-${i}` }));
  }
  return { pos, lines };
}

describe("poVerdict", () => {
  it("a PO with no promised date can never be judged", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: null, received_on: "2026-07-19" }),
      [line({ po_id: "PO-1" })],
      ASOF,
    );
    expect(v.complete).toBe(true);
    expect(v.judged).toBe(false);
  });

  it("a promise whose day has not come is not a broken promise", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: "2026-08-10" }),
      [line({ po_id: "PO-1", received_qty: 0 })],
      ASOF,
    );
    expect(v.judged).toBe(false);
    expect(v.onTime).toBeNull();
  });

  it("delivered early, before its promised day, is on time", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: "2026-08-10", received_on: "2026-07-15" }),
      [line({ po_id: "PO-1" })],
      ASOF,
    );
    // Complete, so it is judged even though the promised day is in the future.
    expect(v.judged).toBe(true);
    expect(v.onTime).toBe(true);
  });

  it("arriving ON the promised day is on time", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: "2026-07-20", received_on: "2026-07-20" }),
      [line({ po_id: "PO-1" })],
      ASOF,
    );
    expect(v.onTime).toBe(true);
  });

  it("arriving one day after the promised day is late", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: "2026-07-20", received_on: "2026-07-21" }),
      [line({ po_id: "PO-1" })],
      ASOF,
    );
    expect(v.onTime).toBe(false);
  });

  it("past its promised day and still short is late, with no receipt date needed", () => {
    const v = poVerdict(
      po({ id: "PO-1", eta_date: "2026-07-20", received_on: null }),
      [line({ po_id: "PO-1", received_qty: 4 })],
      ASOF,
    );
    expect(v.judged).toBe(true);
    expect(v.complete).toBe(false);
    expect(v.onTime).toBe(false);
  });

  it("complete with no receipt date on file answers UNKNOWN, never on time", () => {
    const v = poVerdict(
      po({ id: "PO-1", received_on: null }),
      [line({ po_id: "PO-1" })],
      ASOF,
    );
    expect(v.judged).toBe(true);
    expect(v.onTime).toBeNull();
  });

  it("counts a damaged and a wrong unit as arrived-but-faulty, never as received", () => {
    const v = poVerdict(
      po({ id: "PO-1" }),
      [line({ po_id: "PO-1", qty: 10, received_qty: 7, damaged_qty: 2, wrong_item_qty: 1 })],
      ASOF,
    );
    expect(v.unitsArrived).toBe(10);
    expect(v.unitsFaulty).toBe(3);
    // R1's law: a damaged unit is not received, so the line is still short.
    expect(v.complete).toBe(false);
  });

  it("a PO with no lines at all is not complete", () => {
    const v = poVerdict(po({ id: "PO-1", received_on: "2026-07-19" }), [], ASOF);
    expect(v.complete).toBe(false);
  });
});

describe("computeSupplierScorecard — the gates", () => {
  it("prints NO rate at all when the supplier has no PO (live prod on ship day)", () => {
    const sc = compute([], []);
    expect(sc.coverage.pos).toBe(0);
    expect(sc.onTime.known).toBe(false);
    expect(sc.inFull.known).toBe(false);
    expect(sc.faulty.known).toBe(false);
    expect(sc.claimRate.known).toBe(false);
    for (const r of [sc.onTime, sc.inFull, sc.faulty, sc.claimRate]) {
      if (r.known) throw new Error("unreachable");
      expect(r.reason).toBe("no_records");
    }
    expect(sc.coverage.from).toBeNull();
    expect(sc.coverage.days).toBe(0);
  });

  it("withholds every rate below the delivery floor and says how many are on file", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS - 1);
    const sc = compute(pos, lines);
    expect(sc.coverage.judged).toBe(MIN_JUDGED_POS - 1);
    expect(sc.onTime.known).toBe(false);
    if (sc.onTime.known) throw new Error("unreachable");
    expect(sc.onTime.reason).toBe("too_few");
    // The hits/of are still carried so the drawer can say "2 of 2".
    expect(sc.onTime.of).toBe(MIN_JUDGED_POS - 1);
  });

  it("prints the rates the moment the floor is reached", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS);
    const sc = compute(pos, lines);
    expect(sc.onTime).toEqual({
      known: true,
      pct: 100,
      hits: MIN_JUDGED_POS,
      of: MIN_JUDGED_POS,
    });
    expect(sc.inFull.known && sc.inFull.pct).toBe(100);
  });

  it("a PO with no promised date leaves the score and is counted by name", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS);
    pos.push(po({ id: "PO-X", eta_date: null, received_on: "2026-07-19" }));
    lines.push(line({ po_id: "PO-X" }));
    const sc = compute(pos, lines);
    expect(sc.coverage.pos).toBe(MIN_JUDGED_POS + 1);
    expect(sc.coverage.judged).toBe(MIN_JUDGED_POS);
    expect(sc.coverage.noPromisedDate).toBe(1);
    // It did not sneak into the numerator either.
    expect(sc.onTime.of).toBe(MIN_JUDGED_POS);
  });

  it("a promise not yet due is counted apart and scores nobody", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS);
    pos.push(po({ id: "PO-F", eta_date: "2026-09-01" }));
    lines.push(line({ po_id: "PO-F", received_qty: 0 }));
    const sc = compute(pos, lines);
    expect(sc.coverage.notDueYet).toBe(1);
    expect(sc.coverage.judged).toBe(MIN_JUDGED_POS);
    expect(sc.onTime.known && sc.onTime.pct).toBe(100);
  });

  it("a complete PO with no receipt date leaves the ON-TIME denominator only", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS);
    pos.push(po({ id: "PO-N", received_on: null }));
    lines.push(line({ po_id: "PO-N" }));
    const sc = compute(pos, lines);
    expect(sc.coverage.noDeliveryDate).toBe(1);
    // On-time still reads over the 3 it can answer for…
    expect(sc.onTime.of).toBe(MIN_JUDGED_POS);
    expect(sc.onTime.known && sc.onTime.pct).toBe(100);
    // …while in-full counts all 4, because completeness IS known for it.
    expect(sc.inFull.of).toBe(MIN_JUDGED_POS + 1);
  });

  it("withholds on-time when every judged PO is unanswerable, rather than reading 100%", () => {
    const pos: ScorecardPo[] = [];
    const lines: ScorecardLine[] = [];
    for (let i = 0; i < MIN_JUDGED_POS; i += 1) {
      pos.push(po({ id: `PO-${i}`, received_on: null }));
      lines.push(line({ po_id: `PO-${i}` }));
    }
    const sc = compute(pos, lines);
    expect(sc.coverage.judged).toBe(MIN_JUDGED_POS);
    expect(sc.onTime.known).toBe(false);
    if (sc.onTime.known) throw new Error("unreachable");
    expect(sc.onTime.reason).toBe("no_records");
    expect(sc.inFull.known && sc.inFull.pct).toBe(100);
  });
});

describe("computeSupplierScorecard — the numbers", () => {
  it("scores a mixed record: 2 of 3 on time, 2 of 3 in full", () => {
    const pos = [
      po({ id: "A", received_on: "2026-07-18" }), // early, complete
      po({ id: "B", received_on: "2026-07-20" }), // on the day, complete
      po({ id: "C", received_on: "2026-07-22" }), // late AND short
    ];
    const lines = [
      line({ po_id: "A" }),
      line({ po_id: "B" }),
      line({ po_id: "C", qty: 10, received_qty: 6, damaged_qty: 2 }),
    ];
    const sc = compute(pos, lines);
    expect(sc.onTime).toEqual({ known: true, pct: 67, hits: 2, of: 3 });
    expect(sc.inFull).toEqual({ known: true, pct: 67, hits: 2, of: 3 });
  });

  it("faulty rate is per UNIT and counts only what actually arrived", () => {
    const pos = [
      po({ id: "A", received_on: "2026-07-18" }),
      po({ id: "B", received_on: "2026-07-18" }),
      po({ id: "C", received_on: "2026-07-18" }),
    ];
    const lines = [
      line({ po_id: "A" }), // 10 good
      line({ po_id: "B" }), // 10 good
      // 4 arrived: 2 good, 1 damaged, 1 wrong — the other 6 never turned up and
      // must NOT dilute the quality figure.
      line({ po_id: "C", qty: 10, received_qty: 2, damaged_qty: 1, wrong_item_qty: 1 }),
    ];
    const sc = compute(pos, lines);
    expect(sc.faulty).toEqual({ known: true, pct: 8, hits: 2, of: 24 });
  });

  it("says nothing about quality when nothing has arrived", () => {
    const pos = ["A", "B", "C"].map((id) => po({ id }));
    const lines = ["A", "B", "C"].map((id) => line({ po_id: id, received_qty: 0 }));
    const sc = compute(pos, lines);
    expect(sc.coverage.judged).toBe(3);
    expect(sc.faulty.known).toBe(false);
    if (sc.faulty.known) throw new Error("unreachable");
    expect(sc.faulty.reason).toBe("no_records");
    expect(sc.onTime.known && sc.onTime.pct).toBe(0);
  });

  it("claim rate counts judged POs that needed a claim, once each", () => {
    const { pos, lines } = cleanPos(4);
    const claims: ScorecardClaim[] = [
      { po_id: "PO-0", claim_type: "damaged", status: "open", reported_on: "2026-07-20", closed_on: null },
      { po_id: "PO-0", claim_type: "wrong_sku", status: "open", reported_on: "2026-07-20", closed_on: null },
      { po_id: "PO-1", claim_type: "late_delivery", status: "closed", reported_on: "2026-07-10", closed_on: "2026-07-14" },
    ];
    const sc = compute(pos, lines, claims);
    expect(sc.claimRate).toEqual({ known: true, pct: 50, hits: 2, of: 4 });
  });
});

describe("computeSupplierScorecard — claim settlement", () => {
  const { pos, lines } = cleanPos(MIN_JUDGED_POS);

  it("averages only settled claims, and never hides the open ones", () => {
    const claims: ScorecardClaim[] = [
      { po_id: "PO-0", claim_type: "damaged", status: "closed", reported_on: "2026-07-01", closed_on: "2026-07-05" },
      { po_id: "PO-1", claim_type: "damaged", status: "closed", reported_on: "2026-07-01", closed_on: "2026-07-03" },
      { po_id: "PO-2", claim_type: "late_delivery", status: "open", reported_on: "2026-07-07", closed_on: null },
    ];
    const sc = compute(pos, lines, claims);
    expect(sc.claims.closed).toBe(2);
    expect(sc.claims.avgDaysToSettle).toBe(3);
    expect(sc.claims.open).toBe(1);
    expect(sc.claims.oldestOpenDays).toBe(20);
  });

  it("a supplier who has never settled anything gets no average at all", () => {
    const claims: ScorecardClaim[] = [
      { po_id: "PO-0", claim_type: "damaged", status: "open", reported_on: "2026-07-01", closed_on: null },
    ];
    const sc = compute(pos, lines, claims);
    expect(sc.claims.avgDaysToSettle).toBeNull();
    expect(sc.claims.open).toBe(1);
    expect(sc.claims.oldestOpenDays).toBe(26);
  });

  it("a claim marked closed with no close stamp is counted as still open, not as instant", () => {
    const claims: ScorecardClaim[] = [
      { po_id: "PO-0", claim_type: "damaged", status: "closed", reported_on: "2026-07-01", closed_on: null },
    ];
    const sc = compute(pos, lines, claims);
    expect(sc.claims.closed).toBe(0);
    expect(sc.claims.open).toBe(1);
    expect(sc.claims.avgDaysToSettle).toBeNull();
  });

  it("counts a claim on an unscorable PO — only the RATE needs a comparable denominator", () => {
    const withNoPromise = [...pos, po({ id: "PO-NP", eta_date: null })];
    const claims: ScorecardClaim[] = [
      { po_id: "PO-NP", claim_type: "damaged", status: "open", reported_on: "2026-07-20", closed_on: null },
    ];
    const sc = compute(withNoPromise, lines, claims);
    expect(sc.claims.open).toBe(1);
    // …but it cannot move a rate whose denominator it is not in.
    expect(sc.claimRate).toEqual({ known: true, pct: 0, hits: 0, of: MIN_JUDGED_POS });
  });
});

describe("coverage", () => {
  it("reports where the records start and how far they reach", () => {
    const pos = [
      po({ id: "A", placed_at: "2026-07-01", received_on: "2026-07-19" }),
      po({ id: "B", placed_at: "2026-06-15", received_on: "2026-07-19" }),
    ];
    const sc = compute(pos, [line({ po_id: "A" }), line({ po_id: "B" })]);
    expect(sc.coverage.from).toBe("2026-06-15");
    expect(sc.coverage.days).toBe(42);
  });
});

describe("scorecardHeadline", () => {
  it("teaches instead of printing a zero when there is nothing on file", () => {
    expect(scorecardHeadline(compute([], []))).toBe("No PO on file yet.");
  });

  it("says the promise has not been tested when nothing is judged yet", () => {
    const sc = compute(
      [po({ id: "A", eta_date: "2026-09-01" })],
      [line({ po_id: "A", received_qty: 0 })],
    );
    expect(scorecardHeadline(sc)).toBe(
      "No delivery has reached its promised date yet.",
    );
  });

  it("blames the missing promise, not the supplier, when no PO carries a date", () => {
    const sc = compute(
      [po({ id: "A", eta_date: null }), po({ id: "B", eta_date: null })],
      [line({ po_id: "A" }), line({ po_id: "B" })],
    );
    expect(scorecardHeadline(sc)).toBe(
      "No PO carries a promised date, so nothing can be scored.",
    );
  });

  it("names how many deliveries are still needed before a score", () => {
    const { pos, lines } = cleanPos(1);
    expect(scorecardHeadline(compute(pos, lines))).toBe(
      `1 delivery on file · ${MIN_JUDGED_POS} needed before a score.`,
    );
  });

  it("leads with the numbers once they exist", () => {
    const { pos, lines } = cleanPos(MIN_JUDGED_POS);
    const claims: ScorecardClaim[] = [
      { po_id: "PO-0", claim_type: "damaged", status: "open", reported_on: "2026-07-20", closed_on: null },
    ];
    expect(scorecardHeadline(compute(pos, lines, claims))).toBe(
      "100% on time · 100% in full · 1 claim open.",
    );
  });

  it("never uses a banned word", () => {
    // COPY-STANDARD's banned list — a scorecard is the easiest place to smuggle
    // "At Risk" or "Pending" back in.
    const banned = [
      "Chase",
      "Pending",
      "At Risk",
      "Attention",
      "Processing",
      "In Progress",
      "Unscheduled",
      "POD",
    ];
    const sentences = [
      scorecardHeadline(compute([], [])),
      scorecardHeadline(compute(cleanPos(1).pos, cleanPos(1).lines)),
      scorecardHeadline(compute(cleanPos(3).pos, cleanPos(3).lines)),
      ...Object.values(SCORECARD_UNKNOWN_TEXT),
    ];
    for (const s of sentences)
      for (const b of banned) expect(s.toLowerCase()).not.toContain(b.toLowerCase());
  });
});
