/**
 * The one list of money accounts (migration 0512): cash, each real bank, and
 * the holding account of each card or online payment company, set by Finance
 * on Finance → Settings.
 *
 *   · Paid from (money out) takes CASH or BANK.
 *   · Received into (money in) takes CASH, BANK or HOLDING.
 *
 * The database (`gl_money_account_ok`) refuses the wrong kind; these helpers
 * only keep the pickers to the same rule.
 *
 * PURE — no clock, no I/O.
 */
import { z } from "zod";

export const MONEY_ACCOUNT_KINDS = ["CASH", "BANK", "HOLDING"] as const;
export type MoneyAccountKind = (typeof MONEY_ACCOUNT_KINDS)[number];

/** One row of `gl_money_accounts_list()`. */
export interface MoneyAccountRow {
  code: string;
  name: string;
  money_kind: MoneyAccountKind;
  is_active: boolean;
}

/** The kind as the page says it, in COPY-STANDARD's pay-method words:
 *  the money arrives as cash, by bank transfer, or as an online payment. No
 *  kind has a word of its own in the standard yet. The database's check
 *  constraint keeps the kind to these three. */
export const MONEY_ACCOUNT_KIND_WORD: Record<MoneyAccountKind, string> = {
  CASH: "Cash",
  BANK: "Bank transfer",
  HOLDING: "Online payment",
};

/** May money leave from this account (a voucher's Paid from)? */
export function paysOut(a: MoneyAccountRow): boolean {
  return a.is_active && (a.money_kind === "CASH" || a.money_kind === "BANK");
}

/** May money come into this account (Received into)? */
export function takesIn(a: MoneyAccountRow): boolean {
  return a.is_active;
}

const accountName = z
  .string()
  .trim()
  .min(1, "Type the account name.")
  .max(60, "Keep the name to 60 characters.");

/** Add: Finance names it and says bank or holding; the database picks the code. */
export const moneyAccountAddInput = z.object({
  name: accountName,
  kind: z.enum(["BANK", "HOLDING"], {
    errorMap: () => ({ message: "Choose the kind: a bank, or an online payment company." }),
  }),
});
export type MoneyAccountAddInput = z.infer<typeof moneyAccountAddInput>;

/** Rename, and take in or out of use. */
export const moneyAccountUpdateInput = z.object({
  name: accountName,
  is_active: z.boolean(),
});
export type MoneyAccountUpdateInput = z.infer<typeof moneyAccountUpdateInput>;

/** 0541 — where a card machine sits: the place its money is routed by. */
export const CARD_CHANNELS = ["showroom", "dealer"] as const;
export type CardChannel = (typeof CARD_CHANNELS)[number];

/** One row of `card_settlement_routes`: a holding account pays out to a bank. */
export interface CardRouteRow {
  holding_code: string;
  channel: CardChannel;
  bank_code: string;
}

export const cardRouteInput = z.object({
  holding_code: z.string().regex(/^\d{4}$/, "Choose the card account."),
  channel: z.enum(CARD_CHANNELS, { errorMap: () => ({ message: "Choose showroom or dealer." }) }),
  bank_code: z.string().regex(/^\d{4}$/, "Choose the bank."),
});
export type CardRouteInput = z.infer<typeof cardRouteInput>;

/** The bank a card payout defaults to. With the place chosen, that route;
 *  without it, the one bank every route of this holding agrees on. */
export function settlementBank(routes: CardRouteRow[], holding: string | undefined, channel?: CardChannel): string | undefined {
  const mine = routes.filter((r) => r.holding_code === holding && (!channel || r.channel === channel));
  const banks = new Set(mine.map((r) => r.bank_code));
  return banks.size === 1 ? mine[0]!.bank_code : undefined;
}
