/**
 * ONE FIELD CONTRACT FOR THE SALES ORDER FORM — owner ruling 2026-08-15.
 *
 * The Sales Portal asks the customer a set of questions at order entry. The
 * Sales Order object page shows and corrects the SAME set. Two surfaces reading
 * two lists is how one of them silently loses a field, so the lists live HERE
 * and both import them (ownership Law D — one fact, one arithmetic).
 *
 * `POS_FORM_BUILTINS` in `schemas/order-entry.ts` already owns which fields
 * EXIST and whether they are enabled/required. This file owns the two things
 * that were still duplicated inside the POS screen:
 *
 * ```
 * the CHOICES a field offers      race · gender · building type · relationship
 * the ONE composed-string codec   emergency contact  (three fields ⇄ one column)
 * ```
 *
 * THE EMERGENCY CONTACT IS THREE FIELDS AND ONE COLUMN. `orders
 * .customer_emergency` is a single `text` column holding `"{name} · {phone} ·
 * {relationship}"` — the POS composes it at submit. The object page must edit
 * the same fact as THREE validated fields (owner ruling 2026-08-15), so it
 * parses that column back into its parts and recomposes on save with the same
 * function the POS uses. Nothing is normalised on read: a stored string that
 * does not fit the shape keeps every character it has (it lands in `name`) and
 * is written back untouched unless the operator edits it.
 */

/** Race choices the POS offers (0200 demographics). */
export const CUSTOMER_RACE_OPTIONS = ["Malay", "Chinese", "Indian", "Other"] as const;

/** Gender choices the POS offers (0200 demographics). */
export const CUSTOMER_GENDER_OPTIONS = ["Female", "Male"] as const;

/** Building type of the delivery address (rides `entry_data.fields.building_type`). */
export const BUILDING_TYPE_OPTIONS = [
  "Landed",
  "Condo",
  "Apartment",
  "Office",
  "Retail",
  "Other",
] as const;

/** ⭐ THE TWO ANSWERS TO `Lift available?` (Jess, 2026-08-26).
 *
 *  The POS has always offered these two words as a pill pair; the Sales Order
 *  object page asked the same fact as an unlabelled tickbox, where an unticked
 *  box read as both "no lift" and "nobody said". The words move here so the two
 *  surfaces cannot drift apart again — the same reason the race, gender and
 *  relationship choices live in this file.
 *
 *  ORDER IS DELIBERATE: `No lift` first, because it is the stored default
 *  (`draft.hasLift = false`) and the answer that costs the customer money. */
export const LIFT_OPTIONS = ["No lift", "Has lift"] as const;

/** Emergency-contact relationships the POS offers. `__OTHER__` is the escape
 *  hatch the wizard renders as a free-text box; it is a UI token and never a
 *  stored value — what reaches the column is the typed words. */
export const EMERGENCY_RELATIONSHIPS = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Relative",
  "Friend",
  "Colleague",
  "Helper",
] as const;

export const EMERGENCY_RELATIONSHIP_OTHER = "__OTHER__";

/** The separator the composed column has always used. */
const EMERGENCY_SEPARATOR = " · ";

export interface EmergencyContactParts {
  name: string;
  phone: string;
  relationship: string;
}

/**
 * Three fields → the one `customer_emergency` column.
 *
 * A trailing empty part is dropped, so a contact with no relationship reads
 * `"Alice · 012-3456789"` rather than `"Alice · 012-3456789 · "`. All three
 * empty composes to `""`, which every caller turns into SQL NULL.
 *
 * ⛔ ONLY TRAILING (YH, 2026-09-01 — audit F-4, and it silently corrupted a
 * real field). This used to drop EVERY empty part, which loses the POSITION of
 * the ones that remain. `parseEmergencyContact` reads by position, so:
 *
 *     { name: "", phone: "012-3456789", relationship: "Spouse" }
 *       compose → "012-3456789 · Spouse"
 *       parse   → { name: "012-3456789", phone: "Spouse", relationship: "" }
 *
 * Save a contact with no name, reload the order, and the PHONE has become the
 * name and the relationship has become the phone. Nothing warned, nothing
 * failed, and the next reader saw a plausible-looking contact that was wrong.
 *
 * Keeping the empty slot preserves the position: the same input composes to
 * `" · 012-3456789 · Spouse"` and parses back to itself. A trailing empty
 * carries no position — there is nothing after it — so dropping it is safe and
 * keeps the common shape unchanged.
 */
export function composeEmergencyContact(parts: EmergencyContactParts): string {
  const trio = [parts.name.trim(), parts.phone.trim(), parts.relationship.trim()];
  while (trio.length > 0 && trio[trio.length - 1] === "") trio.pop();
  return trio.join(EMERGENCY_SEPARATOR);
}

/**
 * The one `customer_emergency` column → three fields.
 *
 * The inverse of `composeEmergencyContact` for anything it wrote. For anything
 * it did NOT write — an import, a hand-typed note, a legacy row — the whole
 * string lands in `name` and the other two stay empty, so recomposing returns
 * the identical string and an operator who edits nothing writes nothing.
 *
 * A string carrying MORE than three parts keeps its tail inside the
 * relationship, for the same reason: `parse → compose` must be lossless.
 */
export function parseEmergencyContact(
  stored: string | null | undefined,
): EmergencyContactParts {
  /* ⛔ THE RAW STRING IS SPLIT UNTRIMMED, and that is load-bearing rather than
     sloppy. A composed contact with no name legitimately BEGINS with the
     separator (`" · 012-3456789 · Spouse"`); trimming the whole string first
     would eat that separator's leading space, the split would find one fewer
     boundary, and the phone would land in `name` — the exact defect this pair
     was fixed for. Emptiness is still judged on the trimmed string, and every
     PART is trimmed below, so nothing else changes. */
  const raw = stored ?? "";
  if (!raw.trim()) return { name: "", phone: "", relationship: "" };
  const parts = raw.split(EMERGENCY_SEPARATOR);
  return {
    name: (parts[0] ?? "").trim(),
    phone: (parts[1] ?? "").trim(),
    relationship: parts.slice(2).join(EMERGENCY_SEPARATOR).trim(),
  };
}

/** True when the relationship is one the picker offers; anything else is the
 *  free-text `Other` case. An empty relationship is neither. */
export function isKnownEmergencyRelationship(relationship: string): boolean {
  return (EMERGENCY_RELATIONSHIPS as readonly string[]).includes(relationship.trim());
}
