/**
 * OperationWork — My Work / Team Work (SO V2 Card 10, owner ruling 2026-08-11;
 * display re-ruled by the DELIVERY ORDER BLUEPRINT card §7, owner-approved
 * 2026-08-16 — the Owner Engine two-line grammar).
 *
 * **TWO FILTERS over the ONE open work set — never two datasets, never
 * another dashboard.** This page is ASSEMBLY:
 *
 *   WHAT is open   ← the same `openActionsOf` the Orders list runs, plus the
 *                    composed facts (loan out · Finance exception · the
 *                    never-asked missing delivery date)
 *   WHO + WHEN     ← Card 9's `workItemsForOrder` — owner resolved per RULE
 *                    (§0.1: PO-duty holder · salesperson · PIC) · one clock
 *                    per key · working-days-late over a due that never moves
 *
 * THE TWO-LINE GRAMMAR (card §7, sizes 13/11 — ui/MASTER.md §5):
 *   line 1  the SHORT action sentence — the dictionary's own QUEUE word,
 *           which IS the registered display of the act (one mapping, no
 *           second definition)
 *   line 2  names · document numbers · the due date — `due Wed, 20 Aug`,
 *           or `Late — was due Mon, 18 Aug`. Never stuffed into line 1.
 *
 * MY WORK shows only the signed-in person's actions (the scope answers who —
 * no repeated avatar). TEAM WORK groups per staff: avatar · full name ·
 * `{n} actions to do` · `{n} late` · the action list. Never a bare count word
 * — every count says WHAT it counts (card §7, supersedes the 2026-08-14
 * `open · overdue` tally). An item whose duty has no roster holder yet groups
 * under its DUTY word — never a hand-picked person, never the PIC borrowed
 * for another module's work.
 *
 * The page WRITES NOTHING. A row is a door to the Sales Order Workspace.
 * There is no Done button anywhere, structurally.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { groupWorkItemsByDay, isOpsManager } from "@carres/shared";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import { useOperationStaff } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { useOpenWorkSet, type WorkRow } from "./use-open-work";

type ViewKey = "mine" | "team";

const DELIVERY_ARRANGEMENT_ACTIONS = new Set([
  "assign_logistics",
  "confirm_delivery_date",
  "arrange_new_delivery_date",
]);

const DELIVERY_ORDER_ACTIONS = new Set([
  "deliver_today",
  "issue_delivery_order",
]);

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  neutral: "bg-base-300",
};

/** Line 2 — names · document numbers · due date, in the quieter rank. */
function supportingLine(i: WorkRow): string {
  const parts: string[] = [];
  if (i.customer) parts.push(i.customer);
  parts.push(i.soRef);
  if (i.workingDaysLate > 0 && i.dueIso) {
    parts.push(`Late — was due ${fmtDate(i.dueIso)}`);
  } else if (i.dueIso) {
    parts.push(`due ${fmtDate(i.dueIso)}`);
  }
  return parts.join(" · ");
}

function WorkRowButton({
  item,
  onOpen,
}: {
  item: WorkRow;
  onOpen: (i: WorkRow) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      onClick={() => onOpen(item)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-base-50"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full shrink-0 ${TONE_DOT[item.broken ? "danger" : item.tone] ?? "bg-base-300"}`}
      />
      <span className="flex-1 min-w-0">
        {/* Line 1 — the short action sentence: the dictionary's queue word. */}
        <span className={`${cjkClassName(item.action)} text-body font-semibold text-base-900 block truncate`}>
          {item.locked && (
            <Lock size={11} strokeWidth={2.5} className="inline mr-1 -mt-0.5" aria-label="Held by Finance" />
          )}
          {item.action}
        </span>
        {/* Line 2 — names · numbers · the due date, 11px regular. */}
        <span
          className={`block truncate text-label font-normal ${
            item.workingDaysLate > 0 ? "text-danger" : "text-base-600"
          }`}
        >
          {supportingLine(item)}
        </span>
      </span>
    </button>
  );
}

export default function OperationWork() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const staffQ = useOperationStaff();

  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);
  const myDuties = staffQ.data?.myDuties;
  const isManager = isOpsManager(authRole, authEmail, myDuties);

  const { items: allItems, staff, staffById, loading } = useOpenWorkSet();

  // The rail deep-links into a person's work: `?tab=work&scope=team&owner=…`.
  const linkedScope = params.get("scope");
  const linkedOwner = params.get("owner");
  const [view, setView] = useState<ViewKey | null>(
    linkedScope === "team" ? "team" : linkedScope === "mine" ? "mine" : null,
  );
  const activeView: ViewKey = view ?? (isManager ? "team" : "mine");
  const [ownerFocus, setOwnerFocus] = useState<string | null>(linkedOwner);

  const myUserId = useMemo(() => {
    if (!authEmail) return null;
    const me = staff.find((s) => s.email.toLowerCase() === authEmail.toLowerCase());
    return me?.user_id ?? null;
  }, [staff, authEmail]);

  /** My Work — only the signed-in person's actions. */
  const mine = useMemo(
    () => (myUserId ? allItems.filter((i) => i.ownerId === myUserId) : []),
    [allItems, myUserId],
  );
  const myGroups = useMemo(() => groupWorkItemsByDay(mine), [mine]);

  /** Team Work — grouped per RESOLVED owner (§0.1 Action Owner Engine,
   *  2026-08-27): an ops account (PIC · PO-duty holder), a named non-account
   *  person (a salesperson), or — where no roster holder exists — the DUTY
   *  word. */
  const teamGroups = useMemo(() => {
    const byOwner = new Map<string, WorkRow[]>();
    for (const i of allItems) {
      const key =
        i.ownerId ??
        (i.ownerName
          ? `person:${i.ownerName}`
          : `duty:${i.ownerDuty ?? "No owner yet"}`);
      const list = byOwner.get(key) ?? [];
      list.push(i);
      byOwner.set(key, list);
    }
    const groups = [...byOwner.entries()].map(([key, items]) => {
      const staffMember = key.startsWith("duty:") || key.startsWith("person:")
        ? null
        : staffById.get(key) ?? null;
      // A resolved person without an ops account still has a NAME (the
      // salesperson) — a person group, initials and all, never a duty word.
      const personName = staffMember
        ? personLabel(staffMember.name, staffMember.email)
        : key.startsWith("person:")
          ? key.slice(7)
          : (items[0]?.ownerName ?? null);
      const dutyWord = key.startsWith("duty:") ? key.slice(5) : null;
      return {
        key,
        person: personName !== null,
        userId: staffMember ? key : null,
        name: personName ?? dutyWord ?? "No owner yet",
        items: [...items].sort((a, b) =>
          (a.dueIso ?? "9999").localeCompare(b.dueIso ?? "9999"),
        ),
        late: items.filter((i) => i.workingDaysLate > 0).length,
      };
    });
    // People first (by printed name — coverage, never a ranking), duties last.
    return groups.sort((a, b) =>
      a.person && !b.person ? -1 : !a.person && b.person ? 1 : a.name.localeCompare(b.name),
    );
  }, [allItems, staffById]);

  const visibleTeamGroups = useMemo(
    () => (ownerFocus ? teamGroups.filter((g) => g.userId === ownerFocus) : teamGroups),
    [teamGroups, ownerFocus],
  );

  const visible = activeView === "mine" ? mine : allItems;
  const lateCount = visible.filter((i) => i.workingDaysLate > 0).length;

  /* A row is a DOOR to the object that owns the act. Delivery arrangement
     work opens Delivery's editor; trip/result work opens the active DO. The
     photo and loan rows retain the Sales Order until their existing governed
     writers are mounted on the DO; a precise working door beats a dead one. */
  const openRow = (i: WorkRow) => {
    if (i.ruleKey.startsWith("manual_purchase.")) {
      navigate(`/operation?tab=manual-purchase&mpr=${i.orderId}`);
      return;
    }
    if (DELIVERY_ARRANGEMENT_ACTIONS.has(i.ruleKey)) {
      navigate(`/operation/delivery/edit/${encodeURIComponent(i.orderId)}`);
      return;
    }
    if (DELIVERY_ORDER_ACTIONS.has(i.ruleKey)) {
      navigate(
        i.deliveryDoNumber
          ? `/operation/delivery-orders/${encodeURIComponent(i.deliveryDoNumber)}`
          : `/operation/delivery/edit/${encodeURIComponent(i.orderId)}`,
      );
      return;
    }
    navigate(`/operation/orders/so/${i.orderId}`);
  };

  return (
    <ListPageShell
      title="Work"
      testId="operation-work"
      titleRight={
        // Every count says WHAT it counts (card §7 — supersedes `open · overdue`).
        <span className="text-label text-base-400">
          {visible.length} action{visible.length === 1 ? "" : "s"} to do
          {lateCount > 0 ? ` · ${lateCount} late` : ""}
        </span>
      }
      toolbar={
        <div className="flex items-center gap-2 flex-wrap">
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
                onClick={() => {
                  setView(k);
                  if (k === "mine") setOwnerFocus(null);
                }}
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
          {activeView === "team" && ownerFocus && (
            <button
              type="button"
              data-testid="work-owner-clear"
              onClick={() => setOwnerFocus(null)}
              className="px-2 py-1 rounded-full text-label border border-base-900 bg-base-900 text-white"
            >
              {staffById.get(ownerFocus)
                ? personLabel(staffById.get(ownerFocus)!.name, staffById.get(ownerFocus)!.email)
                : "One person"}{" "}
              · Clear
            </button>
          )}
        </div>
      }
    >
      <div className="h-full overflow-y-auto px-5 py-4" data-testid="work-list">
        {loading ? (
          <div className="text-body text-base-400 py-8">Loading…</div>
        ) : activeView === "mine" ? (
          myGroups.length === 0 ? (
            <div className="text-body text-base-400 py-8" data-testid="work-empty">
              {!myUserId
                ? "Your account is not in the staff list yet — switch to Team Work."
                : "No open work — every track is clear."}
            </div>
          ) : (
            myGroups.map((g) => (
              <section key={g.dayIso ?? "none"} className="mb-5" data-testid={`work-day-${g.dayIso ?? "none"}`}>
                <h2 className="text-label font-semibold text-base-500 uppercase tracking-wide mb-1.5">
                  {g.dayIso ? fmtDate(g.dayIso) : "No date"}
                  <span className="ml-2 font-normal normal-case text-base-400">
                    {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
                    {g.late > 0 && <span className="text-danger"> · {g.late} late</span>}
                  </span>
                </h2>
                <div className="border border-base-200 rounded-md divide-y divide-base-100 bg-white">
                  {g.items.map((i) => (
                    <WorkRowButton key={`${i.orderId}:${i.ruleKey}`} item={i as WorkRow} onOpen={openRow} />
                  ))}
                </div>
              </section>
            ))
          )
        ) : visibleTeamGroups.length === 0 ? (
          <div className="text-body text-base-400 py-8" data-testid="work-empty">
            No open work — every track is clear.
          </div>
        ) : (
          visibleTeamGroups.map((g) => (
            <section key={g.key} className="mb-5" data-testid={`work-owner-group-${g.key}`}>
              <h2 className="flex items-center gap-2 mb-1.5">
                {g.person ? (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      /* Stable per-person colour — the account id where one
                         exists, else the group key (a salesperson has no ops
                         account; the hash only needs a stable string). */
                      backgroundColor: avatarColor(g.userId ?? g.key).bg,
                      color: avatarColor(g.userId ?? g.key).fg,
                    }}
                  >
                    {personInitials(g.name, "")}
                  </span>
                ) : null}
                <span className="text-body font-semibold text-base-900">{g.name}</span>
                <span className="text-label font-normal text-base-400">
                  {g.items.length} action{g.items.length === 1 ? "" : "s"} to do
                  {g.late > 0 && <span className="text-danger"> · {g.late} late</span>}
                </span>
              </h2>
              <div className="border border-base-200 rounded-md divide-y divide-base-100 bg-white">
                {g.items.map((i) => (
                  <WorkRowButton key={`${i.orderId}:${i.ruleKey}`} item={i} onOpen={openRow} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </ListPageShell>
  );
}
