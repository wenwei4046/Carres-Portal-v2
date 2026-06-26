import { describe, expect, it } from "vitest";
import {
  parseDefaultFreeGifts,
  resolveDefaultFreeGifts,
  type DefaultFreeGift,
  type FreeGiftLineInput,
} from "./free-gift";

/* ─── ids + line factories ─────────────────────────────────────────────── */

const MODEL_MATTRESS = "00000000-0000-0000-0000-0000000000a1";
const MODEL_SOFA = "00000000-0000-0000-0000-0000000000b2";
const MODEL_BARE = "00000000-0000-0000-0000-0000000000c3"; // no gifts configured

const mattress = (
  modelId: string | null,
  sizeCode: string | null,
  qty = 1,
): FreeGiftLineInput => ({
  category: "MATTRESS",
  modelId,
  sizeCode,
  builtCompartments: [],
  qty,
});

const sofaRow = (
  modelId: string,
  compartments: string[],
  buildKey: string | null,
  qty = 1,
): FreeGiftLineInput => ({
  category: "SOFA",
  modelId,
  sizeCode: null,
  builtCompartments: compartments,
  buildKey,
  qty,
});

/* ─── parseDefaultFreeGifts ────────────────────────────────────────────── */

describe("parseDefaultFreeGifts", () => {
  it("returns [] for non-arrays (dormant / unset column)", () => {
    expect(parseDefaultFreeGifts(null)).toEqual([]);
    expect(parseDefaultFreeGifts(undefined)).toEqual([]);
    expect(parseDefaultFreeGifts({})).toEqual([]);
    expect(parseDefaultFreeGifts("nope")).toEqual([]);
  });

  it("keeps a clean entry (trims giftSku, floors qty)", () => {
    expect(parseDefaultFreeGifts([{ giftSku: " ACC-PILLOW ", qty: 2.9 }])).toEqual([
      { giftSku: "ACC-PILLOW", qty: 2 },
    ]);
  });

  it("drops malformed entries (no giftSku / qty<1 / non-number qty / non-object)", () => {
    const out = parseDefaultFreeGifts([
      null,
      42,
      { giftSku: "", qty: 1 }, // empty sku
      { giftSku: "ACC-A", qty: 0 }, // qty < 1
      { giftSku: "ACC-B", qty: "2" }, // non-number qty
      { giftSku: "ACC-C", qty: 1 }, // valid
    ]);
    expect(out).toEqual([{ giftSku: "ACC-C", qty: 1 }]);
  });

  it("keeps a non-blank label and drops a blank one", () => {
    expect(parseDefaultFreeGifts([{ giftSku: "ACC-A", qty: 1, label: "  Free pillow  " }])).toEqual([
      { giftSku: "ACC-A", qty: 1, label: "Free pillow" },
    ]);
    expect(parseDefaultFreeGifts([{ giftSku: "ACC-A", qty: 1, label: "   " }])).toEqual([
      { giftSku: "ACC-A", qty: 1 },
    ]);
  });

  it("keeps a usable refinement condition, collapses a 'model'-scope / malformed one", () => {
    expect(
      parseDefaultFreeGifts([
        { giftSku: "ACC-A", qty: 1, condition: { scope: "variant", sizeCodes: ["queen"] } },
      ]),
    ).toEqual([{ giftSku: "ACC-A", qty: 1, condition: { scope: "variant", sizeCodes: ["QUEEN"] } }]);
    // a 'model'-scope (whole-model) condition is stored as NO condition
    expect(parseDefaultFreeGifts([{ giftSku: "ACC-A", qty: 1, condition: { scope: "model" } }])).toEqual([
      { giftSku: "ACC-A", qty: 1 },
    ]);
    // a malformed variant (no sizes) collapses to no condition
    expect(parseDefaultFreeGifts([{ giftSku: "ACC-A", qty: 1, condition: { scope: "variant" } }])).toEqual([
      { giftSku: "ACC-A", qty: 1 },
    ]);
  });
});

/* ─── resolveDefaultFreeGifts ──────────────────────────────────────────── */

describe("resolveDefaultFreeGifts — dormant", () => {
  it("returns [] when NO gifts are authored (byte-identical orders)", () => {
    const lines = [mattress(MODEL_MATTRESS, "QUEEN"), sofaRow(MODEL_SOFA, ["1NA"], "B1")];
    expect(resolveDefaultFreeGifts(lines, new Map())).toEqual([]);
  });

  it("returns [] when the line's model has no configured gift", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([[MODEL_MATTRESS, [{ giftSku: "ACC-A", qty: 1 }]]]);
    expect(resolveDefaultFreeGifts([mattress(MODEL_BARE, "QUEEN")], gifts)).toEqual([]);
  });

  it("skips a line with no modelId", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([[MODEL_MATTRESS, [{ giftSku: "ACC-A", qty: 1 }]]]);
    expect(resolveDefaultFreeGifts([mattress(null, "QUEEN")], gifts)).toEqual([]);
  });

  it("a line marked free (free===true) triggers NO gift (one-way guard)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([[MODEL_MATTRESS, [{ giftSku: "ACC-A", qty: 1 }]]]);
    const freed: FreeGiftLineInput = { ...mattress(MODEL_MATTRESS, "QUEEN"), free: true };
    expect(resolveDefaultFreeGifts([freed], gifts)).toEqual([]);
    // sanity: the SAME line WITHOUT the flag does trigger the gift
    expect(resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "QUEEN")], gifts)).toEqual([
      { giftSku: "ACC-A", qty: 1, sourceModelId: MODEL_MATTRESS },
    ]);
  });
});

describe("resolveDefaultFreeGifts — per-model trigger + qty scaling", () => {
  it("triggers one gift per matching non-sofa line, stamping sourceModelId", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_MATTRESS, [{ giftSku: "ACC-PILLOW", qty: 1, label: "Free pillow" }]],
    ]);
    expect(resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "QUEEN")], gifts)).toEqual([
      { giftSku: "ACC-PILLOW", qty: 1, label: "Free pillow", sourceModelId: MODEL_MATTRESS },
    ]);
  });

  it("scales a non-sofa gift qty by the line qty (configured 2 × line 3 = 6)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_MATTRESS, [{ giftSku: "ACC-A", qty: 2 }]],
    ]);
    const out = resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "QUEEN", 3)], gifts);
    expect(out).toEqual([{ giftSku: "ACC-A", qty: 6, sourceModelId: MODEL_MATTRESS }]);
  });
});

describe("resolveDefaultFreeGifts — sofa build dedup", () => {
  it("grants ONE gift set per complete sofa across split rows (not one per row)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_SOFA, [{ giftSku: "ACC-THROW", qty: 1 }]],
    ]);
    const lines = [
      sofaRow(MODEL_SOFA, ["1A(LHF)"], "B1"),
      sofaRow(MODEL_SOFA, ["1NA"], "B1"),
      sofaRow(MODEL_SOFA, ["1A(RHF)"], "B1"),
    ];
    const out = resolveDefaultFreeGifts(lines, gifts);
    expect(out).toEqual([{ giftSku: "ACC-THROW", qty: 1, sourceModelId: MODEL_SOFA }]);
  });

  it("keeps the configured gift qty for a sofa (one trigger unit, NOT scaled by row qty)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_SOFA, [{ giftSku: "ACC-THROW", qty: 2 }]],
    ]);
    // two split rows each qty 1; a configured qty 2 stays 2 (one complete sofa)
    const out = resolveDefaultFreeGifts(
      [sofaRow(MODEL_SOFA, ["1A(LHF)"], "B1"), sofaRow(MODEL_SOFA, ["1NA"], "B1")],
      gifts,
    );
    expect(out).toEqual([{ giftSku: "ACC-THROW", qty: 2, sourceModelId: MODEL_SOFA }]);
  });

  it("treats two distinct buildKeys as two complete sofas (a gift each)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_SOFA, [{ giftSku: "ACC-THROW", qty: 1 }]],
    ]);
    const out = resolveDefaultFreeGifts(
      [sofaRow(MODEL_SOFA, ["1NA"], "B1"), sofaRow(MODEL_SOFA, ["1NA"], "B2")],
      gifts,
    );
    expect(out).toEqual([
      { giftSku: "ACC-THROW", qty: 1, sourceModelId: MODEL_SOFA },
      { giftSku: "ACC-THROW", qty: 1, sourceModelId: MODEL_SOFA },
    ]);
  });

  // F5 — a FLAT-sofa sku (category SOFA, NO buildKey) is a real catalog product,
  // not a SofaBuildCanvas build, so its gift scales by line qty (not capped at 1).
  it("scales a FLAT-sofa (no buildKey) gift by line qty (qty 3 → 3 gifts)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_SOFA, [{ giftSku: "ACC-THROW", qty: 1 }]],
    ]);
    const out = resolveDefaultFreeGifts([sofaRow(MODEL_SOFA, [], null, 3)], gifts);
    expect(out).toEqual([{ giftSku: "ACC-THROW", qty: 3, sourceModelId: MODEL_SOFA }]);
  });
});

describe("resolveDefaultFreeGifts — condition refinement", () => {
  it("variant condition: fires only for the listed size", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_MATTRESS, [{ giftSku: "ACC-A", qty: 1, condition: { scope: "variant", sizeCodes: ["QUEEN"] } }]],
    ]);
    expect(resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "QUEEN")], gifts)).toEqual([
      { giftSku: "ACC-A", qty: 1, sourceModelId: MODEL_MATTRESS },
    ]);
    expect(resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "KING")], gifts)).toEqual([]);
  });

  it("compartment condition: evaluates against the UNIONed build (compartment on a later row still matches)", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [MODEL_SOFA, [{ giftSku: "ACC-A", qty: 1, condition: { scope: "compartment", compartments: ["1A(LHF)"] } }]],
    ]);
    // the matching compartment lives on the SECOND split row — only the union sees it
    const lines = [sofaRow(MODEL_SOFA, ["1NA"], "B1"), sofaRow(MODEL_SOFA, ["1A-LHF"], "B1")];
    expect(resolveDefaultFreeGifts(lines, gifts)).toEqual([
      { giftSku: "ACC-A", qty: 1, sourceModelId: MODEL_SOFA },
    ]);
    // a build that never contains the compartment → no gift
    expect(
      resolveDefaultFreeGifts([sofaRow(MODEL_SOFA, ["1NA"], "B2"), sofaRow(MODEL_SOFA, ["Console"], "B2")], gifts),
    ).toEqual([]);
  });

  it("filters per-gift: a conditioned gift drops while an unconditioned one stays", () => {
    const gifts = new Map<string, DefaultFreeGift[]>([
      [
        MODEL_MATTRESS,
        [
          { giftSku: "ACC-ALWAYS", qty: 1 },
          { giftSku: "ACC-KING-ONLY", qty: 1, condition: { scope: "variant", sizeCodes: ["KING"] } },
        ],
      ],
    ]);
    const out = resolveDefaultFreeGifts([mattress(MODEL_MATTRESS, "QUEEN")], gifts);
    expect(out).toEqual([{ giftSku: "ACC-ALWAYS", qty: 1, sourceModelId: MODEL_MATTRESS }]);
  });
});
