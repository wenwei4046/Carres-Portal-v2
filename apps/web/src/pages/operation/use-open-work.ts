/**
 * THE ONE OPEN WORK SET — extracted 2026-08-15 (Quick Rail corrections).
 *
 * `OperationWork` composed this set inline and the Quick Rail's Team panel
 * needed the same numbers. The rail's own law (`ui/MASTER.md` §5) is that a
 * widget is a PEEK at authoritative truth and never a second work set, so the
 * only compliant way to preview `{n} open · {n} overdue` per person was to
 * make the computation shared: the rail and the Work destination now run the
 * SAME function, and they are structurally incapable of printing two answers
 * for one person.
 *
 * It is a hook rather than a plain function because the inputs are four cached
 * queries. It writes nothing, and it holds no rules of its own:
 *
 *   WHAT is open   ← `openActionsOf` — the same signal mapping the Orders list runs
 *   WHO + WHEN     ← Card 9's `workItemsForOrder` (PIC · one clock per key ·
 *                    working-days-late over a due that never moves)
 *
 * OVERDUE is `workingDaysLate > 0` — Card 9's own arithmetic, not a second
 * comparison against today. One derived fact, one arithmetic (ERP-ARCHITECTURE
 * ownership law D).
 */
import { useMemo } from "react";
import {
  deliveryQueueLeads,
  myHolidaySet,
  orderActionLine,
  workItemsForOrder,
  type OpsStaffMember,
  type WorkItem,
} from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import { personLabel } from "@/lib/staff-avatar";
import {
  useDeliveryPartners,
  useOperationOrders,
  useOperationStaff,
  useOperationStock,
  usePurchasingSettings,
} from "@/lib/queries";
import {
  logisticStateOf,
  moneyOf,
  openActionsOf,
  ovlOf,
  ownerOf,
  stockReadiness,
  todayIso,
} from "./OperationOrdersControl";

export interface WorkRow extends WorkItem {
  /** The party-named row line — the SAME words the Orders list prints. */
  line: string;
  customer: string | null;
  ownerId: string | null;
}

/** One person's share of the open set. `overdue` is a subset of `open`. */
export interface OwnerWorkload {
  userId: string;
  member: OpsStaffMember;
  open: number;
  overdue: number;
}

export interface OpenWorkSet {
  items: WorkRow[];
  staff: OpsStaffMember[];
  staffById: Map<string, OpsStaffMember>;
  loading: boolean;
}

export function useOpenWorkSet(): OpenWorkSet {
  const ordersQ = useOperationOrders();
  const staffQ = useOperationStaff();
  const stockQ = useOperationStock();
  const partnersQ = useDeliveryPartners();
  const settingsQ = usePurchasingSettings();

  const orders = useMemo(() => ordersQ.data?.orders ?? [], [ordersQ.data]);
  const staff = useMemo(() => staffQ.data?.staff ?? [], [staffQ.data]);
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);

  const staffById = useMemo(() => {
    const m = new Map<string, OpsStaffMember>();
    for (const s of staff) m.set(s.user_id, s);
    return m;
  }, [staff]);

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

  const items = useMemo(() => {
    const out: WorkRow[] = [];
    for (const o of orders) {
      const lines = (o.order_lines ?? []).map((l) => ({ sku: l.sku, qty: l.qty }));
      const open = openActionsOf(o, stockReadiness(o, availableBySku), lines);
      if (open.length === 0) continue;
      const ovl = ovlOf(o);
      const ownerId = ownerOf(o);
      const ownerMember = ownerId ? staffById.get(ownerId) : undefined;
      const workItems = workItemsForOrder(
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
      for (const it of workItems) {
        out.push({
          ...it,
          line: orderActionLine(it.ruleKey as Parameters<typeof orderActionLine>[0], {
            logistics: state.partner,
            customer: displayCustomerName(o.customer_name),
            amount: money.known ? money.outstanding : null,
          }),
          /* Capitalize up — owner ruling 2026-08-15. Cased where the work
             item is composed, so the Work row, the Quick Rail peek and the
             action sentence above all name the customer identically. */
          customer: displayCustomerName(o.customer_name) ?? null,
          ownerId,
        });
      }
    }
    return out;
  }, [
    orders, availableBySku, staffById, partnerNameById,
    holidayOpts, queueLeads, today,
  ]);

  return {
    items,
    staff,
    staffById,
    loading: ordersQ.isLoading || staffQ.isLoading,
  };
}

/**
 * Every operations staff member with their share of the open set.
 *
 * EVERY member appears, including one with nothing open — a rail that hides
 * the people at zero cannot answer *"is anyone free?"*, and a missing name
 * reads as a missing person rather than a clear desk. Sorted by the name the
 * portal prints, never by count: `ui/MASTER.md` §5 makes Team a coverage
 * preview, and ranking people is not one of its jobs.
 */
export function ownerWorkloads(
  items: readonly WorkRow[],
  staff: readonly OpsStaffMember[],
): OwnerWorkload[] {
  const open = new Map<string, number>();
  const overdue = new Map<string, number>();
  for (const i of items) {
    if (!i.ownerId) continue;
    open.set(i.ownerId, (open.get(i.ownerId) ?? 0) + 1);
    if (i.workingDaysLate > 0) {
      overdue.set(i.ownerId, (overdue.get(i.ownerId) ?? 0) + 1);
    }
  }
  return [...staff]
    .map((member) => ({
      userId: member.user_id,
      member,
      open: open.get(member.user_id) ?? 0,
      overdue: overdue.get(member.user_id) ?? 0,
    }))
    .sort((a, b) =>
      personLabel(a.member.name, a.member.email).localeCompare(
        personLabel(b.member.name, b.member.email),
      ),
    );
}
