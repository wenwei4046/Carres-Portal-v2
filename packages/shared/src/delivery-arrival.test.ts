/**
 * WHEN THE GOODS REACH US — the arrival reading, held as tests.
 * Owner ruling 2026-09-10 · `docs/delivery/MASTER.md` §8.
 *
 * Five properties this module exists to guarantee:
 *
 *  1. It computes NO arrival date. Every date it returns was recorded by
 *     Purchasing; the precedence is 0432's own projector's.
 *  2. It invents nothing. No date, no confirmation, no "probably" — an open
 *     purchase order with no date produces the governed absence.
 *  3. A REVISION keeps the original beside the new date.
 *  4. `passed` outranks every other answer: a date gone by without goods is
 *     the fact that still needs a phone call.
 *  5. A shortage is the EXACT number of missing pieces, matched by the same
 *     rule the unit allocator uses.
 */
import { describe, it, expect } from "vitest";
import {
  ARRIVAL_COPY,
  arrivalNoteOf,
  deliveryArrivalStateOf,
  deliveryStockReadinessOf,
  effectiveArrivalOf,
  isArrivalException,
  lineShortagesOf,
  type PoArrival,
} from "./delivery-arrival";

const TODAY = "2026-09-04";

function po(over: Partial<PoArrival> = {}): PoArrival {
  return {
    poId: "PO-1",
    status: "open",
    owedSkus: ["MS-K"],
    plannedIso: null,
    originalIso: null,
    reply: null,
    ...over,
  };
}

const SHORT = { ready: false, shortLines: [], shortQty: 1 };

describe("the shortage is the EXACT number of missing pieces", () => {
  it("committed minus allocated, per line", () => {
    expect(
      lineShortagesOf([{ sku: "MS-K", qty: 3 }], [{ sku: "MS-K", status: "reserved", qty: 1 }]),
    ).toEqual([{ sku: "MS-K", committedQty: 3, allocatedQty: 1, shortQty: 2 }]);
  });

  it("a bulk register row counts its own quantity (0218)", () => {
    expect(
      lineShortagesOf([{ sku: "MS-K", qty: 3 }], [{ sku: "MS-K", status: "reserved", qty: 3 }])[0]!
        .shortQty,
    ).toBe(0);
  });

  it("two lines of one SKU share the pool — the second is short, not both", () => {
    const out = lineShortagesOf(
      [
        { sku: "MS-K", qty: 1 },
        { sku: "MS-K", qty: 1 },
      ],
      [{ sku: "MS-K", status: "reserved", qty: 1 }],
    );
    expect(out.map((l) => l.shortQty)).toEqual([0, 1]);
  });

  it("matches under the SAME key the unit allocator uses — not raw text", () => {
    expect(
      lineShortagesOf([{ sku: "ms-k" }, { sku: "MS-K" }].map((l) => ({ ...l, qty: 1 })), [
        { sku: "MS-K", status: "sold", qty: 2 },
      ]).every((l) => l.shortQty === 0),
    ).toBe(true);
  });

  it("readiness is the WHOLE commitment, accessories included", () => {
    const readiness = deliveryStockReadinessOf(
      [
        { sku: "MS-K", qty: 1 },
        { sku: "Pillow", qty: 2 },
      ],
      [{ sku: "MS-K", status: "reserved", qty: 1 }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.shortQty).toBe(2);
    expect(readiness.shortLines.map((l) => l.sku)).toEqual(["Pillow"]);
  });

  it("an order with no committed line is not `ready` — nothing was proved", () => {
    expect(deliveryStockReadinessOf([], []).ready).toBe(false);
  });
});

describe("the effective date is 0432's own precedence", () => {
  it("reply → original → our prediction", () => {
    expect(
      effectiveArrivalOf(
        po({
          plannedIso: "2026-09-10",
          originalIso: "2026-09-12",
          reply: {
            answer: "delayed",
            aboutIso: "2026-09-12",
            previousIso: null,
            newIso: "2026-09-20",
            recordedAt: "2026-09-01T00:00:00Z",
          },
        }),
      ),
    ).toBe("2026-09-20");
    expect(effectiveArrivalOf(po({ plannedIso: "2026-09-10", originalIso: "2026-09-12" }))).toBe(
      "2026-09-12",
    );
    expect(effectiveArrivalOf(po({ plannedIso: "2026-09-10" }))).toBe("2026-09-10");
    expect(effectiveArrivalOf(po())).toBeNull();
  });

  it("a legacy `shipping` reply means the date it was asked ABOUT", () => {
    expect(
      effectiveArrivalOf(
        po({
          originalIso: "2026-09-12",
          reply: {
            answer: "shipping",
            aboutIso: "2026-09-19",
            previousIso: null,
            newIso: null,
            recordedAt: "2026-09-01T00:00:00Z",
          },
        }),
      ),
    ).toBe("2026-09-19");
  });

  it("the LAST piece decides — the delivery waits for the latest of them", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [
        po({ poId: "PO-1", originalIso: "2026-09-10" }),
        po({ poId: "PO-2", originalIso: "2026-09-25", owedSkus: ["BF-K"] }),
      ],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state).toMatchObject({ kind: "planned", dateIso: "2026-09-25", poId: "PO-2" });
  });

  it("a RECEIVED or fully-delivered purchase order is not an arrival any more", () => {
    expect(
      deliveryArrivalStateOf({
        arrivals: [
          po({ status: "received", originalIso: "2026-09-10" }),
          po({ poId: "PO-2", owedSkus: [], originalIso: "2026-09-30" }),
        ],
        readiness: SHORT,
        todayIso: TODAY,
      }),
    ).toEqual({ kind: "no_purchase_order" });
  });
});

describe("the state, and the words under it", () => {
  it("goods in the register answer `on_hand`, whatever a purchase order says", () => {
    expect(
      deliveryArrivalStateOf({
        arrivals: [po({ originalIso: "2026-09-30" })],
        readiness: { ready: true, shortLines: [], shortQty: 0 },
        todayIso: TODAY,
      }),
    ).toEqual({ kind: "on_hand" });
  });

  it("no reply is `planned`, and its note says the date is NOT confirmed", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [po({ originalIso: "2026-09-20" })],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state.kind).toBe("planned");
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.notConfirmed);
  });

  it("the supplier confirming the date it was given is `Same as PO`", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [
        po({
          originalIso: "2026-09-20",
          reply: {
            answer: "confirmed",
            aboutIso: "2026-09-20",
            previousIso: null,
            newIso: "2026-09-20",
            recordedAt: "2026-09-01T00:00:00Z",
          },
        }),
      ],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state.kind).toBe("confirmed");
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.sameAsPo);
    expect(isArrivalException(state)).toBe(false);
  });

  it("a REVISION keeps the original beside the new date, both directions", () => {
    const moved = (newIso: string) =>
      deliveryArrivalStateOf({
        arrivals: [
          po({
            originalIso: "2026-09-20",
            reply: {
              answer: newIso > "2026-09-20" ? "delayed" : "earlier",
              aboutIso: "2026-09-20",
              previousIso: null,
              newIso,
              recordedAt: "2026-09-01T00:00:00Z",
            },
          }),
        ],
        readiness: SHORT,
        todayIso: TODAY,
      });
    expect(moved("2026-09-28")).toMatchObject({
      kind: "moved",
      dateIso: "2026-09-28",
      originalIso: "2026-09-20",
      later: true,
    });
    expect(arrivalNoteOf(moved("2026-09-28"))).toBe(ARRIVAL_COPY.delayed);
    expect(moved("2026-09-15")).toMatchObject({ later: false });
    expect(arrivalNoteOf(moved("2026-09-15"))).toBe(ARRIVAL_COPY.earlier);
    /* A supplier who answers EARLY is doing the right thing — not an
       exception, and never painted as one. */
    expect(isArrivalException(moved("2026-09-15"))).toBe(false);
    expect(isArrivalException(moved("2026-09-28"))).toBe(false);
  });

  it("a reply on a purchase order with no recorded original is `Date reported`", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [
        po({
          reply: {
            answer: "reported",
            aboutIso: null,
            previousIso: null,
            newIso: "2026-09-22",
            recordedAt: "2026-09-01T00:00:00Z",
          },
        }),
      ],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state).toMatchObject({ kind: "reported", dateIso: "2026-09-22" });
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.reported);
  });

  it("NO date at all states the gap and invents none", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [po()],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state).toEqual({ kind: "no_date", poId: "PO-1" });
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.noDate);
    expect(isArrivalException(state)).toBe(true);
  });

  it("a date behind us with no goods outranks every other answer", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [
        po({
          originalIso: "2026-08-20",
          reply: {
            answer: "confirmed",
            aboutIso: "2026-08-20",
            previousIso: null,
            newIso: "2026-08-20",
            recordedAt: "2026-08-01T00:00:00Z",
          },
        }),
      ],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state).toMatchObject({ kind: "passed", dateIso: "2026-08-20" });
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.passed);
    expect(isArrivalException(state)).toBe(true);
  });

  it("goods short with nothing bought for them says so", () => {
    const state = deliveryArrivalStateOf({
      arrivals: [],
      readiness: SHORT,
      todayIso: TODAY,
    });
    expect(state).toEqual({ kind: "no_purchase_order" });
    expect(arrivalNoteOf(state)).toBe(ARRIVAL_COPY.noPurchaseOrder);
  });

  it("every state has a note, and no note is a banned mood word", () => {
    const states = [
      { kind: "on_hand" },
      { kind: "no_purchase_order" },
      { kind: "no_date", poId: "PO-1" },
      { kind: "planned", dateIso: TODAY, poId: "PO-1" },
      { kind: "confirmed", dateIso: TODAY, poId: "PO-1" },
      { kind: "moved", dateIso: TODAY, originalIso: TODAY, later: true, poId: "PO-1" },
      { kind: "reported", dateIso: TODAY, poId: "PO-1" },
      { kind: "passed", dateIso: TODAY, originalIso: null, poId: "PO-1" },
    ] as const;
    for (const state of states) {
      const note = arrivalNoteOf(state);
      expect(note.length).toBeGreaterThan(0);
      for (const banned of ["Pending", "Unscheduled", "TBA", "ETA", "N/A"]) {
        expect(note).not.toContain(banned);
      }
    }
  });
});
