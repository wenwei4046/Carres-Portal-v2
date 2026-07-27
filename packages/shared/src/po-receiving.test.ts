import { describe, it, expect } from "vitest";
import {
  poReceivingProgress,
  poLineReportable,
  type PoReceivingLine,
} from "./po-receiving";

/**
 * R1 · the four numbers and the one word they produce.
 *
 * The vocabulary law is asserted, not just documented: no surface may ever say
 * "Missing" for the not-yet-arrived qty.
 */

const line = (l: PoReceivingLine): PoReceivingLine => l;

describe("poReceivingProgress — state ladder", () => {
  it("nothing received yet reads In transit", () => {
    const p = poReceivingProgress([line({ qty: 10, received_qty: 0 })]);
    expect(p.state).toBe("in_transit");
    expect(p.label).toBe("In transit");
    expect(p.pendingDelivery).toBe(10);
  });

  it("some good units in reads Partially received with the count", () => {
    const p = poReceivingProgress([line({ qty: 10, received_qty: 8 })]);
    expect(p.state).toBe("partially_received");
    expect(p.label).toBe("Partially received (8/10)");
    expect(p.pendingLabel).toBe("2 units pending delivery");
  });

  it("everything in reads Fully received with no pending line", () => {
    const p = poReceivingProgress([line({ qty: 3, received_qty: 3 })]);
    expect(p.state).toBe("fully_received");
    expect(p.label).toBe("Fully received");
    expect(p.pendingDelivery).toBe(0);
    expect(p.pendingLabel).toBeNull();
  });

  it("damage outranks partial — the row a human must act on", () => {
    const p = poReceivingProgress([
      line({ qty: 10, received_qty: 8, damaged_qty: 2 }),
    ]);
    expect(p.state).toBe("receiving_issue");
    expect(p.label).toBe("Receiving issue");
    expect(p.issueLabel).toBe("2 damaged");
  });

  it("a wrong item alone is an issue too", () => {
    const p = poReceivingProgress([
      line({ qty: 4, received_qty: 0, wrong_item_qty: 4 }),
    ]);
    expect(p.state).toBe("receiving_issue");
    expect(p.issueLabel).toBe("4 wrong items");
  });

  it("one wrong item is singular", () => {
    const p = poReceivingProgress([
      line({ qty: 4, received_qty: 3, wrong_item_qty: 1 }),
    ]);
    expect(p.issueLabel).toBe("1 wrong item");
  });

  it("both kinds of problem read together", () => {
    const p = poReceivingProgress([
      line({ qty: 10, received_qty: 5, damaged_qty: 3, wrong_item_qty: 2 }),
    ]);
    expect(p.issueQty).toBe(5);
    expect(p.issueLabel).toBe("3 damaged · 2 wrong items");
  });

  it("a replaced damaged unit clears the red — history stays on the counters", () => {
    // The supplier sent 2 broken, then shipped 2 good ones. Nothing is
    // outstanding any more, so the row must not stay red forever (there is no
    // button to clear it in R1 — the state has to heal itself).
    const p = poReceivingProgress([
      line({ qty: 10, received_qty: 10, damaged_qty: 2 }),
    ]);
    expect(p.state).toBe("fully_received");
    expect(p.damaged).toBe(2);
  });
});

describe("poReceivingProgress — vocabulary law", () => {
  it("never says Missing", () => {
    const p = poReceivingProgress([
      line({ qty: 10, received_qty: 1, damaged_qty: 1, wrong_item_qty: 1 }),
    ]);
    const words = [p.label, p.pendingLabel, p.issueLabel].join(" ").toLowerCase();
    expect(words).not.toContain("missing");
    expect(words).not.toContain("short");
    expect(words).toContain("pending delivery");
  });

  it("one outstanding unit is singular", () => {
    const p = poReceivingProgress([line({ qty: 2, received_qty: 1 })]);
    expect(p.pendingLabel).toBe("1 unit pending delivery");
  });
});

describe("poReceivingProgress — rolls up multiple lines", () => {
  it("sums across lines and takes the worst state", () => {
    const p = poReceivingProgress([
      line({ qty: 5, received_qty: 5 }),
      line({ qty: 5, received_qty: 3, damaged_qty: 2 }),
    ]);
    expect(p.ordered).toBe(10);
    expect(p.received).toBe(8);
    expect(p.pendingDelivery).toBe(2);
    expect(p.state).toBe("receiving_issue");
  });

  it("a damaged unit is still pending delivery — the supplier owes a good one", () => {
    const p = poReceivingProgress([
      line({ qty: 6, received_qty: 4, damaged_qty: 2 }),
    ]);
    expect(p.pendingDelivery).toBe(2);
  });
});

describe("poReceivingProgress — degrades instead of lying", () => {
  it("a pre-0283 payload with no issue columns reads zero issues", () => {
    const p = poReceivingProgress([{ qty: 10, received_qty: 4 }]);
    expect(p.issueQty).toBe(0);
    expect(p.state).toBe("partially_received");
  });

  it("null/undefined lines read as In transit, not NaN", () => {
    for (const input of [null, undefined, []]) {
      const p = poReceivingProgress(input);
      expect(p.ordered).toBe(0);
      expect(p.state).toBe("in_transit");
      expect(p.pendingLabel).toBeNull();
    }
  });

  it("an empty PO is not Fully received", () => {
    expect(poReceivingProgress([]).state).toBe("in_transit");
  });

  it("clamps a stray over-receipt so the row never reads 12/10", () => {
    const p = poReceivingProgress([line({ qty: 10, received_qty: 12 })]);
    expect(p.received).toBe(10);
    expect(p.pendingDelivery).toBe(0);
    expect(p.state).toBe("fully_received");
  });

  it("ignores negative junk", () => {
    const p = poReceivingProgress([
      line({ qty: 4, received_qty: -2, damaged_qty: -5 }),
    ]);
    expect(p.received).toBe(0);
    expect(p.damaged).toBe(0);
  });
});

describe("poLineReportable", () => {
  it("is what this DO may still account for", () => {
    expect(poLineReportable({ qty: 10, received_qty: 4 })).toBe(6);
  });

  it("does not shrink because of past damage — a replacement can still land", () => {
    // 10 ordered, all 10 arrived broken, 0 received. The replacement DO must
    // be able to report all 10 good units.
    expect(poLineReportable({ qty: 10, received_qty: 0, damaged_qty: 10 })).toBe(
      10,
    );
  });

  it("is zero on a settled line", () => {
    expect(poLineReportable({ qty: 3, received_qty: 3 })).toBe(0);
  });
});
