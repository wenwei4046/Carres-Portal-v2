/**
 * Delivery Card 03 (0411) — the backward-calculation facts on Assign logistics.
 * Pure-function coverage: the region key and the chain lines. The dialog only
 * renders what these return, and silence (an empty array) renders nothing.
 */
import { describe, expect, it } from "vitest";
import type { DeliveryPartnerRow } from "@/lib/queries";
import type { DeliveryScopeRow } from "../delivery-work";
import { journeyRegionKeyFor, readyByLines } from "./AssignLogisticsDialog";

function scope(over: {
  so: number;
  address: string;
  confirmedIso?: string | null;
  customerDeliveryIso?: string | null;
}): DeliveryScopeRow {
  return {
    key: `k${over.so}`,
    orderId: `o${over.so}`,
    so: over.so,
    refs: [],
    leg: null,
    legRoute: null,
    customer: "A Customer",
    customerDeliveryIso: over.customerDeliveryIso ?? null,
    customerDateTbd: false,
    location: "",
    building: "",
    logisticsId: null,
    logisticsName: null,
    confirmedIso: over.confirmedIso ?? null,
    confirmedTime: null,
    goods: "",
    doNumber: null,
    // The functions under test never read status; the fixture carries a
    // placeholder, which is why the object needs the unknown hop.
    status: { kind: "waiting_customer_date" },
    hasArrangement: false,
    o: { customer_address: over.address },
  } as unknown as DeliveryScopeRow;
}

const TEOW: DeliveryPartnerRow = {
  id: "p-teow",
  name: "Teow",
  contact: null,
  zones: null,
  pickup_days: [1, 3, 5],
  journey_regions: {
    Melaka: { deliveryDays: [1, 3, 5], transitDays: 0 },
    JB: { deliveryDays: [2, 4, 6], transitDays: 1 },
  },
  surcharge_areas: [],
};

describe("journeyRegionKeyFor", () => {
  it("maps a Melaka address to the Melaka region and a Johor one to JB", () => {
    expect(journeyRegionKeyFor("12 Jalan Satu, Melaka")).toBe("Melaka");
    expect(journeyRegionKeyFor("8 Jalan Dua, Johor Bahru, Johor")).toBe("JB");
  });
  it("stays silent for an address outside the governed journey regions", () => {
    expect(journeyRegionKeyFor("5 Jalan Tiga, Petaling Jaya, Selangor")).toBeNull();
    expect(journeyRegionKeyFor("")).toBeNull();
  });
});

describe("readyByLines — the ONE backward calculation surfaced as a fact", () => {
  // 2026-08-31 Mon · 09-01 Tue · 09-02 Wed · 09-03 Thu · 09-04 Fri · 09-05 Sat

  it("computes the chain for a Johor scope with a confirmed Saturday date", () => {
    const lines = readyByLines(
      [scope({ so: 1001, address: "8 Jalan Dua, Johor Bahru, Johor", confirmedIso: "2026-09-05" })],
      TEOW,
    );
    expect(lines).toEqual([
      { so: 1001, pickupDay: "2026-09-04", readyBy: "2026-09-04" },
    ]);
  });

  it("falls back to the customer's requested date when nothing is confirmed", () => {
    const lines = readyByLines(
      [scope({ so: 1002, address: "12 Jalan Satu, Melaka", customerDeliveryIso: "2026-09-04" })],
      TEOW,
    );
    expect(lines).toEqual([
      { so: 1002, pickupDay: "2026-09-04", readyBy: "2026-09-04" },
    ]);
  });

  it("stays silent for a partner with no recorded pickup week", () => {
    const nets: DeliveryPartnerRow = { id: "p-nets", name: "NETS", contact: null, zones: null };
    expect(
      readyByLines(
        [scope({ so: 1003, address: "12 Jalan Satu, Melaka", confirmedIso: "2026-09-04" })],
        nets,
      ),
    ).toEqual([]);
  });

  it("skips a scope with no date and keeps the ones that have one", () => {
    const lines = readyByLines(
      [
        scope({ so: 1004, address: "12 Jalan Satu, Melaka" }),
        scope({ so: 1005, address: "12 Jalan Satu, Melaka", confirmedIso: "2026-09-04" }),
      ],
      TEOW,
    );
    expect(lines.map((l) => l.so)).toEqual([1005]);
  });

  it("stays silent entirely when no partner is chosen", () => {
    expect(
      readyByLines(
        [scope({ so: 1006, address: "12 Jalan Satu, Melaka", confirmedIso: "2026-09-04" })],
        undefined,
      ),
    ).toEqual([]);
  });
});
