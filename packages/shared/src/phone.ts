// ----------------------------------------------------------------------------
// Phone canonicalization — the SHARED identity helpers for same-customer / voucher
// binding comparisons. PURE (no I/O). Two consumers, one source of truth:
//   - `phoneKey` — the legacy digits-only key (the loose identity the delivery
//     follow-up + free-gift no-funding guards already use). Behaviour-identical to
//     the private const that lived in `apps/api/src/lib/delivery-fee-recompute.ts`;
//     promoted here so the order-path libs can import ONE copy.
//   - `phoneKeyMy` — the MY-aware key the P8d cross-order voucher binding needs.
//     A returning customer who gives `012…` on one order and `+6012…` on the next
//     must canonicalize to the SAME key, or a legitimate redemption silently
//     bounces. Strips a leading 60 (country code) then leading 0s (domestic trunk)
//     so 012-345 6789 / 0123456789 / +60 12-345 6789 / 60123456789 all map to the
//     same national core (123456789). A non-MY / unrecognized shape falls back to
//     the digit string unchanged.
//
// The migration ships a SQL twin `public.pwp_phone_key(text)` (0188) used inside
// the cross-order claim RPC + the carry-forward sweep; a cross-test in
// `phone.test.ts` asserts `phoneKeyMy` (JS) === `pwp_phone_key` (SQL) over a
// representative set, so mint and redeem normalize identically on both sides.
// ----------------------------------------------------------------------------

/** Digits-only phone key for the loose same-customer comparison. An empty result
 *  means "no usable phone". Legacy behaviour — unchanged. */
export const phoneKey = (p: string | null | undefined): string =>
  (p ?? "").replace(/\D/g, "");

/** MY-aware canonical phone: digits-only, then strip a leading `60` (country
 *  code) followed by leading `0`s (domestic trunk), so 012-345 6789,
 *  0123456789, +60 12-345 6789 and 60123456789 all canonicalize to the SAME
 *  national core (123456789). A non-MY / unrecognized shape falls back to the
 *  digit string unchanged. Pure + deterministic; the SQL twin
 *  `public.pwp_phone_key` (migration 0188) MUST produce byte-identical output
 *  (a cross-test in phone.test.ts asserts agreement). */
export const phoneKeyMy = (p: string | null | undefined): string => {
  let d = (p ?? "").replace(/\D/g, ""); // digits only
  d = d.replace(/^60/, ""); // drop a leading 60 (country code)
  d = d.replace(/^0+/, ""); // drop leading 0s (domestic trunk)
  return d;
};
