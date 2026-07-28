import { describe, expect, it } from "vitest";
import { buildRaisePoPlan, type RaisePoOrder, type RaisePoSkuMeta } from "./raise-po-plan";

// Fixed "now": Mon 2026-07-20 09:00 MYT.
const NOW = new Date("2026-07-20T01:00:00Z");

const NF = "aaaaaaaa-0000-0000-0000-0000000000nf".replace("nf", "01");
const OHANA = "aaaaaaaa-0000-0000-0000-000000000002";
const REDSOFA = "aaaaaaaa-0000-0000-0000-000000000003";
const ARMANI = "aaaaaaaa-0000-0000-0000-000000000004";

const SUPPLIERS = [
  { id: NF, cat_covered: ["mattress"] },
  { id: OHANA, cat_covered: ["bedframe"] },
  { id: REDSOFA, cat_covered: ["sofa"] },
  { id: ARMANI, cat_covered: ["sofa"] },
];

function order(over: Partial<RaisePoOrder> & { so: number }): RaisePoOrder {
  return { id: `o-${over.so}`, deliveryDate: "2026-09-01", lines: [], ...over };
}

const NO_META = new Map<string, RaisePoSkuMeta>();
const NO_OVERRIDE = new Map<string, string>();

describe("buildRaisePoPlan", () => {
  it("aggregates the same SKU across orders into one line with SO chips", () => {
    const plan = buildRaisePoPlan(
      [
        order({ so: 1001, lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 1 }] }),
        order({ so: 1002, lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 2 }] }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    // Mattress → unique covering supplier (NF) even without catalog meta.
    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0].supplierId).toBe(NF);
    expect(plan.cards[0].lines).toEqual([
      expect.objectContaining({ sku: "Breeze FirmCare-B1201F-Q", qty: 3, sos: [1001, 1002] }),
    ]);
  });

  it("skips lines already covered by a PO and counts them", () => {
    const plan = buildRaisePoPlan(
      [
        order({
          so: 1001,
          lines: [
            { sku: "Breeze FirmCare-B1201F-Q", qty: 1, sourcePo: "PO/2606-063" },
            { sku: "Breeze FirmCare-B1201F-K", qty: 1 },
          ],
        }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    expect(plan.alreadyOnPo).toBe(1);
    expect(plan.cards[0].lines.map((l) => l.sku)).toEqual(["Breeze FirmCare-B1201F-K"]);
  });

  it("allocates free stock earliest-SO-first; only the remainder needs a PO", () => {
    const plan = buildRaisePoPlan(
      [
        order({ so: 1002, lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 2 }] }),
        order({ so: 1001, lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 1 }] }),
      ],
      new Map([["Breeze FirmCare-B1201F-Q", 2]]),
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    // SO-1001 takes 1 from the shelf, SO-1002 takes the last 1 → shortage 1 on 1002.
    expect(plan.coveredUnits).toBe(2);
    expect(plan.cards[0].lines).toEqual([
      expect.objectContaining({ qty: 1, sos: [1002] }),
    ]);
  });

  it("fully covered by stock → no cards at all", () => {
    const plan = buildRaisePoPlan(
      [order({ so: 1001, lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 1 }] })],
      new Map([["Breeze FirmCare-B1201F-Q", 5]]),
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    expect(plan.cards).toHaveLength(0);
    expect(plan.unresolved).toHaveLength(0);
    expect(plan.coveredUnits).toBe(1);
  });

  it("ambiguous category (2 sofa suppliers) stays unresolved; an override or catalog supplier resolves it", () => {
    const sofaSku = "AM9053/30\"(3 Seater)/M2402-4 Sand";
    const base = [order({ so: 1001, lines: [{ sku: sofaSku, qty: 1 }] })];
    const plan = buildRaisePoPlan(base, undefined, NO_META, SUPPLIERS, NO_OVERRIDE, NOW);
    expect(plan.cards).toHaveLength(0);
    expect(plan.unresolved.map((l) => l.sku)).toEqual([sofaSku]);

    const overridden = buildRaisePoPlan(
      base,
      undefined,
      NO_META,
      SUPPLIERS,
      new Map([[sofaSku, ARMANI]]),
      NOW,
    );
    expect(overridden.cards[0]).toMatchObject({ supplierId: ARMANI });

    const viaCatalog = buildRaisePoPlan(
      base,
      undefined,
      new Map([[sofaSku, { supplierId: REDSOFA, category: "sofa", cost: 900 }]]),
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    expect(viaCatalog.cards[0]).toMatchObject({ supplierId: REDSOFA });
    expect(viaCatalog.cards[0].lines[0]).toMatchObject({ cost: 900, fromCatalog: true });
  });

  it("accessory / service lines are skipped and counted", () => {
    const plan = buildRaisePoPlan(
      [
        order({
          so: 1001,
          lines: [
            { sku: "BAMBOO-WATERPROOF-K", qty: 1 },
            { sku: "SERV-BFDISP", qty: 1 },
            { sku: "Breeze FirmCare-B1201F-Q", qty: 1 },
          ],
        }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    expect(plan.nonCore).toBe(2);
    expect(plan.cards[0].lines).toHaveLength(1);
  });

  it("flags urgency when the deadline sits inside the production window", () => {
    const plan = buildRaisePoPlan(
      [
        order({
          so: 1001,
          deliveryDate: "2026-07-24", // 4 days out — inside the 7-day window
          lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 1 }],
        }),
        order({
          so: 1002,
          deliveryDate: "2026-09-01", // far out
          lines: [{ sku: "Breeze FirmCare-B1201F-K", qty: 1 }],
        }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
      // P1 (0303): the window is the production working days a human SET, not
      // a constant. It arrives from the purchasing settings.
      { mattress: 7, bedframe: 7, sofa: 14 },
    );
    const bySku = new Map(plan.cards[0].lines.map((l) => [l.sku, l]));
    expect(bySku.get("Breeze FirmCare-B1201F-Q")?.urgent).toBe(true);
    expect(bySku.get("Breeze FirmCare-B1201F-K")?.urgent).toBe(false);
  });

  it("no number set for the category → nothing is called urgent", () => {
    // The K1 rule, applied to urgency: nobody told the portal how long this
    // factory takes, so the portal does not get to say the order is late.
    const plan = buildRaisePoPlan(
      [
        order({
          so: 1001,
          deliveryDate: "2026-07-24",
          lines: [{ sku: "Breeze FirmCare-B1201F-Q", qty: 1 }],
        }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
      {},
    );
    expect(plan.cards[0].lines[0].urgent).toBe(false);
  });

  it("keeps same SKU with different attrs as separate lines", () => {
    const plan = buildRaisePoPlan(
      [
        order({
          so: 1001,
          lines: [
            { sku: "Breeze FirmCare-B1201F-Q", qty: 1, attrs: { color: "NB01" } },
            { sku: "Breeze FirmCare-B1201F-Q", qty: 1, attrs: { color: "NB02" } },
          ],
        }),
      ],
      undefined,
      NO_META,
      SUPPLIERS,
      NO_OVERRIDE,
      NOW,
    );
    expect(plan.cards[0].lines).toHaveLength(2);
  });
});
