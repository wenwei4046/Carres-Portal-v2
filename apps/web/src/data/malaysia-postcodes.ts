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
 * team cannot deliver to. ~~Completeness comes from this dataset, not typing.~~
 * OVERTURNED 2026-10-22 by Weisiang (Mr Lim, WhatsApp; Jess was not part of
 * this decision): completeness comes from this dataset PLUS the office's
 * Settings → Address lists (add, rename or hide a State, City or Postcode;
 * `address_list_overrides`, 0722), Houzs way. The pickers stay strict selects
 * and the generated data file is still never edited by hand. The delivery
 * reader (`region.ts`) keeps reading the national dataset only.
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

/** One row of Settings → Address lists (0722). Names are the list's own
 *  names before any rename. Postcode set = a postcode row; else city set = a
 *  city row; else a state row. A row that is neither hidden nor renamed adds. */
export interface AddressOverride {
  state: string;
  city: string | null;
  postcode: string | null;
  rename_to: string | null;
  hidden: boolean;
}

/**
 * The lists the pickers offer: the generated national file with the office's
 * overrides on top (Weisiang's decision, Mr Lim, WhatsApp 2026-10-22; Jess was
 * not part of it). Adds first, then hides, then renames (a rename onto an
 * existing name merges the two), then hides again: the form asks for "the
 * names as the pickers show them", so a hide can name a renamed State or City.
 * Never mutates `base`.
 */
export function applyAddressOverrides(base: MalaysiaAddressMap, rows: AddressOverride[]): MalaysiaAddressMap {
  const out: MalaysiaAddressMap = {};
  for (const [st, cities] of Object.entries(base)) {
    out[st] = {};
    for (const [c, codes] of Object.entries(cities)) out[st][c] = [...codes];
  }
  for (const r of rows) {
    if (r.hidden || r.rename_to) continue;
    const st = (out[r.state] ??= {});
    if (!r.city) continue;
    const codes = (st[r.city] ??= []);
    if (r.postcode && !codes.includes(r.postcode)) codes.push(r.postcode);
  }
  const hide = () => {
    for (const r of rows) {
      if (!r.hidden || !out[r.state]) continue;
      if (!r.city) delete out[r.state];
      else if (!r.postcode) delete out[r.state][r.city];
      else if (out[r.state][r.city]) out[r.state][r.city] = out[r.state][r.city].filter((p) => p !== r.postcode);
    }
  };
  hide();
  for (const r of rows) {
    const to = r.rename_to?.trim();
    if (!to || r.hidden || r.postcode || !out[r.state] || to === (r.city ?? r.state)) continue;
    if (!r.city) {
      const into = (out[to] ??= {});
      for (const [c, codes] of Object.entries(out[r.state])) into[c] = [...new Set([...(into[c] ?? []), ...codes])];
      delete out[r.state];
    } else if (out[r.state][r.city]) {
      const st = out[r.state];
      st[to] = [...new Set([...(st[to] ?? []), ...st[r.city]])];
      delete st[r.city];
    }
  }
  hide();
  return out;
}

/** A saved value the lists no longer offer (hidden or renamed since) stays
 *  selectable, so an old order still shows what it recorded. */
export function keepCurrent(list: string[], current: string | null | undefined): string[] {
  return current && !list.includes(current) ? [...list, current] : list;
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
