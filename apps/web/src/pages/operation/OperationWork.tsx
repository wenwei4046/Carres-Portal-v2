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
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  deliveryQueueLeads,
  groupWorkItemsByDay,
  isOpsManager,
  myHolidaySet,
  orderActionLine,
  workItemsForOrder,
  type OpsStaffMember,
  type WorkItem,
} from "@carres/shared";
import { cjkClassName } from "@/lib/cjk";
import { personLabel } from "@/lib/staff-avatar";
import ListPageShell from "@/components/ListPageShell";
import {
  useDeliveryPartners,
  useOperationOrders,
  useOperationStaff,
  useOperationStock,
  usePurchasingSettings,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import {
  logisticStateOf,
  moneyOf,
  openActionsOf,
  ovlOf,
  ownerOf,
  stockReadiness,
  todayIso,
} from "./OperationOrdersControl";

type ViewKey = "mine" | "team";

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  neutral: "bg-base-300",
};

interface WorkRow extends WorkItem {
  /** The party-named row line — the SAME words the Orders list prints. */
  line: string;
  customer: string | null;
  ownerId: string | null;
}

export default function OperationWork() {
  const navigate = useNavigate();
  const ordersQ = useOperationOrders();
  const staffQ = useOperationStaff();
  const stockQ = useOperationStock();
  const partnersQ = useDeliveryPartners();
  const settingsQ = usePurchasingSettings();

  const authRole = useAuth((s) => s.role);
  const authEmail = useAuth((s) => s.user?.email ?? null);
  const myDuties = staffQ.data?.myDuties;
  const isManager = isOpsManager(authRole, authEmail, myDuties);

  // §2.2 OWNER SCOPE — a starting view, never a wall. Initialised once from
  // the role; the operator may switch at any time.
  const [view, setView] = useState<ViewKey | null>(null);
  const activeView: ViewKey = view ?? (isManager ? "team" : "mine");
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());

  const orders = useMemo(() => ordersQ.data?.orders ?? [], [ordersQ.data]);
  const staff = useMemo(() => staffQ.data?.staff ?? [], [staffQ.data]);
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);

  const staffById = useMemo(() => {
    const m = new Map<string, OpsStaffMember>();
    for (const s of staff) m.set(s.user_id, s);
    return m;
  }, [staff]);
  const myUserId = useMemo(() => {
    if (!authEmail) return null;
    const me = staff.find((s) => s.email.toLowerCase() === authEmail.toLowerCase());
    return me?.user_id ?? null;
  }, [staff, authEmail]);

  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);

  const availableBySku = useMemo(() => {
    const rows = stockQ.data?.skus ?? [];
    if (rows.length === 0) return undefined;
    const m = new Map<string, number>();
    for (const s of rows) m.set(s.sku, s.available);
    return m;
  }, [stockQ.data]);

  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);
  const queueLeads = useMemo(
    () => (settingsQ.data ? deliveryQueueLeads(settingsQ.data) : undefined),
    [settingsQ.data],
  );
  const today = todayIso();

  /** The ONE open work set — every order, through the one signal mapping,
   *  composed by Card 9. Completed orders contribute only what their engines
   *  still hold open (the photo, the money that survives delivery). */
  const allItems = useMemo(() => {
    const out: WorkRow[] = [];
    for (const o of orders) {
      const lines = (o.order_lines ?? []).map((l) => ({ sku: l.sku, qty: l.qty }));
      const open = openActionsOf(o, stockReadiness(o, availableBySku), lines);
      if (open.length === 0) continue;
      const ovl = ovlOf(o);
      const ownerId = ownerOf(o);
      const ownerMember = ownerId ? staffById.get(ownerId) : undefined;
      const items = workItemsForOrder(
        open,
        {
          orderId: o.id,
          so: o.so,
          picName: ownerMember ? personLabel(ownerMember.name, ownerMember.email) : null,
          promisedDateIso: o.delivery_date_tbd ? null : o.delivery_date ?? null,
          confirmedDateIso: ovl?.confirmed_date ?? null,
          deliveredAtIso: o.delivered_at ?? null,
          delayDetectedAtIso: ovl?.delay_detected_at ?? null,
          delayDecisionAtIso: ovl?.delay_decision_at ?? null,
        },
        today,
        holidayOpts,
        queueLeads,
      );
      const state = logisticStateOf(o, partnerNameById);
      const money = moneyOf(o);
      for (const it of items) {
        out.push({
          ...it,
          line: orderActionLine(it.ruleKey as Parameters<typeof orderActionLine>[0], {
            logistics: state.partner,
            customer: o.customer_name,
            amount: money.known ? money.outstanding : null,
          }),
          customer: o.customer_name ?? null,
          ownerId,
        });
      }
    }
    return out;
  }, [
    orders, availableBySku, staffById, partnerNameById,
    holidayOpts, queueLeads, today,
  ]);

  /** My Work / Team Work — two filters, one set. */
  const visible = useMemo(() => {
    if (activeView === "mine") {
      return myUserId ? allItems.filter((i) => i.ownerId === myUserId) : [];
    }
    if (ownerFilter.size === 0) return allItems;
    return allItems.filter((i) => i.ownerId != null && ownerFilter.has(i.ownerId));
  }, [allItems, activeView, myUserId, ownerFilter]);

  const groups = useMemo(() => groupWorkItemsByDay(visible), [visible]);

  /** Owner chips (Team view) — counts of open items per person, from the SAME
   *  set. Visibility, never a ranking. */
  const ownerCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of allItems) {
      if (i.ownerId) m.set(i.ownerId, (m.get(i.ownerId) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, n]) => ({ id, n, member: staffById.get(id) }))
      .filter((x) => x.member)
      .sort((a, b) =>
        personLabel(a.member!.name, a.member!.email).localeCompare(
          personLabel(b.member!.name, b.member!.email),
        ),
      );
  }, [allItems, staffById]);

  const toggleOwner = (id: string) =>
    setOwnerFilter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const loading = ordersQ.isLoading || staffQ.isLoading;

  return (
    <ListPageShell
      title="Work"
      testId="operation-work"
      titleRight={
        <span className="text-label text-base-400">
          {visible.length} open · {visible.filter((i) => i.workingDaysLate > 0).length} late
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
              {ownerCounts.map(({ id, n, member }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`work-owner-${id}`}
                  onClick={() => toggleOwner(id)}
                  className={`px-2 py-1 rounded-full text-label border ${
                    ownerFilter.has(id)
                      ? "border-base-900 bg-base-900 text-white"
                      : "border-base-200 bg-white text-base-600 hover:bg-base-50"
                  }`}
                  title={member!.email}
                >
                  {personLabel(member!.name, member!.email)} · {n}
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
                  {g.late > 0 && <span className="text-danger"> · {g.late} late</span>}
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
