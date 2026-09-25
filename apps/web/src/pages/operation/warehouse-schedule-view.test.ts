/**
 * The Schedule's view rules, tested where they are decided rather than through
 * the DOM — every one of these is a claim about TRUTH, not about layout.
 */
import { describe, expect, it } from "vitest";
import {
  cardReferencesOf,
  cardSurfaceClassOf,
  extraRelatedRecordsOf,
  undatedSummaryWordOf,
  cardsOnDate,
  categoryVisualOf,
  dateStatusPillOf,
  emptyDayWordOf,
  exceptionLinesOf,
  lineProgressOf,
  specialMovementLabelOf,
  undatedCards,
} from "./warehouse-schedule-view";
import type {
  WarehouseScheduleCard,
  WarehouseScheduleLine,
} from "@carres/shared";

function line(over: Partial<WarehouseScheduleLine> = {}): WarehouseScheduleLine {
  return {
    id: "l1",
    categoryKey: "Mattress",
    modelLabel: "Ohana King",
    plannedQty: 3,
    receivedQty: null,
    loadedQty: null,
    damagedQty: null,
    ...over,
  };
}

function card(over: Partial<WarehouseScheduleCard> = {}): WarehouseScheduleCard {
  return {
    id: "c1",
    direction: "arrival",
    kind: "supplier-delivery",
    sourceId: "po1",
    sourceRef: "PO-2609-0001",
    soRef: null,
    doRef: null,
    partyName: "Ohana",
    siteId: "site-pj",
    date: "2026-09-15",
    dateStatus: "expected",
    lines: [line()],
    driverConfirmedQty: null,
    logisticsName: "NETS Delivery",
    relatedRecords: [],
    openHref: "/operation?tab=warehouse-inbound&po=po1",
    detailHref: null,
    overdue: false,
    ...over,
  };
}

describe("progress — an absent fact is never a recorded zero", () => {
  it("null receipt prints the PLANNED quantity alone, never a fabricated 0/N", () => {
    const p = lineProgressOf(line({ receivedQty: null }), "arrival");
    expect(p.state).toBe("unknown");
    expect(p.text).toBe("3");
    expect(p.text).not.toContain("0");
    expect(p.done).toBeNull();
    expect(p.status).toBe("3 expected, receipt not recorded");
    expect(p.tone).toBe("neutral");
  });

  it("a RECORDED zero is a different answer from an absent one", () => {
    const recorded = lineProgressOf(line({ receivedQty: 0 }), "arrival");
    const absent = lineProgressOf(line({ receivedQty: null }), "arrival");
    expect(recorded.state).toBe("none");
    expect(recorded.text).toBe("0/3");
    expect(recorded.text).not.toBe(absent.text);
    expect(recorded.status).toBe("0 of 3 received");
  });

  it("partial is warning, complete is success, and both keep their numbers", () => {
    const partial = lineProgressOf(line({ receivedQty: 2 }), "arrival");
    expect(partial.state).toBe("partial");
    expect(partial.text).toBe("2/3");
    expect(partial.tone).toBe("warning");

    const complete = lineProgressOf(line({ receivedQty: 3 }), "arrival");
    expect(complete.state).toBe("complete");
    expect(complete.text).toBe("3/3");
    expect(complete.tone).toBe("success");
  });

  it("a pickup reads loadedQty and says `loaded`; it never reads receivedQty", () => {
    const p = lineProgressOf(line({ loadedQty: 1, receivedQty: 3 }), "pickup");
    expect(p.text).toBe("1/3");
    expect(p.status).toBe("1 of 3 loaded");
  });
});

describe("the special movement label", () => {
  it("an ordinary supplier arrival and an ordinary customer pickup print NO heading", () => {
    expect(specialMovementLabelOf("supplier-delivery")).toBeNull();
    expect(specialMovementLabelOf("customer_delivery_pickup")).toBeNull();
  });

  it("names every special movement in the governed words", () => {
    expect(specialMovementLabelOf("transfer")).toBe("Transfer arrival");
    expect(specialMovementLabelOf("customer-return")).toBe("Customer/failed-delivery return");
    expect(specialMovementLabelOf("failed-delivery-return")).toBe("Customer/failed-delivery return");
    expect(specialMovementLabelOf("repair-return")).toBe("Return from repair");
    expect(specialMovementLabelOf("supplier-return")).toBe("Supplier-return pickup");
    expect(specialMovementLabelOf("repair-pickup")).toBe("Repair pickup");
  });

  it("an unknown kind stays SILENT — a storage key never reaches the screen", () => {
    expect(specialMovementLabelOf("stock_flag_repair")).toBeNull();
  });
});

describe("the category slot", () => {
  it("uses the kit glyph and names the category for the reader", () => {
    expect(categoryVisualOf("mattress")).toEqual({ glyph: "mattress", word: "Mattress" });
    expect(categoryVisualOf("Sofa")).toEqual({ glyph: "sofa", word: "Sofa" });
  });

  it("categories sharing the neutral glyph still say their own word", () => {
    expect(categoryVisualOf("footrest")).toEqual({ glyph: "goods", word: "Footrest" });
    expect(categoryVisualOf("accessory")).toEqual({ glyph: "goods", word: "Accessory" });
  });

  it("a record that states NO category claims nothing", () => {
    expect(categoryVisualOf(null)).toEqual({ glyph: "goods", word: null });
    expect(categoryVisualOf("  ")).toEqual({ glyph: "goods", word: null });
  });
});

describe("date agreement is a QUIET badge, never the card's surface", () => {
  it("expected is quiet slate, scheduled is quiet blue", () => {
    expect(dateStatusPillOf("expected")).toEqual({ word: "Expected", tone: "neutral" });
    expect(dateStatusPillOf("scheduled")).toEqual({ word: "Scheduled", tone: "info" });
  });

  it("an unknown agreement prints NO badge — a date alone never means Scheduled", () => {
    expect(dateStatusPillOf(null)).toBeNull();
  });

  it("EVERY card is white; date agreement never paints the surface", () => {
    for (const status of ["expected", "scheduled", null] as const) {
      const surface = cardSurfaceClassOf({ overdue: false });
      expect(surface).toContain("bg-white");
      expect(surface).not.toContain("amber");
      expect(dateStatusPillOf(status)?.tone).not.toBe("warning");
    }
  });

  it("WARNING is reserved for work that is actually overdue", () => {
    const overdue = cardSurfaceClassOf({ overdue: true });
    expect(overdue).toContain("kit-amber-6");
    expect(overdue).not.toContain("bg-white");
    /* and the word survives the colour change */
    expect(exceptionLinesOf(card({ overdue: true }))[0]).toEqual({
      key: "overdue",
      text: "Overdue",
      tone: "warning",
    });
  });
});

describe("source references", () => {
  it("an arrival leads with its owning source record", () => {
    expect(cardReferencesOf(card({ sourceRef: "PO-2609-0001" }))).toEqual({
      primary: { ref: "PO-2609-0001", href: null },
      secondary: null,
    });
  });

  it("a customer pickup leads with the SO and puts the DO second", () => {
    expect(
      cardReferencesOf(
        card({ direction: "pickup", soRef: "SO-1362", doRef: "DO-2609-019" }),
      ),
    ).toEqual({
      primary: { ref: "SO-1362", href: null },
      secondary: { ref: "DO-2609-019", href: null },
    });
  });

  it("a pickup with only a DO still names it", () => {
    expect(
      cardReferencesOf(card({ direction: "pickup", soRef: null, doRef: "DO-2609-019" })),
    ).toEqual({ primary: { ref: "DO-2609-019", href: null }, secondary: null });
  });
});

describe("exception lines", () => {
  it("damage is its own warning AND says it is already inside the received count", () => {
    const lines = exceptionLinesOf(
      card({ lines: [line({ receivedQty: 3, damagedQty: 1 })] }),
    );
    const damage = lines.find((l) => l.key === "damaged")!;
    expect(damage.text).toBe(
      "1 received with issue · counted in received, not available stock",
    );
    expect(damage.tone).toBe("danger");
  });

  it("damage NEVER adds to the received progress — the Unit arrived once", () => {
    const progress = lineProgressOf(line({ receivedQty: 3, damagedQty: 1 }), "arrival");
    expect(progress.text).toBe("3/3");
  });

  it("driver confirmation is its own fact, never the loading count", () => {
    const lines = exceptionLinesOf(card({ driverConfirmedQty: 2 }));
    expect(lines.find((l) => l.key === "driver")!.text).toBe("Driver confirmed 2");
  });

  it("an unevidenced driver count shows nothing at all", () => {
    expect(exceptionLinesOf(card({ driverConfirmedQty: null }))).toEqual([]);
  });

  it("an overdue card says the governed word, and leads with it", () => {
    expect(exceptionLinesOf(card({ overdue: true }))[0]).toEqual({
      key: "overdue",
      text: "Overdue",
      tone: "warning",
    });
    expect(exceptionLinesOf(card({ overdue: false }))).toEqual([]);
  });
});

describe("the board", () => {
  it("places a card only on its OWN date", () => {
    const a = card({ id: "a", date: "2026-09-15" });
    const b = card({ id: "b", date: "2026-09-16" });
    expect(cardsOnDate([a, b], "2026-09-15").map((c) => c.id)).toEqual(["a"]);
  });

  it("an undated card stands on NO column and is reported instead of dropped", () => {
    const undated = card({ id: "u", date: null });
    expect(cardsOnDate([undated], "2026-09-15")).toEqual([]);
    expect(undatedCards([undated]).map((c) => c.id)).toEqual(["u"]);
  });

  it("a FAILED feed never reads as an empty day", () => {
    expect(emptyDayWordOf("arrival", false)).toBe("Nothing arriving.");
    expect(emptyDayWordOf("pickup", false)).toBe("Nothing for pickup.");
    const failed = emptyDayWordOf("arrival", true);
    expect(failed).toBe("The schedule could not be read for this date.");
    expect(failed.toLowerCase()).not.toContain("nothing");
  });
});


/**
 * PRODUCTION ACCEPTANCE, 2026-09-14 — the SO printed twice.
 *
 * A pickup card named the Sales Order at the top AND again in the related
 * records at the bottom, because the reference line was plain text and the
 * link had nowhere else to live.
 */
describe("each reference appears exactly once, and keeps its link", () => {
  const pickup = () =>
    card({
      direction: "pickup",
      soRef: "SO-1362",
      doRef: "DO-2609-019",
      relatedRecords: [
        { id: "so", ref: "SO-1362", href: "/operation/orders/so/order-19" },
        { id: "grn", ref: "GRN-2609-004", href: "/operation?tab=receiving" },
      ],
    });

  it("the reference line CARRIES the link the related record used to hold", () => {
    const refs = cardReferencesOf(pickup());
    expect(refs.primary).toEqual({
      ref: "SO-1362",
      href: "/operation/orders/so/order-19",
    });
    expect(refs.secondary?.ref).toBe("DO-2609-019");
  });

  it("a reference already printed above is REMOVED from the bottom row", () => {
    const extra = extraRelatedRecordsOf(pickup());
    expect(extra.map((r) => r.ref)).toEqual(["GRN-2609-004"]);
  });

  it("a record the card does not otherwise name still shows", () => {
    const extra = extraRelatedRecordsOf(
      card({
        relatedRecords: [{ id: "g", ref: "GRN-2609-004", href: "/x" }],
      }),
    );
    expect(extra).toHaveLength(1);
  });
});

describe("work the board cannot place", () => {
  it("says how many, in words that never imply lateness", () => {
    expect(undatedSummaryWordOf(20)).toBe(
      "20 with no date yet — not shown on any column",
    );
    expect(undatedSummaryWordOf(1)).toBe(
      "1 with no date yet — not shown on any column",
    );
    expect(undatedSummaryWordOf(20)).not.toMatch(/overdue|late/i);
  });
});
