/**
 * Region + carrier-default classifier for the Orders control grid (P2 of
 * memory: project-orders-control-spec).
 *
 * Two jobs, both pure + overridable defaults (the operator can always pick a
 * different carrier in the order drawer — these are suggestions, not locks):
 *
 *   1. AREA tag for the Orders list:  KV  vs  Outstation.
 *      KV ("Klang Valley") = Selangor + Kuala Lumpur + Putrajaya.
 *      Outstation = everything else (incl. Singapore + East Malaysia).
 *
 *   2. Suggested logistic carrier by destination region. Business rule is
 *      Jess's own operating model — docs/master-sheet-operating-model.md §carrier:
 *        Klang Valley ............ NETS   (AL / HOUZS = expensive backup)
 *        North (Penang/Ipoh/...) . NETS
 *        Melaka & Johor .......... TT     (TEOW alt)  — KL→JB transit
 *        Singapore ............... SSY    (EU alt)    — JB→SG
 *        Other outstation ........ AL     (HOUZS alt) — expensive overflow
 *
 * State is read from the free-text `customer_address`. Native orders are built
 * by composeAddress() as "…, {city} {postcode}, {state}" so the state name sits
 * at the end and matches by keyword. AutoCount-imported addresses are messier,
 * so we fall back to the 5-digit postcode (exact map from the shared address
 * dataset, then a coarse 2-digit-prefix range table).
 *
 * Web-local by design: the only consumers are the Orders list + drawer, and the
 * postcode dataset it leans on lives in apps/web/src/data. Promote to
 * @carres/shared if the API ever needs to auto-assign a carrier (e.g. on import).
 */

import { MY_ADDRESS } from "@/data/malaysia-postcodes";

export type Area = "KV" | "Outstation";
export type Region = "KV" | "North" | "South" | "Singapore" | "Other";

/** Canonical state → region bucket. States absent here fall through to "Other". */
const KV_STATES = new Set(["Selangor", "Kuala Lumpur", "Putrajaya"]);
const NORTH_STATES = new Set(["Penang", "Perak", "Kedah", "Perlis"]);
const SOUTH_STATES = new Set(["Johor", "Melaka"]); // JB-logistics transit

/** Region → default carrier (primary shown in the list; alt offered in the drawer). */
export const REGION_CARRIER: Record<
  Region,
  { primary: string; alt?: string }
> = {
  KV: { primary: "NETS", alt: "AL" },
  North: { primary: "NETS" },
  South: { primary: "TT", alt: "TEOW" },
  Singapore: { primary: "SSY", alt: "EU" },
  Other: { primary: "AL", alt: "HOUZS" },
};

/** Free-text spellings that should resolve to a canonical MY_ADDRESS state key. */
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

/** Canonical state names from the shared dataset (e.g. "Selangor", "Penang"). */
const STATE_NAMES = Object.keys(MY_ADDRESS);

/** Exact 5-digit postcode → state (first-wins; KL/Selangor overlaps are both KV). */
const POSTCODE_TO_STATE = (() => {
  const m = new Map<string, string>();
  for (const [state, cities] of Object.entries(MY_ADDRESS)) {
    for (const codes of Object.values(cities)) {
      for (const pc of codes) if (!m.has(pc)) m.set(pc, state);
    }
  }
  return m;
})();

/** Coarse first-2-digit postcode prefix → state, for postcodes not in the
 *  curated dataset. Approximate but only used as a last resort. */
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

/**
 * Best-effort state detection from a free-text address. Returns a canonical
 * MY state name, the sentinel "Singapore", or null when nothing is recognised.
 */
export function detectState(address: string | null | undefined): string | null {
  if (!address) return null;
  const lower = address.toLowerCase();

  // Singapore is not a MY state — treat as its own region.
  if (/\bsingapore\b/.test(lower) || /\bs'?pore\b/.test(lower)) return "Singapore";

  // Keyword match on canonical state names + aliases. Prefer the match closest
  // to the END of the string (the state sits last in a composed address; this
  // also dodges a street that happens to share a state's name).
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

  // Postcode fallback: exact 5-digit, then coarse 2-digit prefix.
  const pc = lower.match(/\b(\d{5})\b/)?.[1];
  if (pc) return POSTCODE_TO_STATE.get(pc) ?? PREFIX2_TO_STATE[pc.slice(0, 2)] ?? null;

  return null;
}

/** Map a detected state (or "Singapore") to a region bucket. */
export function stateToRegion(state: string | null): Region | null {
  if (!state) return null;
  if (state === "Singapore") return "Singapore";
  if (KV_STATES.has(state)) return "KV";
  if (NORTH_STATES.has(state)) return "North";
  if (SOUTH_STATES.has(state)) return "South";
  return "Other"; // any other MY state = outstation overflow
}

/** Region from a free-text address, or null when undetectable. */
export function regionForAddress(
  address: string | null | undefined,
): Region | null {
  return stateToRegion(detectState(address));
}

/** AREA tag for the Orders list. Undetectable address → "Unknown". */
export function areaForAddress(
  address: string | null | undefined,
): Area | "Unknown" {
  const region = regionForAddress(address);
  if (!region) return "Unknown";
  return region === "KV" ? "KV" : "Outstation";
}

/** Exact 5-digit postcode → city (first-wins), mirror of POSTCODE_TO_STATE. */
const POSTCODE_TO_CITY = (() => {
  const m = new Map<string, string>();
  for (const cities of Object.values(MY_ADDRESS)) {
    for (const [city, codes] of Object.entries(cities)) {
      for (const pc of codes) if (!m.has(pc)) m.set(pc, city);
    }
  }
  return m;
})();

/**
 * Short delivery-LOCATION label for the Orders list — the *real* place from the
 * imported address (the city when its 5-digit postcode is known, else the
 * state), never the invented word "Outstation". The KV/Outstation `area` rides
 * along for colour + the call-first SOP, but it is not the label.
 */
export function locationForAddress(
  address: string | null | undefined,
): { label: string | null; area: Area | "Unknown" } {
  const area = areaForAddress(address);
  if (!address) return { label: null, area };
  if (/\bsingapore\b/.test(address.toLowerCase())) {
    return { label: "Singapore", area };
  }
  const pc = address.toLowerCase().match(/\b(\d{5})\b/)?.[1];
  const city = pc ? POSTCODE_TO_CITY.get(pc) : undefined;
  return { label: city ?? detectState(address) ?? null, area };
}

/**
 * Suggested default carrier for an address — the overridable default the list
 * shows and the drawer pre-selects. Returns null when the region can't be
 * determined (operator must pick manually).
 */
export function suggestCarrier(
  address: string | null | undefined,
): { partner: string; alt?: string; region: Region } | null {
  const region = regionForAddress(address);
  if (!region) return null;
  const { primary, alt } = REGION_CARRIER[region];
  return { partner: primary, alt, region };
}
