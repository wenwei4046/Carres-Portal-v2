import { describe, expect, it } from "vitest";
import { generalLedgerBlocks, generalLedgerQuery, type GeneralLedgerAnswer, type GeneralLedgerWireRow } from "./general-ledger";

const row = (over: Partial<GeneralLedgerWireRow>): GeneralLedgerWireRow => ({
  row_kind: "LINE", account_code: "1121", account_name: "Public Bank", kind: "ASSET",
  entry_date: "2026-10-02", entry_no: "JE-202610-0001", source_type: "CUSTOMER_PAYMENT", source_doc_no: "OR-1",
  narration: "Payment", memo: null, debit: 0, credit: 0, running_balance: 0, ...over,
});

const answer = (rows: GeneralLedgerWireRow[], code = "1121"): GeneralLedgerAnswer => ({
  status: "OK", go_live_on: "2026-09-01", from: "2026-10-01", to: "2026-10-31",
  accounts: [{ account_code: code, rows }],
});

const BANK = [
  row({ row_kind: "OPENING", entry_date: null, entry_no: null, source_type: null, source_doc_no: null, debit: null, credit: null, running_balance: "1000.00" }),
  row({ debit: "250.50", running_balance: "1250.50" }),
  row({ entry_no: "JE-202610-0002", memo: "Bank charge", credit: "0.50", running_balance: "1250.00" }),
  row({ row_kind: "CLOSING", entry_date: null, entry_no: null, source_type: null, source_doc_no: null, debit: null, credit: null, running_balance: "1250.00" }),
];

describe("General Ledger (0639, Chew 2026-10-03)", () => {
  it("reads one block per account: brought forward, the lines with their balance, the totals and the end", () => {
    const [b] = generalLedgerBlocks(answer(BANK));
    expect(b).toMatchObject({ code: "1121", name: "Public Bank", kind: "ASSET", opening: 1000, totalDebit: 250.5, totalCredit: 0.5, closing: 1250 });
    expect(b!.lines.map((l) => [l.entryNo, l.balance, l.description])).toEqual([
      ["JE-202610-0001", 1250.5, "Payment"],
      ["JE-202610-0002", 1250, "Bank charge"],
    ]);
  });

  it("a credit account's balance grows with its credits", () => {
    const [b] = generalLedgerBlocks(answer([
      row({ row_kind: "OPENING", kind: "LIABILITY", account_code: "2110", account_name: "Trade payables", debit: null, credit: null, running_balance: 0 }),
      row({ kind: "LIABILITY", account_code: "2110", account_name: "Trade payables", credit: 900, running_balance: 900 }),
      row({ kind: "LIABILITY", account_code: "2110", account_name: "Trade payables", debit: 400, running_balance: 500 }),
      row({ row_kind: "CLOSING", kind: "LIABILITY", account_code: "2110", account_name: "Trade payables", debit: null, credit: null, running_balance: 500 }),
    ], "2110"));
    expect(b).toMatchObject({ opening: 0, totalDebit: 400, totalCredit: 900, closing: 500 });
  });

  it("refuses a block whose running balance does not follow its lines", () => {
    const broken = BANK.map((r) => ({ ...r }));
    broken[2]!.running_balance = "1250.01";
    expect(() => generalLedgerBlocks(answer(broken))).toThrow("The General Ledger could not be read.");
  });

  it("refuses a closing that is not the last balance, and a block with no opening", () => {
    const badClose = BANK.map((r) => ({ ...r }));
    badClose[3]!.running_balance = "1300.00";
    expect(() => generalLedgerBlocks(answer(badClose))).toThrow();
    expect(() => generalLedgerBlocks(answer(BANK.slice(1)))).toThrow();
  });

  it("a period before the ledger started has no blocks", () => {
    expect(generalLedgerBlocks({ ...answer(BANK), status: "BEFORE_GO_LIVE", accounts: [] })).toEqual([]);
  });

  it("asks for a period that runs forward, and accounts from the chart", () => {
    expect(generalLedgerQuery.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(generalLedgerQuery.safeParse({ from: "2026-10-01", to: "2026-10-31", accounts: "1121,2110" }).success).toBe(true);
    expect(generalLedgerQuery.safeParse({ from: "2026-10-31", to: "2026-10-01" }).success).toBe(false);
    expect(generalLedgerQuery.safeParse({ from: "2026-10-01", to: "2026-10-31", accounts: "1121;drop" }).success).toBe(false);
    expect(generalLedgerQuery.safeParse({ from: "2026-10-01", to: "2026-10-31", departmentId: "11111111-1111-4111-8111-111111111111" }).success).toBe(false);
  });
});
