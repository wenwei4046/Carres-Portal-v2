import { z } from "zod";

/**
 * Finance departments (migration 0540). Every income and expense line belongs
 * to one: a Showroom (an outlet), a Dealer, Subscription or Office. The list
 * itself lives in the database (`fin_departments()`); this file is the wire
 * shape and the two rules the screen can check before a round-trip.
 */
export const DEPARTMENT_TYPES = ["SHOWROOM", "DEALER", "SUBSCRIPTION", "OFFICE"] as const;
export type DepartmentType = (typeof DEPARTMENT_TYPES)[number];

/** Showroom and Dealer name one outlet or dealer; Subscription and Office are one each. */
export const departmentNeedsId = (t: DepartmentType) => t === "SHOWROOM" || t === "DEALER";

/** Office has expenses only. */
export const departmentAllowedOn = (t: DepartmentType, accountKind: string) =>
  !(t === "OFFICE" && accountKind === "INCOME");

/** Optional department on a document line (snake_case and camelCase wires). */
export const lineDepartmentFields = {
  departmentType: z.enum(DEPARTMENT_TYPES).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
};
export const lineDepartmentFieldsSnake = {
  department_type: z.enum(DEPARTMENT_TYPES).nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
};

/** A list or report filter: one type, or one instance of it. */
export const departmentFilterFields = {
  departmentType: z.enum(DEPARTMENT_TYPES).optional(),
  departmentId: z.string().uuid().optional(),
};

/** An id needs its type; Subscription and Office take no id. */
export const departmentFilterOk = (v: { departmentType?: DepartmentType; departmentId?: string }) =>
  v.departmentId === undefined || (v.departmentType !== undefined && departmentNeedsId(v.departmentType));

export const departmentFilterMessage = "Choose the department.";

export const departmentFilterQuery = z
  .object(departmentFilterFields)
  .refine(departmentFilterOk, { message: departmentFilterMessage, path: ["departmentId"] });
export type DepartmentFilter = z.infer<typeof departmentFilterQuery>;

/** RPC arguments for a report function; both null = every department. */
export const departmentRpcArgs = (v: { departmentType?: DepartmentType; departmentId?: string }) => ({
  p_department_type: v.departmentType ?? null,
  p_department_id: v.departmentId ?? null,
});

/** Does a stored line match the filter? */
export const departmentMatches = (
  line: { department_type: string | null; department_id: string | null },
  f: { departmentType?: DepartmentType; departmentId?: string },
) =>
  f.departmentType === undefined ||
  (line.department_type === f.departmentType &&
    (f.departmentId === undefined || line.department_id === f.departmentId));
