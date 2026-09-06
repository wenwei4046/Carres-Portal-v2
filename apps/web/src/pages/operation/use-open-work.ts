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
  demandPurposeLabelOf,
  manualPurchaseForOf,
  manualPurchaseLineRemainingOf,
  manualPurchaseOrderByOf,
  manualPurchaseStatusOf,
  manualPurchaseSupplierSummary,
  manualPurchaseWorkContext,
  manualPurchaseWorkItems,
  countWorkingDays,
  myHolidaySet,
  orderActionLine,
  receivingWorkItems,
  purchaseOrderReplyWorkItems,
  poSupplierDeliveryDateOf,
  WAREHOUSE_OFF_DAYS,
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
  useOperationPos,
  useOperationStaff,
  useOperationStock,
  useOperationSuppliers,
  useOperationWarehouseReceipts,
  usePurchasingSettings,
  useReceivingDuty,
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
  // Card 06 §7 (wording Card 08 §3.4) — the Manual Purchase module supplies
  // its two governed actions (`Approve purchase` · `Issue PO`) from its own
  // register read; Work composes, stores nothing, and exposes no manual
  // Done.
  const manualQ = useManualPurchaseRegister();
  // §0.1 Action Owner Engine (2026-08-27) — Purchasing's order-track work
  // resolves to the month's PO-duty holder. Fails soft exactly as the duty
  // hook always has: dormant layer → no holder → the duty word stands.
  const poDutyQ = useOperationPoDuty();
  // Receiving's feed (2026-09-04 card): submitted counts + arrival-day POs,
  // owner from the ONE shared resolver — never a rota read (Law F.1).
  const receiptsQ = useOperationWarehouseReceipts("submitted");
  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const receivingDutyQ = useReceivingDuty();
  const supplierNameById = useMemo(
    () =>
      new Map(
        (suppliersQ.data?.suppliers ?? []).map((s) => [s.id, s.name ?? null]),
      ),
    [suppliersQ.data],
  );

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
        // The exact PO/version feed owns supplier replies, once per PO.
        if (it.ruleKey === "confirm_ready_date") continue;
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

  /* ── The Manual Purchase actions (Card 06 §7; wording Card 08 §3.4) ────
     Approval work belongs to the configured real approver; issuance to the
     month's NORMAL PO Duty holder (Team Work groups by them). Both are due
     no later than the request's server-derived Order By and deep-link the
     exact request by its invisible UUID. The row prints business facts —
     `Manual Purchase · {Need for} · {For} · {supplier}` — never a document
     number. Completion is the stored decision / the current PO version's
     confirmed-sent evidence — read here, never inferred. */
  const manualItems = useMemo(() => {
    const data = manualQ.data;
    // A partial payload composes nothing rather than crashing the set.
    if (!data?.requests) return [] as WorkRow[];
    const destNameById = new Map(
      (data.destinations ?? []).map((d) => [d.id, d.name]),
    );
    const supplierNameById = new Map(
      (data.suppliers ?? []).map((s) => [s.id, s.name]),
    );
    const userNameById = new Map(
      (data.users ?? []).map((u) => [u.id, u.name ?? ""]),
    );
    const caseNoById = new Map(
      (data.serviceCases ?? []).map((sc) => [sc.id, sc.case_no]),
    );
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
          /* ⭐ THE APPROVER'S NUMBER, NOT THE DATABASE'S COLUMN (YH, 2026-09-02).
             `manualPurchaseStatusOf` stopped reading `remainingQty` when the
             cut joined the arithmetic — it reads `approvedQty` now. This call
             site was still handing over `remaining_qty`, a field the input type
             no longer has, and never passing the cut at all. So the status fell
             back to `qty − issuedQty` and the OPEN-WORK RAIL kept showing a
             fully-issued request as outstanding, which is the same defect the
             register and the record page were fixed for. Three callers, one
             arithmetic; this was the third. */
          approvedQty: l.approved_qty,
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
          context: manualPurchaseWorkContext({
            purposeLabel: demandPurposeLabelOf(r.purpose) ?? r.purpose,
            forText: manualPurchaseForOf({
              purpose: r.purpose,
              destinationName: destNameById.get(r.destination_id) ?? null,
              serviceCaseNo: r.for_service_case_id
                ? (caseNoById.get(r.for_service_case_id) ?? null)
                : null,
              staffName: r.for_staff_user_id
                ? (userNameById.get(r.for_staff_user_id) || null)
                : null,
              subsidiaryName: r.for_subsidiary_name,
              why: r.why,
            }),
            supplierSummary: manualPurchaseSupplierSummary(
              live.map((l) =>
                l.supplier_id ? (supplierNameById.get(l.supplier_id) ?? "") : "",
              ),
            ),
          }),
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

  /* Receiving's projection (owner-approved 2026-08-29 slice; wired by the
     2026-09-04 card). Two triggers only — a submitted Warehouse count, and a
     supplier date that has arrived with goods still owed. Outstanding
     quantity alone never makes a row (the anti-spam rule), and lateness
     counts on the WAREHOUSE calendar (Mon–Sat). The owner is the ONE shared
     resolver's answer (`useReceivingDuty` → 0425); this hook never reads a
     rota or computes an offset (Law F.1). */
  const receivingItems = useMemo(() => {
    const receipts = receiptsQ.data?.receipts ?? [];
    const pos = posQ.data?.pos ?? [];
    const duty = receivingDutyQ.data;
    const grnDuty =
      duty?.normal_user_id != null
        ? {
            userId: duty.acting_user_id ?? duty.normal_user_id,
            name: duty.acting_user_name ?? duty.normal_user_name,
          }
        : null;
    const src = {
      submitted: receipts
        .filter((r) => r.status === "submitted")
        .map((r) => ({
          id: r.id,
          po_id: r.po_id,
          supplier_name: r.supplier_name,
          goods_received_at: r.goods_received_at,
          submitted_at: r.submitted_at,
        })),
      arrivalsDue: pos
        .filter((p) => p.status === "open")
        .map((p) => ({
          po_id: p.id,
          supplier_name: p.supplier_id
            ? (supplierNameById.get(p.supplier_id) ?? null)
            : null,
          eta_date: poSupplierDeliveryDateOf(p.promises, p.version ?? 1) ?? p.eta_date ?? null,
          pending_qty: (p.purchase_order_lines ?? []).reduce(
            (n, l) => n + Math.max(0, (l.qty ?? 0) - (l.received_qty ?? 0)),
            0,
          ),
        })),
    };
    const late = (dueIso: string) =>
      countWorkingDays(dueIso, today, {
        ...holidayOpts,
        offDays: WAREHOUSE_OFF_DAYS,
      });
    return receivingWorkItems(src, { grnDuty }, today, late).map(
      (it): WorkRow => ({
        ruleKey: it.ruleKey,
        module: "receiving" as WorkItem["module"],
        soRef: it.soRef,
        orderId: it.orderId,
        action: it.action,
        ownerName: it.ownerName,
        ownerUserId: it.ownerUserId,
        ...(it.ownerDuty ? { ownerDuty: it.ownerDuty } : {}),
        tone: it.tone,
        locked: false,
        broken: false,
        dueIso: it.dueIso,
        workingDaysLate: it.workingDaysLate,
        line: it.action,
        customer: null,
        ownerId: it.ownerUserId,
        deliveryDoNumber: null,
      }),
    );
  }, [
    receiptsQ.data,
    posQ.data,
    receivingDutyQ.data,
    supplierNameById,
    holidayOpts,
    today,
  ]);

  const supplierReplyItems = useMemo<WorkRow[]>(() => (posQ.data?.pos ?? []).flatMap(po => {
    const input = {
      id: po.id, supplierName: supplierNameById.get(po.supplier_id) ?? "Supplier",
      status: po.status, version: po.version,
      supplierDate: poSupplierDeliveryDateOf(po.promises, po.version ?? 1),
      lines: po.purchase_order_lines.map(line => ({ qty: line.qty, receivedQty: line.received_qty })),
      sends: (po.sends ?? []).map(send => ({ kind: send.kind, channel: send.channel,
        sentAt: send.sent_at, poVersion: send.po_version, recipient: send.recipient })),
    };
    return purchaseOrderReplyWorkItems(input, poDuty, today, holidayOpts.holidays).map(item => ({
      ...item, line: item.action, customer: null, ownerId: item.ownerUserId, deliveryDoNumber: null,
    }));
  }), [posQ.data, supplierNameById, poDuty, today, holidayOpts]);

  const allItems = useMemo(
    () => [...items, ...manualItems, ...receivingItems, ...supplierReplyItems],
    [items, manualItems, receivingItems, supplierReplyItems],
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
