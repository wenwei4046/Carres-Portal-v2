import { describe, it, expect } from "vitest";
import {
  deliveryWorkStatusOf,
  deliveryJourneyProgressOf,
  deliveryWorkStatusLabelOf,
  DELIVERY_WORK_STATUS_KINDS,
  DELIVERY_WORK_STATUS_TONE,
  type DeliveryStatusSpell,
  type DeliveryWorkStatusInput,
} from "./delivery-work-status";
import { DELIVERY_ORDER_STATUS_LABEL } from "./delivery-order-status";
import type { DeliveryHandoverKind } from "./delivery-order-status";

/** A test speller — the words are this module's, the spelling is the caller's. */
const SPELL: DeliveryStatusSpell = {
  date: (iso) => `D(${iso})`,
  dateTime: (iso) => `T(${iso})`,
};

const base: DeliveryWorkStatusInput = {
  partnerName: "NETS",
  confirmedDate: null,
  confirmedTime: null,
  hasDeliveryOrder: false,
  handoverEvents: [],
  attempts: [],
};
const at = (...kinds: DeliveryHandoverKind[]) => kinds.map((kind) => ({ kind }));
const attempt = (
  result: "delivered" | "partial" | "failed",
  reasonKey: string | null = null,
  recordedAt = "2026-08-24T10:00:00Z",
) => ({ result, reasonKey, recordedAt });
const status = (over: Partial<DeliveryWorkStatusInput>) =>
  deliveryWorkStatusOf({ ...base, ...over }, SPELL);

describe("journey progress is independent of work urgency", () => {
  it("keeps collection visible when Sales details are missing and the day has passed", () => {
    const input = { ...base, confirmedDate: "2026-09-01", todayIso: "2026-09-14", missingFacts: ["Floor not recorded"], handoverEvents: at("received_by_logistics") };
    expect(deliveryWorkStatusOf(input, SPELL).kind).toBe("details_incomplete");
    expect(deliveryJourneyProgressOf(input, SPELL).label).toBe("Collected by NETS");
  });
  it("does not infer transit from a planned day or a warehouse-only handover", () => {
    const input = { ...base, hasDeliveryOrder: true, handoverEvents: at("handed_over"), expectedArrival: "14:00" };
    expect(deliveryJourneyProgressOf(input, SPELL).kind).toBe("waiting_pickup");
  });
  it("uses transfer progress and the recorded stop, never customer delivery words", () => {
    const input = { ...base, intermediateLeg: true, legStop: "Ipoh WH", handoverEvents: at("received_by_logistics") };
    expect(deliveryJourneyProgressOf(input, SPELL).label).toBe("Collected for transfer");
    expect(deliveryJourneyProgressOf({ ...input, expectedArrival: "14:00" }, SPELL).label).toBe("In transit to Ipoh WH");
    expect(deliveryJourneyProgressOf({ ...input, attempts: [attempt("delivered")] }, SPELL).label).toBe("Arrived at Ipoh WH");
    expect(deliveryJourneyProgressOf({ ...input, attempts: [attempt("failed")] }, SPELL).label).toBe("Transfer failed");
  });
  it("keeps customer delivery proof work and does not repeat the confirmed date", () => {
    expect(deliveryJourneyProgressOf({ ...base, confirmedDate: "2026-09-15", confirmedTime: "Morning" }, SPELL).label).toBe("Confirmed");
    const result = deliveryJourneyProgressOf({ ...base, attempts: [attempt("delivered")], proof: { photoUploaded: false, signedDoUploaded: false, acceptedOn: null } }, SPELL);
    expect(result.label).toBe("Delivered to customer");
    expect(result.second).toBe("Delivery photo not uploaded");
  });
});

describe("deliveryWorkStatusOf — the actor and the fact, never the document (§8.4)", () => {
  it("no partner on the scope → Operation must assign logistics, orange", () => {
    const s = status({ partnerName: null });
    expect(s.label).toBe("Operation must assign logistics");
    expect(s.tone).toBe("orange");
    expect(s.second).toBeNull();
  });

  it("⭐ partner set, nothing agreed → the ACT, and the act alone (owner ruling 2026-09-14)", () => {
    const s = status({});
    /* The party is NOT in the sentence: `Logistics` is its own column, and
       the status says the job. */
    expect(s.label).toBe("Call customer");
    expect(s.label).not.toContain("NETS");
    expect(s.tone).toBe("orange");
    /* And the deadline is NOT a sentence on line two any more — the surface
       draws the day from `contactDueIso` with the kit's glyph, once. */
    expect(s.second).toBeNull();
    expect(s.secondTone).toBeNull();
  });

  it("the ladder no longer takes a contact deadline at all — the row owns that fact", () => {
    /* The deadline used to enter here and leave as `Call by {date}` on line
       two. It is now read once, from the row's own `contactDueIso`, by the
       surface that draws it — so no rung can disagree with the strip, the
       chip or the phone card about which day is owed. */
    const s = status({ todayIso: "2026-09-12" });
    expect(s.label).toBe("Call customer");
    expect(s.second).toBeNull();
    expect(s.secondTone).toBeNull();
    expect(Object.keys(s)).toEqual(["kind", "label", "tone", "second", "secondTone", "reasonLabel"]);
  });

  it("who contacts the customer changes the RUNG, never the words on the row", () => {
    /* Delivery Settings still decides whether the partner or Operation owns
       the call; the operator's job is the same act either way, so the row
       reads the same and the owner stays a settings fact. */
    const s = status({ contactBy: "operation" });
    expect(s.kind).toBe("operation_must_call");
    expect(s.label).toBe("Call customer");
    expect(s.second).toBeNull();
  });

  it("the latest contact waiting for a reply names that wait and the day asked", () => {
    const s = status({
      latestContact: { result: "waiting_customer_reply", recordedOn: "2026-09-08" },
    });
    expect(s.label).toBe("Waiting for customer reply");
    expect(s.second).toBe("Asked D(2026-09-08)");
  });

  it("⭐ a DAY without a WINDOW is still contact work — and it names the HALF that is missing", () => {
    const s = status({ confirmedDate: "2026-09-14" });
    /* Never `Confirmed` — and never `Call customer` either, which would send
       the operator to re-open a day the customer already agreed. */
    expect(s.kind).toBe("confirm_time");
    expect(s.label).toBe("Confirm delivery time");
    expect(s.tone).toBe("orange");
    expect(s.second).toBeNull();
  });

  it("a day AND a window → Confirmed for the day, green, the window beneath", () => {
    const s = status({ confirmedDate: "2026-09-14", confirmedTime: "2 PM to 5 PM" });
    expect(s.label).toBe("Confirmed for D(2026-09-14)");
    expect(s.second).toBe("2 PM to 5 PM");
    expect(s.tone).toBe("green");
  });

  it("⭐ a live document with nothing physical recorded names the PARTNER's pickup, never `Created`", () => {
    const s = status({
      confirmedDate: "2026-09-14",
      confirmedTime: "2 PM to 5 PM",
      hasDeliveryOrder: true,
      handoverDate: "2026-09-13",
    });
    expect(s.label).toBe("Waiting for NETS pickup");
    expect(s.second).toBe("Handover D(2026-09-13)");
    expect(s.tone).toBe("none");
    expect(s.label).not.toBe(DELIVERY_ORDER_STATUS_LABEL.created);
  });

  it("Ready for handover and Handed over WITHOUT the partner's receipt are still the pickup wait", () => {
    expect(
      status({ hasDeliveryOrder: true, handoverEvents: at("ready_for_handover", "handed_over") }).label,
    ).toBe("Waiting for NETS pickup");
  });

  it("the partner's receipt → Goods collected by the partner, with its clock", () => {
    const s = status({
      hasDeliveryOrder: true,
      handoverEvents: [
        { kind: "ready_for_handover" },
        { kind: "received_by_logistics", recordedAt: "2026-09-14T09:30:00Z" },
      ],
    });
    expect(s.label).toBe("Goods collected by NETS");
    expect(s.second).toBe("Collected T(2026-09-14T09:30:00Z)");
  });

  it("collected with an ETA → the partner is delivering, ETA beneath", () => {
    const s = status({
      hasDeliveryOrder: true,
      handoverEvents: at("received_by_logistics"),
      expectedArrival: "14:30",
    });
    expect(s.label).toBe("NETS is delivering to the customer");
    expect(s.second).toBe("ETA 14:30");
  });

  it("⭐ a confirmed day behind us with no result → Overdue, red, the partner must record it", () => {
    const s = status({
      confirmedDate: "2026-09-10",
      confirmedTime: "9 AM to 12 PM",
      hasDeliveryOrder: true,
      handoverEvents: at("received_by_logistics"),
      todayIso: "2026-09-12",
    });
    expect(s.label).toBe("Overdue");
    expect(s.tone).toBe("red");
    expect(s.second).toBe("NETS must record the result");
  });

  it("without today handed in, no row is ever Overdue — the arithmetic keeps no clock", () => {
    expect(status({ confirmedDate: "2026-09-10", confirmedTime: "9 AM to 12 PM" }).label).toBe(
      "Confirmed for D(2026-09-10)",
    );
  });

  it("a recorded delivery outranks every derivation, and names its proof state", () => {
    const delivered = (proof: DeliveryWorkStatusInput["proof"]) =>
      status({
        hasDeliveryOrder: true,
        handoverEvents: at("received_by_logistics"),
        attempts: [attempt("delivered")],
        confirmedDate: "2026-08-20",
        confirmedTime: "9 AM to 12 PM",
        todayIso: "2026-09-12",
        proof,
      });
    const accepted = delivered({ photoUploaded: true, signedDoUploaded: true, acceptedOn: "2026-08-25" });
    expect(accepted.label).toBe("Delivered");
    expect(accepted.tone).toBe("green");
    expect(accepted.second).toBe("Proof accepted D(2026-08-25)");
    const noPhoto = delivered({ photoUploaded: false, signedDoUploaded: true, acceptedOn: null });
    expect(noPhoto.second).toBe("Delivery photo not uploaded");
    expect(noPhoto.secondTone).toBe("orange");
    const noSigned = delivered({ photoUploaded: true, signedDoUploaded: false, acceptedOn: null });
    expect(noSigned.second).toBe("Upload signed Delivery Order");
    expect(delivered(null).second).toBeNull();
  });

  it("`Proof Accepted` is the ONE fact that turns Delivered green — every other delivered row is orange (§6.1)", () => {
    const delivered = (proof: DeliveryWorkStatusInput["proof"]) =>
      status({
        hasDeliveryOrder: true,
        handoverEvents: at("received_by_logistics"),
        attempts: [attempt("delivered")],
        confirmedDate: "2026-08-20",
        todayIso: "2026-09-12",
        proof,
      });
    expect(delivered(null).tone).toBe("orange");
    const pending = delivered({
      photoUploaded: true,
      signedDoUploaded: true,
      acceptedOn: null,
      review: { state: "pending", reason: null },
    });
    expect(pending.tone).toBe("orange");
    expect(pending.second).toBe("Check delivery proof");
    expect(pending.secondTone).toBe("orange");
    const rejected = delivered({
      photoUploaded: true,
      signedDoUploaded: true,
      acceptedOn: null,
      review: { state: "rejected", reason: "Photo shows the lobby" },
    });
    expect(rejected.tone).toBe("orange");
    expect(rejected.second).toBe("Proof Rejected · Photo shows the lobby");
    const more = delivered({
      photoUploaded: true,
      signedDoUploaded: true,
      acceptedOn: null,
      review: { state: "more_required", reason: "Need the signed paper" },
    });
    expect(more.second).toBe("More Proof Required · Need the signed paper");
    /* A newer upload after a rejection is pending again — and a missing file
       still names the file before it names the review. */
    const noPhotoRejected = delivered({
      photoUploaded: false,
      signedDoUploaded: true,
      acceptedOn: null,
      review: { state: "pending", reason: null },
    });
    expect(noPhotoRejected.second).toBe("Delivery photo not uploaded");
  });

  it("a failure is ONE Failed Delivery carrying ONE reason, red", () => {
    const s = status({ hasDeliveryOrder: true, attempts: [attempt("failed", "customer_unreachable")] });
    expect(s.label).toBe("Failed Delivery");
    expect(s.tone).toBe("red");
    expect(s.reasonLabel).toBeTruthy();
    expect(s.second).toBe(s.reasonLabel);
  });

  it("a partial delivery is the same one failure word, never a third", () => {
    expect(status({ hasDeliveryOrder: true, attempts: [attempt("partial")] }).label).toBe(
      "Failed Delivery",
    );
  });

  it("the LATEST attempt decides — a redelivery after a failure reads Delivered", () => {
    expect(
      status({
        hasDeliveryOrder: true,
        attempts: [
          attempt("failed", "customer_unreachable", "2026-08-20T09:00:00Z"),
          attempt("delivered", null, "2026-08-24T09:00:00Z"),
        ],
      }).label,
    ).toBe("Delivered");
  });

  it("a required Sales fact missing → Order details incomplete, naming the fact", () => {
    const s = status({ missingFacts: ["Building type not recorded"] });
    expect(s.label).toBe("Order details incomplete");
    expect(s.second).toBe("Building type not recorded");
    expect(s.tone).toBe("orange");
  });

  it("the role word stands in where the data names no partner — never an empty gap", () => {
    expect(status({ partnerName: "  ", hasDeliveryOrder: true }).label).toBe(
      "Waiting for logistics pickup",
    );
    expect(deliveryWorkStatusLabelOf("delivering", null)).toBe("Logistics is delivering to the customer");
    /* The contact rungs name no party at all now, so there is no gap for a
       role word to fill: the act is the same whoever owns it. */
    expect(deliveryWorkStatusLabelOf("partner_must_contact", "")).toBe("Call customer");
    expect(deliveryWorkStatusLabelOf("operation_must_call", null)).toBe("Call customer");
    expect(deliveryWorkStatusLabelOf("confirm_time", "NETS")).toBe("Confirm delivery time");
  });

  it("⭐ the retired words never return, and no word names a mood", () => {
    const every = DELIVERY_WORK_STATUS_KINDS.map((k) => deliveryWorkStatusLabelOf(k, "NETS", "Thu, 22 Oct"));
    for (const retired of [
      "Waiting for customer date",
      "Delivery confirmed",
      "Waiting for warehouse",
      "Ready for handover",
      "Out for delivery",
      DELIVERY_ORDER_STATUS_LABEL.created,
    ]) {
      expect(every).not.toContain(retired);
    }
    for (const label of every) {
      expect(label).not.toMatch(/pending|awaiting|in progress|scheduled|booked|unscheduled/i);
      expect(label).not.toMatch(/^Waiting$/);
    }
    /* And no label joins an act to a party or an explanation with a dash
       (owner ruling 2026-09-14). */
    for (const label of every) expect(label).not.toMatch(/[—–-]/);
    expect(every).toHaveLength(14);
  });

  it("every kind carries a colour word, and only the two exceptions are red", () => {
    const red = DELIVERY_WORK_STATUS_KINDS.filter((k) => DELIVERY_WORK_STATUS_TONE[k] === "red");
    expect(red).toEqual(["overdue", "failed"]);
  });

  /* 【DELIVERY】 CARD 20 — `Delivered` is the CUSTOMER's word. An intermediate
     Journey leg's `delivered` result is the goods reaching the named partner
     warehouse: `Arrived` over the stop, green, and no proof owed on it. */
  describe("an intermediate Journey leg ARRIVES; only the customer leg is Delivered", () => {
    const delivered = { result: "delivered" as const, reasonKey: null, recordedAt: "2026-09-13T12:23:00Z" };
    const base = {
      partnerName: "NETS",
      confirmedDate: "2026-09-15",
      confirmedTime: "10 AM to 1 PM",
      hasDeliveryOrder: true,
      handoverEvents: [{ kind: "received_by_logistics" as const }],
      attempts: [delivered],
      proof: { photoUploaded: false, signedDoUploaded: false, acceptedOn: null, review: null },
    };

    it("leg 1 of 2 with a delivered result reads Arrived over the stop, green, no proof line", () => {
      const s = deliveryWorkStatusOf(
        { ...base, intermediateLeg: true, legStop: "JB transit warehouse" },
        SPELL,
      );
      expect(s.kind).toBe("arrived");
      expect(s.label).toBe("Arrived");
      expect(s.tone).toBe("green");
      expect(s.second).toBe("JB transit warehouse");
      expect(s.secondTone).toBeNull();
    });

    it("the same facts on the customer leg are Delivered, and the proof gap still prints", () => {
      const s = deliveryWorkStatusOf({ ...base, intermediateLeg: false }, SPELL);
      expect(s.kind).toBe("delivered");
      expect(s.label).toBe("Delivered");
      expect(s.second).toBe("Delivery photo not uploaded");
    });

    it("an intermediate leg with no result yet keeps the transit rungs", () => {
      const s = deliveryWorkStatusOf({ ...base, attempts: [], intermediateLeg: true, legStop: "JB transit warehouse" }, SPELL);
      expect(s.kind).toBe("collected");
    });

    it("`Arrived` sits in the dropdown order before `Delivered`, and is green", () => {
      const i = DELIVERY_WORK_STATUS_KINDS.indexOf("arrived");
      expect(i).toBeGreaterThan(-1);
      expect(DELIVERY_WORK_STATUS_KINDS[i + 1]).toBe("delivered");
      expect(DELIVERY_WORK_STATUS_TONE.arrived).toBe("green");
      expect(deliveryWorkStatusLabelOf("arrived", "NETS")).toBe("Arrived");
    });
  });
});
