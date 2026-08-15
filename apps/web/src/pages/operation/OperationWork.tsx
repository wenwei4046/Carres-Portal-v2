/**
 * OperationWork — SO V2 CARD 10 · My Work / Team Work (owner ruling
 * 2026-08-11; built under the Production UI Execution ruling of the same day:
 * proactive design judgment, asynchronous owner review — docs/ui/MASTER.md
 * §1.1).
 *
 * **TWO FILTERS over the ONE open work set — never two datasets, never
 * another dashboard.** This page is ASSEMBLY, exactly as Delivery was:
 *
 *   WHAT is open   ← the same `openActionsOf` the Orders list runs (one
 *                    signal mapping — the two surfaces structurally cannot
 *                    disagree)
 *   WHO + WHEN     ← Card 9's `workItemsForOrder` (the PIC · each key's ONE
 *                    shipped clock · weekday+date words · working-days-late
 *                    over a due that never moves)
 *   GROUPING       ← `groupWorkItemsByDay` — days ascend, broken first,
 *                    `No date` last
 *
 * OWNER SCOPE (§2.2, the identical starting-view law): a NON-MANAGER lands on
 * My Work; a MANAGER lands on Team Work. The toggle is a STARTING VIEW, never
 * an access restriction — anyone may switch. Team Work makes responsibility
 * visible without KPI cards: owner chips filter, they never rank people.
 *
 * The page WRITES NOTHING. Opening a row goes to the owning module's
 * existing workspace — an order action opens the Sales Order Workspace.
 * There is no Done button anywhere on this surface, structurally: an item
 * leaves when its module records the completion fact and the engines
 * recompute.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { groupWorkItemsByDay, isOpsManager } from "@carres/shared";
import { cjkClassName } from "@/lib/cjk";
import { personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import { useOperationStaff } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ownerWorkloads, useOpenWorkSet } from "./use-open-work";

type ViewKey = "mine" | "team";

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  neutral: "bg-base-300",
};

export default function OperationWork() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const staffQ = useOperationStaff();

  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);
  const myDuties = staffQ.data?.myDuties;
  const isManager = isOpsManager(authRole, authEmail, myDuties);

  /** The ONE open work set — every order, through the one signal mapping,
   *  composed by Card 9. Completed orders contribute only what their engines
   *  still hold open (the photo, the money that survives delivery). Shared
   *  with the Quick Rail's Team panel so the two cannot disagree. */
  const { items: allItems, staff, loading } = useOpenWorkSet();

  // The rail deep-links into a person's work: `?tab=work&scope=team&owner=…`.
  // A link is a STARTING view exactly as the role default is — the operator
  // may switch the moment they land, so the URL seeds state and never owns it.
  const linkedScope = params.get("scope");
  const linkedOwner = params.get("owner");
  const [view, setView] = useState<ViewKey | null>(
    linkedScope === "team" ? "team" : linkedScope === "mine" ? "mine" : null,
  );
  const activeView: ViewKey = view ?? (isManager ? "team" : "mine");
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(
    linkedOwner ? new Set([linkedOwner]) : new Set(),
  );

  const myUserId = useMemo(() => {
    if (!authEmail) return null;
    const me = staff.find((s) => s.email.toLowerCase() === authEmail.toLowerCase());
    return me?.user_id ?? null;
  }, [staff, authEmail]);

  /** My Work / Team Work — two filters, one set. */
  const visible = useMemo(() => {
    if (activeView === "mine") {
      return myUserId ? allItems.filter((i) => i.ownerId === myUserId) : [];
    }
    if (ownerFilter.size === 0) return allItems;
    return allItems.filter((i) => i.ownerId != null && ownerFilter.has(i.ownerId));
  }, [allItems, activeView, myUserId, ownerFilter]);

  const groups = useMemo(() => groupWorkItemsByDay(visible), [visible]);

  /** Owner chips (Team view) — each person's `open · overdue` from the SAME
   *  set the rail's Team panel previews. Visibility, never a ranking.
   *  `ui/MASTER.md` §5 (2026-08-14) locks the group summary as
   *  `open · overdue`; the chip prints exactly that pair. */
  const ownerCounts = useMemo(
    () => ownerWorkloads(allItems, staff).filter((w) => w.open > 0),
    [allItems, staff],
  );

  const toggleOwner = (id: string) =>
    setOwnerFilter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ListPageShell
      title="Work"
      testId="operation-work"
      titleRight={
        // `open · overdue` — the ONE tally spelling (ui/MASTER.md §5, locked
        // 2026-08-14). It read `late` here while the rail read `overdue`, and
        // one number with two words is how two screens come to disagree.
        <span className="text-label text-base-400">
          {visible.length} open · {visible.filter((i) => i.workingDaysLate > 0).length} overdue
        </span>
      }
      toolbar={
        <div className="flex items-center gap-2 flex-wrap">
          {/* The starting-view toggle — §2.2's law verbatim: a default, never a wall. */}
          <div className="inline-flex rounded-md border border-base-200 overflow-hidden">
            {(
              [
                ["mine", "My Work"],
                ["team", "Team Work"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                data-testid={`work-view-${k}`}
                onClick={() => setView(k)}
                className={`px-3 py-1.5 text-body ${
                  activeView === k
                    ? "bg-base-900 text-white font-semibold"
                    : "bg-white text-base-600 hover:bg-base-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeView === "team" && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {ownerCounts.map(({ userId, open, overdue, member }) => (
                <button
                  key={userId}
                  type="button"
                  data-testid={`work-owner-${userId}`}
                  onClick={() => toggleOwner(userId)}
                  className={`px-2 py-1 rounded-full text-label border ${
                    ownerFilter.has(userId)
                      ? "border-base-900 bg-base-900 text-white"
                      : "border-base-200 bg-white text-base-600 hover:bg-base-50"
                  }`}
                  title={member.email}
                >
                  {personLabel(member.name, member.email)} · {open} open
                  {overdue > 0 ? ` · ${overdue} overdue` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      }
    >
      <div className="h-full overflow-y-auto px-5 py-4" data-testid="work-list">
        {loading ? (
          <div className="text-body text-base-400 py-8">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-body text-base-400 py-8" data-testid="work-empty">
            {activeView === "mine" && !myUserId
              ? "Your account is not in the staff list yet — switch to Team Work."
              : "No open work — every track is clear."}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.dayIso ?? "none"} className="mb-5" data-testid={`work-day-${g.dayIso ?? "none"}`}>
              <h2 className="text-label font-semibold text-base-500 uppercase tracking-wide mb-1.5">
                {g.label}
                <span className="ml-2 font-normal normal-case text-base-400">
                  {g.items.length}
                  {g.late > 0 && <span className="text-danger"> · {g.late} overdue</span>}
                </span>
              </h2>
              <div className="border border-base-200 rounded-md divide-y divide-base-100 bg-white">
                {g.items.map((i) => (
                  <button
                    key={`${i.orderId}:${i.ruleKey}`}
                    type="button"
                    data-testid={`work-row-${i.soRef}-${i.ruleKey}`}
                    onClick={() => navigate(`/operation/orders/so/${i.orderId}`)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-base-50"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full shrink-0 ${TONE_DOT[i.broken ? "danger" : i.tone] ?? "bg-base-300"}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className={`${cjkClassName(i.line)} text-body text-base-900 block truncate`}>
                        {i.locked && (
                          <Lock size={11} strokeWidth={2.5} className="inline mr-1 -mt-0.5" aria-label="Held on money" />
                        )}
                        {i.line}
                      </span>
                      <span className="text-label text-base-400">
                        <span className="font-mono">{i.soRef}</span>
                        {i.customer ? ` · ${i.customer}` : ""}
                      </span>
                    </span>
                    {activeView === "team" && (
                      <span className="text-label text-base-500 shrink-0">
                        {i.ownerName ?? "Unassigned"}
                      </span>
                    )}
                    {i.workingDaysLate > 0 && (
                      <span className="text-label text-danger font-semibold shrink-0">
                        {i.workingDaysLate} working day{i.workingDaysLate === 1 ? "" : "s"} late
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </ListPageShell>
  );
}
