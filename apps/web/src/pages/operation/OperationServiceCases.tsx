import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
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
    queryKey: ["ops", "service-cases", "list", state],
    queryFn: () => {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      return apiFetch(`/api/ops/service-cases?${params}`);
    },
    refetchInterval: 30_000,
    // The list is the Cases tab's data. The Numbers tab reads its own endpoint,
    // so there is no reason to keep polling every case behind it.
    enabled: tab === "cases",
  });

  const rows: ServiceCase[] = listQ.data?.items ?? [];

  // S4 — the deadline is counted in WORKING days, so the holiday calendar is
  // injected once for the whole table rather than rebuilt per row.
  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const todayIso = new Date().toLocaleDateString("en-CA");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-meta uppercase tracking-wider text-base-500 mb-1">Operation</p>
        <h1 className="text-page text-base-900">Service Cases</h1>
        <p className="text-body text-base-600 mt-2">
          Every issue is a case · classify · record · generate a Service Note dispatch order
        </p>
      </div>

      {/* S5 — the module's two doors. The card asks for "a small Numbers tab
          ON THE MODULE": one page, one sidebar item, two views. */}
      <div className="flex items-center gap-4 border-b border-base-200 mb-4">
        {(["cases", "numbers"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            data-testid={`case-tab-${t}`}
            className={`-mb-px border-b-2 px-1 py-2 text-body font-medium ${
              tab === t
                ? "border-primary text-base-900"
                : "border-transparent text-base-500 hover:text-base-700"
            }`}
          >
            {t === "cases" ? "Cases" : "Numbers"}
          </button>
        ))}
      </div>

      {tab === "numbers" ? (
        <ServiceCaseNumbersPanel />
      ) : (
      <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded border border-base-200 overflow-hidden text-body">
          {(["", "ongoing", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`px-3 py-1.5 font-medium ${
                state === s
                  ? "bg-base-900 text-white"
                  : "bg-white text-base-600 hover:bg-base-50"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="btn-hero text-body py-1.5"
        >
          + New Case
        </button>
      </div>

      {/* Table */}
      {listQ.isLoading ? (
        <p className="text-body text-base-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded border border-base-200 bg-white p-12 text-center">
          <p className="text-base-700 font-medium">No cases yet.</p>
          <p className="text-body text-base-500 mt-1">Open a new case when an issue arises.</p>
        </div>
      ) : (
        <div className="rounded border border-base-200 bg-white overflow-x-auto">
          <table className="w-full text-body">
            <thead className="bg-base-50 text-meta uppercase tracking-wider text-base-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Case No.</th>
                {/* J2 — the case→order link gets its own column: it is the
                    answer to "which order is this about", not a footnote. */}
                <th className="text-left px-3 py-2 font-medium">Sales order</th>
                {/* S1 — urgency is DERIVED from "can the customer still use
                    it"; nobody types it, so it is the same answer on every
                    row. High = a manager has to be told. */}
                <th className="text-left px-3 py-2 font-medium">Urgency</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Customer / Ref</th>
                <th className="text-left px-3 py-2 font-medium">What Happened</th>
                {/* S3 — the row says what to DO next, not only what happened.
                    Derived from the case's own answers, so it costs no extra
                    query and cannot drift from the case view. */}
                <th className="text-left px-3 py-2 font-medium">Next step</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Opened</th>
                {/* S4 — 14 working days from the day it was reported. Derived
                    from the same clock the case view and the server read, so
                    no row can carry a deadline that disagrees with the rule. */}
                <th className="text-left px-3 py-2 font-medium">Deadline</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clock = caseSlaClock(
                  {
                    openedAt:     r.openedAt,
                    todayIso,
                    events:       r.slaEvents ?? [],
                    closed:       r.statusIsClosed,
                    customerName: r.customerName,
                  },
                  holidayOpts,
                );
                return (
                <tr
                  key={r.id}
                  className="border-t border-base-200 hover:bg-base-50 cursor-pointer"
                  onClick={() => setEditId(r.id)}
                >
                  <td className="px-3 py-2 font-mono text-meta text-base-900 font-semibold whitespace-nowrap">
                    {r.caseNo}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <CaseOrderLink orderId={r.orderId} so={r.so} compact />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <PriorityCell priority={r.priority ?? null} />
                  </td>
                  <td className="px-3 py-2">
                    {r.caseTypeLabel ? (
                      <span className="rounded bg-base-100 px-1.5 py-0.5 text-meta text-base-700">
                        {r.caseTypeLabel}
                      </span>
                    ) : (
                      <span className="text-base-400 text-meta">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-base-900 text-body">{r.customerImpact === "stock_only" ? "Unsold stock" : r.customerName || "—"}</div>
                    {r.refNo && <div className="text-meta text-base-500 font-mono">{r.refNo}</div>}
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <p className="text-body text-base-700 line-clamp-2">
                      {r.whatHappened || <span className="text-base-400">—</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2 max-w-[15rem]">
                    <NextStepCell row={r} clock={clock} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`pill ${r.statusIsClosed ? "pill-confirmed" : "pill-neutral"}`}>
                      {r.statusLabel ?? "Unset"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-meta text-base-500 whitespace-nowrap">
                    {fmtDate(r.openedAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.customerImpact === "stock_only" ? "—" : <DeadlineCell clock={clock} />}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditId(r.id); }}
                      className="rounded border border-base-300 bg-white px-2 py-1 text-meta text-base-700 hover:bg-base-100"
                    >
                      Open
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
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
  if (row.customerImpact === "stock_only") return <span className="text-body text-base-700">Open Case</span>;

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
      <span className="text-body text-base-700">Everything done — close this case.</span>
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
  if (!clock.dueIso) return <span className="text-base-400 text-meta">—</span>;
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
  if (!priority) return <span className="text-base-400 text-meta">—</span>;
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
