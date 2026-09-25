import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { departmentFilterQuery, type DepartmentFilter } from "@carres/shared";
import { readAllPages, tooManyRows } from "./route-helpers";
import type { AppEnv } from "../types";

/**
 * 0540 — the Department filter on the Finance document lists, and the line
 * departments on each document. The list and detail functions predate 0540,
 * so the department is read from the line tables next to them.
 */
export type LineTable =
  | { table: "supplier_bill_lines"; parent: "bill_id" }
  | { table: "payment_voucher_lines"; parent: "voucher_id" }
  | { table: "other_debtor_invoice_lines"; parent: "invoice_id" }
  | { table: "other_receipt_lines"; parent: "receipt_id" };

/** `?departmentType=&departmentId=`, or a 422 answer. */
export function departmentQuery(c: Context<AppEnv>): { ok: true; value: DepartmentFilter } | { ok: false; res: Response } {
  const parsed = departmentFilterQuery.safeParse({
    departmentType: c.req.query("departmentType") || undefined,
    departmentId: c.req.query("departmentId") || undefined,
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    res: c.json({ error: "invalid_input", code: "invalid_param", message: "Choose the department." }, 422),
  };
}

/** The one sentence a register refuses a department filter with. */
export const TOO_MANY_DEPARTMENT_LINES = "There are too many lines in this department to filter here.";

/** Refuse the register rather than answer it with a shorter list. */
export function tooManyDepartmentLines(c: Context<AppEnv>) {
  return tooManyRows(c, TOO_MANY_DEPARTMENT_LINES);
}

/**
 * Keep the documents with at least one line in the department.
 *
 * The lines are read in PAGES and the read FAILS CLOSED. The first version of
 * this (PR #1456) read them once with no `.range()`: past PostgREST's 1000-row
 * ceiling the extra lines never came back, so their documents silently fell
 * off the bills, payment voucher, other-debtor and other-receipt registers.
 * No error, just a shorter list — the worst possible answer, because nothing
 * on screen says a document is missing. `{ tooMany: true }` is now the answer
 * past the ceiling and the register refuses.
 */
export async function keepByDepartment<T>(
  sb: SupabaseClient,
  t: LineTable,
  rows: T[],
  idOf: (r: T) => string,
  f: DepartmentFilter,
): Promise<{ rows: T[] } | { tooMany: true } | { error: { code?: string; message?: string } }> {
  const { departmentType, departmentId } = f;
  if (!departmentType) return { rows };
  // Ordered by `id`, the line table's primary key: paging on a non-unique
  // order can miss or repeat a row across two pages.
  const read = await readAllPages<Record<string, unknown>>((from, to) => {
    let q = sb.from(t.table).select(t.parent).eq("department_type", departmentType);
    if (departmentId) q = q.eq("department_id", departmentId);
    return q.order("id", { ascending: true }).range(from, to);
  });
  if (!("rows" in read)) return read;
  const ids = new Set(read.rows.map((l) => String(l[t.parent])));
  return { rows: rows.filter((r) => ids.has(idOf(r))) };
}

/** Add department_type / department_id to each `lines[]` entry, by line_no. */
export async function withLineDepartments(
  sb: SupabaseClient,
  t: LineTable,
  parentId: string,
  doc: unknown,
): Promise<{ doc: unknown } | { error: { code?: string; message?: string } }> {
  const lines = (doc as { lines?: Array<Record<string, unknown>> } | null)?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return { doc };
  const { data, error } = await sb
    .from(t.table)
    .select("line_no, department_type, department_id")
    .eq(t.parent, parentId);
  if (error) return { error };
  const byNo = new Map((data ?? []).map((l) => [Number(l.line_no), l]));
  return {
    doc: {
      ...(doc as object),
      lines: lines.map((l) => {
        const d = byNo.get(Number(l.line_no));
        return { ...l, department_type: d?.department_type ?? null, department_id: d?.department_id ?? null };
      }),
    },
  };
}
