import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ModuleHeader from "./components/ModuleHeader";
import DutyCatalogue from "./staff-duties/DutyCatalogue";
import DutyDetail, { DutyHistory } from "./staff-duties/DutyDetail";
import type { DutyStateFilter } from "./staff-duties/staff-duties-model";
import { appTodayIso } from "@/lib/fmt-date";
import { useWorkspaceDuties } from "@/lib/queries";

/**
 * `Workspace → Staff & Duties` — the ONE company-wide duty assignment surface
 * (docs/workspace/MASTER.md §§4.1–4.7; ERP-ARCHITECTURE Global Duty Law).
 *
 * It answers three questions and no more: who normally holds each governed
 * duty, who acts during a dated absence, and what history proves it. It is
 * not People, leave management, a roster, workload balancing or a manager
 * dashboard.
 *
 * The composition is one CATALOGUE and one SELECTED duty (§4.2), replacing
 * the document that stacked two forms and a full history under every duty.
 * Search and `State` are LOCAL — they change which rows a reader sees. The
 * selected duty lives in the URL, so a Work configuration failure can
 * deep-link to the duty it needs and the page can be shared.
 *
 * Every rule stays in the SQL doors. The page renders the server's
 * `can_assign` fact and never offers a control the server would refuse: a
 * reader gets the quiet sentence, not a disabled form.
 */
export default function StaffDuties() {
  const dutiesQ = useWorkspaceDuties();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<DutyStateFilter>("all");
  /* The COMPANY date, read once per render from the governed clock — never a
     `new Date()` inside a comparison (§4.4). */
  const today = appTodayIso();

  const duties = useMemo(() => dutiesQ.data?.duties ?? [], [dutiesQ.data]);
  const requested = params.get("duty");
  const known = duties.some((d) => d.key === requested);
  const selectedKey = known ? requested! : (duties[0]?.key ?? "");
  /* Explicit = the reader chose this duty. Below 1024px that is what opens
     the detail; from `lg` both panes are always on screen. */
  const explicit = known;

  /* An unknown duty key is CORRECTED, not obeyed — and it is replaced, so
     Back never walks the reader through a key that never existed. */
  useEffect(() => {
    if (!requested || known || duties.length === 0) return;
    const next = new URLSearchParams(params);
    next.set("duty", duties[0]!.key);
    setParams(next, { replace: true });
  }, [requested, known, duties, params, setParams]);

  function select(key: string) {
    const next = new URLSearchParams(params);
    next.set("duty", key);
    setParams(next);
  }

  function back() {
    const next = new URLSearchParams(params);
    next.delete("duty");
    setParams(next);
  }

  const selected = duties.find((d) => d.key === selectedKey) ?? null;
  const canAssign = dutiesQ.data?.can_assign === true;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="staff-duties-destination-header"
        word="Staff & Duties"
        docTitle="Staff & Duties · Workspace — Carres"
        destinationHeader
      />
      <div className="min-h-0 flex-1 bg-white" data-testid="staff-duties">
        {dutiesQ.isLoading ? (
          <p className="px-6 py-8 text-body text-kit-slate-9" role="status">
            Opening Staff &amp; Duties…
          </p>
        ) : dutiesQ.isError ? (
          /* A failure sentence is never the empty sentence — what broke, then
             the act that fixes it. It never infers that nobody holds a duty. */
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-body text-kit-slate-12">
              Staff &amp; Duties could not be opened
            </p>
            <button
              type="button"
              className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-11 hover:text-kit-slate-12"
              onClick={() => void dutiesQ.refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="px-6 pt-3 text-meta text-kit-slate-11">
              Who holds each company duty today and who covers an absence.
            </p>
            <div
              data-testid="staff-duties-split"
              className="mt-2 grid min-h-0 flex-1 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]"
            >
              <DutyCatalogue
                duties={duties}
                selectedKey={selectedKey}
                onSelect={select}
                search={search}
                onSearchChange={setSearch}
                stateFilter={stateFilter}
                onStateFilterChange={setStateFilter}
                today={today}
                hiddenWhenDetailOpen={explicit}
              />
              <div
                data-testid="duty-detail"
                className={`min-h-0 overflow-y-auto px-6 py-4 ${
                  explicit ? "block" : "hidden lg:block"
                }`}
              >
                {selected ? (
                  <>
                    <DutyDetail
                      duty={selected}
                      canAssign={canAssign}
                      today={today}
                      onBack={explicit ? back : undefined}
                    />
                    <DutyHistory duty={selected} />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
