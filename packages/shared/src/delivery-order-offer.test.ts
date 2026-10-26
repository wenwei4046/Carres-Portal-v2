import { describe, expect, it } from "vitest";
import { deliveryOrderOffer, deliveryOrderScopeOf } from "./delivery-order-offer";

/**
 * New Delivery Order (Weisiang's decision, Mr Lim, WhatsApp 2026-10-22):
 * office staff open a DO from a Sales Order's lines. The one thing it may
 * never do is ship twice: goods already on a live DO are not offered again.
 */
const BED = { sku: "MS12 Firmcare 10inch Queen", qty: 1 };
const FRAME = { sku: "BF07 Hilton Divan King", qty: 1 };
const SOFA = { sku: "SF03 Muro 2 Seater", qty: 1 };
const PILLOW = { sku: "Memory Pillow", qty: 2 };
const LINES = [BED, FRAME, SOFA, PILLOW];

describe("deliveryOrderOffer — what an office DO may still carry", () => {
  it("an order with no live DO offers every group and the whole order", () => {
    expect(deliveryOrderOffer(LINES, [])).toEqual({ groups: ["bed", "sofa"], whole: true, journey: false });
  });

  it("a voided DO gives its goods back", () => {
    const docs = [{ leg: 0, trip_groups: null, voided_at: "2026-10-01T00:00:00Z" }];
    expect(deliveryOrderOffer(LINES, docs).whole).toBe(true);
  });

  it("a live whole-order DO leaves nothing to offer", () => {
    expect(deliveryOrderOffer(LINES, [{ leg: 0, trip_groups: null, voided_at: null }])).toEqual({
      groups: [],
      whole: false,
      journey: false,
    });
  });

  it("a live bed trip leaves only the sofa", () => {
    expect(deliveryOrderOffer(LINES, [{ leg: 0, trip_groups: ["bed"], voided_at: null }])).toEqual({
      groups: ["sofa"],
      whole: false,
      journey: false,
    });
  });

  it("a Journey order is not offered: its legs issue their own documents", () => {
    const offer = deliveryOrderOffer(LINES, [{ leg: 1, trip_groups: null, voided_at: null }]);
    expect(offer).toEqual({ groups: [], whole: false, journey: true });
  });
});

describe("deliveryOrderScopeOf — the picked groups become the DO's scope", () => {
  it("every group picked on an untouched order is the whole order, pillow included", () => {
    expect(deliveryOrderScopeOf(deliveryOrderOffer(LINES, []), ["sofa", "bed"])).toEqual({ ok: true, scope: null });
  });

  it("an accessories-only order is the whole order", () => {
    expect(deliveryOrderScopeOf(deliveryOrderOffer([PILLOW], []), [])).toEqual({ ok: true, scope: null });
  });

  it("one group picked is that group's trip", () => {
    expect(deliveryOrderScopeOf(deliveryOrderOffer(LINES, []), ["bed"])).toEqual({ ok: true, scope: ["bed"] });
  });

  it("a group already on a live DO is refused, never shipped twice", () => {
    const offer = deliveryOrderOffer(LINES, [{ leg: 0, trip_groups: ["bed"], voided_at: null }]);
    expect(deliveryOrderScopeOf(offer, ["bed"])).toEqual({ ok: false, reason: "already_on_a_delivery_order" });
    expect(deliveryOrderScopeOf(offer, ["sofa"])).toEqual({ ok: true, scope: ["sofa"] });
  });

  it("nothing picked is refused", () => {
    expect(deliveryOrderScopeOf(deliveryOrderOffer(LINES, []), [])).toEqual({ ok: false, reason: "nothing_picked" });
  });

  it("nothing left is refused", () => {
    const offer = deliveryOrderOffer(LINES, [{ leg: 0, trip_groups: null, voided_at: null }]);
    expect(deliveryOrderScopeOf(offer, [])).toEqual({ ok: false, reason: "already_on_a_delivery_order" });
  });
});
