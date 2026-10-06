// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid) beside the governed 240px FilterRail, the
// same composition Sales Orders, SO Batch Purchase and Supplier Claims ship.
// The engine owns the one toolbar (search · export · columns), the grid and
// the status footer; the rail owns the factual filters; nothing wraps a second
// chrome around either (docs/ui/MASTER.md §6.0 / §6.5).
/**
 * ⭐ SERVICE CASES — `docs/service/MASTER.md` (§1 WHAT IS ON SCREEN TODAY,
 * template adoption fix 2026-10-06, owner directive LINE 1).
 *
 * ```text
 * Opened · Case No · Customer · Sales order · Item · Problem · Urgency ·
 * Latest step · Deadline · Status
 * ```
 *
 * A register of FACTS (UI MASTER §5.1): no action clause, no owner avatar and
 * no `Work` column in any cell. The next act lives in the Case record, which
 * opens in the shared kit `Drawer` on a row click (Escape closes it and focus
 * returns to the row). `New Case` stays on the toolbar because Service is the
 * Case's birthplace, and it is the door for the no-source-document path only;
 * the in-context doors are `Report a problem` on the Sales Order (built), the
 * Delivery Order and Payment Records (not built).
 *
 * Status is a FACT derived from the one `is_closed` flag — `In progress` or
 * `Closed` (owner ruling 2026-10-06: staff never choose a status; the
 * `Pending / In Progress / Follow-up / Resolved` dropdown is retired). The
 * who + action + object step sentences of the approved Blueprint are the next
 * slice; until then `Latest step` prints the last RECORDED fact.
 *
 * The Numbers view (monthly numbers) is a page presentation item under `⋯`,
 * not a tab row: a register has no tab strip (UI MASTER §6.5).
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  caseIssueLabel,
  caseProductCategoryLabel,
  caseSlaClock,
  caseSlaCountLabel,
  caseTimeline,
  myHolidaySet,
  type CasePriority,
  type CaseProductCategory,
  type ServiceCase,
  type ServiceCaseListResponse,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import StatusPill from "@/components/kit/StatusPill";
import ModuleHeader from "./components/ModuleHeader";
import { FilterRail, FilterRailGroup, FilterRailRow, ShowFiltersButton, useFilterRailOpen } from "./components/workspace-rail";
import SecondLine from "./components/register-cell";
import CaseOrderLink from "./components/CaseOrderLink";
import ServiceCaseModal from "./components/ServiceCaseModal";
import ServiceCaseNumbersPanel from "./components/ServiceCaseNumbersPanel";
import ServiceCaseWizard from "./components/ServiceCaseWizard";

/** The register words (COPY-STANDARD "Service Cases register words", 2026-10-06). */
export const SERVICE_CASE_COLUMN_LABEL = {
  opened: "Opened",
  case: "Case No",
  customer: "Customer",
  order: "Sales order",
  item: "Item",
  problem: "Problem",
  urgency: "Urgency",
  step: "Latest step",
  deadline: "Deadline",
  status: "Status",
} as const;

/** The one status fact a Case carries today: closed or not (COPY: `In progress` means NOT YET CLOSED). */
export function serviceCaseStatusWord(row: Pick<ServiceCase, "statusIsClosed">): "In progress" | "Closed" {
  return row.statusIsClosed ? "Closed" : "In progress";
}

export function serviceCasePriorityWord(priority: CasePriority | null | undefined): string {
  if (priority === "high") return "Urgent";
  if (priority === "normal") return "Normal";
  if (priority === "low") return "Low";
  return "";
}

/**
 * The last RECORDED fact on the case, in the chain's own words (`{supplier}
 * gave a date` · `Picked up` · `Customer says it is solved`), with its business
 * date; a case with nothing recorded reads `Reported {date}`. A fact, never an
 * action (UI MASTER §5.1).
 */
export function serviceCaseLatestStep(row: ServiceCase): { fact: string; on: string | null } {
  const progress = row.progress ?? [];
  const last = [...progress].sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))[0];
  if (!last) return { fact: "Reported", on: row.openedAt ?? null };
  const rows = caseTimeline(
    { customerWants: row.customerWants ?? [], customerName: row.customerName, supplierName: row.supplierName ?? null },
    progress,
  );
  const match = rows.find((r) => r.entry === last || (r.entry && r.entry.step === last.step && r.entry.on === last.on));
  return { fact: match?.label ?? last.step, on: last.on };
}

type Facet = "status" | "item" | "problem" | "supplier";
const FACETS: Facet[] = ["status", "item", "problem", "supplier"];
const FACET_TITLE: Record<Facet, string> = { status: "Status", item: "Item", problem: "Problem", supplier: "Supplier" };
const FACET_ICON = { status: "flag", item: "goods", problem: "late", supplier: "supplier" } as const;
const ABSENT: Record<Facet, string> = {
  status: "",
  item: "No item recorded",
  problem: "No problem recorded",
  supplier: "No supplier on the case",
};

function facetValue(row: ServiceCase, facet: Facet): string {
  switch (facet) {
    case "status": return serviceCaseStatusWord(row);
    case "item": return row.productCategory ? caseProductCategoryLabel(row.productCategory as CaseProductCategory) : ABSENT.item;
    case "problem": return row.issueType ? caseIssueLabel(row.issueType) : ABSENT.problem;
    case "supplier": return row.supplierName || ABSENT.supplier;
  }
}

const RAIL_KEY = "carres.service-cases.rail";

function Absence({ children }: { children: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

export function serviceCaseColumns(
  open: (row: ServiceCase) => void,
  todayIso: string,
  holidayOpts: { holidays: Set<string> },
): DataGridColumn<ServiceCase>[] {
  const L = SERVICE_CASE_COLUMN_LABEL;
  return [
    {
      key: "opened", label: L.opened, width: W.date, sortable: true,
      accessor: (row) => (row.openedAt ? fmtDate(row.openedAt) : null),
      dateValue: (row) => row.openedAt, filterType: "date", filterable: true,
      sortFn: (a, b) => (a.openedAt ?? "").localeCompare(b.openedAt ?? ""),
      exportValue: (row) => (row.openedAt ? fmtDate(row.openedAt) : ""),
    },
    {
      key: "case", label: L.case, width: W.documentNo, minWidth: 150,
      accessor: (row) => (
        <button
          type="button"
          className="font-semibold text-kit-blue-11 hover:underline"
          data-testid={`case-open-${row.caseNo}`}
          onClick={(event) => { event.stopPropagation(); open(row); }}
        >
          {row.caseNo}
        </button>
      ),
      searchValue: (row) => row.caseNo, exportValue: (row) => row.caseNo, filterType: "numbering",
    },
    {
      key: "customer", label: L.customer, width: W.customer,
      accessor: (row) => <>{row.customerName || null}{row.refNo ? <SecondLine>{row.refNo}</SecondLine> : null}</>,
      searchValue: (row) => `${row.customerName ?? ""} ${row.refNo ?? ""} ${row.customerPhone ?? ""}`,
      exportValue: (row) => row.customerName ?? "",
    },
    {
      key: "order", label: L.order, width: W.soNo,
      accessor: (row) => <CaseOrderLink orderId={row.orderId} so={row.so} compact />,
      searchValue: (row) => (typeof row.so === "number" ? `SO-${row.so}` : ""),
      exportValue: (row) => (typeof row.so === "number" ? `SO-${row.so}` : ""),
    },
    {
      key: "item", label: L.item, width: W.items,
      accessor: (row) => row.productCategory
        ? <>{caseProductCategoryLabel(row.productCategory as CaseProductCategory)}{row.productSku ? <SecondLine>{row.productSku}</SecondLine> : null}</>
        : <Absence>{ABSENT.item}</Absence>,
      searchValue: (row) => `${facetValue(row, "item")} ${row.productSku ?? ""}`,
      exportValue: (row) => `${facetValue(row, "item")} ${row.productSku ?? ""}`.trim(),
    },
    {
      key: "problem", label: L.problem, width: W.status,
      accessor: (row) => (row.issueType ? caseIssueLabel(row.issueType) : <Absence>{ABSENT.problem}</Absence>),
      overflowText: (row) => row.whatHappened ?? "",
      searchValue: (row) => `${facetValue(row, "problem")} ${row.whatHappened ?? ""}`,
      exportValue: (row) => facetValue(row, "problem"),
    },
    {
      key: "urgency", label: L.urgency, width: W.shortFact,
      accessor: (row) => {
        const word = serviceCasePriorityWord(row.priority ?? null);
        if (!word) return null;
        return <StatusPill tone={row.priority === "high" ? "danger" : "neutral"}>{word}</StatusPill>;
      },
      searchValue: (row) => serviceCasePriorityWord(row.priority ?? null),
      exportValue: (row) => serviceCasePriorityWord(row.priority ?? null),
    },
    {
      key: "step", label: L.step, width: W.caseStep,
      accessor: (row) => {
        const latest = serviceCaseLatestStep(row);
        return <>{latest.fact}{latest.on ? <SecondLine>{fmtDate(latest.on)}</SecondLine> : null}</>;
      },
      searchValue: (row) => serviceCaseLatestStep(row).fact,
      exportValue: (row) => { const l = serviceCaseLatestStep(row); return l.on ? `${l.fact} · ${fmtDate(l.on)}` : l.fact; },
    },
    {
      key: "deadline", label: L.deadline, width: W.date, sortable: true,
      accessor: (row) => {
        const clock = caseSlaClock({ openedAt: row.openedAt, todayIso, events: row.slaEvents ?? [], closed: row.statusIsClosed, customerName: row.customerName }, holidayOpts);
        if (!clock.dueIso) return null;
        const count = caseSlaCountLabel(clock);
        return (
          <>
            <span className="tabular-nums">{fmtDate(clock.dueIso)}</span>
            {count ? <SecondLine>{clock.state === "late" ? <span className="text-kit-red-11">{count}</span> : count}</SecondLine> : null}
            {clock.extendedToIso ? <SecondLine>Moved once</SecondLine> : null}
          </>
        );
      },
      dateValue: (row) => caseSlaClock({ openedAt: row.openedAt, todayIso, events: row.slaEvents ?? [], closed: row.statusIsClosed }, holidayOpts).dueIso,
      filterType: "date", filterable: true,
      sortFn: (a, b) => {
        const da = caseSlaClock({ openedAt: a.openedAt, todayIso, events: a.slaEvents ?? [], closed: a.statusIsClosed }, holidayOpts).dueIso ?? "";
        const db = caseSlaClock({ openedAt: b.openedAt, todayIso, events: b.slaEvents ?? [], closed: b.statusIsClosed }, holidayOpts).dueIso ?? "";
        return da.localeCompare(db);
      },
      exportValue: (row) => { const c = caseSlaClock({ openedAt: row.openedAt, todayIso, events: row.slaEvents ?? [], closed: row.statusIsClosed }, holidayOpts); return c.dueIso ? fmtDate(c.dueIso) : ""; },
    },
    {
      key: "status", label: L.status, width: W.status,
      accessor: (row) => <StatusPill tone={row.statusIsClosed ? "success" : "info"}>{serviceCaseStatusWord(row)}</StatusPill>,
      searchValue: (row) => serviceCaseStatusWord(row), exportValue: (row) => serviceCaseStatusWord(row),
      filterType: "enum", filterable: true, filterValue: (row) => serviceCaseStatusWord(row),
    },
  ];
}

export default function OperationServiceCases() {
  const [params, setParams] = useSearchParams();
  const caseId = params.get("case");
  const view = params.get("view") === "numbers" ? "numbers" : "cases";
  const [showCreate, setShowCreate] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [railOpen, setRailVisible] = useFilterRailOpen(RAIL_KEY, canvasRef);
  const [picks, setPicks] = useState<Partial<Record<Facet, string>>>({});

  const listQ = useQuery<ServiceCaseListResponse>({
    queryKey: ["ops", "service-cases", "list"],
    queryFn: () => apiFetch("/api/ops/service-cases"),
    refetchInterval: 30_000,
    enabled: view === "cases",
  });
  const forbidden = (listQ.error as { status?: number } | null)?.status === 403;
  const all = useMemo(() => listQ.data?.items ?? [], [listQ.data]);
  const matches = (row: ServiceCase, except?: Facet) =>
    (Object.keys(picks) as Facet[]).every((key) => key === except || facetValue(row, key) === picks[key]);
  const rows = useMemo(() => all.filter((row) => matches(row)), [all, picks]); // eslint-disable-line react-hooks/exhaustive-deps

  // The deadline is counted in WORKING days against today in Malaysia; the
  // holiday calendar is injected once for the whole table.
  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const todayIso = appTodayIso();

  const open = useCallback((row: ServiceCase) => setParams((previous) => {
    const next = new URLSearchParams(previous); next.set("case", row.id); return next;
  }), [setParams]);
  const close = useCallback(() => setParams((previous) => {
    const next = new URLSearchParams(previous); next.delete("case"); return next;
  }), [setParams]);
  const setView = (next: "cases" | "numbers") => setParams((previous) => {
    const p = new URLSearchParams(previous); if (next === "numbers") p.set("view", "numbers"); else p.delete("view"); return p;
  }, { replace: true });

  // A stale `?case=` whose record is gone must not trap the page behind a drawer.
  useEffect(() => {
    if (caseId && listQ.isSuccess && !all.some((row) => row.id === caseId)) close();
  }, [caseId, listQ.isSuccess, all, close]);

  const columns = useMemo(() => serviceCaseColumns(open, todayIso, holidayOpts), [open, todayIso, holidayOpts]);
  const errorState = listQ.isError
    ? <div role="alert"><EmptyState title={forbidden ? "You do not have access to Service Cases." : "Service Cases could not be loaded"} action={!forbidden ? <Button variant="neutral" onClick={() => void listQ.refetch()}>Try again</Button> : undefined} /></div>
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="operation-service-cases">
      <ModuleHeader testId="service-cases-header" word="Service Cases" docTitle="Service Cases · Carres Portal" destinationHeader />
      {view === "numbers" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3"><Button variant="ghost" icon="back" onClick={() => setView("cases")} data-testid="numbers-back">Cases</Button></div>
          <ServiceCaseNumbersPanel />
        </div>
      ) : (
        <div ref={canvasRef} className="flex min-h-0 flex-1 overflow-hidden">
          {railOpen && !listQ.isError && (
            <FilterRail testId="service-cases-rail" onHide={() => setRailVisible(false)}>
              {FACETS.map((facet) => {
                const counts = new Map<string, number>();
                all.filter((row) => matches(row, facet)).forEach((row) => { const v = facetValue(row, facet); counts.set(v, (counts.get(v) ?? 0) + 1); });
                if (counts.size === 0) return null;
                return (
                  <FilterRailGroup key={facet} title={FACET_TITLE[facet]} icon={FACET_ICON[facet]} chosen={picks[facet] ?? null}>
                    {[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => (
                      <FilterRailRow key={value} label={value} count={count} active={picks[facet] === value} testId={`cases-rail-${facet}-${value}`}
                        onClick={() => setPicks((previous) => { const next = { ...previous }; if (next[facet] === value) delete next[facet]; else next[facet] = value; return next; })} />
                    ))}
                  </FilterRailGroup>
                );
              })}
            </FilterRail>
          )}
          <div className="flex min-w-0 flex-1 flex-col p-2">
            <DataGrid
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              storageKey="carres.service-cases.register.v1"
              appearance="reference"
              exportName="Service Cases"
              groupBanner={false}
              leadingColumns={{ date: "opened", identity: "case" }}
              rowHeight={51}
              isLoading={listQ.isLoading}
              errorState={errorState}
              emptyMessage={all.length === 0 ? "No Service Cases yet. Open one from a Sales Order's Report a problem, or New Case when there is no order." : "No Service Cases match these filters"}
              searchPlaceholder="Search Service Cases"
              searchScope="case number, customer, phone, item and problem"
              toolbarStart={!railOpen ? <ShowFiltersButton onShow={() => setRailVisible(true)} testId="cases-show-filters" /> : null}
              toolbarEnd={<Button variant="primary" shape="pill" icon="add" onClick={() => setShowCreate(true)} data-testid="case-new">New Case</Button>}
              pageToolsItems={[{ key: "numbers", label: "Numbers", icon: "activity", separatorBefore: true, onSelect: () => setView("numbers") }]}
              onRowClick={open}
              onRowDoubleClick={open}
              contextMenu={(row) => [{ label: "View", onClick: () => open(row) }]}
              activeConditions={(Object.keys(picks) as Facet[]).map((facet) => ({ key: facet, label: `${FACET_TITLE[facet]}: ${picks[facet]}`, onClear: () => setPicks((previous) => { const next = { ...previous }; delete next[facet]; return next; }) }))}
              onClearConditions={() => setPicks({})}
              statusSummary={(visible) => <span>{visible.length === all.length ? `${all.length} ${all.length === 1 ? "case" : "cases"}` : `${visible.length} of ${all.length} cases`}</span>}
            />
          </div>
        </div>
      )}

      {showCreate && (
        <ServiceCaseWizard onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)} />
      )}
      {caseId && (
        <ServiceCaseModal mode="edit" id={caseId} onClose={close} onSaved={close} />
      )}
    </div>
  );
}
