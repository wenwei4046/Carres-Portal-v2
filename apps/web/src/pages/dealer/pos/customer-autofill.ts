import { EMERGENCY_RELATIONSHIPS } from "@carres/shared";
import type { CustomerSearchHit } from "@/lib/queries";
import { MY_ADDRESS } from "@/data/malaysia-postcodes";
import type { WizardDraft } from "../new-order/draft";

/** Emergency-contact relationship options. The list moved to
 *  `@carres/shared` (`sales-order-form.ts`) on 2026-08-15 so the Sales Order
 *  object page offers the SAME choices this wizard does; this re-export keeps
 *  the POS's existing import path. */
export const RELATIONSHIPS = EMERGENCY_RELATIONSHIPS;

/**
 * Reverse of `composeAddress` ("{line1}, {line2?}, {city} {postcode}, {state}").
 *
 * The DB only stores the composed string, so prefilling the structured MY
 * address fields means parsing it back. Strict on the tail — the last segment
 * must be a known state and the one before it must end in a 5-digit postcode
 * with the rest being a known city of that state — because a wrong guess would
 * silently mis-set the cascading dropdowns. Returns null when the string
 * doesn't parse; the caller falls back to line1-only prefill.
 */
export function parseComposedAddress(address: string): {
  addressLine1: string;
  addressLine2: string;
  addressState: string;
  addressCity: string;
  addressPostcode: string;
} | null {
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const state = parts[parts.length - 1];
  const cities = MY_ADDRESS[state];
  if (!cities) return null;

  const m = /^(.+)\s(\d{5})$/.exec(parts[parts.length - 2]);
  if (!m) return null;
  const [, city, postcode] = m;
  if (!cities[city]) return null;

  const head = parts.slice(0, -2);
  return {
    addressLine1: head[0],
    addressLine2: head.slice(1).join(", "),
    addressState: state,
    addressCity: city,
    addressPostcode: postcode,
  };
}

/**
 * Reverse of `composeEmergency` ("{name} · {phone} · {relationship}").
 * A relationship outside the fixed list maps to "__OTHER__" + the free text
 * (mirroring how the dropdown stores it). Missing segments stay empty.
 */
export function parseEmergency(emergency: string): {
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  emergencyRelationshipOther: string;
} {
  const [name = "", phone = "", rel = ""] = emergency
    .split("·")
    .map((s) => s.trim());
  const known = (RELATIONSHIPS as readonly string[]).includes(rel);
  return {
    emergencyName: name,
    emergencyPhone: phone,
    emergencyRelationship: rel ? (known ? rel : "__OTHER__") : "",
    emergencyRelationshipOther: rel && !known ? rel : "",
  };
}

/**
 * Build the full `draft.customer` patch for a picked autocomplete hit —
 * name/phone/email/demographics verbatim, the composed address parsed back
 * into the structured MY fields (line1-only fallback when unparseable, so
 * the salesperson completes state/city/postcode by hand), billing + the
 * billing-same flag, and the emergency contact split back into its fields.
 * `addressUnknown` is never carried over: if the address is on file we fill
 * it; if it isn't, the customer should fill it now rather than inherit a
 * stale "fill in later".
 */
export function customerPatchFromHit(hit: CustomerSearchHit): Partial<WizardDraft["customer"]> {
  const parsedAddress = hit.address ? parseComposedAddress(hit.address) : null;
  // Billing keys in structured too (Loo 2026-07-19) — parse the stored
  // composed billing back into the billing* cascade; unparseable → line1-only
  // fallback, same as delivery.
  const parsedBilling =
    !hit.billingSame && hit.billing ? parseComposedAddress(hit.billing) : null;
  return {
    name: hit.name,
    phone: hit.phone ?? "",
    email: hit.email ?? "",
    race: hit.race ?? "",
    gender: hit.gender ?? "",
    birthday: hit.birthday ? hit.birthday.slice(0, 10) : "",
    address: hit.address ?? "",
    addressUnknown: false,
    ...(parsedAddress ?? {
      addressLine1: hit.address ?? "",
      addressLine2: "",
      addressState: "",
      addressCity: "",
      addressPostcode: "",
    }),
    billingSame: hit.billingSame,
    billing: hit.billingSame ? "" : (hit.billing ?? ""),
    billingLine1: hit.billingSame
      ? ""
      : (parsedBilling?.addressLine1 ?? hit.billing ?? ""),
    billingLine2: parsedBilling?.addressLine2 ?? "",
    billingState: parsedBilling?.addressState ?? "",
    billingCity: parsedBilling?.addressCity ?? "",
    billingPostcode: parsedBilling?.addressPostcode ?? "",
    ...parseEmergency(hit.emergency ?? ""),
  };
}
