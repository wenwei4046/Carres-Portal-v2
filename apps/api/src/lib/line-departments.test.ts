import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepByDepartment } from "./line-departments";

/**
 * A stand-in for the supabase client that behaves like PostgREST: it answers
 * at most 1000 rows per `.range()`, and it records every range it was asked
 * for. That is the whole bug — the first version of `keepByDepartment` never
 * called `.range()` at all, so it saw the first 1000 rows and no more.
 *
 * There is no PostgREST in front of the local cluster, so the 1000-row
 * ceiling cannot be proved against a real database here. It is faked.
 */
const BILL_LINES = { table: "supplier_bill_lines", parent: "bill_id" } as const;

function pagedClient(total: number, parentOf: (i: number) => string, error: { code?: string; message?: string } | null = null) {
  const ranges: Array<[number, number]> = [];
  const eqs: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, v: unknown) => { eqs.push([col, v]); return chain; };
  chain.order = () => chain;
  chain.range = (from: number, to: number) => {
    ranges.push([from, to]);
    if (error) return Promise.resolve({ data: null, error });
    const data: Array<Record<string, unknown>> = [];
    for (let i = from; i <= Math.min(to, total - 1); i += 1) data.push({ bill_id: parentOf(i) });
    return Promise.resolve({ data, error: null });
  };
  const sb = { from: () => chain } as unknown as SupabaseClient;
  return { sb, ranges, eqs };
}

/** Ten lines per bill, so 2500 lines are 250 bills — bill-249 lives on page 2. */
const tenPerBill = (i: number) => `bill-${Math.floor(i / 10)}`;
const docs = (ids: string[]) => ids.map((id) => ({ id }));

describe("keepByDepartment — the department read is paged", () => {
  it("asks for no lines at all when no department was chosen", async () => {
    const { sb, ranges } = pagedClient(0, tenPerBill);
    const rows = docs(["bill-1"]);
    const got = await keepByDepartment(sb, BILL_LINES, rows, (r) => r.id, { departmentType: undefined, departmentId: undefined });
    expect(got).toEqual({ rows });
    expect(ranges).toEqual([]);
  });

  it("reads past 1000 rows, and keeps a document whose only line is on page 3", async () => {
    const { sb, ranges, eqs } = pagedClient(2500, tenPerBill);
    const rows = docs(["bill-0", "bill-249", "bill-9999"]);
    const got = await keepByDepartment(sb, BILL_LINES, rows, (r) => r.id, {
      departmentType: "SHOWROOM",
      departmentId: "11111111-1111-4111-8111-111111111111",
    });
    // Three pages, the last one short — that is how the loop knows it is done.
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(eqs).toContainEqual(["department_type", "SHOWROOM"]);
    expect(eqs).toContainEqual(["department_id", "11111111-1111-4111-8111-111111111111"]);
    // bill-249's lines are rows 2490-2499. The unpaged read stopped at 999 and
    // dropped it from the register with no error at all.
    expect(got).toEqual({ rows: docs(["bill-0", "bill-249"]) });
  });

  it("refuses rather than answers short when the read runs past 20 pages", async () => {
    // Every page full: the loop never sees a short page, so it gives up.
    const { sb, ranges } = pagedClient(50_000, tenPerBill);
    const got = await keepByDepartment(sb, BILL_LINES, docs(["bill-0"]), (r) => r.id, {
      departmentType: "OFFICE",
      departmentId: undefined,
    });
    expect(got).toEqual({ tooMany: true });
    expect(ranges).toHaveLength(20);
  });

  it("gives the database error back, never an empty list", async () => {
    const { sb } = pagedClient(10, tenPerBill, { code: "42501", message: "row-level violation" });
    const got = await keepByDepartment(sb, BILL_LINES, docs(["bill-0"]), (r) => r.id, {
      departmentType: "OFFICE",
      departmentId: undefined,
    });
    expect(got).toEqual({ error: { code: "42501", message: "row-level violation" } });
  });
});
