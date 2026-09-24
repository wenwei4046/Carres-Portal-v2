import { describe, expect, it } from "vitest";
import { dayFee, dayMayApprove, parseCardFile } from "./card-settlement";
import { ghlFile, maybankFile, pbbFile } from "./__fixtures__/card-settlement-files";

const sale = { sett: "02092026", trans: "01092026", amt: "100.00", net: "99.00", mid: "900000000001", tid: "90000001", code: "A1B2C3", trace: "000101" };

describe("parseCardFile — Public Bank", () => {
  it("keeps the whole line and every column", () => {
    const text = pbbFile([sale, { ...sale, amt: "2,500.00", net: "2,475.00", code: "Z9Y8X7", trace: "000102" }]);
    const r = parseCardFile("PBB", text);
    if (!r.ok) throw new Error(r.message);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      line_no: 2, txn_date: "2026-09-01", payout_date: "2026-09-02", merchant_id: "900000000001",
      terminal_id: "90000001", approval_code: "A1B2C3", card_no: "400000XXXXXX0001", amount: 100, net_amount: 99,
    });
    expect(r.rows[1].amount).toBe(2500);
    expect(r.rows[0].raw_line).toBe(text.split("\r\n")[1]);
    expect(Object.keys(r.rows[0].fields)).toHaveLength(21);
    expect(r.rows[0].fields.DBA).toBe("TEST SHOP");
  });

  it("refuses a row that is not a purchase", () => {
    const r = parseCardFile("PBB", pbbFile([sale, { ...sale, status: "REFUND" }]));
    expect(r).toEqual({ ok: false, message: "Row 3 is a refund, void or chargeback. Carres does not import these until their sign is confirmed on a real one." });
  });

  it("refuses a negative amount even when the status says purchase", () => {
    const r = parseCardFile("PBB", pbbFile([{ ...sale, amt: "-100.00" }]));
    expect(r.ok).toBe(false);
  });

  it("refuses another card company's file", () => {
    const r = parseCardFile("PBB", ghlFile([{ at: "2026-09-01 10:00:00.0", amount: "1.00", fee: "0.01", net: "0.99", tid: "T1", txId: "1" }]));
    expect(r).toEqual({ ok: false, message: "This is not a Public Bank settlement file. Check the card company and the file." });
  });
});

describe("parseCardFile — GHL", () => {
  it("reads the date, terminal, amount and net; no approval code", () => {
    const r = parseCardFile("GHL", ghlFile([{ at: "2026-09-03 14:05:11.0", amount: "300.0000", fee: "3.9000", net: "296.1000", tid: "TESTTERM01", txId: "5001" }]));
    if (!r.ok) throw new Error(r.message);
    expect(r.rows[0]).toMatchObject({ txn_date: "2026-09-03", payout_date: null, terminal_id: "TESTTERM01", approval_code: null, amount: 300, net_amount: 296.1 });
  });

  it("takes the paid-out date from the statement date in the file name, never from the sale date", () => {
    const text = ghlFile([{ at: "2026-09-16 14:05:11.0", amount: "300.00", fee: "3.90", net: "296.10", tid: "T1", txId: "5001" }]);
    const named = parseCardFile("GHL", text, "StatementOfAccountDetails2026-09-17_149125.csv");
    if (!named.ok) throw new Error(named.message);
    expect(named.rows[0]).toMatchObject({ txn_date: "2026-09-16", payout_date: "2026-09-17" });
    const renamed = parseCardFile("GHL", text, "ghl.csv");
    if (!renamed.ok) throw new Error(renamed.message);
    expect(renamed.rows[0].payout_date).toBeNull();
    const impossible = parseCardFile("GHL", text, "StatementOfAccountDetails2026-02-30_1.csv");
    if (!impossible.ok) throw new Error(impossible.message);
    expect(impossible.rows[0].payout_date).toBeNull();
  });

  it("refuses anything but a payment", () => {
    const r = parseCardFile("GHL", ghlFile([{ at: "2026-09-03 14:05:11.0", amount: "300.00", fee: "0", net: "300.00", tid: "T1", txId: "1", code: "REFUND" }]));
    expect(r).toEqual({ ok: false, message: "Row 2 is a refund, void or chargeback. Carres does not import these until their sign is confirmed on a real one." });
  });
});

describe("parseCardFile — Maybank T41", () => {
  const base = {
    merchant: "900000000009", reportDate: "05/09/26",
    sales: [
      { amount: "150.00", date: "04/09/26", code: "M1N2P3", tid: "90000009", ref: "600000000001" },
      { amount: "50.00", date: "04/09/26", code: "Q4R5S6", tid: "90000009", ref: "600000000002" },
    ],
    gross: "200.00", fee: "2.00", net: "198.00",
  };

  it("reads the sales and the payout printed once for the merchant", () => {
    const r = parseCardFile("MAYBANK", maybankFile(base));
    if (!r.ok) throw new Error(r.message);
    expect(r.published).toEqual({ merchant_id: "900000000009", report_date: "2026-09-05", gross: 200, fee: 2, net: 198 });
    expect(r.rows.map((x) => [x.approval_code, x.amount, x.txn_date, x.payout_date, x.net_amount])).toEqual([
      ["M1N2P3", 150, "2026-09-04", "2026-09-05", null],
      ["Q4R5S6", 50, "2026-09-04", "2026-09-05", null],
    ]);
    expect(r.rows[0].fields["Reference No"]).toBe("600000000001");
  });

  it("refuses a file with credits", () => {
    expect(parseCardFile("MAYBANK", maybankFile({ ...base, credit: "10.00" }))).toEqual({
      ok: false, message: "This file has refunds or adjustments. Carres does not import these until their sign is confirmed on a real one.",
    });
  });

  it("refuses a file with items withheld", () => {
    expect(parseCardFile("MAYBANK", maybankFile({ ...base, withheld: "5.00" })).ok).toBe(false);
  });

  it("refuses totals that do not add up", () => {
    expect(parseCardFile("MAYBANK", maybankFile({ ...base, gross: "210.00", net: "208.00" }))).toEqual({
      ok: false, message: "The file's totals do not add up. Import the file as it came from the card company.",
    });
    expect(parseCardFile("MAYBANK", maybankFile({ ...base, net: "197.00" })).ok).toBe(false);
  });

  it("refuses a negative sale", () => {
    const r = parseCardFile("MAYBANK", maybankFile({ ...base, sales: [{ ...base.sales[0], amount: "-150.00" }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^Row 15 is a refund/);
  });

  it("refuses a Public Bank file chosen as Maybank", () => {
    expect(parseCardFile("MAYBANK", pbbFile([sale]))).toEqual({
      ok: false, message: "This is not a Maybank settlement file. Check the card company and the file.",
    });
  });
});

describe("day helpers", () => {
  const day = { acquirer: "PBB" as const, day_date: "2026-09-02", payout_date: "2026-09-02", group_key: "k", row_count: 2, matched_count: 2, gross: 2600, net: 2574.01, recorded: 2600, reference: "r", payout_status: null, payout_move_no: null, holding_codes: [], unlinked_payouts: [] };
  it("a day may fill the payout form only when every row is matched and no payout exists", () => {
    expect(dayMayApprove(day)).toBe(true);
    expect(dayMayApprove({ ...day, matched_count: 1 })).toBe(false);
    expect(dayMayApprove({ ...day, payout_status: "prepared" })).toBe(false);
  });
  it("the fee is gross less net, in whole sen", () => {
    expect(dayFee(day)).toBe(25.99);
  });
});
