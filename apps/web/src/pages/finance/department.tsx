/**
 * Finance departments (0540) on screen: the list, the line picker and the
 * page filter. A choice travels as one string, "TYPE" or "TYPE:id", so it
 * fits a <select> value and a `?dept=` link.
 */
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { DEPARTMENT_TYPES, departmentNeedsId, type DepartmentType } from "@carres/shared";
import { fieldCls } from "@/components/Field";
import { apiFetch } from "@/lib/api";

export interface DepartmentRow { department_type: DepartmentType; department_id: string | null; name: string }
export interface DepartmentChoice { departmentType?: DepartmentType; departmentId?: string }

const TYPE_WORD: Record<DepartmentType, string> = {
  SHOWROOM: "Showroom", DEALER: "Dealer", SUBSCRIPTION: "Subscription", OFFICE: "Office",
};

export function useDepartments() {
  return useQuery({
    queryKey: ["finance", "departments"] as const,
    queryFn: async () => (await apiFetch<{ rows: DepartmentRow[] }>("/api/finance/ledger/departments")).rows ?? [],
    staleTime: 5 * 60_000,
  });
}

export const encodeDepartment = (type: string | null | undefined, id: string | null | undefined) =>
  type ? (id ? `${type}:${id}` : type) : "";

/** "" or anything unknown = no department. */
export function decodeDepartment(v: string | null | undefined): DepartmentChoice {
  const [type, id] = (v ?? "").split(":");
  if (!(DEPARTMENT_TYPES as readonly string[]).includes(type ?? "")) return {};
  const t = type as DepartmentType;
  if (id) return departmentNeedsId(t) ? { departmentType: t, departmentId: id } : {};
  return { departmentType: t };
}

/** Query-string pairs for a list or report read, from "TYPE" or "TYPE:id". */
export function departmentSearch(dept: string | null | undefined): Record<string, string> {
  const c = decodeDepartment(dept);
  const out: Record<string, string> = {};
  if (c.departmentType) out.departmentType = c.departmentType;
  if (c.departmentId) out.departmentId = c.departmentId;
  return out;
}

/** The page's filter, kept in `?dept=`. */
export function useDepartmentParam(): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const set = (v: string) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (v) next.set("dept", v); else next.delete("dept");
    return next;
  });
  return [params.get("dept") ?? "", set];
}


/** Filter: every department, one type, or one instance. */
export function DepartmentFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data = [] } = useDepartments();
  return <label className="flex items-center gap-2 text-body">
    <span>Department</span>
    <select aria-label="Department" className={`${fieldCls} w-56`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All</option>
      {DEPARTMENT_TYPES.map((t) => {
        const rows = data.filter((d) => d.department_type === t && d.department_id);
        return rows.length === 0
          ? <option key={t} value={t}>{TYPE_WORD[t]}</option>
          : <optgroup key={t} label={TYPE_WORD[t]}>
            <option value={t}>All {TYPE_WORD[t]}</option>
            {rows.map((d) => <option key={d.department_id} value={encodeDepartment(t, d.department_id)}>{d.name}</option>)}
          </optgroup>;
      })}
    </select>
  </label>;
}

/** Line picker: one instance. Income lines cannot pick Office. */
export function DepartmentPicker({ type, id, onChange, income = false, label, className }: {
  type: string | null | undefined; id: string | null | undefined;
  onChange: (c: { departmentType: DepartmentType | null; departmentId: string | null }) => void;
  income?: boolean; label: string; className?: string;
}) {
  const { data = [] } = useDepartments();
  const rows = data.filter((d) => !(income && d.department_type === "OFFICE"));
  return <select aria-label={label} className={className ?? fieldCls}
    value={encodeDepartment(type, id)}
    onChange={(e) => {
      const c = decodeDepartment(e.target.value);
      onChange({ departmentType: c.departmentType ?? null, departmentId: c.departmentId ?? null });
    }}>
    <option value="">Department…</option>
    {DEPARTMENT_TYPES.map((t) => {
      const group = rows.filter((d) => d.department_type === t);
      if (group.length === 0) return null;
      return <optgroup key={t} label={TYPE_WORD[t]}>
        {group.map((d) => <option key={encodeDepartment(t, d.department_id)} value={encodeDepartment(t, d.department_id)}>{d.name}</option>)}
      </optgroup>;
    })}
  </select>;
}

/** A stored line department as its name; nothing when the line has none. */
export function DepartmentName({ type, id }: { type?: string | null; id?: string | null }) {
  const { data = [] } = useDepartments();
  if (!type) return null;
  const row = data.find((d) => d.department_type === type && (d.department_id ?? null) === (id ?? null));
  return <>{row?.name ?? TYPE_WORD[type as DepartmentType] ?? type}</>;
}

/** A list's query key and URL with the filter on; unchanged without one. */
export function withDepartment<K extends readonly unknown[]>(key: K, url: string, dept: string) {
  const q = new URLSearchParams(departmentSearch(dept)).toString();
  return q ? { queryKey: [...key, dept] as const, url: `${url}${url.includes("?") ? "&" : "?"}${q}` } : { queryKey: key, url };
}
