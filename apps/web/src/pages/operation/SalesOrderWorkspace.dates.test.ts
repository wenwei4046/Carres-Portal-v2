import { describe, expect, it } from "vitest";
import { earliestPromiseISO } from "./SalesOrderWorkspace";

/**
 * THE OFFICE DOOR PROMISES THE SAME DATES THE POS CAN (2026-08-21).
 *
 * A made item has a factory behind it, so a delivery date sooner than the
 * production lead is a promise Carres cannot keep. The POS has refused those
 * dates since 2026-05-22; this door did not — so the same cart keyed in the
 * office could carry a date the shop floor was forbidden to sell.
 *
 * The arithmetic is SHARED (`maxLeadDaysFor` + `minDeliveryDateISO`), not
 * copied: two implementations that currently agree is the arrangement under
 * which a third, wrong one grows (Law D).
 */
const TODAY = new Date("2026-08-21T00:00:00Z");

describe("earliestPromiseISO", () => {
  it("gates a made item by the configured lead", () => {
    // 14 calendar days from 21 Aug is 4 Sep.
    expect(earliestPromiseISO(["sofa"], 14, TODAY)).toBe("2026-09-04");
    expect(earliestPromiseISO(["mattress"], 14, TODAY)).toBe("2026-09-04");
    expect(earliestPromiseISO(["bedframe"], 21, TODAY)).toBe("2026-09-11");
  });

  it("the longest lead in a mixed cart wins", () => {
    expect(earliestPromiseISO(["accessory", "sofa"], 14, TODAY)).toBe("2026-09-04");
  });

  it("a cart with no made item has NO floor — it may be promised for any day", () => {
    // A pure accessory or service cart has no factory behind it. Gating it
    // would refuse a same-day delivery the business genuinely offers.
    expect(earliestPromiseISO(["accessory"], 14, TODAY)).toBeNull();
    expect(earliestPromiseISO(["service"], 14, TODAY)).toBeNull();
    expect(earliestPromiseISO([], 14, TODAY)).toBeNull();
  });

  it("a SKU the catalog does not hold contributes NO category, and cannot invent a lead", () => {
    // This is the D9 discipline: the category comes from the catalog or not at
    // all. 975 live units have no catalog row — guessing "sofa" from their SKU
    // text would impose a three-week floor on lines nobody can vouch for.
    expect(earliestPromiseISO([null, undefined], 14, TODAY)).toBeNull();
    expect(earliestPromiseISO([null, "sofa"], 14, TODAY)).toBe("2026-09-04");
  });

  it("no configured lead means no floor — the door does not invent policy", () => {
    // `purchasing_settings.earliest_sell_days` is Jess's number. If the bundle
    // has not loaded, or the setting is 0, this door stays open rather than
    // applying a remembered default.
    expect(earliestPromiseISO(["sofa"], undefined, TODAY)).toBeNull();
    expect(earliestPromiseISO(["sofa"], 0, TODAY)).toBeNull();
  });
});
