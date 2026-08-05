/**
 * C11 · What a money figure looks like (Loo's ruling, 2026-07-28).
 *
 * ONE spelling for a ringgit amount, and it is the whole rule:
 *
 *     RM 1,250.50      — the marker, a space, thousands separators, TWO decimals
 *
 * **Two decimals, always.** Loo, 2026-07-28: *"收款金额必须与实际应收金额一致，
 * 不允许为了视觉统一改变金额显示"* — the figure on a collect action is the money
 * owed, to the cent, and it may not be re-shaped to match a neighbour. A rounded
 * `RM 1,251` against a ledger holding RM 1,250.50 is a figure nobody can act on:
 * the operator asks for the wrong number and the receipt disagrees with the
 * screen.
 *
 * **Why this lives in `packages/shared` and takes a NUMBER.** The bug this file
 * closes was not five careless call sites — it was a `string` parameter.
 * `order-action-words` owned the `RM ` prefix and asked its callers for the
 * digits, so "already prefixed" and "already rounded" were both things a caller
 * could hand it, and one caller did each. A number cannot be pre-formatted, so
 * the failure stops being a thing anybody can express. See
 * `OrderActionParties.amount`.
 *
 * `apps/web/src/lib/format-currency.ts` re-exports this rather than carrying a
 * second body: one concern, one file. A test pins the two together.
 *
 * NOT for prices. This is the spelling of an amount of money the portal states
 * as a fact — what is owed, what was paid. Catalog prices, combo savings and the
 * `Money` display component are their own recipes and are deliberately untouched.
 *
 * PURE — no clock, no I/O. The locale is `en-MY`, which is the portal's only one.
 */

/**
 * `1250.5` → `"RM 1,250.50"`.
 *
 * A non-finite input reads as zero rather than printing `RM NaN` on a screen an
 * operator is about to phone a customer from.
 */
export function fmtMoney(n: number): string {
  const v = Number(n);
  return `RM ${(Number.isFinite(v) ? v : 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
