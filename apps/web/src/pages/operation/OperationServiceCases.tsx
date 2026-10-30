import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  caseFollowUpPlan,
  caseNeedsManager,
  caseOpenSteps,
  caseSlaAction,
  caseSlaClock,
  caseSlaCountLabel,
  myHolidaySet,
  type CasePriority,
  type CaseSlaClock,
  type ServiceCase,
  type ServiceCaseListResponse,
} from "@carres/shared";
import ServiceCaseModal from "./components/ServiceCaseModal";
import ServiceCaseNumbersPanel from "./components/ServiceCaseNumbersPanel";
import ServiceCaseWizard from "./components/ServiceCaseWizard";
import CaseOrderLink from "./components/CaseOrderLink";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Tabs from "@/components/kit/Tabs";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import ListPageShell from "@/components/ListPageShell";
import ModuleHeader from "./components/ModuleHeader";

/**
 * Operation Service Cases — the case (病历) list.
 * Each case classifies an issue (Case Type + Status) and holds the medical
 * record. A printable Service Note dispatch order is generated under a case (P2).
 *
 * Filter [All][Ongoing][Closed] derives from the case status's is_closed flag.
 */
export default function OperationServiceCases() {
  const [state, setState] = useState<"" | "ongoing" | "closed">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // 0711 — Weisiang's decision (Mr Lim, WhatsApp 2026-10-22), Houzs way: a
  // My cases switch (mine + my downline, decided by the server) and a stage
  // card filter (click a card, click it again to clear).
  const [mine, setMine] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);

  // J2 — `?case=<id>` opens that case straight away, which is what the order
  // drawer's Related-cases row links to. Consumed once and stripped from the
  // URL so closing the modal does not immediately reopen it, and a refresh
  // lands on the plain list.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCase = searchParams.get("case");

  // S5 — the Numbers tab. `?tab=numbers` is a real deep link (the Stock K0
  // shape): the no-tab default is unchanged, so every existing link still
  // lands on the case list.
  const tab = searchParams.get("tab") === "numbers" ? "numbers" : "cases";
  const setTab = (next: "cases" | "numbers") => {
    const params = new URLSearchParams(searchParams);
    if (next === "cases") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  useEffect(() => {
    if (!deepLinkCase) return;
    setEditId(deepLinkCase);
    const next = new URLSearchParams(searchParams);
    next.delete("case");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkCase]);

  const listQ = useQuery<ServiceCaseListResponse>({
    queryKey: ["ops", "service-cases", "list", state, mine],
    queryFn: () => {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (mine) params.set("mine", "1");
      return apiFetch(`/api/ops/service-cases?${params}`);
    },
    refetchInterval: 30_000,
    // The list is the Cases tab's data. The Numbers tab reads its own endpoint,
    // so there is no reason to keep polling every case behind it.
    enabled: tab === "cases",
  });

  const allRows: ServiceCase[] = listQ.data?.items ?? [];
  const stages = stageCounts(allRows);
  // A picked stage with no cases left in this list (My cases / state switched)
  // has no card to un-press, so it stops filtering instead of hiding every row.
  const stageShown = stageId !== null && stages.some((st) => st.id === stageId);
  const rows = stageShown ? allRows.filter((r) => (r.statusId ?? "") === stageId) : allRows;

  // 0711 — the owner's name on each row, from the same staff list every
  // Operation picker reads.
  const staffQ = useQuery<{ staff?: Array<{ user_id: string; name: string | null }> }>({
    queryKey: ["operation", "staff"],
    queryFn: () => apiFetch("/api/operation/staff"),
    staleTime: 60_000,
  });
  const nameOf = new Map((staffQ.data?.staff ?? []).map((p) => [p.user_id, p.name ?? ""]));

  // S4 — the deadline is counted in WORKING days, so the holiday calendar is
  // injected once for the whole table rather than rebuilt per row.
  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const todayIso = appTodayIso();
  const clockOf = (r: ServiceCase) =>
    caseSlaClock(
      { openedAt: r.openedAt, todayIso, events: r.slaEvents ?? [], closed: r.statusIsClosed, customerName: r.customerName },
      holidayOpts,
    );

  // An empty list under a filter is not an empty module: say which filter emptied it.
  const filtered = state !== "" || mine || stageShown;
  const emptyFilteredSentence = `No ${state || ""}${state ? " " : ""}cases${mine ? " of yours" : ""}${stageShown ? " at this stage" : ""}.`;

  // The 12 columns, same order and cells as the hand-built table they replace.
  const columns = useMemo<DataGridColumn<ServiceCase>[]>(() => [
    { key: "caseNo", label: "Case No.", width: W.documentNo, accessor: (r) => <span className="font-mono font-semibold">{r.caseNo}</span>, searchValue: (r) => r.caseNo },
    // J2 — the case→order link gets its own column: it answers "which order is this about".
    { key: "so", label: "Sales order", width: W.documentNo, accessor: (r) => <CaseOrderLink orderId={r.orderId} so={r.so} compact />, searchValue: (r) => String(r.so ?? "") },
    // S1 — urgency is DERIVED from "can the customer still use it"; nobody types it.
    { key: "priority", label: "Urgency", width: W.status, accessor: (r) => <PriorityCell priority={r.priority ?? null} />, searchValue: (r) => r.priority ?? "" },
    { key: "type", label: "Type", width: W.category, accessor: (r) => (r.caseTypeLabel ? <span className="rounded bg-base-100 px-1.5 py-0.5 text-meta text-base-700">{r.caseTypeLabel}</span> : null), searchValue: (r) => r.caseTypeLabel ?? "" },
    {
      key: "customer", label: "Customer / Ref", width: W.customer,
      accessor: (r) => (<><div>{r.customerName || ""}</div>{r.refNo && <div className="text-meta text-base-500 font-mono">{r.refNo}</div>}</>),
      searchValue: (r) => `${r.customerName ?? ""} ${r.refNo ?? ""}`,
    },
    { key: "what", label: "What Happened", width: 260, accessor: (r) => <p className="line-clamp-2 whitespace-normal">{r.whatHappened || null}</p>, searchValue: (r) => r.whatHappened ?? "" },
    // S3 — the row says what to DO next, derived from the case's own answers.
    { key: "next", label: "Next step", width: 240, accessor: (r) => <NextStepCell row={r} clock={clockOf(r)} /> },
    { key: "stage", label: "Stage", width: W.status, accessor: (r) => <span className={`pill ${r.statusIsClosed ? "pill-confirmed" : "pill-neutral"}`}>{r.statusLabel ?? "Unset"}</span>, searchValue: (r) => r.statusLabel ?? "Unset" },
    { key: "owner", label: "Owner", width: W.requestedBy, accessor: (r) => (r.ownerUserId ? nameOf.get(r.ownerUserId) || null : null), searchValue: (r) => (r.ownerUserId ? nameOf.get(r.ownerUserId) ?? "" : "") },
    { key: "opened", label: "Opened", width: W.date, accessor: (r) => fmtDate(r.openedAt), dateValue: (r) => r.openedAt, filterType: "date" },
    // S4 — 14 working days from the day it was reported, from the same clock the case view and server read.
    { key: "deadline", label: "Deadline", width: W.date, accessor: (r) => <DeadlineCell clock={clockOf(r)} /> },
    {
      key: "actions", label: "Actions", width: 90, align: "right",
      accessor: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditId(r.id); }}
          className="rounded border border-base-300 bg-white px-2 py-1 text-meta text-base-700 hover:bg-base-100">Open</button>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [nameOf, holidayOpts, todayIso]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="operation-service-cases">
      <ModuleHeader destinationHeader testId="operation-service-cases-header" word="Service Cases" docTitle="Service Cases · Carres" />
      {/* S5 — the module's two doors: one page, one sidebar item, two views. */}
      <div className="flex items-center gap-4 px-3 pt-3">
        <Tabs label="Service Cases view" value={tab} onValueChange={(v) => setTab(v as "cases" | "numbers")}
          tabs={[{ value: "cases", label: "Cases" }, { value: "numbers", label: "Numbers" }]} />
        {/* 0711 — Houzs keeps Service Maintenance beside the cases. */}
        <Link to="/operation/settings/service" className="ml-auto py-2 text-body text-base-500 hover:text-base-700">
          Service Settings
        </Link>
      </div>

      {tab === "numbers" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3"><ServiceCaseNumbersPanel /></div>
      ) : (
      <ListPageShell register>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* 0711 — one card per stage with its count (Houzs ServiceCases.tsx:1226-1229), click to filter. */}
          {stages.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stages.map((st) => (
                <button key={st.id} type="button" aria-pressed={stageId === st.id} data-testid={`case-stage-card-${st.id}`}
                  onClick={() => setStageId(stageId === st.id ? null : st.id)}
                  className={`kpi-box text-left ${stageId === st.id ? "border-base-900" : ""}`}>
                  <span className="label text-base-500">{st.label}</span>
                  <span className="text-strong font-semibold t-num text-base-900 mt-1">{st.count}</span>
                </button>
              ))}
            </div>
          )}
          {listQ.isError && !listQ.data ? (
            /* A failure sentence is never the empty sentence (COPY-STANDARD 2026-08-28). */
            <div role="alert" className="flex flex-col items-center gap-3 rounded border border-base-200 bg-white p-12 text-center">
              <p className="text-body text-base-700">Service Cases could not be opened</p>
              <Button variant="neutral" onClick={() => void listQ.refetch()}>Try again</Button>
            </div>
          ) : (
            <DataGrid<ServiceCase>
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              storageKey="carres.operation.service-cases.v1"
              appearance="reference"
              groupBanner={false}
              isLoading={listQ.isLoading}
              onRowClick={(r) => setEditId(r.id)}
              searchPlaceholder="Search Service Cases"
              exportName="Service Cases"
              emptyMessage={filtered ? emptyFilteredSentence : "No cases yet."}
              toolbarStart={<>
                <div className="flex rounded border border-base-200 overflow-hidden text-body">
                  {(["", "ongoing", "closed"] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}
                      className={`px-3 py-1.5 font-medium ${state === s ? "bg-base-900 text-white" : "bg-white text-base-600 hover:bg-base-50"}`}>
                      {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <Checkbox id="service-cases-mine" label="My cases" checked={mine} onCheckedChange={setMine} />
                {filtered && <Button variant="neutral" onClick={() => { setState(""); setMine(false); setStageId(null); }}>Show all cases</Button>}
              </>}
              toolbarEnd={<Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>New Case</Button>}
            />
          )}
        </div>
      </ListPageShell>
      )}

      {/* S1 — "+ New Case" now opens the guided wizard instead of the
          free-form modal. The modal stays for EDIT: the wizard replaces the
          ENTRY, not the case, the statuses or the Service Note. */}
      {showCreate && (
        <ServiceCaseWizard onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
      {editId && (
        <ServiceCaseModal mode="edit" id={editId} onClose={() => setEditId(null)} onSaved={() => setEditId(null)} />
      )}
    </div>
  );
}

/**
 * S3 — the ONE follow-up that shows first, with the rest behind a "+N"
 * (ACTION-FLOW-STANDARD Law 1, layer 2: nothing is suppressed, only out-ranked;
 * every open step is visible the moment the case is opened).
 *
 * A closed case shows the terminal fact instead of an action — there is nothing
 * to do on it, and "Done" is a fact, not a to-do word.
 */
function NextStepCell({ row, clock }: { row: ServiceCase; clock: CaseSlaClock }) {
  if (row.statusIsClosed) return <span className="text-meta text-base-500">Done</span>;

  const open = caseOpenSteps(
    caseFollowUpPlan({
      customerWants: row.customerWants ?? [],
      customerName:  row.customerName,
      supplierName:  row.supplierName ?? null,
    }),
    row.progress ?? [],
  ).map((s) => s.label);

  // S4 — the deadline is its own TRACK, computed independently of the chain
  // (ACTION-FLOW-STANDARD Law 1: one track may never suppress another's
  // action). It goes FIRST because Law 4 ranks "the customer must be told
  // something" above every goods step — the chain's own work is unaffected and
  // rides behind it.
  const slaAction = caseSlaAction(clock, row.customerName);
  const actions = slaAction ? [slaAction, ...open] : open;

  if (actions.length === 0) {
    return (
      <span className="text-body text-base-700">Everything done. Close this case.</span>
    );
  }

  return (
    <span className="block">
      <span className="block text-body text-base-900">{actions[0]}</span>
      {actions.length > 1 && (
        <span className="text-meta text-base-500">+{actions.length - 1} more</span>
      )}
    </span>
  );
}

/**
 * S4 — the deadline, as a FACT: the date, and how the clock stands against it.
 * Never a to-do word (COPY-STANDARD) — the thing to DO about a deadline is in
 * the Next step column, where every other action lives.
 *
 * A closed case shows only the date it was working to: its clock is off, and a
 * count on a finished case would be a number nobody can act on.
 */
function DeadlineCell({ clock }: { clock: CaseSlaClock }) {
  if (!clock.dueIso) return null;
  const count = caseSlaCountLabel(clock);

  return (
    <span className="block">
      <span className="block text-body text-base-900 tabular-nums">{fmtDate(clock.dueIso)}</span>
      {count && (
        <span
          className={`text-meta block tabular-nums ${
            clock.state === "late" ? "text-error-700" : "text-base-500"
          }`}
        >
          {count}
        </span>
      )}
      {clock.extendedToIso && (
        <span className="text-meta block text-base-500">Moved once</span>
      )}
    </span>
  );
}

/** Urgency, derived — never typed. A case filed before the wizard (or through
 *  the edit modal, which asks no usability question) has none, and says so
 *  rather than inventing a middle value. */
function PriorityCell({ priority }: { priority: CasePriority | null }) {
  if (!priority) return null;
  if (priority === "high") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="pill pill-overdue">Urgent</span>
        {caseNeedsManager(priority) && (
          <span className="text-meta text-base-600">tell manager</span>
        )}
      </span>
    );
  }
  return (
    <span className="pill pill-neutral">{priority === "normal" ? "Normal" : "Low"}</span>
  );
}

/** 0711 — how many cases sit in each stage, in the order stages first appear.
 *  A case with no stage counts under "Unset". */
export function stageCounts(rows: readonly ServiceCase[]): { id: string; label: string; count: number }[] {
  const out = new Map<string, { id: string; label: string; count: number }>();
  for (const r of rows) {
    const id = r.statusId ?? "";
    const hit = out.get(id) ?? { id, label: r.statusLabel ?? "Unset", count: 0 };
    hit.count += 1;
    out.set(id, hit);
  }
  return [...out.values()];
}
