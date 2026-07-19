/**
 * Dealer vs Showroom — the ONE place this naming rule lives (Loo 2026-07-19).
 *
 *   Showroom = a store Carres owns and runs itself.
 *   Dealer   = an external reseller.
 *
 * Both are rows in the `dealers` table, told apart by `dealers.channel`
 * ('dealer' | 'showroom'). Loo's rule for what we call the branches under
 * each:
 *
 *   "我们自己开的叫做 showroom，如果 dealer（经销商）开的话叫做 outlet"
 *
 * i.e. a branch under an external dealer is an OUTLET; a branch under one of
 * our own stores is a SHOWROOM. Every user-facing label reads it from here so
 * the rule can never drift between the HQ list, the POS pickers and the
 * store-side staff screens.
 */

export type StoreChannel = "dealer" | "showroom";

/** True only for Carres' own stores. Anything unknown/absent is a dealer,
 *  matching the `dealers.channel` column default. */
export function isShowroom(channel: string | null | undefined): boolean {
  return channel === "showroom";
}

/** What we call the account itself — "Dealer" or "Showroom". */
export function storeNoun(channel: string | null | undefined): "Dealer" | "Showroom" {
  return isShowroom(channel) ? "Showroom" : "Dealer";
}

/** What we call one physical branch under the account — "Outlet" or "Showroom". */
export function branchNoun(channel: string | null | undefined): "Outlet" | "Showroom" {
  return isShowroom(channel) ? "Showroom" : "Outlet";
}
