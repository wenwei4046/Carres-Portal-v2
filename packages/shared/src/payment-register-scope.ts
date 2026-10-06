/**
 * ONE ORDER'S MONEY, INSIDE THE ONE REGISTER — the entry-point correction,
 * 2026-09-09.
 *
 * The retired `/operation?tab=payments` desk answered "show me the money on
 * THIS order" by filtering itself to `?so=<SO No>`, and the Sales Order
 * Workspace's `Open this order in Payment` door was its only real caller. That
 * desk is gone (payment/MASTER.md §16 gives the act one home), so the scope
 * had to arrive with it or the door would have opened a list of every payment
 * Carres has ever taken and left the operator to find their order in it.
 *
 * The scope travels as `?order=<SO No>` — NOT `?so=`, which the Invoices
 * Register already spends on the §17 Calendar's highlighted order (a UUID, not
 * a number). Two meanings on one parameter is the collision that would have
 * been found in production.
 *
 * Both registers read the COMPLETE record set (`usePaymentRegister` /
 * `useInvoiceRegister` page until `total`, and a page that cannot be completed
 * is an error, never a shorter list), so scoping in the browser is exact — it
 * cannot hide a row that lives on a page nobody fetched.
 */

/** The order scope carried on a Register URL, or `null` for the whole list. */
export function orderScopeOf(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // An SO No is a positive integer. Anything else is not an order, and a
  // register that silently ignored it would show the whole list while the
  // URL still claimed a scope.
  if (!/^\d+$/.test(trimmed)) return null;
  const so = Number(trimmed);
  return Number.isSafeInteger(so) && so > 0 ? so : null;
}

/** Does this register row belong to the scoped order? */
export function inOrderScope(
  row: { orders?: { so: number } | null },
  scope: number | null,
): boolean {
  if (scope === null) return true;
  return row.orders?.so === scope;
}

/**
 * The sibling listing's href, carrying the scope across the toolbar's
 * `Payments · Invoices` switch. Losing the scope on the switch would make the
 * second listing answer a different question than the first.
 */
export function scopedRegisterHref(path: string, scope: number | null): string {
  return scope === null ? path : `${path}?order=${scope}`;
}
