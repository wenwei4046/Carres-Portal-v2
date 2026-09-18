import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { departmentFilterQuery, type DepartmentFilter } from "@carres/shared";
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

/** Keep the documents with at least one line in the department. */
export async function keepByDepartment<T>(
  sb: SupabaseClient,
  t: LineTable,
  rows: T[],
  idOf: (r: T) => string,
  f: DepartmentFilter,
): Promise<{ rows: T[] } | { error: { code?: string; message?: string } }> {
  if (!f.departmentType) return { rows };
  // ponytail: one read of matching lines (PostgREST max-rows ceiling); a
  // department filter in each register function if a list outgrows it.
  let q = sb.from(t.table).select(t.parent).eq("department_type", f.departmentType);
  if (f.departmentId) q = q.eq("department_id", f.departmentId);
  const { data, error } = await q;
  if (error) return { error };
  const ids = new Set((data ?? []).map((l) => String((l as Record<string, unknown>)[t.parent])));
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
