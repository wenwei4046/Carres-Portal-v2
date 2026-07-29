// design-standard: not-a-list-page — the HR-P4 employee record drawer.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Eye, Lock, Plus, ShieldOff, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import {
  EMPLOYMENT_STATUS_LABEL,
  EXIT_REASON_LABEL,
  STAFF_TIER_LABEL,
  checklistFor,
  employmentTone,
  type ChecklistKind,
  type HrEmployeeDetail,
  type HrEmployeePatchInput,
  type HrPersonRow,
  type HrRecordExitInput,
} from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import {
  useHrEmployee,
  useHrPatchEmployee,
  useHrRecordExit,
  useHrRevealField,
  useHrSetAccess,
  useHrToggleChecklist,
} from "@/lib/queries";

/**
 * The employee record (HR-P4, migration 0269).
 *
 * The design decision this drawer has to make visible: name, seat, manager and
 * login are READ from the Team tab, not stored again here. Anything carrying the
 * `Team` chip is not editable in this drawer, and there is exactly one place to
 * change it. Everything below the "HR only" divider is what `hr_employees`
 * actually owns.
 *
 * IC and bank account are never in the payload — the drawer gets booleans and
 * has to ask for the value, which is what writes the audit row.
 */

const PILL: Record<string, string> = {
  ready: "pill pill-confirmed",
  waiting: "pill pill-warning",
  overdue: "pill pill-overdue",
  neutral: "pill pill-neutral",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

// ── small building blocks ────────────────────────────────────────────────────

function Panel({
  title,
  tag,
  defaultOpen = false,
  children,
}: {
  title: string;
  tag?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-base-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-[18px] py-3 text-left hover:bg-hovertint"
      >
        <span className="text-strong flex-1 font-semibold">{title}</span>
        {tag && <span className="text-meta text-base-400">{tag}</span>}
        <ChevronDown
          size={16}
          className={`text-base-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="px-[18px] pb-4">{children}</div>}
    </div>
  );
}

/** One label/value row. 36px minimum per the drawer-row rule. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2 first:border-t-0">
      <span className="text-meta w-[132px] shrink-0 text-base-400">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-body text-base-900">
        {children}
      </div>
    </div>
  );
}

/** Marks a value as belonging to the Team tab — the whole join-don't-copy idea,
 *  said in one chip so HR knows where to go to change it. */
function TeamChip() {
  return (
    <span className="text-label uppercase tracking-[0.05em] inline-flex items-center gap-1 rounded bg-base-100 px-1.5 py-0.5 font-semibold text-base-500">
      <Lock size={11} />
      Team
    </span>
  );
}

/** An HR-owned text field: shows the value, or an Add affordance when empty. */
function EditableText({
  value,
  placeholder,
  onChange,
  type = "text",
}: {
  value: string | null;
  placeholder: string;
  onChange: (v: string | null) => void;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing && (value === null || value === "")) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline"
        onClick={() => setEditing(true)}
      >
        <Plus size={12} />
        Add
      </button>
    );
  }
  if (!editing) {
    return (
      <button
        type="button"
        className="text-left text-body hover:underline"
        onClick={() => setEditing(true)}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type={type}
      className={`${fieldCls} h-8 max-w-[260px] text-body`}
      placeholder={placeholder}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        onChange(e.target.value.trim() === "" ? null : e.target.value.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/** A masked HR field. The value is NOT in the payload; asking for it is the
 *  audited event, so the button says what it does. */
function MaskedField({
  present,
  mask,
  field,
  employeeId,
}: {
  present: boolean;
  mask: string;
  field: "ic_number" | "bank_account_no";
  employeeId: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const reveal = useHrRevealField(employeeId);

  if (!present) return <span className="text-base-400">Not on file</span>;
  if (shown) return <span className="font-mono text-body tabular-nums">{shown}</span>;

  return (
    <>
      <span className="font-mono text-body tracking-wider">{mask}</span>
      <button
        type="button"
        disabled={reveal.isPending}
        className="inline-flex items-center gap-1 rounded border border-base-300 px-2 py-[3px] text-label font-semibold text-base-600 hover:bg-hovertint disabled:opacity-50"
        onClick={() =>
          reveal.mutate(
            { field },
            {
              onSuccess: (r) => setShown(r.value),
              onError: (e) => toast.error(e.message || "Could not reveal"),
            },
          )
        }
      >
        <Eye size={12} />
        {reveal.isPending ? "…" : "Reveal"}
      </button>
    </>
  );
}

// ── the disable-login dialog (the door Loo approved 2026-07-26) ──────────────

function DisableLoginDialog({
  person,
  employeeId,
  onClose,
}: {
  person: HrPersonRow;
  employeeId: string;
  onClose: () => void;
}) {
  const setAccess = useHrSetAccess(employeeId);
  const disabling = person.access !== "disabled";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-base-900/30 p-6">
      <div className="w-[452px] max-w-full overflow-hidden rounded-xl bg-card shadow-xl">
        <div className="flex gap-3 px-6 pt-5">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
              disabling ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
            }`}
          >
            <ShieldOff size={19} />
          </div>
          <div>
            <h3 className="text-strong mb-1 font-semibold">
              {disabling
                ? `Disable ${person.name}'s login?`
                : `Give ${person.name} their login back?`}
            </h3>
            <p className="text-body text-base-500">
              {disabling
                ? "They lose the Carres portal straight away — not whenever their session happens to expire."
                : "They will be able to sign in again with their existing password."}
            </p>
          </div>
        </div>

        {disabling && (
          <ul className="mx-6 mt-4 rounded-lg border border-base-200 bg-base-50 px-3.5 py-3">
            <li className="text-body py-1 text-base-900">Their login stops working immediately</li>
            <li className="text-body py-1 text-base-900">
              They are signed out of every device they are on right now
            </li>
            <li className="text-body py-1 text-base-500">
              Their orders, commission and records stay exactly as they are
            </li>
          </ul>
        )}

        <p className="text-meta mx-6 mt-3 leading-relaxed text-base-400">
          You can change this back at any time. It is recorded in the audit log.
        </p>

        <div className="flex justify-end gap-2 px-6 pb-5 pt-4">
          <Btn variant="ghost" onClick={onClose} disabled={setAccess.isPending}>
            Cancel
          </Btn>
          {/* v4 §A5: destructive is red TEXT on white, never a filled red button. */}
          <button
            type="button"
            className={disabling ? "btn-danger" : "btn-primary"}
            disabled={setAccess.isPending}
            onClick={() =>
              setAccess.mutate(
                { status: disabling ? "disabled" : "active" },
                {
                  onSuccess: () => {
                    toast.success(disabling ? "Login disabled" : "Login restored");
                    onClose();
                  },
                  onError: (e) => toast.error(e.message || "Could not change access"),
                },
              )
            }
          >
            {disabling && <ShieldOff size={14} />}
            {disabling ? "Disable login" : "Restore login"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the exit block ───────────────────────────────────────────────────────────

function ExitBlock({
  person,
  detail,
  employeeId,
}: {
  person: HrPersonRow;
  detail: HrEmployeeDetail;
  employeeId: string;
}) {
  const record = useHrRecordExit(employeeId);
  const [exitDate, setExitDate] = useState(detail.exitDate ?? "");
  const [reason, setReason] = useState<HrRecordExitInput["reason"]>(
    (detail.exitReason as HrRecordExitInput["reason"]) ?? "resigned",
  );
  const [note, setNote] = useState(detail.exitNote ?? "");

  const done = detail.exitDate !== null;
  // Offboarding is two shapes: an HQ login has sessions to kill; floor staff
  // never had one — staff_verify_pin already refuses an inactive salesperson.
  const isHq = person.kind === "hq";

  return (
    <Panel
      title={done ? "Exit" : "Record the exit"}
      tag={done ? fmtDate(detail.exitDate) : undefined}
      defaultOpen={!done}
    >
      <Row label="Last working day">
        <input
          type="date"
          className={`${fieldCls} h-8 max-w-[170px] text-body`}
          value={exitDate}
          onChange={(e) => setExitDate(e.target.value)}
        />
      </Row>
      <Row label="Reason">
        <div className="inline-flex gap-0.5 rounded-lg bg-base-100 p-0.5">
          {(Object.keys(EXIT_REASON_LABEL) as HrRecordExitInput["reason"][]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-md px-3 py-1.5 text-meta font-semibold ${
                reason === r ? "bg-card text-base-900 shadow-sm" : "text-base-600"
              }`}
            >
              {EXIT_REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Note">
        <input
          className={`${fieldCls} h-8 text-body`}
          placeholder="Optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Row>

      <div className="mt-3 flex items-center gap-2">
        <Btn
          variant="box"
          size="sm"
          disabled={!exitDate || record.isPending}
          onClick={() =>
            record.mutate(
              { exitDate, reason, note: note.trim() || undefined },
              {
                onSuccess: () => toast.success("Exit recorded"),
                onError: (e) => toast.error(e.message || "Could not record the exit"),
              },
            )
          }
        >
          {done ? "Update exit" : "Save exit"}
        </Btn>
        <span className="text-meta text-base-400">
          Recording an exit does not cut access — that is the separate step above.
        </span>
      </div>

      <div className="mt-4 border-t border-base-100 pt-3">
        <div className="text-label uppercase tracking-[0.05em] mb-2 text-base-400">Access revocation</div>
        <ul className="flex flex-col gap-2">
          <li className="text-body flex gap-2">
            <span className={person.access === "disabled" ? "text-success" : "text-base-300"}>
              {person.access === "disabled" ? "✓" : "○"}
            </span>
            <span className={person.access === "disabled" ? "" : "text-base-500"}>
              {isHq ? "Portal login disabled" : "Store PIN switched off"}
            </span>
          </li>
          <li className="text-body flex gap-2">
            <span className={person.access === "disabled" && isHq ? "text-success" : "text-base-300"}>
              {person.access === "disabled" && isHq ? "✓" : "—"}
            </span>
            <span className="text-base-500">
              {isHq
                ? "Signed out of every device"
                : "No sessions to end — they sign in with a PIN, not a portal login"}
            </span>
          </li>
        </ul>
      </div>
    </Panel>
  );
}

// ── the drawer ───────────────────────────────────────────────────────────────

export default function HrPersonDrawer({
  person,
  onClose,
}: {
  person: HrPersonRow;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useHrEmployee(person.employeeId);
  const patch = useHrPatchEmployee(person.employeeId);
  const toggle = useHrToggleChecklist(person.employeeId);
  const [draft, setDraft] = useState<HrEmployeePatchInput>({});
  const [confirmAccess, setConfirmAccess] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset the draft whenever a different person is opened.
  useEffect(() => setDraft({}), [person.employeeId]);

  const dirty = Object.keys(draft).length > 0;
  const set = (k: keyof HrEmployeePatchInput, v: string | null) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const val = <K extends keyof HrEmployeeDetail>(
    camel: K,
    key: keyof HrEmployeePatchInput,
  ): string | null =>
    key in draft
      ? ((draft[key] as string | null) ?? null)
      : ((detail?.[camel] as string | null) ?? null);

  const ticked = useMemo(
    () => new Set((detail?.checklist ?? []).map((c) => `${c.kind}:${c.itemKey}`)),
    [detail],
  );

  const needsExit = person.access === "disabled" && !detail?.exitDate;
  const checklistKind: ChecklistKind =
    person.access === "disabled" || detail?.exitDate ? "offboarding" : "onboarding";
  const items = checklistFor(checklistKind);
  const doneCount = items.filter((i) => ticked.has(`${checklistKind}:${i.key}`)).length;

  const subtitle = [
    person.positionName ??
      (person.staffRole ? (STAFF_TIER_LABEL[person.staffRole] ?? person.staffRole) : null),
    person.departmentName ?? person.storeName,
    person.reportsToName ? `reports to ${person.reportsToName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
        className="fixed inset-0 z-[55] bg-base-900/20"
      />
      <div className="fixed inset-y-0 right-0 z-[60] flex w-[576px] max-w-full flex-col bg-card shadow-2xl">
        {/* header */}
        <div className="border-b border-base-200 px-[18px] py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-base-100 text-body font-semibold text-base-700">
              {person.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-strong truncate font-semibold">{person.name}</div>
              {subtitle && <div className="text-meta truncate text-base-500">{subtitle}</div>}
            </div>
            {person.staffCode && (
              <span className="font-mono text-meta font-semibold text-base-500">
                {person.staffCode}
              </span>
            )}
            <span className={PILL[employmentTone(person.employment)]}>
              {EMPLOYMENT_STATUS_LABEL[person.employment]}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-base-400 hover:bg-hovertint"
            >
              <X size={17} />
            </button>
          </div>

          {/* the join-don't-copy rule, said out loud */}
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-base-200 bg-base-50 px-3 py-2.5">
            <Lock size={14} className="mt-0.5 shrink-0 text-base-400" />
            <p className="text-meta leading-relaxed text-base-500">
              Name, seat, manager and login live in <b>Team</b> — this page reads them.
              Change them once there and every screen agrees.
            </p>
          </div>

          {/* access control — the door Loo approved */}
          {person.kind === "hq" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-meta text-base-400">Portal access</span>
              <span
                className={
                  person.access === "disabled" ? "pill pill-overdue" : "pill pill-confirmed"
                }
              >
                {person.access === "disabled" ? "Disabled" : "Can log in"}
              </span>
              <button
                type="button"
                className={person.access === "disabled" ? "btn-secondary" : "btn-danger"}
                onClick={() => setConfirmAccess(true)}
              >
                {person.access === "disabled" ? "Restore login" : "Disable login"}
              </button>
            </div>
          )}
        </div>

        {isLoading || !detail ? (
          <div className="text-body flex-1 py-12 text-center text-base-500">Loading record…</div>
        ) : (
          <>
            {needsExit && (
              <div className="mx-[18px] mt-3.5 flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-meta leading-relaxed text-danger">
                  <b>Their login is cut, but the register never learned why.</b> Write the
                  exit down so the people list, the commission run and the handover
                  checklist all say the same thing.
                </p>
              </div>
            )}

            {/* employment strip */}
            <div className="grid grid-cols-3 gap-px border-y border-base-200 bg-base-200">
              {[
                ["Joined", fmtDate(detail.joinDate)],
                ["Confirmed", fmtDate(detail.confirmDate)],
                ["Type", detail.employmentType?.replace("_", " ") ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-3.5 py-2.5">
                  <div className="text-label uppercase tracking-[0.05em] mb-1 text-base-400">{k}</div>
                  <div className="text-body font-semibold capitalize">{v}</div>
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              <Panel title="Identity" tag={`${detail.filled} of 8 filled`} defaultOpen>
                <Row label="Full name">
                  {person.name} <TeamChip />
                </Row>
                <Row label="Staff code">
                  <span className="font-mono">{person.staffCode ?? "—"}</span> <TeamChip />
                </Row>
                <Row label="Seat">
                  {person.positionName ?? "Not set"} <TeamChip />
                </Row>

                <div className="my-3 flex items-center gap-2">
                  <span className="text-label uppercase tracking-[0.05em] whitespace-nowrap text-base-400">HR only</span>
                  <span className="h-px flex-1 bg-base-200" />
                </div>

                <Row label="IC number">
                  <MaskedField
                    present={detail.hasIcNumber}
                    mask="••••••-••-••••"
                    field="ic_number"
                    employeeId={person.employeeId}
                  />
                </Row>
                <Row label="Nationality">
                  <EditableText
                    value={val("nationality", "nationality")}
                    placeholder="Malaysian"
                    onChange={(v) => set("nationality", v)}
                  />
                </Row>
                <Row label="Marital status">
                  <select
                    className={`${fieldCls} h-8 max-w-[160px] text-body`}
                    value={val("maritalStatus", "marital_status") ?? ""}
                    onChange={(e) => set("marital_status", e.target.value || null)}
                  >
                    <option value="">—</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </Row>
                <p className="text-meta mt-2.5 leading-relaxed text-base-400">
                  Revealing the IC asks the server for it and writes an audit line at the
                  same moment — the number is never in the list.
                </p>
              </Panel>

              <Panel title="Contact" defaultOpen>
                <Row label="Work email">
                  <span className="font-mono text-meta">{person.workEmail ?? "—"}</span>
                  {person.workEmail && <TeamChip />}
                </Row>
                <Row label="Personal email">
                  <EditableText
                    type="email"
                    value={val("personalEmail", "personal_email")}
                    placeholder="name@example.com"
                    onChange={(v) => set("personal_email", v)}
                  />
                </Row>
                <Row label="Personal phone">
                  <EditableText
                    value={val("personalPhone", "personal_phone")}
                    placeholder="+60…"
                    onChange={(v) => set("personal_phone", v)}
                  />
                </Row>
                <Row label="Emergency">
                  <EditableText
                    value={val("emergencyName", "emergency_name")}
                    placeholder="Name"
                    onChange={(v) => set("emergency_name", v)}
                  />
                  <EditableText
                    value={val("emergencyPhone", "emergency_phone")}
                    placeholder="Phone"
                    onChange={(v) => set("emergency_phone", v)}
                  />
                </Row>
              </Panel>

              <Panel
                title="Bank & statutory refs"
                tag={detail.hasBankAccount ? undefined : "empty"}
              >
                <Row label="Bank">
                  <EditableText
                    value={val("bankName", "bank_name")}
                    placeholder="Maybank"
                    onChange={(v) => set("bank_name", v)}
                  />
                </Row>
                <Row label="Account no.">
                  <MaskedField
                    present={detail.hasBankAccount}
                    mask="•••• •••• ••••"
                    field="bank_account_no"
                    employeeId={person.employeeId}
                  />
                </Row>
                <Row label="EPF no.">
                  <EditableText
                    value={val("epfNo", "epf_no")}
                    placeholder="Reference only"
                    onChange={(v) => set("epf_no", v)}
                  />
                </Row>
                <Row label="SOCSO no.">
                  <EditableText
                    value={val("socsoNo", "socso_no")}
                    placeholder="Reference only"
                    onChange={(v) => set("socso_no", v)}
                  />
                </Row>
                <Row label="Tax no.">
                  <EditableText
                    value={val("taxNo", "tax_no")}
                    placeholder="Reference only"
                    onChange={(v) => set("tax_no", v)}
                  />
                </Row>
                <p className="text-meta mt-2.5 leading-relaxed text-base-400">
                  Reference numbers only. Carres never calculates EPF, SOCSO, EIS or PCB —
                  these ride the monthly export to the payroll service and nothing else.
                </p>
              </Panel>

              <Panel title="Employment" tag={detail.employmentType ? undefined : "incomplete"}>
                <Row label="Join date">
                  <input
                    type="date"
                    className={`${fieldCls} h-8 max-w-[170px] text-body`}
                    value={val("joinDate", "join_date") ?? ""}
                    onChange={(e) => set("join_date", e.target.value || null)}
                  />
                </Row>
                <Row label="Confirmed on">
                  <input
                    type="date"
                    className={`${fieldCls} h-8 max-w-[170px] text-body`}
                    value={val("confirmDate", "confirm_date") ?? ""}
                    onChange={(e) => set("confirm_date", e.target.value || null)}
                  />
                </Row>
                <Row label="Type">
                  <select
                    className={`${fieldCls} h-8 max-w-[170px] text-body`}
                    value={val("employmentType", "employment_type") ?? ""}
                    onChange={(e) => set("employment_type", e.target.value || null)}
                  >
                    <option value="">—</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </select>
                </Row>
              </Panel>

              <ExitBlock person={person} detail={detail} employeeId={person.employeeId} />

              <Panel
                title={checklistKind === "onboarding" ? "Onboarding checklist" : "Offboarding checklist"}
                tag={`${doneCount} of ${items.length} done`}
                defaultOpen={needsExit}
              >
                <ul className="flex flex-col">
                  {items.map((item) => {
                    const on = ticked.has(`${checklistKind}:${item.key}`);
                    return (
                      <li key={item.key} className="border-t border-base-100 first:border-t-0">
                        <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5 py-2 text-body">
                          <input
                            type="checkbox"
                            className="h-[17px] w-[17px] shrink-0 accent-primary"
                            checked={on}
                            disabled={toggle.isPending}
                            onChange={(e) =>
                              toggle.mutate({
                                kind: checklistKind,
                                itemKey: item.key,
                                done: e.target.checked,
                              })
                            }
                          />
                          <span className={on ? "text-base-400 line-through" : ""}>
                            {item.label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-meta mt-2.5 leading-relaxed text-base-400">
                  The same list for everyone — tell us what Carres actually hands over and
                  it changes for the whole company.
                </p>
              </Panel>

              <Panel title="History" tag={`${detail.events.length} events`}>
                {detail.events.length === 0 ? (
                  <p className="text-body py-2 text-base-400">Nothing recorded yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {detail.events.map((ev, i) => (
                      <li
                        key={`${ev.kind}-${ev.effectiveDate}-${i}`}
                        className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2 text-body first:border-t-0"
                      >
                        <span className="w-[92px] shrink-0 text-base-400">
                          {fmtDate(ev.effectiveDate)}
                        </span>
                        <span className="flex-1 capitalize">{ev.kind}</span>
                        <span className="text-meta truncate text-base-400">{ev.note ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="flex items-center gap-2 border-t border-base-200 bg-base-50 px-[18px] py-3">
              <span className="text-meta text-base-400">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <span className="flex-1" />
              <Btn variant="ghost" onClick={() => setDraft({})} disabled={!dirty}>
                Discard
              </Btn>
              <Btn
                variant="hero"
                disabled={!dirty || patch.isPending}
                onClick={() =>
                  patch.mutate(draft, {
                    onSuccess: () => {
                      setDraft({});
                      toast.success("Profile saved");
                    },
                    onError: (e) => toast.error(e.message || "Could not save"),
                  })
                }
              >
                Save changes
              </Btn>
            </div>
          </>
        )}
      </div>

      {confirmAccess && (
        <DisableLoginDialog
          person={person}
          employeeId={person.employeeId}
          onClose={() => setConfirmAccess(false)}
        />
      )}
    </>
  );
}
