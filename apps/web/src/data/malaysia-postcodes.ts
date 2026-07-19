/**
 * Malaysia address data — state → official post town → postcode list.
 *
 * Backed by the FULL national dataset in `malaysia-postcodes-data.ts`
 * (generated — see that file's header for the source + how to regenerate).
 * 2026-07-19: replaced the prototype's hand-curated demo subset, which was
 * missing whole towns (Batu Caves, Pelabuhan Klang, …) and misfiled codes
 * (Petaling Jaya's entire 47xxx band sat under Sungai Buloh), after the
 * Kelana Jaya showroom's 47301 could not be keyed in. Neighbourhood aliases
 * (KLCC, Bangsar, Kota Damansara, USJ, …) were dropped with it — the picker
 * now speaks official post towns only, matching what Pos Malaysia prints.
 *
 * The pickers (MYAddressFields) are strict selects with NO free-type escape.
 * Deliberate (Loo, 2026-07-19): salespeople often don't know which city a
 * postcode really belongs to, and a mis-keyed address is one the operation
 * team cannot deliver to. Completeness comes from this dataset, not typing.
 */
import { MY_ADDRESS_DATA } from "./malaysia-postcodes-data";

type CityMap = Record<string, string[]>;
export type MalaysiaAddressMap = Record<string, CityMap>;

export const MY_ADDRESS: MalaysiaAddressMap = MY_ADDRESS_DATA;

export const MY_STATES = Object.keys(MY_ADDRESS).sort();

export function getCities(state: string | null): string[] {
  if (!state || !MY_ADDRESS[state]) return [];
  return Object.keys(MY_ADDRESS[state]).sort();
}

export function getPostcodes(state: string | null, city: string | null): string[] {
  if (!state || !city || !MY_ADDRESS[state]?.[city]) return [];
  return [...new Set(MY_ADDRESS[state][city])].sort();
}

/** Compose the structured address fields into the single `customer_address`
 *  string the DB stores. Empty parts are dropped so the result is always tidy.
 *  Ordering: `{line1}, {line2?}, {city} {postcode}, {state}`. line2 is
 *  optional (e.g. "Unit 12-A, Block B") — added 2026-05-13 for residential
 *  addresses where Line 1 alone can't carry the full street + unit. */
export function composeAddress(parts: {
  line1: string;
  line2?: string;
  state: string;
  city: string;
  postcode: string;
}): string {
  const { line1, line2, state, city, postcode } = parts;
  const tail = [city, postcode].filter(Boolean).join(" ");
  return [line1.trim(), (line2 ?? "").trim(), tail, state]
    .filter(Boolean)
    .join(", ");
}
