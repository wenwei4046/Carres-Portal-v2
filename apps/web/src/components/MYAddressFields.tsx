import { MY_STATES, getCities, getPostcodes } from "@/data/malaysia-postcodes";

interface AddressData {
  addressLine1: string;
  addressState: string;
  addressCity: string;
  addressPostcode: string;
}

interface Props {
  data: AddressData;
  onChange: (patch: Partial<AddressData>) => void;
}

/**
 * Cascading Malaysia address picker. Mirrors `reference/proto/my-address-fields.jsx`:
 *   1. Address Line 1 — full-width free text (building / unit / street).
 *   2. State (select) — locks until picked.
 *   3. City (select) — populated from `MY_ADDRESS[state]`; disabled until state.
 *   4. Postcode (select) — populated from `MY_ADDRESS[state][city]`; disabled until city.
 *
 * Picking a new state resets city + postcode; picking a new city resets only
 * postcode. Keeps draft data tidy: a draft can never end up with a postcode
 * that doesn't belong to its city.
 */
export default function MYAddressFields({ data, onChange }: Props) {
  const cities = getCities(data.addressState || null);
  const postcodes = getPostcodes(data.addressState || null, data.addressCity || null);
  const cityDisabled = !data.addressState;
  const postcodeDisabled = !data.addressCity;

  function setState(next: string) {
    onChange({ addressState: next, addressCity: "", addressPostcode: "" });
  }

  function setCity(next: string) {
    onChange({ addressCity: next, addressPostcode: "" });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <FieldLabel label="Address Line 1 *">
        <input
          type="text"
          value={data.addressLine1}
          placeholder="Building, unit, street (e.g. 12-3, Jalan Telawi 5, Bangsar Baru)"
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          className={ACTIVE_CLASS}
        />
      </FieldLabel>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <FieldLabel label="State *">
          <select
            value={data.addressState}
            onChange={(e) => setState(e.target.value)}
            className={ACTIVE_CLASS}
          >
            <option value="">— select state —</option>
            {MY_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="City / Town *">
          <select
            value={data.addressCity}
            onChange={(e) => setCity(e.target.value)}
            disabled={cityDisabled}
            className={cityDisabled ? LOCKED_CLASS : ACTIVE_CLASS}
          >
            <option value="">{cityDisabled ? "Select state first" : "— select city —"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <FieldLabel label="Postcode *">
        <select
          value={data.addressPostcode}
          onChange={(e) => onChange({ addressPostcode: e.target.value })}
          disabled={postcodeDisabled}
          className={`${postcodeDisabled ? LOCKED_CLASS : ACTIVE_CLASS} max-w-[260px]`}
        >
          <option value="">
            {postcodeDisabled
              ? data.addressState
                ? "Select city first"
                : "Select state first"
              : "— select postcode —"}
          </option>
          {postcodes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </FieldLabel>
    </div>
  );
}

// Two-tone gating cue:
//   ACTIVE_CLASS  — pure white, signals "this is the next field to fill".
//   LOCKED_CLASS  — dark cream (matches body bg), signals "waiting for the
//                   prerequisite above". Disabled selects use this so the
//                   sequence is visually obvious without reading labels.
const ACTIVE_CLASS =
  "w-full px-3 py-2.5 border border-base-300 rounded bg-white text-sm outline-none focus:border-primary";
const LOCKED_CLASS =
  "w-full px-3 py-2.5 border border-base-300 rounded bg-base-50 text-base-500 text-sm cursor-not-allowed";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
