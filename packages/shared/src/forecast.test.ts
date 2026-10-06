import { describe, expect, it } from "vitest";
import {
  amountShare,
  copyPlan,
  forecastQuery,
  forecastReport,
  forecastSaveInput,
  readTypedAmount,
  readTypedShare,
  shareAmount,
  shareWord,
  type ForecastAccount,
} from "./forecast";

const acc = (code: string, block: ForecastAccount["block"], over: Partial<ForecastAccount> = {}): ForecastAccount => ({
  code, name: `Account ${code}`, kind: block === "income" ? "INCOME" : "EXPENSE", active: true, block, ...over,
});
const CHART = [
  acc("4100", "income"), acc("4900", "income"),
  acc("5100", "cost"),
  acc("6100", "expense"), acc("6200", "expense"),
];

describe("the Forecast", () => {
  it("takes a share of the planned income, and reads an amount as its share", () => {
    const r = forecastReport(CHART, {
      "4100": { amount: 100000 }, "4900": { amount: 2000 },
      "5100": { share: 5500 },            // 55% of RM 102,000
      "6100": { amount: 8000 },           // fixed rent
    }, null);
    expect(r.basis).toBe(10200000);
    expect(r.lines.map((l) => [l.account.code, l.plan, l.share])).toEqual([
      ["4100", 10000000, 9804],
      ["4900", 200000, 196],
      ["5100", 5610000, 5500],
      ["6100", 800000, 784],
      ["6200", null, null],
    ]);
    expect(r.blocks.income).toMatchObject({ plan: 10200000, share: 10000 });
    expect(r.gross).toMatchObject({ plan: 4590000, share: 4500 });
    expect(r.net).toMatchObject({ plan: 3790000, share: 3716, actual: null, difference: null });
  });

  it("rounds half away from zero, to the sen and to the basis point", () => {
    expect(shareAmount(333, 5000)).toBe(167);       // 166.5 → 167
    expect(shareAmount(-333, 5000)).toBe(-167);
    expect(amountShare(1, 3)).toBe(3333);
    expect(amountShare(2, 3)).toBe(6667);
    expect(amountShare(5, 0)).toBeNull();
    // Exact where a float would not be: RM 99,999,999.99 at 9,999.99%.
    expect(shareAmount(9999999999, 999999)).toBe(999998999900); // 999,998,999,900.0001
  });

  it("with no income planned, a share plans nothing and an amount has no share", () => {
    const r = forecastReport(CHART, { "5100": { share: 5500 }, "6100": { amount: 8000 } }, null);
    expect(r.lines.find((l) => l.account.code === "5100")).toMatchObject({ plan: 0, share: 5500 });
    expect(r.lines.find((l) => l.account.code === "6100")).toMatchObject({ plan: 800000, share: null });
    expect(r.net).toMatchObject({ plan: -800000, share: null });
  });

  it("sets the month's actual beside the plan, and refuses an actual that does not add up to its net", () => {
    const actual = {
      lines: [
        { code: "4100", name: "Furniture sales", kind: "INCOME", amount: 90000 },
        { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", amount: 52000.5 },
        { code: "6200", name: "Rent", kind: "EXPENSE", amount: 1000 },
      ],
      net: 36999.5,
    };
    const r = forecastReport(CHART, { "4100": { amount: 100000 }, "5100": { share: 5500 } }, actual);
    expect(r.lines.map((l) => [l.account.code, l.actual, l.difference])).toEqual([
      ["4100", 9000000, -1000000],
      ["4900", 0, 0],
      ["5100", 5200050, -299950],
      ["6100", 0, 0],
      ["6200", 100000, 100000],      // nothing planned: the whole actual is the difference
    ]);
    expect(r.gross).toMatchObject({ plan: 4500000, actual: 3799950, difference: -700050 });
    expect(r.net).toMatchObject({ plan: 4500000, actual: 3699950, difference: -800050 });
    expect(() => forecastReport(CHART, {}, { ...actual, net: 37000 })).toThrow("could not be read");
  });

  it("shows a retired account only with a plan or an actual, and keeps an actual on an account it does not list", () => {
    const chart = [...CHART, acc("6300", "expense", { active: false }), acc("6400", "expense", { active: false })];
    const r = forecastReport(chart, { "6300": { amount: 50 } }, {
      lines: [{ code: "6950", name: "Old heading", kind: "EXPENSE", amount: 10 }, { code: "4950", name: "Old income", kind: "INCOME", amount: 30 }],
      net: 20,
    });
    expect(r.lines.map((l) => l.account.code)).toEqual(["4100", "4900", "4950", "5100", "6100", "6200", "6300", "6950"]);
    expect(r.blocks.expense.actual).toBe(1000);
    expect(r.net.actual).toBe(2000);
  });

  it("gives no line to an account at RM 0.00 that it does not list, or to a retired one", () => {
    const chart = [...CHART, acc("6400", "expense", { active: false })];
    const r = forecastReport(chart, {}, {
      lines: [
        { code: "4000", name: "Income", kind: "INCOME", amount: 0 },
        { code: "6400", name: "Retired", kind: "EXPENSE", amount: 0 },
        { code: "4100", name: "Furniture sales", kind: "INCOME", amount: 0 },
      ],
      net: 0,
    });
    expect(r.lines.map((l) => [l.account.code, l.actual])).toEqual([["4100", 0], ["4900", 0], ["5100", 0], ["6100", 0], ["6200", 0]]);
  });

  it("refuses a plan it cannot read: an unknown account, a share on income, a broken cell", () => {
    expect(() => forecastReport(CHART, { "7777": { amount: 1 } }, null)).toThrow();
    expect(() => forecastReport(CHART, { "4100": { share: 100 } }, null)).toThrow();
    expect(() => forecastReport(CHART, { "6100": { amount: 1, share: 2 } }, null)).toThrow();
    expect(() => forecastReport(CHART, { "6100": { share: 1.5 } }, null)).toThrow();
    expect(() => forecastReport(CHART, { "6100": { amount: "12.345.6" } }, null)).toThrow();
    // The database sends numeric as a JSON number; a decimal string still reads.
    expect(forecastReport(CHART, { "6100": { amount: "12.30" } }, null).lines[3]!.plan).toBe(1230);
  });

  it("copies an earlier plan into the accounts left blank, never over a typed cell", () => {
    const chart = [...CHART, acc("6300", "expense", { active: false })];
    const out = copyPlan(chart, { "4100": { amount: 5 } }, {
      "4100": { amount: 100000 }, "5100": { share: 5500 }, "6100": { amount: 8000 }, "6300": { amount: 1 },
    });
    expect(out).toEqual({ "4100": { amount: 5 }, "5100": { share: 5500 }, "6100": { amount: 8000 } });
  });

  it("reads what the operator typed, and says what is wrong", () => {
    expect(readTypedAmount("  ")).toBeNull();
    expect(readTypedAmount("12,500.5")).toEqual({ ok: true, value: 12500.5 });
    expect(readTypedAmount("-300")).toEqual({ ok: true, value: -300 });
    expect(readTypedAmount("1.234")).toEqual({ ok: false, words: "Type the amount in ringgit and sen." });
    expect(readTypedAmount("RM 5")).toMatchObject({ ok: false });
    expect(readTypedShare("12.5%")).toEqual({ ok: true, value: 1250 });
    expect(readTypedShare("0")).toEqual({ ok: true, value: 0 });
    expect(readTypedShare("-1")).toEqual({ ok: false, words: "A share is 0% or more, to two decimals." });
    expect(readTypedShare("10000.01")).toMatchObject({ ok: false });
    expect(shareWord(1250)).toBe("12.50%");
    expect(shareWord(null)).toBe("");
  });

  it("checks the month and the save as the database does", () => {
    expect(forecastQuery.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(forecastQuery.safeParse({ month: "2026-10" }).success).toBe(true);
    const ok = forecastSaveInput.parse({
      lines: { "4100": { amount: 0.1 + 0.2 }, "5100": { share: 5500 }, "100-0001": { amount: 3 } },
      was: "2026-10-03T08:15:00.123456+00:00",
    });
    expect(JSON.stringify(ok.lines["4100"])).toBe('{"amount":0.3}');
    expect(forecastSaveInput.safeParse({ lines: { "6100": { amount: 1.234 } }, was: null }).success).toBe(false);
    expect(forecastSaveInput.safeParse({ lines: { "6100": { share: 12.5 } }, was: null }).success).toBe(false);
    expect(forecastSaveInput.safeParse({ lines: { "6100": { amount: 1, share: 1 } }, was: null }).success).toBe(false);
    expect(forecastSaveInput.safeParse({ lines: { "61": { amount: 1 } }, was: null }).success).toBe(false);
    expect(forecastSaveInput.safeParse({ lines: {}, was: "yesterday" }).success).toBe(false);
  });
});
