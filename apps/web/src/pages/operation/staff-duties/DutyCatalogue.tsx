import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import {
  dutyDisplayState,
  matchesDutySearch,
  matchesDutyState,
  type DutyStateFilter,
} from "./staff-duties-model";
import type { WorkspaceDutiesResponse } from "@/lib/queries";

/**
 * The left catalogue (workspace/MASTER.md §4.2).
 *
 * One row per governed duty, in the SHARED catalogue's order: the duty word,
 * who holds it, and the one exceptional note. It shows no workload, no
 * performance, no recommended person and no copied module roster — this is a
 * list of duties, not a view of people.
 *
 * Narrowing is presentation. Search and `State` change which rows are VISIBLE
 * and never which person a duty resolves to.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

/** COPY-STANDARD's four State words, in the order the rail reads them. */
const STATE_OPTIONS: { value: DutyStateFilter; label: string }[] = [
  { value: "all", label: "All duties" },
  { value: "covered_today", label: "Covered today" },
  { value: "cover_scheduled", label: "Cover scheduled" },
  { value: "not_assigned", label: "Not assigned" },
];

export default function DutyCatalogue({
  duties,
  selectedKey,
  onSelect,
  search,
  onSearchChange,
  stateFilter,
  onStateFilterChange,
  today,
  hiddenWhenDetailOpen,
}: {
  duties: Duty[];
  selectedKey: string;
  onSelect: (key: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  stateFilter: DutyStateFilter;
  onStateFilterChange: (value: DutyStateFilter) => void;
  today: string;
  /** Below 1024px one pane shows at a time; from `lg` both always do. */
  hiddenWhenDetailOpen: boolean;
}) {
  const visible = duties.filter(
    (d) =>
      matchesDutySearch(d, search) && matchesDutyState(d, stateFilter, today),
  );

  return (
    <div
      data-testid="duty-catalogue"
      /* `min-w-0`: a grid item is `min-width: auto` and would refuse to shrink
         below the State strip's own width, pushing the PORTAL sideways at
         390px instead of narrowing. */
      className={`min-h-0 min-w-0 flex-col border-kit-slate-5 lg:flex lg:border-r ${
        hiddenWhenDetailOpen ? "hidden lg:block" : "flex"
      }`}
    >
      <div className="flex flex-col gap-2 border-b border-kit-slate-5 px-4 py-3">
        <SearchInput
          id="duty-search"
          aria-label="Search duties"
          placeholder="Search duties"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {/* A Select, not a chip strip. Measured in the rendered walk: four
            chips are ONE indivisible `inline-flex` atom ~455px wide, so in a
            272px rail the fourth word — `Not assigned` — was clipped out of
            reach. A filter nobody can see is not a filter, and four full-width
            rail rows would push the duty list itself off the screen. */}
        <Select
          id="duty-state"
          label="State"
          value={stateFilter}
          onValueChange={(v) => onStateFilterChange(v as DutyStateFilter)}
          options={STATE_OPTIONS}
        />
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-6">
          <p className="text-body text-kit-slate-12">
            No duties match this search
          </p>
          <button
            type="button"
            className="mt-2 rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-11 hover:text-kit-slate-12"
            onClick={() => {
              onSearchChange("");
              onStateFilterChange("all");
            }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {visible.map((d) => {
            const note = dutyDisplayState(d, today);
            const current = d.key === selectedKey;
            return (
              <li key={d.key}>
                <button
                  type="button"
                  data-testid={`duty-catalogue-${d.key}`}
                  aria-current={current ? "true" : undefined}
                  onClick={() => onSelect(d.key)}
                  className={`w-full px-4 py-2 text-left hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9 ${
                    current ? "bg-kit-slate-3" : ""
                  }`}
                >
                  <span className="block text-body font-medium text-kit-slate-12">
                    {d.label}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-meta text-kit-slate-11">
                      {d.resolution.normal_user_name ?? "Not assigned"}
                    </span>
                    {note.word && note.kind !== "not_assigned" ? (
                      <span className="text-label text-kit-slate-9">
                        {note.word}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
