import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OrderJourneyHeader, {
  deriveOrderJourney,
  JOURNEY_STAGES,
  type OrderJourneyInput,
  type OrderJourneySignals,
} from "./OrderJourneyHeader";

/**
 * J3 — the journey header.
 *
 * The card's DONE WHEN is "the strip agrees with the ladder/queues for the same
 * order, always", so the centrepiece here is the LADDER MATRIX: every rung the
 * Orders list can emit is run through the derive and asserted to land on the
 * stage that rung belongs to. If someone adds a ladder rung without teaching
 * this module its stage, the fall-through test catches it.
 */

const SIG: OrderJourneySignals = {
  next: { label: "Confirm ready date", tone: "warning" },
  hasPo: true,
  goodsReady: false,
  bookingConfirmed: false,
  delivered: false,
  photoOnFile: null,
  holdAmount: null,
  // C2 · the strip renders only the HEAD of this list; the drawer's
  // OrderActionList renders all of it. Nothing in this module reads it.
  openActions: [],
};

function input(over: Partial<OrderJourneyInput> = {}): OrderJourneyInput {
  return {
    signals: SIG,
    docsMissing: 0,
    docsMissingLabels: [],
    ledgerOutstanding: 0,
    ledgerOutstandingLabel: "0",
    holdAmountLabel: "",
    ...over,
  };
}
function sig(over: Partial<OrderJourneySignals>): OrderJourneySignals {
  return { ...SIG, ...over };
}
const stateOf = (j: ReturnType<typeof deriveOrderJourney>, stage: string) =>
  j.stages.find((s) => s.stage === stage)?.state;

describe("deriveOrderJourney — the stage strip agrees with the ladder", () => {
  // (verb, the signals an order carrying that verb really has, expected ●)
  const MATRIX: [string, Partial<OrderJourneySignals>, string][] = [
    ["Send PO", { hasPo: false, goodsReady: false }, "Purchase"],
    ["Confirm ready date", { hasPo: true, goodsReady: false }, "Goods"],
    // C8 — the delay radar's one rung became TWO: an internal DECISION first,
    // and only its NO answer opens the call to logistics. Both sit on Goods.
    ["Delay planning", { hasPo: true, goodsReady: false }, "Goods"],
    [
      "Arrange new delivery date",
      { hasPo: true, goodsReady: false },
      "Goods",
    ],
    ["Assign logistics", { hasPo: true, goodsReady: true }, "Booking"],
    ["Confirm delivery date", { hasPo: true, goodsReady: true }, "Booking"],
    [
      "Deliver today",
      { hasPo: true, goodsReady: true, bookingConfirmed: true },
      "Delivery",
    ],
    // C3 — the FACT that replaced `Confirm delivery`: the ● still lands on
    // Delivery (booking finished, delivery not happened), but nobody acts.
    [
      "Delivering",
      { hasPo: true, goodsReady: true, bookingConfirmed: true },
      "Delivery",
    ],
    [
      "Upload delivery photo",
      {
        hasPo: true,
        goodsReady: true,
        bookingConfirmed: true,
        delivered: true,
        photoOnFile: false,
      },
      "Done",
    ],
  ];

  it.each(MATRIX)(
    "%s puts the ● on %s",
    (label, over, expected) => {
      const j = deriveOrderJourney(
        input({ signals: sig({ ...over, next: { label, tone: "warning" } }) }),
      );
      expect(stateOf(j, expected)).toBe("current");
      expect(j.stages.filter((s) => s.state === "current")).toHaveLength(1);
    },
  );

  it("marks every stage BEFORE the current one done, and none after", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: true,
          next: { label: "Confirm delivery date", tone: "info" },
        }),
      }),
    );
    expect(stateOf(j, "Purchase")).toBe("done");
    expect(stateOf(j, "Goods")).toBe("done");
    expect(stateOf(j, "Booking")).toBe("current");
    expect(stateOf(j, "Delivery")).toBe("todo");
    expect(stateOf(j, "Done")).toBe("todo");
  });

  it("shows an OPEN earlier stage without a tick when the ladder has moved past it", () => {
    // The past-deadline escalation (Loo's freeze gate): a late order with a
    // partner chases the logistic even though a line is still not ready. The
    // ● follows the ladder; Goods must NOT claim a tick it has not earned.
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: false,
          next: { label: "Confirm delivery date", tone: "danger" },
        }),
      }),
    );
    expect(stateOf(j, "Goods")).toBe("todo");
    expect(stateOf(j, "Booking")).toBe("current");
  });

  it("counts Purchase settled when the goods are already on the shelf (no PO needed)", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: false,
          goodsReady: true,
          next: { label: "Assign logistics", tone: "info" },
        }),
      }),
    );
    expect(stateOf(j, "Purchase")).toBe("done");
  });

  it("closes every stage on Done and leaves no current node", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: true,
          bookingConfirmed: true,
          delivered: true,
          photoOnFile: true,
          next: { label: "Done", tone: "neutral" },
        }),
      }),
    );
    expect(j.stages.every((s) => s.state === "done")).toBe(true);
    expect(j.owner).toBe("Nobody — this order is closed");
  });

  it("does not call a delivered order Done while its photo ledger is empty", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: true,
          bookingConfirmed: true,
          delivered: true,
          photoOnFile: false,
          next: { label: "Upload delivery photo", tone: "warning" },
        }),
      }),
    );
    expect(stateOf(j, "Delivery")).toBe("done");
    expect(stateOf(j, "Done")).toBe("current");
  });

  it("treats an UNKNOWN photo answer as no gap — silence beats a false accusation", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: true,
          bookingConfirmed: true,
          delivered: true,
          photoOnFile: null,
          next: { label: "Done", tone: "neutral" },
        }),
      }),
    );
    expect(stateOf(j, "Done")).toBe("done");
  });

  it("falls back to the first unfinished stage for a verb it does not know", () => {
    // A Worker newer or older than this build emits a rung this map has never
    // seen: the strip must still point somewhere real.
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: false,
          next: { label: "Some future rung", tone: "warning" },
        }),
      }),
    );
    expect(stateOf(j, "Goods")).toBe("current");
    expect(j.owner).toBe("Operations — check this order");
  });

  it("passes the ladder's verb through untouched — never a synonym", () => {
    for (const [label] of MATRIX) {
      const j = deriveOrderJourney(
        input({ signals: sig({ next: { label, tone: "info" } }) }),
      );
      expect(j.nextLabel).toBe(label);
    }
  });
});

describe("deriveOrderJourney — owner", () => {
  it("names the party for every rung the ladder can emit", () => {
    const verbs = [
      "Send PO",
      "Confirm ready date",
      "Delay planning",
      "Arrange new delivery date",
      "Assign logistics",
      "Confirm delivery date",
      "Deliver today",
      "Delivering",
      "Upload delivery photo",
      // C2 made `Collect` a headline in its own right; C3's hold makes it one
      // more often, so it needs an owner line like every other word.
      "Collect",
      "Done",
    ];
    for (const label of verbs) {
      const j = deriveOrderJourney(
        input({ signals: sig({ next: { label, tone: "info" } }) }),
      );
      expect(j.owner).not.toBe("Operations — check this order");
      // COPY-STANDARD: the party, then why — and short enough to read at once.
      expect(j.owner).toContain(" — ");
      expect(j.owner.split(/\s+/).length).toBeLessThanOrEqual(10);
    }
  });

  it("hands a money-held order to the customer, not to operations", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Collect", tone: "warning", locked: true },
        }),
        holdAmountLabel: "1,200",
      }),
    );
    expect(j.owner).toBe("Customer — balance not paid");
    expect(j.nextLocked).toBe(true);
  });
});

describe("deriveOrderJourney — health", () => {
  it("says nothing is wrong out loud rather than showing an empty box", () => {
    const j = deriveOrderJourney(input());
    expect(j.health).toEqual([]);
    render(<OrderJourneyHeader journey={j} />);
    expect(screen.getByTestId("journey-health-clear")).toHaveTextContent(
      "Nothing blocking this order.",
    );
  });

  it("states the ladder's hold with its own amount", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Collect", tone: "warning", locked: true },
          holdAmount: 1200,
        }),
        holdAmountLabel: "1,200",
      }),
    );
    expect(j.health[0]).toMatchObject({ key: "hold", tone: "danger" });
    expect(j.health[0].text).toBe("Delivery on hold — RM 1,200 to collect");
  });

  it("still states the hold when the amount is not on file", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Collect", tone: "warning", locked: true },
        }),
      }),
    );
    expect(j.health[0].text).toBe("Delivery on hold — balance not collected");
  });

  it("raises the delay radar from the ladder's own verb, not a second ETA read", () => {
    // C8 — BOTH delay stages raise it. The stock fact does not stop being true
    // when the decision is taken; what changes is the action beside it.
    for (const label of ["Delay planning", "Arrange new delivery date"]) {
      const j = deriveOrderJourney(
        input({ signals: sig({ next: { label, tone: "danger" } }) }),
      );
      expect(j.health.map((h) => h.key)).toContain("stock_delay");
    }
  });

  it("C8 · no delay rung's owner line opens a call to the CUSTOMER (Law 4 rung 2)", () => {
    // `Carres does not phone a customer about a delay — logistics carries that
    // conversation.` The owner line is exactly where that rule was being
    // broken: it read "Operations — agree a new date with the customer".
    for (const label of ["Delay planning", "Arrange new delivery date"]) {
      const j = deriveOrderJourney(
        input({ signals: sig({ next: { label, tone: "danger" } }) }),
      );
      expect(j.owner).not.toMatch(/with the customer/i);
      expect(j.owner).not.toMatch(/\bagree\b/i);
    }
  });

  it("reports uncollected ledger money as a fact, never as a hold", () => {
    const j = deriveOrderJourney(
      input({ ledgerOutstanding: 2800, ledgerOutstandingLabel: "2,800" }),
    );
    expect(j.health).toHaveLength(1);
    expect(j.health[0]).toMatchObject({ key: "uncollected", tone: "warning" });
    expect(j.health[0].text).toBe("RM 2,800 not collected yet");
    // The word "hold" belongs to the ladder, and the ladder is not holding.
    expect(j.health[0].text).not.toMatch(/hold/i);
  });

  it("never prints two money lines — the hold replaces the ledger fact", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Collect", tone: "warning", locked: true },
        }),
        holdAmountLabel: "500",
        ledgerOutstanding: 2800,
        ledgerOutstandingLabel: "2,800",
      }),
    );
    expect(j.health.filter((h) => h.key === "uncollected")).toHaveLength(0);
    expect(j.health.filter((h) => h.key === "hold")).toHaveLength(1);
  });

  it("names the missing documents J1 found", () => {
    const one = deriveOrderJourney(
      input({ docsMissing: 1, docsMissingLabels: ["Invoice"] }),
    );
    expect(one.health.at(-1)?.text).toBe("Invoice missing");
    const many = deriveOrderJourney(
      input({
        docsMissing: 2,
        docsMissingLabels: ["Invoice", "Delivery photo"],
      }),
    );
    expect(many.health.at(-1)?.text).toBe(
      "2 documents missing — Invoice, Delivery photo",
    );
  });

  it("caps the health block at three lines", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Agree new delivery date", tone: "danger", locked: true },
        }),
        holdAmountLabel: "500",
        ledgerOutstanding: 2800,
        ledgerOutstandingLabel: "2,800",
        docsMissing: 2,
        docsMissingLabels: ["Invoice", "Delivery photo"],
      }),
    );
    expect(j.health.length).toBeLessThanOrEqual(3);
  });

  it("stays silent on money when nothing is owed", () => {
    const j = deriveOrderJourney(input({ ledgerOutstanding: 0 }));
    expect(j.health.map((h) => h.key)).not.toContain("uncollected");
  });
});

describe("OrderJourneyHeader — the strip", () => {
  it("renders all five stages, the ladder's verb and the owner", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          hasPo: true,
          goodsReady: true,
          next: { label: "Confirm delivery date", tone: "info" },
        }),
      }),
    );
    render(<OrderJourneyHeader journey={j} />);
    const strip = screen.getByTestId("journey-header");
    const cells = within(strip).getAllByTestId("journey-stage");
    expect(cells.map((c) => c.getAttribute("data-stage"))).toEqual([
      ...JOURNEY_STAGES,
    ]);
    expect(screen.getByTestId("journey-next")).toHaveTextContent("Confirm delivery date");
    expect(screen.getByTestId("journey-owner")).toHaveTextContent(
      "Logistics — customer has not confirmed a date",
    );
  });

  it("shows the lock on a held order", () => {
    const j = deriveOrderJourney(
      input({
        signals: sig({
          next: { label: "Collect", tone: "warning", locked: true },
        }),
        holdAmountLabel: "1,200",
      }),
    );
    render(<OrderJourneyHeader journey={j} />);
    expect(screen.getByTestId("journey-next")).toHaveTextContent("🔒");
    expect(screen.getByTestId("journey-health")).toHaveAttribute(
      "data-tone",
      "danger",
    );
  });

  it("uses no banned words (COPY-STANDARD)", () => {
    // Every rung's rendered strip, swept for the vocabulary Jess retired.
    const banned =
      /\b(POD|Proof of Delivery|Unscheduled|Not booked|carrier|chase|logistic(?!s))\b/i;
    for (const label of [
      "Send PO",
      "Confirm ready date",
      "Delay planning",
      "Arrange new delivery date",
      "Assign logistics",
      "Confirm delivery date",
      "Deliver today",
      "Delivering",
      "Upload delivery photo",
      "Collect",
      "Done",
    ]) {
      const j = deriveOrderJourney(
        input({
          signals: sig({ next: { label, tone: "info" } }),
          docsMissing: 1,
          docsMissingLabels: ["Invoice"],
          ledgerOutstanding: 100,
          ledgerOutstandingLabel: "100",
        }),
      );
      const { container, unmount } = render(<OrderJourneyHeader journey={j} />);
      expect(container.textContent ?? "").not.toMatch(banned);
      unmount();
    }
  });
});
