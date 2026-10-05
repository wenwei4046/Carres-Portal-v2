import { phoneKey, phoneKeyMy } from "@carres/shared";

/* ⭐ FIND AN ORDER BY THE PHONE THE CUSTOMER GIVES (Orders MASTER §0 Charter:
   when a customer calls, the Register's first job is finding their orders).

   Stored phones are typed by people, so one number lives in several shapes:
   `019-83372393`, `0123456789`, `123456789` (trunk 0 dropped), `+60123456789`,
   `012-3456789/013-9876543`. A PostgREST filter cannot compare digits, and this
   needs no migration: the read below narrows on the server with a pattern that
   can only widen the answer, and the Worker decides the match on DIGITS.

   ONE arithmetic for "the same number" (Law D): the shared `phoneKeyMy` — the
   MY-aware key the voucher binding already uses — on BOTH sides, so a leading
   `60` country code and a leading `0` trunk read the same. */

/** E.164 caps a phone number at 15 digits; 8 is the shortest number the
 *  customer-type probe accepts. */
const PHONE_DIGITS = /^\d{8,15}$/;
/** The shortest national core an 8-digit typed number leaves after its trunk
 *  `0` (`0123 4567` → `1234567`). A shorter key — `60` stripped from a middle
 *  fragment such as `60123456` — is compared by its typed digits only, so a
 *  fragment never widens into an unrelated customer's number. */
const KEY_DIGITS_MIN = 7;

/** The digits of a search term that is a phone number, or `null`. Spaces,
 *  dashes and brackets are separators and a leading `+` is the international
 *  prefix; any other character means the term is not a phone. */
export function phoneSearchDigits(term: string): string | null {
  const bare = term.trim().replace(/[\s()-]/g, "").replace(/^\+/, "");
  return PHONE_DIGITS.test(bare) ? bare : null;
}

function termKey(digits: string): string | null {
  const key = phoneKeyMy(digits);
  return key.length >= KEY_DIGITS_MIN ? key : null;
}

/** Does this stored phone carry the typed number? Typed digits inside the
 *  stored digits, or the typed national core inside the stored national core. */
export function phoneMatches(stored: string | null | undefined, digits: string): boolean {
  if (!stored) return false;
  if (phoneKey(stored).includes(digits)) return true;
  const key = termKey(digits);
  return key !== null && phoneKeyMy(stored).includes(key);
}

/** An ILIKE pattern every matching stored phone satisfies: the digits that
 *  must appear, in order, with anything between them. It may admit a phone
 *  that does not match (`phoneMatches` decides); it never excludes one that
 *  does — the national core is a suffix of the typed digits, and both cores
 *  are suffixes of their own digits. */
export function phoneSearchPattern(digits: string): string {
  const core = termKey(digits) ?? digits;
  return `%${core.split("").join("%")}%`;
}

const PAGE = 1000;
type PhoneRow = { id: string; customer_phone: string | null };

/** The ids of the orders whose phone carries the typed number. `readPage`
 *  is the caller's own RLS read over its own population; a failed read
 *  THROWS — an unread phone is not "no match". */
export async function findOrdersByPhone(
  readPage: (
    pattern: string,
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  digits: string,
): Promise<string[]> {
  const pattern = phoneSearchPattern(digits);
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await readPage(pattern, from, from + PAGE - 1);
    if (error) throw error;
    if (!data) throw new Error("Phone numbers could not be read.");
    for (const row of data as PhoneRow[]) if (phoneMatches(row.customer_phone, digits)) ids.add(row.id);
    if (data.length < PAGE) break;
  }
  return [...ids];
}
