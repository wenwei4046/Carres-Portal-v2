import { describe, it, expect } from "vitest";
import { moneyMoveActions, moneyMoveGross, moneyMoveInput, moveAccounts } from "./money-moves";
import type { MoneyAccountRow } from "./money-accounts";

const rows: MoneyAccountRow[] = [
  { code: "1110", name: "Cash", money_kind: "CASH", is_active: true },
  { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
  { code: "1123", name: "Hong Leong", money_kind: "BANK", is_active: true },
  { code: "1124", name: "RHB", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];
const codes = (r: MoneyAccountRow[]) => r.map((a) => a.code);
const good = {
  kind: "CARD_PAYOUT",
  move_date: "2026-09-17",
  from_account_code: "1131",
  to_account_code: "1123",
  amount: 97.5,
  fee: 2.5,
  idempotency_key: "11111111-1111-4111-8111-111111111111",
};

describe("money moves", () => {
  it("a transfer offers cash and banks in use on both sides", () => {
    expect(codes(moveAccounts("TRANSFER", "from", rows))).toEqual(["1110", "1121", "1123"]);
    expect(codes(moveAccounts("TRANSFER", "to", rows))).toEqual(["1110", "1121", "1123"]);
  });

  it("a card payout comes from a holding account and goes to a bank", () => {
    expect(codes(moveAccounts("CARD_PAYOUT", "from", rows))).toEqual(["1131"]);
    expect(codes(moveAccounts("CARD_PAYOUT", "to", rows))).toEqual(["1121", "1123"]);
  });

  it("gross is amount plus fee, in sen", () => {
    expect(moneyMoveGross(0.1, 0.2)).toBe(0.3);
    expect(moneyMoveGross(97.5, 2.5)).toBe(100);
  });

  it("the input refuses a fee on a transfer, one account twice and a third decimal", () => {
    expect(moneyMoveInput.safeParse(good).success).toBe(true);
    expect(moneyMoveInput.safeParse({ ...good, kind: "TRANSFER" }).success).toBe(false);
    expect(moneyMoveInput.safeParse({ ...good, to_account_code: "1131" }).success).toBe(false);
    expect(moneyMoveInput.safeParse({ ...good, fee: 0.001 }).success).toBe(false);
    expect(moneyMoveInput.safeParse({ ...good, fee: -1 }).success).toBe(false);
    expect(moneyMoveInput.parse({ ...good, kind: "TRANSFER", fee: undefined }).fee).toBe(0);
  });

  it("offers Approve only to another approver, and Cancel on a posted move only to the approver", () => {
    expect(moneyMoveActions({ status: "prepared", prepared_by_me: false }, true)).toEqual({ approve: true, cancel: true });
    expect(moneyMoveActions({ status: "prepared", prepared_by_me: true }, true)).toEqual({ approve: false, cancel: true });
    expect(moneyMoveActions({ status: "prepared", prepared_by_me: false }, false)).toEqual({ approve: false, cancel: true });
    expect(moneyMoveActions({ status: "approved", prepared_by_me: false }, false)).toEqual({ approve: false, cancel: false });
    expect(moneyMoveActions({ status: "approved", prepared_by_me: true }, true)).toEqual({ approve: false, cancel: true });
    expect(moneyMoveActions({ status: "reversed", prepared_by_me: false }, true)).toEqual({ approve: false, cancel: false });
  });
});
