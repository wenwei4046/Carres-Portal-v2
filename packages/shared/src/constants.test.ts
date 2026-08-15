import { describe, expect, it } from "vitest";
import { ATTACHED_ONLY_CATEGORIES, cartHasGoods, maxLeadDaysFor } from "./constants";

/**
 * ⛔ A SALES ORDER MUST CONTAIN GOODS — owner ruling 2026-08-15 (Jess).
 *
 * `docs/guarantee/MASTER.md` already gates one category this way; the ruling
 * generalises it. The half that MUST be pinned is the direction of the
 * default: recognition is POSITIVE, so an unresolved category counts as
 * GOODS. Flip that and every not-yet-catalogued SKU silently becomes
 * unsellable — the exact failure `line-category.ts` D9 exists to stop.
 */
describe("cartHasGoods", () => {
  it("passes a cart carrying a product", () => {
    expect(cartHasGoods(["mattress", "service"])).toBe(true);
  });

  it("refuses a cart of nothing but service", () => {
    expect(cartHasGoods(["service"])).toBe(false);
  });

  it("refuses a guarantee sold on its own", () => {
    expect(cartHasGoods(["guarantee"])).toBe(false);
  });

  it("refuses service + guarantee together — neither can carry the order", () => {
    expect(cartHasGoods(["service", "guarantee"])).toBe(false);
  });

  it("counts an UNRESOLVED category as goods — nothing is refused by elimination", () => {
    expect(cartHasGoods([undefined])).toBe(true);
    expect(cartHasGoods([null])).toBe(true);
    expect(cartHasGoods(["something-nobody-ruled"])).toBe(true);
  });

  it("reports false for an empty cart — `lines.min(1)` owns that refusal, not this gate", () => {
    expect(cartHasGoods([])).toBe(false);
  });

  it("names exactly the two attachment-only categories", () => {
    expect([...ATTACHED_ONLY_CATEGORIES]).toEqual(["service", "guarantee"]);
  });

  it("accessory is goods — it is a physical thing the customer takes home", () => {
    expect(cartHasGoods(["accessory"])).toBe(true);
  });
});

describe("maxLeadDaysFor — unchanged by the goods gate", () => {
  it("gates a made item and lets a pure accessory cart sell for any date", () => {
    expect(maxLeadDaysFor(["mattress"], 14)).toBe(14);
    expect(maxLeadDaysFor(["accessory", "service"], 14)).toBe(0);
  });
});
