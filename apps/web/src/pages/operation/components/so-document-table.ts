/**
 * THE SO PAGE'S ONE TABLE GRAMMAR — `Items` and `Payment` (owner approval,
 * Jess 2026-09-22, `docs/orders/MASTER.md` § "Order view" → PAYMENT: *"Items
 * and Payment share ONE table style"*).
 *
 * Measured 2026-09-23, the two tables disagreed on every axis the ruling
 * names: Items padded its cells 8/8/8/8 and ruled BELOW each row; Payment
 * padded 8/16/8/0, drew no rule under its header and ruled ABOVE each row.
 * Written once here and imported by both, so the next change moves both.
 *
 * This is an OBJECT-DETAIL table, not a Register grid: rows keep their natural
 * height so a configuration line, a voided reason or a receipt number under
 * the main value is never clipped. The Register row-height law
 * (`ui/MASTER.md` REGISTER TABLE DENSITY LAW) governs listings and does not
 * reach here.
 *
 *   header   `text-label` 11/500/14 over a 1px rule
 *   cells    `text-body` 13/400/18 · 8px each side (token `2`) · top-aligned
 *   rows     divided by a 1px rule beneath
 *   amounts  right-aligned · `tabular-nums` · never wrap
 */
export const SO_TABLE = "w-full border-collapse text-body";
export const SO_HEAD_ROW = "border-b border-kit-slate-5";
export const SO_TH = "px-2 py-2 text-label text-base-500 align-bottom";
export const SO_ROW = "border-b border-kit-slate-5";
export const SO_TD = "px-2 py-2 align-top";
export const SO_AMOUNT = "whitespace-nowrap text-right tabular-nums";
