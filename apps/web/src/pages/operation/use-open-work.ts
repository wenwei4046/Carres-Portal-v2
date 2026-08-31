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
 *   WHO + WHEN     ← Card 9's `workItemsForOrder` — the owner resolved per
 *                    RULE (§0.1 Action Owner Engine, 2026-08-27: PO-duty
 *                    holder · salesperson · PIC) · one clock per key ·
 *                    working-days-late over a due that never moves
 *
 * OVERDUE is `workingDaysLate > 0` — Card 9's own arithmetic, not a second
 * comparison against today. One derived fact, one arithmetic (ERP-ARCHITECTURE
 * ownership law D).
 */
import { useMemo } from "react";
import {
  deliveryQueueLeads,
  manualPurchaseLineRemainingOf,
  manualPurchaseOrderByOf,
  manualPurchaseStatusOf,
  manualPurchaseWorkItems,
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
  useManualPurchaseRegister,
  useOperationOrders,
  useOperationPoDuty,
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
  /** The RESOLVED owner's account id (§0.1 Action Owner Engine, 2026-08-27):
   *  the PO-duty holder for Purchasing's work, else the PIC. Null for a named
   *  non-account owner (a salesperson) and for a duty word. */
  ownerId: string | null;
  /** Delivery's active document door. Null means the work belongs to the
   *  arrangement/scope rather than an issued Delivery Order. */
  deliveryDoNumber: string | null;
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
  // Card 06 §7 — the Manual Purchase module supplies its two governed
  // actions (`Approve {MPR}` · `Issue the purchase order for {MPR}`) from
  // its own register read; Work composes, stores nothing, and exposes no
  // manual Done.
  const manualQ = useManualPurchaseRegister();
  // §0.1 Action Owner Engine (2026-08-27) — Purchasing's order-track work
  // resolves to the month's PO-duty holder. Fails soft exactly as the duty
  // hook always has: dormant layer → no holder → the duty word stands.
  const poDutyQ = useOperationPoDuty();

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

  const poDuty = useMemo(() => {
    const holder = poDutyQ.data?.holder;
    if (!holder) return null;
    return {
      userId: holder.userId,
      name: personLabel(holder.name, holder.email),
    };
  }, [poDutyQ.data]);

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
      const ovl = ovlOf(o);
      const ownerId = ownerOf(o);
      const ownerMember = ownerId ? staffById.get(ownerId) : undefined;
      // The composed Work facts (blueprint card §7 + §0.1 row 1) + the
      // Assign-logistics due anchor (the EARLIEST PO's issue day;
      // stock-source: the order day).
      const poIssueDays = (o.order_supplier_threads ?? [])
        .map((t) => t.purchase_orders?.placed_at ?? null)
        .filter((d): d is string => Boolean(d))
        .sort();
      const workItems = workItemsForOrder(
        open,
        {
          orderId: o.id,
          so: o.so,
          picName: ownerMember ? personLabel(ownerMember.name, ownerMember.email) : null,
          picUserId: ownerId,
          poDuty,
          salespersonName: o.salespersons?.name ?? null,
          // §0.1 row 1 — the 3 nobody asked, never the 8 who answered "not
          // yet" (owner ruling 2026-08-15), and never a finished order.
          askDeliveryDate:
            !o.delivery_date &&
            !o.delivery_date_tbd &&
            o.status !== "delivered" &&
            !o.delivered_at,
          promisedDateIso: o.delivery_date_tbd ? null : o.delivery_date ?? null,
          confirmedDateIso: ovl?.confirmed_date ?? null,
          deliveredAtIso: o.delivered_at ?? null,
          delayDetectedAtIso: ovl?.delay_detected_at ?? null,
          delayDecisionAtIso: ovl?.delay_decision_at ?? null,
          poIssuedAtIso: poIssueDays[0] ?? null,
          placedAtIso: o.placed_at ?? null,
          financeExceptionHolds: (o.order_finance_exceptions ?? []).some(
            (e) => e.status === "open",
          ),
          loanOutstanding: (o.ops_sofa_loans ?? []).some(
            (l) => l.status === "on_loan",
          ),
        },
        today,
        holidayOpts,
        queueLeads,
      );
      if (workItems.length === 0) continue;
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
          deliveryDoNumber: o.do_number?.trim() || null,
          /* The RESOLVED owner's account (2026-08-27) — the PO-duty holder
             for Purchasing's work, else the PIC; never the PIC borrowed for
             another rule's item. */
          ownerId: it.ownerUserId,
        });
      }
    }
    return out;
  }, [
    orders, availableBySku, staffById, partnerNameById,
    holidayOpts, queueLeads, today, poDuty,
  ]);

  /* ── The Manual Purchase actions (Card 06 §7) ──────────────────────────
     Approval work belongs to the configured real approver; issuance to the
     month's NORMAL PO Duty holder (Team Work groups by them). Both are due
     no later than the request's server-derived Order By and deep-link the
     exact MPR. Completion is the stored decision / the current PO version's
     confirmed-sent evidence — read here, never inferred. */
  const manualItems = useMemo(() => {
    const data = manualQ.data;
    // A partial payload composes nothing rather than crashing the set.
    if (!data?.requests) return [] as WorkRow[];
    const approverRaw =
      (data.approvers ?? []).find((a) => (a.name ?? "").trim() !== "") ?? null;
    const approver = approverRaw
      ? { userId: approverRaw.id, name: approverRaw.name }
      : null;
    const sentByPo = new Map((data.pos ?? []).map((p) => [p.id, p.sent === true]));
    const linesByReq = new Map<string, typeof data.lines>();
    for (const l of data.lines ?? []) {
      const list = linesByReq.get(l.request_id) ?? [];
      list.push(l);
      linesByReq.set(l.request_id, list);
    }
    const mpToday = data.todayIso ?? today;
    const out: WorkRow[] = [];
    for (const r of data.requests) {
      const lines = linesByReq.get(r.id) ?? [];
      const live = lines.filter((l) => l.cancelled_at === null);
      const status = manualPurchaseStatusOf({
        approvalRequired: r.approval_required,
        approvedAt: r.approved_at,
        refusedAt: r.refused_at,
        refuseReason: r.refuse_reason,
        lines: lines.map((l) => ({
          qty: l.qty,
          issuedQty: l.issued_qty,
          remainingQty: l.remaining_qty,
          cancelledAt: l.cancelled_at,
          poId: l.po_id,
          received: l.received,
        })),
      });
      const linkedPoIds = [
        ...new Set(
          live.flatMap((l) => l.po_ids ?? (l.po_id ? [l.po_id] : [])),
        ),
      ];
      const workItems = manualPurchaseWorkItems(
        {
          requestId: r.id,
          reqNo: r.req_no,
          status: status.kind,
          remainingQty: live.reduce(
            (n, l) =>
              n +
              manualPurchaseLineRemainingOf({
                qty: l.qty,
                approvedQty: l.approved_qty,
                issuedQty: l.issued_qty,
              }),
            0,
          ),
          orderBy: manualPurchaseOrderByOf(live.map((l) => l.order_by ?? null)),
          hasPos: linkedPoIds.length > 0,
          posAllSent:
            linkedPoIds.length > 0 &&
            linkedPoIds.every((id) => sentByPo.get(id) === true),
        },
        { approver, poDuty },
        mpToday,
        holidayOpts,
      );
      for (const it of workItems) {
        out.push({
          ...it,
          line: it.action,
          customer: null,
          ownerId: it.ownerUserId,
          deliveryDoNumber: null,
        });
      }
    }
    return out;
  }, [manualQ.data, poDuty, holidayOpts, today]);

  const allItems = useMemo(
    () => [...items, ...manualItems],
    [items, manualItems],
  );

  return {
    items: allItems,
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
