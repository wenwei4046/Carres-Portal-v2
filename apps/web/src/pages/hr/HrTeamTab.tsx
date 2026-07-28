// design-standard: not-a-list-page — the Team hierarchy editor inside the HR
// tabbed shell; the page header lives in HrApp.
import { useMemo, useState, type ReactNode } from "react";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  HR_TEAM_CREATABLE_ROLES,
  POSITION_BAND_LABEL,
  POSITION_BAND_ORDER,
  STAFF_TIER_RANK,
  isTeamInternalRole,
  type HrCreateTeamAccountInput,
  type OrgDepartment,
  type OrgPosition,
  type OrgDuty,
  type PositionBand,
  type TeamAccount,
  type TeamShowroomStaff,
} from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import { useAuth } from "@/lib/auth";
import {
  useHrCreateShowroomStaff,
  useHrCreateTeamAccount,
  useHrSetReportsTo,
  useHrSetStaffCode,
  useHrSetTeamPosition,
  useHrTeam,
  useHrUpsertDepartment,
  useHrUpsertPosition,
  useHrSetPositionDuty,
} from "@/lib/queries";

/**
 * Team tab (HR hierarchy Phase 1, Loo 2026-07-25) — the org registry + THE
 * account door. Four blocks:
 *   a. Carres Team   — internal logins grouped C-Level → Manager → Executive;
 *                      inline position / reports-to / CRnnn code edits.
 *   b. Showroom staff — OUR floor staff per store/outlet (position derives
 *                      from the POS tier; codes editable; add-staff door).
 *   c. External accounts — supplier / partner / store logins (no codes).
 *   d. Positions + 职位更替 history — the registry editor + the change log.
 * Dealers and dealer-side staff never appear here (independent entities).
 */

const ROLE_LABEL: Record<string, string> = {
  principal: "Principal",
  operation: "Operation",
  finance: "Finance",
  hr: "HR",
  bd: "BD",
  supplier: "Supplier",
  partner: "Delivery Partner",
  // R6 — the third external company: it counts what arrives and files it.
  warehouse: "Warehouse",
  showroom: "Store login",
  salesperson: "Salesperson",
};

const SHOWROOM_TIER_POSITION: Record<string, string> = {
  manager: "Sales Manager",
  salesperson: "Sales Executive",
};

function StatusPill({ status }: { status: string }) {
  return status === "active" ? (
    <span className="pill pill-confirmed">Active</span>
  ) : (
    <span className="pill pill-neutral">Disabled</span>
  );
}

/** Mono CRnnn chip; click to edit in place (Enter saves, Esc cancels). */
function StaffCodeCell({
  kind,
  id,
  code,
}: {
  kind: "hq_user" | "showroom_staff";
  id: string;
  code: string | null;
}) {
  const setCode = useHrSetStaffCode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code ?? "");

  const save = () => {
    const next = draft.trim().toUpperCase();
    setEditing(false);
    if (next === (code ?? "")) return;
    setCode.mutate(
      { kind, id, code: next === "" ? null : next },
      {
        onSuccess: () => toast.success(next ? `Staff code → ${next}` : "Staff code cleared"),
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`${fieldCls} !h-6 !w-[86px] font-mono text-[12px]`}
        placeholder="CR001"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(code ?? "");
        setEditing(true);
      }}
      title="Edit staff code"
      className={`font-mono text-[12px] tabular-nums px-1.5 py-0.5 rounded border ${
        code
          ? "border-base-200 bg-base-50 text-base-900"
          : "border-dashed border-base-300 text-base-400"
      } hover:border-base-700`}
    >
      {code ?? "—"}
    </button>
  );
}

// ----------------------------------------------------------------------------
// a. Carres Team — internal logins by band
// ----------------------------------------------------------------------------

function TeamRow({
  account,
  positions,
  internalAccounts,
}: {
  account: TeamAccount;
  positions: OrgPosition[];
  internalAccounts: TeamAccount[];
}) {
  const setPosition = useHrSetTeamPosition();
  const setReportsTo = useHrSetReportsTo();

  const managers = internalAccounts.filter((a) => a.id !== account.id);

  return (
    <div className="flex items-center gap-3 h-9 px-2 rounded hover:bg-hovertint min-w-0">
      <div className="w-[92px] shrink-0">
        <StaffCodeCell kind="hq_user" id={account.id} code={account.staffCode} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-base-900 truncate">
          {account.name}
        </span>
        <span className="ml-2 text-[12px] text-base-500 truncate">{account.email}</span>
      </div>
      <span className="pill pill-neutral shrink-0">{ROLE_LABEL[account.role] ?? account.role}</span>
      <select
        value={account.positionId ?? ""}
        onChange={(e) =>
          setPosition.mutate(
            { userId: account.id, positionId: e.target.value === "" ? null : e.target.value },
            {
              onSuccess: () => toast.success(`Position updated · ${account.name}`),
              onError: (err) => toast.error(err.message || "Save failed"),
            },
          )
        }
        className={`${fieldCls} !h-7 !w-[168px] shrink-0 text-[12px]`}
        aria-label={`Position of ${account.name}`}
      >
        <option value="">— no position —</option>
        {POSITION_BAND_ORDER.map((band) => (
          <optgroup key={band} label={POSITION_BAND_LABEL[band]}>
            {positions
              .filter((p) => p.band === band && (p.active || p.id === account.positionId))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <select
        value={account.reportsToUserId ?? ""}
        onChange={(e) =>
          setReportsTo.mutate(
            { userId: account.id, managerId: e.target.value === "" ? null : e.target.value },
            {
              onSuccess: () => toast.success(`Reporting line updated · ${account.name}`),
              onError: (err) => toast.error(err.message || "Save failed"),
            },
          )
        }
        className={`${fieldCls} !h-7 !w-[168px] shrink-0 text-[12px]`}
        aria-label={`${account.name} reports to`}
      >
        <option value="">— reports to —</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.positionName ? ` · ${m.positionName}` : ""}
          </option>
        ))}
      </select>
      <div className="w-[70px] shrink-0 text-right">
        <StatusPill status={account.status} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// b. Showroom staff rows
// ----------------------------------------------------------------------------

function ShowroomStaffRow({ staff }: { staff: TeamShowroomStaff }) {
  return (
    <div className="flex items-center gap-3 h-9 px-2 rounded hover:bg-hovertint min-w-0">
      <div className="w-[92px] shrink-0">
        <StaffCodeCell kind="showroom_staff" id={staff.id} code={staff.staffCode} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-base-900 truncate">{staff.name}</span>
        {staff.outletName && (
          <span className="ml-2 text-[12px] text-base-500 truncate">{staff.outletName}</span>
        )}
      </div>
      <span className="text-[12px] text-base-700 shrink-0">
        {SHOWROOM_TIER_POSITION[staff.staffRole] ?? staff.staffRole}
      </span>
      <span className={`pill shrink-0 ${staff.hasPin ? "pill-confirmed" : "pill-neutral"}`}>
        {staff.hasPin ? "PIN set" : "No PIN"}
      </span>
      <div className="w-[70px] shrink-0 text-right">
        <StatusPill status={staff.active ? "active" : "disabled"} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Add user modal — THE account door (all roles except dealer/showroom stores)
// ----------------------------------------------------------------------------

function AddUserModal({
  positions,
  internalAccounts,
  warehouses,
  callerIsPrincipal,
  onClose,
}: {
  positions: OrgPosition[];
  internalAccounts: TeamAccount[];
  /** R6 — what a `warehouse` login may be bound to. Empty on a pre-R6 server. */
  warehouses: { id: string; name: string }[];
  callerIsPrincipal: boolean;
  onClose: () => void;
}) {
  const create = useHrCreateTeamAccount();
  const [role, setRole] = useState<HrCreateTeamAccountInput["role"]>("operation");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const roles = HR_TEAM_CREATABLE_ROLES.filter(
    (r) => r !== "principal" || callerIsPrincipal,
  );
  // R6 — a warehouse is external too, but it is the one external role that
  // creates NO company row: the warehouse already exists as master data, so the
  // form picks one instead of naming one.
  const isWarehouse = role === "warehouse";
  const external = role === "supplier" || role === "partner";
  const valid =
    name.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    password.length >= 8 &&
    password === confirmPw &&
    (!external || companyName.trim().length > 0) &&
    (!isWarehouse || warehouseId.length > 0);

  const submit = () => {
    create.mutate(
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        title: title.trim() === "" ? null : title.trim(),
        tempPassword: password,
        ...(external
          ? { companyName: companyName.trim() }
          : isWarehouse
            ? { warehouseId }
            : {
                positionId: positionId === "" ? null : positionId,
                reportsToUserId: reportsTo === "" ? null : reportsTo,
              }),
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.staffCode ? `${res.name} added · ${res.staffCode}` : `${res.name} added`,
          );
          onClose();
        },
        onError: (e) => toast.error(e.message || "Create failed"),
      },
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full max-w-[520px] overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-[9px]">HR · Team</div>
          <h2 className="font-display text-[20px] mt-1 tracking-[-0.02em] font-semibold">
            Add user
          </h2>
          <div className="text-[12px] text-base-600 mt-1 leading-relaxed">
            Every new user is added here — except dealers, which live on the
            Dealers side. Carres staff get a CR staff code automatically.
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-[12px] font-semibold text-base-700">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as HrCreateTeamAccountInput["role"])}
              className={`${fieldCls} mt-1 font-normal`}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-base-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldCls} mt-1 font-normal`} />
          </label>
          <label className="text-[12px] font-semibold text-base-700">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${fieldCls} mt-1 font-normal`} />
          </label>
          {external ? (
            <label className="col-span-2 text-[12px] font-semibold text-base-700">
              Company name
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={`${fieldCls} mt-1 font-normal`}
              />
            </label>
          ) : isWarehouse ? (
            /* R6 — PICK a warehouse, never type one. A free-text name here
               would mint nothing and bind nothing; the login has to point at
               the same row the POs are bound to or it sees an empty list. */
            <label className="col-span-2 text-[12px] font-semibold text-base-700">
              Warehouse
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={`${fieldCls} mt-1 font-normal`}
                data-testid="hr-team-warehouse-picker"
              >
                <option value="">— pick one —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] font-normal text-base-600 mt-1">
                This login sees only what is coming to that warehouse.
              </span>
            </label>
          ) : (
            <>
              <label className="text-[12px] font-semibold text-base-700">
                Position
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className={`${fieldCls} mt-1 font-normal`}
                >
                  <option value="">— none yet —</option>
                  {POSITION_BAND_ORDER.map((band) => (
                    <optgroup key={band} label={POSITION_BAND_LABEL[band]}>
                      {positions
                        .filter((p) => p.band === band && p.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-semibold text-base-700">
                Reports to
                <select
                  value={reportsTo}
                  onChange={(e) => setReportsTo(e.target.value)}
                  className={`${fieldCls} mt-1 font-normal`}
                >
                  <option value="">— nobody —</option>
                  {internalAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.positionName ? ` · ${a.positionName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-[12px] font-semibold text-base-700">
                Title (optional)
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`${fieldCls} mt-1 font-normal`}
                />
              </label>
            </>
          )}
          <label className="text-[12px] font-semibold text-base-700">
            Temp password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${fieldCls} mt-1 font-normal`}
            />
          </label>
          <label className="text-[12px] font-semibold text-base-700">
            Confirm password
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={`${fieldCls} mt-1 font-normal`}
            />
          </label>
          {confirmPw.length > 0 && password !== confirmPw && (
            <div className="col-span-2 text-[12px] text-destructive">
              Passwords don&apos;t match.
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Btn>
          <Btn variant="hero" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? "Adding…" : "Add user"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Add showroom staff modal — floor-staff PIN identity, CR code minted
// ----------------------------------------------------------------------------

function AddShowroomStaffModal({
  stores,
  onClose,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
}) {
  const create = useHrCreateShowroomStaff();
  const [dealerId, setDealerId] = useState(stores[0]?.id ?? "");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"manager" | "salesperson">("salesperson");
  const valid = dealerId !== "" && name.trim().length > 0;

  const submit = () => {
    create.mutate(
      { dealerId, name: name.trim(), staffRole: tier },
      {
        onSuccess: (res) => {
          toast.success(`${name.trim()} added · ${res.staffCode} — set the PIN in the POS Staff page`);
          onClose();
        },
        onError: (e) => toast.error(e.message || "Create failed"),
      },
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full max-w-[420px] overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-[9px]">HR · Team</div>
          <h2 className="font-display text-[20px] mt-1 tracking-[-0.02em] font-semibold">
            Add showroom staff
          </h2>
          <div className="text-[12px] text-base-600 mt-1 leading-relaxed">
            A floor-staff PIN identity in one of our showrooms. The CR staff
            code is assigned automatically; outlet + PIN + profile are set in
            the store&apos;s POS Staff page.
          </div>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <label className="text-[12px] font-semibold text-base-700">
            Showroom
            <select
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              className={`${fieldCls} mt-1 font-normal`}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-base-700">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldCls} mt-1 font-normal`} />
          </label>
          <label className="text-[12px] font-semibold text-base-700">
            Position
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as "manager" | "salesperson")}
              className={`${fieldCls} mt-1 font-normal`}
            >
              <option value="salesperson">Sales Executive</option>
              <option value="manager">Sales Manager</option>
            </select>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Btn>
          <Btn variant="hero" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? "Adding…" : "Add staff"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Department chart (0259) — management team on top, one column per department
// ----------------------------------------------------------------------------

function ChartPersonCard({
  name,
  detail,
  code,
}: {
  name: string;
  detail: string | null;
  code: string | null;
}) {
  return (
    <div className="bg-white border border-base-200 rounded px-3 py-1.5 min-w-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-base-900 truncate">{name}</span>
        {code && (
          <span className="font-mono text-[11px] tabular-nums text-base-400 shrink-0">{code}</span>
        )}
      </div>
      {detail && <div className="text-[11px] text-base-500 truncate">{detail}</div>}
    </div>
  );
}

/** Band rank inside a department column — managers on top. */
const CHART_BAND_RANK: Record<string, number> = { c_level: 0, manager: 1, executive: 2 };

function DepartmentChartCard({
  internalAccounts,
  showroomStaff,
  positions,
  departments,
}: {
  internalAccounts: TeamAccount[];
  showroomStaff: TeamShowroomStaff[];
  positions: OrgPosition[];
  departments: OrgDepartment[];
}) {
  const [collapsed, setCollapsed] = useState(false);

  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const active = internalAccounts.filter((a) => a.status === "active");
  const cLevel = active
    .filter((a) => a.band === "c_level")
    .sort((a, b) => a.name.localeCompare(b.name));
  const rest = active.filter((a) => a.band !== "c_level");

  const byDept = useMemo(() => {
    const groups = new Map<string, TeamAccount[]>();
    const unassigned: TeamAccount[] = [];
    for (const a of rest) {
      const deptId = a.positionId ? (posById.get(a.positionId)?.departmentId ?? null) : null;
      if (deptId) {
        const g = groups.get(deptId);
        if (g) g.push(a);
        else groups.set(deptId, [a]);
      } else {
        unassigned.push(a);
      }
    }
    const rank = (a: TeamAccount) => CHART_BAND_RANK[a.band ?? ""] ?? 9;
    for (const g of groups.values()) g.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    unassigned.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return { groups, unassigned };
  }, [rest, posById]);

  const staffByStore = useMemo(() => {
    const groups = new Map<string, TeamShowroomStaff[]>();
    for (const s of showroomStaff.filter((s) => s.active)) {
      const g = groups.get(s.storeName);
      if (g) g.push(s);
      else groups.set(s.storeName, [s]);
    }
    for (const g of groups.values()) {
      g.sort(
        (a, b) =>
          (STAFF_TIER_RANK[a.staffRole] ?? 9) - (STAFF_TIER_RANK[b.staffRole] ?? 9) ||
          a.name.localeCompare(b.name),
      );
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [showroomStaff]);

  const deptColumns = departments
    .filter((d) => d.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const column = (title: string, count: number, body: ReactNode) => (
    <div key={title} className="rounded border border-base-200 bg-base-50 min-w-0">
      <div className="flex items-baseline justify-between px-3 py-2 border-b border-base-200">
        <span className="text-[12px] font-semibold text-base-900 uppercase tracking-wide truncate">
          {title}
        </span>
        <span className="text-[11px] text-base-500 tabular-nums shrink-0">{count}</span>
      </div>
      <div className="p-2 flex flex-col gap-1.5">{body}</div>
    </div>
  );

  return (
    <SectionCard>
      <SectionBand
        title="Department chart"
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      />
      {!collapsed && (
        <div className="p-4" data-testid="hr-department-chart">
          {/* Management team — sits ON TOP of every department. */}
          {cLevel.length > 0 && (
            <div className="pb-4 mb-4 border-b border-dashed border-base-200">
              <div className="t-micro text-base-500 text-center mb-2">Management team</div>
              <div className="flex flex-wrap justify-center gap-2">
                {cLevel.map((a) => (
                  <ChartPersonCard
                    key={a.id}
                    name={a.name}
                    detail={a.positionName}
                    code={a.staffCode}
                  />
                ))}
              </div>
            </div>
          )}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
          >
            {deptColumns.map((d) => {
              const members = byDept.groups.get(d.id) ?? [];
              return column(
                d.name,
                members.length,
                members.length === 0 ? (
                  <div className="text-[11px] text-base-400 px-1 py-2 text-center">No one yet</div>
                ) : (
                  members.map((a) => (
                    <ChartPersonCard
                      key={a.id}
                      name={a.name}
                      detail={a.positionName}
                      code={a.staffCode}
                    />
                  ))
                ),
              );
            })}
            {staffByStore.length > 0 &&
              column(
                "Showrooms",
                staffByStore.reduce((n, [, rows]) => n + rows.length, 0),
                staffByStore.map(([store, rows]) => (
                  <div key={store} className="flex flex-col gap-1.5">
                    <div className="t-micro text-base-500 px-1">{store}</div>
                    {rows.map((s) => (
                      <ChartPersonCard
                        key={s.id}
                        name={s.name}
                        detail={SHOWROOM_TIER_POSITION[s.staffRole] ?? s.staffRole}
                        code={s.staffCode}
                      />
                    ))}
                  </div>
                )),
              )}
            {byDept.unassigned.length > 0 &&
              column(
                "Unassigned",
                byDept.unassigned.length,
                byDept.unassigned.map((a) => (
                  <ChartPersonCard
                    key={a.id}
                    name={a.name}
                    detail={a.positionName ?? "No position yet"}
                    code={a.staffCode}
                  />
                )),
              )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ----------------------------------------------------------------------------
// Departments registry editor (0259)
// ----------------------------------------------------------------------------

function DepartmentsCard({ departments }: { departments: OrgDepartment[] }) {
  const upsert = useHrUpsertDepartment();
  const [collapsed, setCollapsed] = useState(false);
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (name === "") return;
    upsert.mutate(
      { name },
      {
        onSuccess: () => {
          toast.success(`Department added · ${name}`);
          setNewName("");
        },
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  return (
    <SectionCard>
      <SectionBand
        title="Departments"
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        total={departments.filter((d) => d.active).length}
      />
      {!collapsed && (
        <div className="p-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 px-1">
            {departments.map((d) => (
              <span
                key={d.id}
                className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full border text-[12px] ${
                  d.active
                    ? "border-base-200 bg-base-50 text-base-900"
                    : "border-dashed border-base-300 text-base-400 line-through"
                }`}
              >
                {d.name}
                <button
                  type="button"
                  title={d.active ? `Retire ${d.name}` : `Restore ${d.name}`}
                  onClick={() =>
                    upsert.mutate(
                      { id: d.id, name: d.name, active: !d.active },
                      {
                        onSuccess: () =>
                          toast.success(d.active ? `${d.name} retired` : `${d.name} restored`),
                        onError: (e) => toast.error(e.message || "Save failed"),
                      },
                    )
                  }
                  className="w-5 h-5 rounded-full inline-flex items-center justify-center text-base-400 hover:text-base-900 hover:bg-base-200"
                >
                  {d.active ? "×" : "+"}
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1 px-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New department name"
              className={`${fieldCls} !w-[220px]`}
            />
            <Btn icon={Plus} size="sm" onClick={add} disabled={newName.trim() === "" || upsert.isPending}>
              Add department
            </Btn>
          </div>
          <div className="text-[11px] text-base-400 px-1 pb-1">
            A position joins a department in the Positions card below; the chart
            follows automatically. C-level seats stay department-less — they top
            the chart.
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ----------------------------------------------------------------------------
// d0. Permissions matrix — HR-P2 (0260)
// ----------------------------------------------------------------------------

/** Column headers. The DB `name` ("PO duty roster editor") is right for a
 *  tooltip but far too long for a column, so each key gets a 1-2 word label
 *  and the full name rides the `title`. */
const DUTY_SHORT: Record<string, string> = {
  ops_manager: "Ops manager",
  po_duty_editor: "PO roster",
  account_creator: "Accounts",
  finance_approver: "Finance",
  roster_editor: "Shift roster",
};

/**
 * WHO CAN DO WHAT — permissions hang off the POSITION, so promoting someone
 * moves their access with them (no code change, no redeploy).
 *
 * Rendered as a matrix rather than checkboxes inside each Positions row: the
 * useful question is usually read down a COLUMN ("who can create accounts?"),
 * and a matrix makes the empty seats visible, which a per-row control hides.
 */
function DutiesCard({
  positions,
  duties,
  grants,
}: {
  positions: OrgPosition[];
  duties: OrgDuty[];
  grants: { positionId: string; dutyKey: string }[];
}) {
  const setDuty = useHrSetPositionDuty();
  const [collapsed, setCollapsed] = useState(false);

  const held = useMemo(
    () => new Set(grants.map((g) => `${g.positionId}::${g.dutyKey}`)),
    [grants],
  );
  const rows = useMemo(() => positions.filter((p) => p.active), [positions]);

  // Pre-0260 server → no catalogue → the card simply isn't there (every gate
  // keeps running on the legacy email fallback).
  if (duties.length === 0) return null;

  return (
    <SectionCard>
      <SectionBand
        title="Permissions"
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        total={held.size}
      />
      {!collapsed && (
        <div className="p-2">
          <p className="t-tiny text-base-500 px-1 mb-2">
            Access follows the position, not the person — promote someone and
            their access moves with them. The Chairman passes every check by
            role, which is why that row stays empty.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="t-micro text-base-500 text-left font-medium px-1 pb-1.5">
                    Position
                  </th>
                  {duties.map((d) => (
                    <th
                      key={d.key}
                      title={`${d.name} — ${d.description}`}
                      className="t-micro text-base-500 font-medium px-1 pb-1.5 w-[92px] text-center"
                    >
                      {DUTY_SHORT[d.key] ?? d.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-hovertint">
                    <td className="text-[13px] text-base-900 px-1 h-8 truncate max-w-[200px]">
                      {p.name}
                    </td>
                    {duties.map((d) => {
                      const on = held.has(`${p.id}::${d.key}`);
                      return (
                        <td key={d.key} className="text-center h-8">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={setDuty.isPending}
                            aria-label={`${d.name} for ${p.name}`}
                            onChange={() =>
                              setDuty.mutate(
                                { positionId: p.id, dutyKey: d.key, granted: !on },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      `${d.name} ${on ? "revoked from" : "granted to"} ${p.name}`,
                                    ),
                                  onError: (e) => toast.error(e.message || "Save failed"),
                                },
                              )
                            }
                            className="w-3.5 h-3.5 accent-primary cursor-pointer disabled:cursor-wait"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ----------------------------------------------------------------------------
// d. Positions registry editor
// ----------------------------------------------------------------------------

function PositionsCard({
  positions,
  departments,
}: {
  positions: OrgPosition[];
  departments: OrgDepartment[];
}) {
  const upsert = useHrUpsertPosition();
  const [collapsed, setCollapsed] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBand, setNewBand] = useState<PositionBand>("executive");
  const [newDept, setNewDept] = useState("");

  const activeDepts = departments.filter((d) => d.active);

  const add = () => {
    const name = newName.trim();
    if (name === "") return;
    upsert.mutate(
      { name, band: newBand, departmentId: newDept === "" ? null : newDept },
      {
        onSuccess: () => {
          toast.success(`Position added · ${name}`);
          setNewName("");
        },
        onError: (e) => toast.error(e.message || "Save failed"),
      },
    );
  };

  return (
    <SectionCard>
      <SectionBand
        title="Positions"
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        total={positions.filter((p) => p.active).length}
      />
      {!collapsed && (
        <div className="p-2 flex flex-col gap-2">
          {POSITION_BAND_ORDER.map((band) => {
            const rows = positions.filter((p) => p.band === band);
            if (rows.length === 0) return null;
            return (
              <div key={band}>
                <div className="t-micro text-base-500 px-1 mb-1">{POSITION_BAND_LABEL[band]}</div>
                <div className="flex flex-col">
                  {rows.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 h-8 px-1 rounded hover:bg-hovertint min-w-0"
                    >
                      <span
                        className={`flex-1 min-w-0 truncate text-[13px] ${
                          p.active ? "text-base-900" : "text-base-400 line-through"
                        }`}
                      >
                        {p.name}
                      </span>
                      {/* Department link — the chart's column for this position.
                          C-level seats top the chart, so no picker there. */}
                      {band !== "c_level" && (
                        <select
                          value={p.departmentId ?? ""}
                          disabled={!p.active}
                          onChange={(e) =>
                            upsert.mutate(
                              {
                                id: p.id,
                                name: p.name,
                                band: p.band,
                                departmentId: e.target.value === "" ? null : e.target.value,
                              },
                              {
                                onSuccess: () => toast.success(`Department updated · ${p.name}`),
                                onError: (err) => toast.error(err.message || "Save failed"),
                              },
                            )
                          }
                          className={`${fieldCls} !h-7 !w-[190px] shrink-0 text-[12px]`}
                          aria-label={`Department of ${p.name}`}
                        >
                          <option value="">— no department —</option>
                          {activeDepts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        title={p.active ? `Retire ${p.name}` : `Restore ${p.name}`}
                        onClick={() =>
                          upsert.mutate(
                            { id: p.id, name: p.name, band: p.band, active: !p.active },
                            {
                              onSuccess: () =>
                                toast.success(p.active ? `${p.name} retired` : `${p.name} restored`),
                              onError: (e) => toast.error(e.message || "Save failed"),
                            },
                          )
                        }
                        className="w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-base-400 hover:text-base-900 hover:bg-base-200"
                      >
                        {p.active ? "×" : "+"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1 px-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New position name"
              className={`${fieldCls} !w-[200px]`}
            />
            <select
              value={newBand}
              onChange={(e) => setNewBand(e.target.value as PositionBand)}
              className={`${fieldCls} !w-[130px]`}
              aria-label="Band of the new position"
            >
              {POSITION_BAND_ORDER.map((b) => (
                <option key={b} value={b}>
                  {POSITION_BAND_LABEL[b]}
                </option>
              ))}
            </select>
            <select
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              className={`${fieldCls} !w-[170px]`}
              aria-label="Department of the new position"
            >
              <option value="">— no department —</option>
              {activeDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Btn icon={Plus} size="sm" onClick={add} disabled={newName.trim() === "" || upsert.isPending}>
              Add position
            </Btn>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ----------------------------------------------------------------------------
// The tab
// ----------------------------------------------------------------------------

export default function HrTeamTab() {
  const role = useAuth((s) => s.role);
  const { data, isLoading } = useHrTeam();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const internalAccounts = useMemo(
    () => accounts.filter((a) => isTeamInternalRole(a.role)),
    [accounts],
  );
  const externalAccounts = useMemo(
    () => accounts.filter((a) => !isTeamInternalRole(a.role)),
    [accounts],
  );

  const byBand = useMemo(() => {
    const groups = new Map<PositionBand | "unassigned", TeamAccount[]>();
    for (const a of internalAccounts) {
      const key = a.band ?? "unassigned";
      const g = groups.get(key);
      if (g) g.push(a);
      else groups.set(key, [a]);
    }
    for (const g of groups.values()) g.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [internalAccounts]);

  const staffByStore = useMemo(() => {
    const groups = new Map<string, TeamShowroomStaff[]>();
    for (const s of data?.showroomStaff ?? []) {
      const g = groups.get(s.storeName);
      if (g) g.push(s);
      else groups.set(s.storeName, [s]);
    }
    for (const g of groups.values()) {
      g.sort(
        (a, b) =>
          (STAFF_TIER_RANK[a.staffRole] ?? 9) - (STAFF_TIER_RANK[b.staffRole] ?? 9) ||
          a.name.localeCompare(b.name),
      );
    }
    return [...groups.entries()];
  }, [data]);

  if (isLoading || !data) {
    return <div className="text-[13px] text-base-500 py-10 text-center">Loading team…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Department chart (0259) — the org at a glance */}
      <DepartmentChartCard
        internalAccounts={internalAccounts}
        showroomStaff={data.showroomStaff}
        positions={data.positions}
        departments={data.departments ?? []}
      />

      {/* a. Carres Team */}
      <SectionCard>
        <SectionBand
          title="Carres Team"
          collapsed={!!collapsed.team}
          onToggle={() => toggle("team")}
          total={internalAccounts.length}
          right={
            <Btn icon={UserPlus} size="sm" onClick={() => setAddUserOpen(true)}>
              Add user
            </Btn>
          }
        />
        {!collapsed.team && (
          <div className="p-1 flex flex-col gap-2">
            {[...POSITION_BAND_ORDER, "unassigned" as const].map((band) => {
              const rows = byBand.get(band);
              if (!rows || rows.length === 0) return null;
              return (
                <div key={band}>
                  <div className="t-micro text-base-500 px-2 pt-1">
                    {band === "unassigned" ? "No position yet" : POSITION_BAND_LABEL[band]}
                  </div>
                  {rows.map((a) => (
                    <TeamRow
                      key={a.id}
                      account={a}
                      positions={data.positions}
                      internalAccounts={internalAccounts}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* b. Showroom staff */}
      <SectionCard>
        <SectionBand
          title="Showroom staff"
          collapsed={!!collapsed.showroom}
          onToggle={() => toggle("showroom")}
          total={data.showroomStaff.length}
          right={
            <Btn
              icon={UserPlus}
              size="sm"
              onClick={() => setAddStaffOpen(true)}
              disabled={data.showroomStores.length === 0}
            >
              Add staff
            </Btn>
          }
        />
        {!collapsed.showroom && (
          <div className="p-1 flex flex-col gap-2">
            {staffByStore.length === 0 && (
              <div className="text-[12px] text-base-500 px-2 py-3">
                No showroom staff yet.
              </div>
            )}
            {staffByStore.map(([store, rows]) => (
              <div key={store}>
                <div className="t-micro text-base-500 px-2 pt-1">{store}</div>
                {rows.map((s) => (
                  <ShowroomStaffRow key={s.id} staff={s} />
                ))}
              </div>
            ))}
            <div className="text-[11px] text-base-400 px-2 pb-1">
              Dealer-side staff are not Carres staff — they are managed by each
              dealer and never appear here.
            </div>
          </div>
        )}
      </SectionCard>

      {/* c. External accounts */}
      <SectionCard>
        <SectionBand
          title="External & store accounts"
          collapsed={!!collapsed.external}
          onToggle={() => toggle("external")}
          total={externalAccounts.length}
        />
        {!collapsed.external && (
          <div className="p-1">
            {externalAccounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 h-9 px-2 rounded hover:bg-hovertint min-w-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-base-900 truncate">
                    {a.name}
                  </span>
                  <span className="ml-2 text-[12px] text-base-500 truncate">{a.email}</span>
                </div>
                {a.orgName && (
                  <span className="text-[12px] text-base-600 truncate shrink-0">{a.orgName}</span>
                )}
                <span className="pill pill-neutral shrink-0">
                  {ROLE_LABEL[a.role] ?? a.role}
                </span>
                <div className="w-[70px] shrink-0 text-right">
                  <StatusPill status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* d. Departments + Positions registries + change history */}
      <DepartmentsCard departments={data.departments ?? []} />
      <PositionsCard positions={data.positions} departments={data.departments ?? []} />
      <DutiesCard
        positions={data.positions}
        duties={data.duties ?? []}
        grants={data.positionDuties ?? []}
      />

      <SectionCard>
        <SectionBand
          title="Position changes"
          collapsed={!!collapsed.history}
          onToggle={() => toggle("history")}
          total={data.history.length}
        />
        {!collapsed.history && (
          <div className="p-1">
            {data.history.length === 0 && (
              <div className="text-[12px] text-base-500 px-2 py-3">
                No position changes recorded yet.
              </div>
            )}
            {data.history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 h-8 px-2 text-[12px] min-w-0">
                <span className="tabular-nums text-base-500 shrink-0 w-[86px]">
                  {h.changedAt.slice(0, 10)}
                </span>
                <span className="font-semibold text-base-900 truncate">{h.subjectName}</span>
                <span className="text-base-600 truncate">
                  {h.prevPosition ?? "—"} → {h.newPosition ?? "—"}
                </span>
                {h.changedBy && (
                  <span className="ml-auto text-base-400 shrink-0">by {h.changedBy}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {addUserOpen && (
        <AddUserModal
          positions={data.positions}
          internalAccounts={internalAccounts}
          warehouses={data.warehouses ?? []}
          callerIsPrincipal={role === "principal"}
          onClose={() => setAddUserOpen(false)}
        />
      )}
      {addStaffOpen && (
        <AddShowroomStaffModal
          stores={data.showroomStores}
          onClose={() => setAddStaffOpen(false)}
        />
      )}
    </div>
  );
}
