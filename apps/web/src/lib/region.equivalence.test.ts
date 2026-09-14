/**
 * ⭐ A SHARED HELPER MAY NOT SILENTLY CHANGE ITS OTHER CONSUMERS.
 *
 * `detectState` was rewritten as `classifyState(...)?.state ?? null` when the
 * address correction needed to know HOW a state had been read (2026-09-14).
 * The commit claimed "every existing caller keeps its exact behaviour" — this
 * file is that claim under test rather than in a comment, because
 * `detectState` is read by surfaces the correction never looked at:
 *
 * ```
 * AssignLogisticsDialog   the suggested carrier for an address
 * OperationOrdersControl  the Orders control grid's state grouping
 * region.ts itself        regionForAddress · areaForAddress ·
 *                         locationForAddress · suggestCarrier
 * ```
 *
 * The rewrite swapped `??` (nullish) for truthiness on the two postcode
 * lookups, so the ONE way it could diverge is a falsy-but-present state name
 * in the dataset. The old implementation is re-stated below and both are run
 * over every postcode the national dataset holds plus the shapes production
 * actually carries — an equivalence proof, not an inspection.
 */
import { describe, it, expect } from "vitest";
import { detectState } from "./region";
import { MY_ADDRESS } from "@/data/malaysia-postcodes";

/* ── The implementation EXACTLY as it stood before the correction ────────── */
const STATE_ALIASES: Record<string, string> = {
  kl: "Kuala Lumpur",
  "w.p. kuala lumpur": "Kuala Lumpur",
  "wp kuala lumpur": "Kuala Lumpur",
  "wilayah persekutuan kuala lumpur": "Kuala Lumpur",
  malacca: "Melaka",
  "pulau pinang": "Penang",
  "p. pinang": "Penang",
  "p.pinang": "Penang",
  "negri sembilan": "Negeri Sembilan",
  "n. sembilan": "Negeri Sembilan",
  "n.sembilan": "Negeri Sembilan",
};
const STATE_NAMES = Object.keys(MY_ADDRESS);
const POSTCODE_TO_STATE = (() => {
  const m = new Map<string, string>();
  for (const [state, cities] of Object.entries(MY_ADDRESS)) {
    for (const codes of Object.values(cities)) {
      for (const pc of codes) if (!m.has(pc)) m.set(pc, state);
    }
  }
  return m;
})();
const PREFIX2_TO_STATE: Record<string, string> = {
  "01": "Perlis", "02": "Perlis",
  "05": "Kedah", "06": "Kedah", "07": "Kedah", "08": "Kedah", "09": "Kedah",
  "10": "Penang", "11": "Penang", "12": "Penang", "13": "Penang", "14": "Penang",
  "15": "Kelantan", "16": "Kelantan", "17": "Kelantan", "18": "Kelantan",
  "20": "Terengganu", "21": "Terengganu", "22": "Terengganu", "23": "Terengganu", "24": "Terengganu",
  "25": "Pahang", "26": "Pahang", "27": "Pahang", "28": "Pahang", "39": "Pahang", "49": "Pahang", "69": "Pahang",
  "30": "Perak", "31": "Perak", "32": "Perak", "33": "Perak", "34": "Perak", "35": "Perak", "36": "Perak",
  "40": "Selangor", "41": "Selangor", "42": "Selangor", "43": "Selangor", "44": "Selangor",
  "45": "Selangor", "46": "Selangor", "47": "Selangor", "48": "Selangor",
  "63": "Selangor", "64": "Selangor", "68": "Selangor",
  "50": "Kuala Lumpur", "51": "Kuala Lumpur", "52": "Kuala Lumpur", "53": "Kuala Lumpur",
  "54": "Kuala Lumpur", "55": "Kuala Lumpur", "56": "Kuala Lumpur", "57": "Kuala Lumpur",
  "58": "Kuala Lumpur", "59": "Kuala Lumpur", "60": "Kuala Lumpur",
  "62": "Putrajaya",
  "70": "Negeri Sembilan", "71": "Negeri Sembilan", "72": "Negeri Sembilan", "73": "Negeri Sembilan",
  "75": "Melaka", "76": "Melaka", "77": "Melaka", "78": "Melaka",
  "79": "Johor", "80": "Johor", "81": "Johor", "82": "Johor", "83": "Johor",
  "84": "Johor", "85": "Johor", "86": "Johor",
  "87": "Labuan",
  "88": "Sabah", "89": "Sabah", "90": "Sabah", "91": "Sabah",
  "93": "Sarawak", "94": "Sarawak", "95": "Sarawak", "96": "Sarawak", "97": "Sarawak", "98": "Sarawak",
};

function detectStateBefore(address: string | null | undefined): string | null {
  if (!address) return null;
  const lower = address.toLowerCase();
  if (/\bsingapore\b/.test(lower) || /\bs'?pore\b/.test(lower)) return "Singapore";
  let bestState: string | null = null;
  let bestIdx = -1;
  for (const s of STATE_NAMES) {
    const idx = lower.lastIndexOf(s.toLowerCase());
    if (idx > bestIdx) {
      bestIdx = idx;
      bestState = s;
    }
  }
  for (const [alias, canonical] of Object.entries(STATE_ALIASES)) {
    const idx = lower.lastIndexOf(alias);
    if (idx > bestIdx) {
      bestIdx = idx;
      bestState = canonical;
    }
  }
  if (bestState !== null) return bestState;
  const pc = lower.match(/\b(\d{5})\b/)?.[1];
  if (pc) return POSTCODE_TO_STATE.get(pc) ?? PREFIX2_TO_STATE[pc.slice(0, 2)] ?? null;
  return null;
}

describe("detectState is unchanged for every consumer outside the address fix", () => {
  it("agrees on EVERY postcode the national dataset holds", () => {
    const codes = [...POSTCODE_TO_STATE.keys()];
    expect(codes.length).toBeGreaterThan(1000);
    const diffs = codes.filter((pc) => detectState(pc) !== detectStateBefore(pc));
    expect(diffs).toEqual([]);
  });

  it("agrees on every 5-digit code in 00000-99999, dataset or not", () => {
    /* The coarse 2-digit table is only reachable for codes the dataset does
       NOT hold, which is exactly the branch the rewrite touched. */
    const diffs: string[] = [];
    for (let n = 0; n < 100000; n += 1) {
      const pc = String(n).padStart(5, "0");
      if (detectState(pc) !== detectStateBefore(pc)) diffs.push(pc);
    }
    expect(diffs).toEqual([]);
  });

  it("agrees on the address shapes production actually carries", () => {
    const samples = [
      null,
      undefined,
      "",
      "   ",
      "31,JALAN BK8/2B,ANGGUN, RESIDENCE,BANDAR KINRARA,, 43300 PUCHONG,SELANGOR, Puchong, Selangor",
      "65 Jalan Kajang Selatan, 1/1 Kajang Selatan, 43500, Semenyih, Sentul, Kuala Lumpur",
      "Tuai Timur, Setia Alam",
      "15, Jalan Elmma/Lhan 15",
      "C-208 SD Apartment 2 Persiaran Meranti, Bandar Sri Damasara 52200 KL",
      "37-05, Residensi Park Place, 52200 KL, Kuala Lumpur, Federal Territory",
      "12 Walk Street, Singapore 189555",
      "No. 5 Welloyd Industrial Park, Sungai Buloh 47020, Selangor",
      "Lot 9, Jalan Hutan 49999",
      "Blk 7 S'pore 560123",
      "no digits and no state at all",
      "Carres Klang Warehouse",
      "JB transit warehouse",
      "Customer (Singapore)",
    ];
    for (const s of samples) {
      expect([s, detectState(s)]).toEqual([s, detectStateBefore(s)]);
    }
  });

  it("the dataset holds no falsy state name — the one way the rewrite could diverge", () => {
    /* `??` became truthiness on the two postcode lookups. An empty-string state
       would have survived the old operator and been dropped by the new one. */
    expect(Object.keys(MY_ADDRESS).filter((s) => !s)).toEqual([]);
    expect([...POSTCODE_TO_STATE.values()].filter((s) => !s)).toEqual([]);
    expect(Object.values(PREFIX2_TO_STATE).filter((s) => !s)).toEqual([]);
  });
});
