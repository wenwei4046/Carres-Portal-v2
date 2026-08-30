import { useEffect, useMemo, useState } from "react";
import {
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  MANUAL_PURCHASE_APPROVAL_WORDS,
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  MANUAL_PURCHASE_STATUS_WORDS,
  MANUAL_PURCHASE_WORDS as MW,
  TO_ORDER_WORDS as W,
  categoryLabel,
  demandPurposeLabelOf,
  manualPurchaseApprovalOf,
  manualPurchaseApproverLine,
  manualPurchaseHistoryRecord,
  manualPurchaseDeliverToSummary,
  manualPurchaseForOf,
  manualPurchaseIssueGroupCount,
  manualPurchaseIssueSentence,
  manualPurchaseItemsSummary,
  manualPurchaseLeadDayFacts,
  manualPurchaseLineRemainingOf,
  manualPurchaseOrderByLine,
  manualPurchaseOrderByOf,
  manualPurchasePoSummary,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseSelectable,
  manualPurchaseStatusOf,
  manualPurchaseSupplierSummary,
  manualPurchaseTimingOf,
  manualPurchaseWorkOrder,
  purchasingRefusal,
  stillNeededOf,
  type DemandPickItem,
  type DemandPurpose,
  type ManualPurchaseApprovalKind,
  type ManualPurchaseRailFilter,
  type ManualPurchaseStatus,
  type ManualPurchaseStatusKind,
  type OrderActionTone,
  type ProductCategory,
} from "@carres/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import {
  DataGrid,
  type DataGridColumn,
} from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import {
  useAlreadyOnPo,
  useCreatePurchaseRequest,
  useCreatePurchaseRequestLine,
  useDecidePurchaseRequest,
  useIssuePurchaseRequests,
  useManualPurchaseDetail,
  useManualPurchasePlan,
  useManualPurchaseRegister,
  type ManualPurchasePlanLine,
  type ManualPurchaseRegisterPayload,
  type PurchaseRequestLineRow,
  type PurchaseRequestRow,
} from "@/lib/queries";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
import PurchasingTabs from "./PurchasingTabs";
import SalesOrderTabs from "./SalesOrderTabs";
import { Block } from "./SalesOrderWorkspace";
import {
  RecordRanks,
  groupHistoryChronology,
  historyActorWords,
} from "./SalesOrderLedger";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";

/**
 * MANUAL PURCHASE — the request, the approval, the order
 * (PURCHASING CARD 04 — the permanent Register;
 *  docs/purchasing/MASTER.md §9.2; docs/COPY-STANDARD.md).
 *
 * The permanent right-side Register: one Manual Purchase request per parent
 * row, complete history by default (ordered records included — `All not
 * ordered` is Card 03's explicit rail filter, never a silent default), the
 * eleven governed columns in the Card's exact order, the read-only
 * expansion, and selection that admits ONLY `Ready to order` remainder.
 * PO Duty appears nowhere until a selection exists, then once, beside the
 * issue action (the SO Batch sibling grammar).
 *
 * Status is ONE arithmetic — `manualPurchaseStatusOf` in packages/shared
 * (Law D) — over facts the register read returns. Nothing here computes a
 * second version, and `Arrived` has no button anywhere (the Observation
 * Law: the system reads the linked PO's posted receipt).
 *
 * Money appears NOWHERE on this page: Purchasing has no money, and the
 * approver-only money surface is the approval slice's, server-gated.
 */

/** The remembered open/closed choice for the local filter rail (ui/MASTER —
 *  LOCAL FILTER RAIL COLLAPSE). Per staff browser, like SO Batch's. */
const FILTER_RAIL_STORAGE_KEY = "carres.manualPurchase.filterRail.v1";

/** Approval pills — the waiting state louder, decided states quiet. */
const APPROVAL_TONE: Record<ManualPurchaseApprovalKind, OrderActionTone> = {
  need_approval: "warning",
  approved: "success",
  refused: "neutral",
  not_needed: "neutral",
};

/** Detail pills keep the request-status tones (unchanged from Card 03). */
const STATUS_TONE: Record<ManualPurchaseStatusKind, OrderActionTone> = {
  waiting_approval: "warning",
  waiting_sku: "warning",
  ready_to_order: "info",
  ordered: "neutral",
  arrived: "success",
  not_going_ahead: "neutral",
};

/** One expansion line — exact per-line quantities and lineage (Card 04). */
interface ExpansionLine {
  id: string;
  sku: string;
  item: string;
  requestedQty: number;
  approvedQty: number | null;
  orderedQty: number;
  stillToOrder: number;
  supplier: string;
  deliverTo: string;
  poNos: string[];
  cancelled: boolean;
  cancelReason: string | null;
}

interface RequestRegisterRow {
  id: string;
  reqNo: string;
  purpose: string;
  /** Card 06 §3.1 — the actual hand-off fact (`created_at`), immutable. */
  proceedDate: string;
  approval: { kind: ManualPurchaseApprovalKind; label: string };
  poNos: string[];
  /** Card 06 §3.2 — when supplier goods must reach Deliver To
   *  (`required_by`); a historical null prints `Not recorded`. */
  deliveryDate: string | null;
  /** The SERVER-derived earliest line Order By (Card 06 §3.3), or null. */
  orderBy: string | null;
  forText: string;
  itemsText: string;
  qty: number;
  supplierText: string;
  deliverToText: string;
  requestedBy: string;
  status: ManualPurchaseStatus;
  /** Live remainder still issuable — the selection gate's other half. */
  remainingQty: number;
  /** The CATALOG's categories on the request's live lines (Card 03) —
   *  the rail's `PRODUCT` facts, never SKU-text inference. */
  lineCategories: (ProductCategory | null)[];
  /** Actual supplier names behind the live lines — the demand line's
   *  Catalog-derived supplier (0323/0359), never chosen by Operation. */
  lineSupplierNames: (string | null)[];
  /** Per live line: the server's Order By — the rail's timing facts. */
  lineOrderBys: (string | null)[];
  /** Card 06 §5 — the named configuration gaps the rail's work/setup
   *  lenses filter by, straight from the server's own plan. */
  supplierGap: boolean;
  productionDaysMissing: boolean;
  transitDaysMissing: boolean;
  /** The document-partition facts behind `Issue {n} PO{s}` — Card 06 adds
   *  Delivery Date: one PO has ONE official supplier-facing date. */
  issueWalls: Array<{
    supplierId: string | null;
    category: string | null;
    destinationId: string;
    purpose: string;
    deliveryDate: string | null;
    remainingQty: number;
  }>;
  lines: ExpansionLine[];
  /** Every searchable token the columns cannot carry alone (SKUs). */
  skuTokens: string;
}

/** ONE label arithmetic (Law D) — approved and retired values both answer;
 *  an unexpected value prints itself rather than a blank cell. */
function purposeLabelOf(value: string): string {
  return demandPurposeLabelOf(value) ?? value;
}

function buildRows(data: ManualPurchaseRegisterPayload): RequestRegisterRow[] {
  const destName = new Map(data.destinations.map((d) => [d.id, d.name]));
  const userName = new Map(data.users.map((u) => [u.id, u.name ?? ""]));
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const poNo = new Map(data.pos.map((p) => [p.id, p.po_no]));
  const caseNo = new Map(data.serviceCases.map((sc) => [sc.id, sc.case_no]));
  const linesByReq = new Map<string, PurchaseRequestLineRow[]>();
  for (const l of data.lines) {
    const list = linesByReq.get(l.request_id) ?? [];
    list.push(l);
    linesByReq.set(l.request_id, list);
  }

  /* Newest request first BY DEFAULT (Card 04 §3.1) — the actual
     `created_at`, asserted here rather than trusted to payload order. */
  const requests = [...data.requests].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return requests.map((r: PurchaseRequestRow) => {
    const lines = linesByReq.get(r.id) ?? [];
    const live = lines.filter((l) => l.cancelled_at === null);
    const linePoNos = (l: PurchaseRequestLineRow): string[] =>
      [
        ...new Set(
          (l.po_ids ?? (l.po_id ? [l.po_id] : [])).map((id) => poNo.get(id) ?? ""),
        ),
      ].filter((n) => n !== "");
    const remainingOf = (l: PurchaseRequestLineRow) =>
      manualPurchaseLineRemainingOf({
        qty: l.qty,
        approvedQty: l.approved_qty,
        issuedQty: l.issued_qty,
      });
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
    const deliverNames = live.map(
      (l) => destName.get(l.destination_id ?? r.destination_id) ?? "",
    );
    return {
      id: r.id,
      reqNo: r.req_no,
      purpose: r.purpose,
      proceedDate: r.created_at,
      approval: manualPurchaseApprovalOf({
        approvalRequired: r.approval_required,
        approvedAt: r.approved_at,
        refusedAt: r.refused_at,
      }),
      poNos: [...new Set(live.flatMap(linePoNos))],
      deliveryDate: r.required_by,
      /* The earliest server-derived line Order By governs the request —
         the first item that must start (Card 06 §3.3). */
      orderBy: manualPurchaseOrderByOf(live.map((l) => l.order_by ?? null)),
      forText: manualPurchaseForOf({
        purpose: r.purpose,
        destinationName: destName.get(r.destination_id) ?? null,
        serviceCaseNo: r.for_service_case_id
          ? (caseNo.get(r.for_service_case_id) ?? null)
          : null,
        staffName: r.for_staff_user_id
          ? (userName.get(r.for_staff_user_id) || null)
          : null,
        subsidiaryName: r.for_subsidiary_name,
        why: r.why,
      }),
      itemsText: manualPurchaseItemsSummary(
        live.map((l) => l.item_label ?? l.sku),
      ),
      qty: live.reduce((n, l) => n + l.qty, 0),
      supplierText: manualPurchaseSupplierSummary(
        live.map((l) =>
          l.supplier_id ? (supplierName.get(l.supplier_id) ?? "") : "",
        ),
      ),
      deliverToText: manualPurchaseDeliverToSummary(
        deliverNames.length > 0 ? deliverNames : [destName.get(r.destination_id) ?? ""],
      ),
      requestedBy: userName.get(r.created_by ?? "") ?? "",
      status,
      remainingQty: live.reduce((n, l) => n + remainingOf(l), 0),
      lineCategories: live.map(
        (l) => (l.category as ProductCategory | null | undefined) ?? null,
      ),
      lineSupplierNames: live.map((l) =>
        l.supplier_id ? (supplierName.get(l.supplier_id) ?? null) : null,
      ),
      lineOrderBys: live.map((l) => l.order_by ?? null),
      /* Card 06 §5 — the named gaps, straight from the server's plan:
         a live line without its Catalog supplier, or with a supplier whose
         Settings numbers nobody set. */
      supplierGap: live.some((l) => l.supplier_id == null),
      productionDaysMissing: live.some((l) => l.production_days_missing === true),
      transitDaysMissing: live.some((l) => l.transit_days_missing === true),
      issueWalls: live.map((l) => ({
        supplierId: l.supplier_id,
        category: (l.category as string | null | undefined) ?? null,
        destinationId: l.destination_id ?? r.destination_id,
        purpose: r.purpose,
        deliveryDate: (l.delivery_date ?? l.required_by ?? r.required_by) || null,
        remainingQty: remainingOf(l),
      })),
      lines: lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        item: l.item_label ?? l.sku,
        requestedQty: l.qty,
        approvedQty: l.approved_qty,
        orderedQty: l.issued_qty,
        stillToOrder: remainingOf(l),
        supplier: l.supplier_id ? (supplierName.get(l.supplier_id) ?? "") : "",
        deliverTo: destName.get(l.destination_id ?? r.destination_id) ?? "",
        poNos: linePoNos(l),
        cancelled: l.cancelled_at !== null,
        cancelReason: l.cancel_reason,
      })),
      skuTokens: lines.map((l) => l.sku).join(" "),
    };
  });
}

/** The SO Batch sibling's own duty words — one grammar on both Purchasing
 *  buying surfaces. */
function poDutyLabel(data: ManualPurchaseRegisterPayload): string {
  if (data.poDutyUnavailable) return "PO duty could not be checked.";
  if (data.actingPoDuty) return `${data.actingPoDuty.name} is covering PO duty`;
  if (data.currentPoDuty) return `${data.currentPoDuty.name} holds PO duty`;
  return "Nobody holds PO duty this month.";
}

export default function OperationManualPurchase() {
  const [mode, setMode] = useState<"register" | "create" | { detail: string }>(
    "register",
  );
  const q = useManualPurchaseRegister();
  const navigate = useNavigate();
  const issue = useIssuePurchaseRequests();

  /* Card 06 §7 — a Work action deep-links the exact MPR:
     `?tab=manual-purchase&mpr={id}` opens the object directly. The param is
     consumed so `‹ Manual Purchase` returns to the Register, not a loop. */
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedMpr = searchParams.get("mpr");
  useEffect(() => {
    if (!linkedMpr) return;
    setMode({ detail: linkedMpr });
    const next = new URLSearchParams(searchParams);
    next.delete("mpr");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedMpr]);

  const rows = useMemo(
    () => (q.data ? buildRows(q.data) : []),
    [q.data],
  );

  /** Card 03 §3 — the real action owner's name beside `Need approval`. */
  const approverLine = useMemo(
    () => manualPurchaseApproverLine((q.data?.approvers ?? []).map((a) => a.name)),
    [q.data?.approvers],
  );

  /**
   * THE RAIL FILTER (Card 03 — unchanged by Card 04) — one slot per section;
   * sections combine with AND; the empty filter is the permanent Register,
   * ordered history included. Counts are UNIQUE requests, cross-computed per
   * section by the one shared model (Law D).
   */
  const [railFilter, setRailFilter] = useState<ManualPurchaseRailFilter>(
    MANUAL_PURCHASE_RAIL_CLEAR,
  );
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    try {
      return localStorage.getItem(FILTER_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      // Storage may be unavailable in a locked-down browser; the live state
      // still works for this visit.
    }
  };
  const railFacts = useMemo(
    () =>
      manualPurchaseRailFacts(
        rows.map((r) => ({
          requestId: r.id,
          status: r.status.kind,
          purpose: r.purpose,
          remainingQty: r.remainingQty,
          lineCategories: r.lineCategories,
          lineSupplierNames: r.lineSupplierNames,
          lineOrderBys: r.lineOrderBys,
          supplierGap: r.supplierGap,
          productionDaysMissing: r.productionDaysMissing,
          transitDaysMissing: r.transitDaysMissing,
        })),
        /* The SERVER's Malaysia date — the browser never reads its own clock
           for a business classification (Card 06 §5). */
        q.data?.todayIso ?? null,
      ),
    [rows, q.data?.todayIso],
  );
  const rail = useMemo(
    () => manualPurchaseRailModel(railFacts, railFilter),
    [railFacts, railFilter],
  );

  const filtered = useMemo(() => {
    const visible = rows.filter((r) => rail.visibleRequestIds.has(r.id));
    /* Card 06 §6 — a work/timing lens sorts earliest Order By first, then
       newest Proceed Date, so the most urgent visible request is first. The
       no-filter default stays newest Proceed Date first (buildRows' order). */
    return railFilter.work != null || railFilter.timing != null
      ? manualPurchaseWorkOrder(visible)
      : visible;
  }, [rows, rail, railFilter.work, railFilter.timing]);

  /* ── THE FILTERED REGISTER ORDER (Card 05 §3.1) — what the grid actually
     shows after search + column filters, post-sort. The object header's
     `‹ n of m ›` steps THIS list, so position is the operator's own filtered
     Register truth, never a second ordering. ─────────────────────────── */
  const [gridRows, setGridRows] = useState<RequestRegisterRow[]>([]);

  /* ── SELECTION (Card 04) — only `Ready to order` remainder may be ticked;
     PO Duty exists on this page ONLY beside a live selection. ─────────── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issueError, setIssueError] = useState<string | null>(null);
  const selectable = (r: RequestRegisterRow) =>
    manualPurchaseSelectable(r.status.kind, r.remainingQty);
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id) && selectable(r)),
    [filtered, selected],
  );
  const selectionUnits = selectedRows.reduce((n, r) => n + r.remainingQty, 0);
  const selectionPos = manualPurchaseIssueGroupCount(
    selectedRows.flatMap((r) => r.issueWalls),
  );

  async function issueSelected() {
    setIssueError(null);
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    if (ids.length > 20) {
      setIssueError("Select at most 20 requests for one issue.");
      return;
    }
    try {
      /* ⭐ THE PRICES THIS ISSUE COMMITS TO (0380) — read, then DECLARED, so
         the door has two numbers to compare instead of one number compared
         with itself. A SKU Catalog has no price for is named, not zeroed. */
      const costs = await apiFetch<{ costs: { sku: string; unitCost: number | null }[] }>(
        `/api/operation/purchasing/requests/issue-costs?requestIds=${encodeURIComponent(
          ids.join(","),
        )}`,
      );
      const missing = costs.costs.find((c) => c.unitCost == null);
      if (missing) {
        setIssueError(
          `Catalog has no price. Ask Catalog to set the cost of ${missing.sku}.`,
        );
        return;
      }
      const expectedCosts: Record<string, number> = {};
      for (const c of costs.costs) {
        if (c.unitCost != null) expectedCosts[c.sku] = c.unitCost;
      }
      await issue.mutateAsync({
        requestIds: ids,
        together: true,
        partners: null,
        expectedCosts,
      });
      setSelected(new Set());
      void q.refetch();
    } catch (e) {
      /* THE APPROVED TWO LINES: the fact, then the act. */
      const body = (e as { body?: { message?: string; action?: string; code?: string } })
        .body;
      const fallback = purchasingRefusal(body?.code);
      setIssueError(
        `${body?.message ?? fallback.wrong} ${body?.action ?? fallback.todo}`.trim(),
      );
    }
  }

  const columns = useMemo<DataGridColumn<RequestRegisterRow>[]>(
    () => [
      {
        key: "proceed_date",
        label: MW.colProceedDate,
        width: 118,
        sortable: true,
        filterType: "date",
        dateValue: (r) => r.proceedDate,
        accessor: (r) => fmtDate(r.proceedDate.slice(0, 10)),
        searchValue: (r) => fmtDate(r.proceedDate.slice(0, 10)),
        filterValue: (r) => fmtDate(r.proceedDate.slice(0, 10)),
        sortFn: (a, b) => a.proceedDate.localeCompare(b.proceedDate),
      },
      {
        key: "approval",
        label: MW.colApproval,
        width: 168,
        sortable: true,
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={APPROVAL_TONE[r.approval.kind]}>
              {r.approval.label}
            </StatusPill>
            {/* Card 03 §3 — while approval is needed the row names the REAL
                action owner. Nothing resolved prints nothing. */}
            {r.approval.kind === "need_approval" && approverLine ? (
              <span
                className="block truncate text-label font-normal text-base-600"
                data-testid={`mp-approver-${r.id}`}
              >
                {approverLine}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => r.approval.label,
        filterValue: (r) => r.approval.label,
      },
      {
        key: "mpr_no",
        label: MW.colMprNo,
        width: 168,
        sortable: true,
        filterType: "numbering",
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              setMode({ detail: r.id });
            }}
          >
            {r.reqNo}
          </button>
        ),
        searchValue: (r) => r.reqNo,
        filterValue: (r) => r.reqNo,
      },
      {
        key: "po_no",
        label: MW.colPoNo,
        width: 150,
        sortable: true,
        accessor: (r) => {
          /* ONLY real lineage (Card 04 §3.4): none / the clickable number /
             `{n} POs` — the exact mapping lives in the expansion. */
          if (r.poNos.length === 1) {
            return (
              <button
                type="button"
                className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`mp-po-link-${r.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/operation/procurement?po=${encodeURIComponent(r.poNos[0])}`);
                }}
              >
                {r.poNos[0]}
              </button>
            );
          }
          return manualPurchasePoSummary(r.poNos);
        },
        searchValue: (r) => r.poNos.join(" "),
        filterValue: (r) => manualPurchasePoSummary(r.poNos),
        /* Excel prints the CELL's truth, not the search tokens (§6.7: the
           outputs derive their cells once). */
        exportValue: (r) => manualPurchasePoSummary(r.poNos),
      },
      {
        key: "delivery_date",
        label: MW.colDeliveryDate,
        width: 113,
        sortable: true,
        filterType: "date",
        dateValue: (r) => r.deliveryDate,
        /* A historical null Delivery Date prints the honest sentence, never
           a bare dash — and gains no invented Order By (Card 06 §6). */
        accessor: (r) =>
          r.deliveryDate ? (
            fmtDate(r.deliveryDate)
          ) : (
            <span className="text-base-500">{MW.notRecorded}</span>
          ),
        searchValue: (r) => (r.deliveryDate ? fmtDate(r.deliveryDate) : MW.notRecorded),
        filterValue: (r) => (r.deliveryDate ? fmtDate(r.deliveryDate) : MW.notRecorded),
        exportValue: (r) => (r.deliveryDate ? fmtDate(r.deliveryDate) : MW.notRecorded),
        sortFn: (a, b) => (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? ""),
      },
      {
        key: "for",
        label: MW.colFor,
        width: 170,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.forText}>
            {r.forText}
          </span>
        ),
        searchValue: (r) => r.forText,
        filterValue: (r) => r.forText,
      },
      {
        key: "items",
        label: MW.colItems,
        width: 210,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.itemsText}>
            {r.itemsText}
          </span>
        ),
        /* SKU stays searchable even though the cell speaks Catalog words. */
        searchValue: (r) => `${r.itemsText} ${r.skuTokens}`,
        filterValue: (r) => r.itemsText,
        exportValue: (r) => r.itemsText,
      },
      {
        key: "qty",
        label: MW.colQty,
        width: 60,
        sortable: true,
        filterType: "number",
        numberValue: (r) => r.qty,
        accessor: (r) => <span className="block text-right tabular-nums">{r.qty}</span>,
        searchValue: (r) => String(r.qty),
        filterValue: (r) => String(r.qty),
        sortFn: (a, b) => a.qty - b.qty,
      },
      {
        key: "supplier",
        label: MW.colSupplier,
        width: 150,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.supplierText}>
            {r.supplierText}
          </span>
        ),
        searchValue: (r) =>
          [r.supplierText, ...r.lineSupplierNames.filter(Boolean)].join(" "),
        filterValue: (r) => r.supplierText,
        exportValue: (r) => r.supplierText,
      },
      {
        key: "deliver_to",
        label: MW.colDeliverTo,
        width: 150,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.deliverToText}>
            {r.deliverToText}
          </span>
        ),
        searchValue: (r) => r.deliverToText,
        filterValue: (r) => r.deliverToText,
      },
      {
        key: "requested_by",
        label: MW.colRequestedBy,
        width: 130,
        sortable: true,
        accessor: (r) => (
          <span className="block truncate" title={r.requestedBy}>
            {r.requestedBy}
          </span>
        ),
        searchValue: (r) => r.requestedBy,
        filterValue: (r) => r.requestedBy,
      },
    ],
    [approverLine, navigate],
  );

  if (mode === "create") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <CreateRequestWorkspace
          destinations={q.data?.destinations ?? []}
          staff={q.data?.users ?? []}
          onDone={() => {
            setMode("register");
            void q.refetch();
          }}
        />
      </div>
    );
  }

  /* Card 05 §3 — clicking the MPR number opens WORK: the full-width object
     replaces the Register content. The Register stays MOUNTED underneath
     (visibility only), so `‹ Manual Purchase` restores the complete state
     the operator left — rail filters, search, column filters, sort, scroll
     and expansion — instead of a fresh grid. */
  const detailId = typeof mode === "object" ? mode.detail : null;
  const detailRow = detailId != null ? (rows.find((r) => r.id === detailId) ?? null) : null;
  const gridIndex = detailId != null ? gridRows.findIndex((r) => r.id === detailId) : -1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {detailId == null && <PurchasingTabs />}
      <div className="relative min-h-0 flex-1">
      <div
        className={`absolute inset-0 flex overflow-hidden${detailId != null ? " invisible" : ""}`}
        aria-hidden={detailId != null || undefined}
        data-testid="mp-register-surface"
      >
        {/* Card 03 — the readable 240px shell, BYTE-BEHAVIOURALLY UNCHANGED
            by Card 04 (the sixth purpose row arrives through the one shared
            `DEMAND_PURPOSES` list, Law D). */}
        {filterRailOpen && (
        <FilterRail
          testId="manual-purchase-rail"
          onHide={() => setFilterRailVisible(false)}
        >
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.work.heading}>
            {/* Card 06 §5 — the five concrete daily actions, all visible with
                zero: an action LENS over the same server facts and central
                Work identities, never a second queue. Clicking a filter never
                grants approval or PO authority — the filtered row/object
                names the real owner. A second click clears the row. */}
            {MANUAL_PURCHASE_RAIL.work.actions.map((action) => (
              <FilterRailRow
                key={action.key}
                active={railFilter.work === action.key}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    work: prev.work === action.key ? null : action.key,
                  }))
                }
                testId={`mp-work-${action.key}`}
                label={action.word}
                count={rail.workCounts[action.key]}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.toOrder.heading}>
            {/* `All not ordered` — live quantity not yet fully issued.
                (`Need approval` / `Ready to order` retired into WORK TO DO,
                Card 06 §5.) */}
            <FilterRailRow
              active={railFilter.notOrderedOnly}
              onClick={() =>
                setRailFilter((prev) => ({
                  ...prev,
                  notOrderedOnly: !prev.notOrderedOnly,
                }))
              }
              testId="mp-to-order-not_ordered"
              label={MANUAL_PURCHASE_RAIL.toOrder.all}
              count={rail.notOrderedCount}
            />
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.timing.heading}>
            {/* The request's earliest server-derived Order By against the
                server's Malaysia date — a filter and fact, never an issue
                permission gate (an authorised person may buy early). */}
            {MANUAL_PURCHASE_RAIL.timing.rows.map((row) => (
              <FilterRailRow
                key={row.state}
                active={railFilter.timing === row.state}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    timing: prev.timing === row.state ? null : row.state,
                  }))
                }
                testId={`mp-timing-${row.state}`}
                label={row.word}
                count={rail.timingCounts[row.state]}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.purpose.heading}>
            {/* The approved purposes — `DEMAND_PURPOSES`, the one creatable
                list. A retired historical value matches no row and lives
                under `All purposes` only (never falsely relabelled). */}
            <FilterRailRow
              active={railFilter.purpose == null}
              onClick={() => setRailFilter((prev) => ({ ...prev, purpose: null }))}
              testId="mp-purpose-all"
              label={MANUAL_PURCHASE_RAIL.purpose.all}
            />
            {MANUAL_PURCHASE_RAIL.purpose.rows.map((p) => (
              <FilterRailRow
                key={p.value}
                active={railFilter.purpose === p.value}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    purpose: prev.purpose === p.value ? null : p.value,
                  }))
                }
                testId={`mp-purpose-${p.value}`}
                label={p.label}
                count={rail.purposeCounts[p.value]}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.product.heading}>
            {/* The CATALOG's categories, never SKU-text inference. */}
            <FilterRailRow
              active={railFilter.product == null}
              onClick={() => setRailFilter((prev) => ({ ...prev, product: null }))}
              testId="mp-product-all"
              label={MANUAL_PURCHASE_RAIL.product.all}
            />
            {MANUAL_PURCHASE_RAIL.product.categories.map((c) => (
              <FilterRailRow
                key={c.category}
                active={railFilter.product === c.category}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    product: prev.product === c.category ? null : c.category,
                  }))
                }
                testId={`mp-product-${c.category}`}
                label={c.word}
                count={rail.productCounts[c.category]}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.supplier.heading}>
            {/* Actual names — the demand line's Catalog-derived supplier,
                dynamic and alphabetical, never hardcoded. A name with no
                match under the other filters drops off; the SELECTED name
                stays, with its honest 0. */}
            <FilterRailRow
              active={railFilter.supplier == null}
              onClick={() => setRailFilter((prev) => ({ ...prev, supplier: null }))}
              testId="mp-supplier-all"
              label={MANUAL_PURCHASE_RAIL.supplier.all}
            />
            {rail.suppliers.map((s) => (
              <FilterRailRow
                key={s.name}
                active={railFilter.supplier === s.name}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    supplier: prev.supplier === s.name ? null : s.name,
                  }))
                }
                testId={`mp-supplier-${s.name}`}
                label={s.name}
                count={s.count}
              />
            ))}
          </FilterRailGroup>
          {/* Card 06 §5 — SETUP TO FIX renders ONLY while an affected request
              exists: it states the missing configuration; the owning action
              (and its Settings deep link) stays in WORK TO DO. */}
          {rail.setupExists && (
            <FilterRailGroup title={MANUAL_PURCHASE_RAIL.setup.heading}>
              {MANUAL_PURCHASE_RAIL.setup.rows.map((row) => (
                <FilterRailRow
                  key={row.key}
                  active={railFilter.setup === row.key}
                  onClick={() =>
                    setRailFilter((prev) => ({
                      ...prev,
                      setup: prev.setup === row.key ? null : row.key,
                    }))
                  }
                  testId={`mp-setup-${row.key}`}
                  label={row.word}
                  count={rail.setupCounts[row.key]}
                />
              ))}
            </FilterRailGroup>
          )}
        </FilterRail>
        )}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col p-2"
          data-testid="register-column"
        >
          <div className="min-h-0 flex-1">
          <DataGrid<RequestRegisterRow>
            appearance="reference"
            /* `+ Manual Purchase` is the register's PRIMARY action and lives
               in the control band (ui/MASTER §6.7 Row 2). */
            toolbarStart={
              <>
                {!filterRailOpen && (
                  <button
                    type="button"
                    aria-label="Show filters"
                    title="Show filters"
                    data-testid="manual-purchase-show-filters"
                    onClick={() => setFilterRailVisible(true)}
                    className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
                  >
                    <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
                <Button
                  variant="primary"
                  onClick={() => setMode("create")}
                  data-testid="manual-purchase-new-request"
                >
                  {MW.newRequest}
                </Button>
              </>
            }
            rows={filtered}
            columns={columns}
            /* The grid's own filtered+sorted order feeds the object header's
               `‹ n of m ›` (Card 05 §3.1) — a STABLE setter, per the engine. */
            onFilteredRowsChange={setGridRows}
            storageKey="carres.manualPurchase.register.v3"
            rowKey={(r) => r.id}
            rowTestId={(r) => `mp-row-${r.id}`}
            exportName="Manual Purchase"
            searchPlaceholder="Search requests…"
            isLoading={q.isLoading}
            emptyMessage={
              rows.length === 0 ? MW.emptyRegister : "No matching requests."
            }
            groupBanner={false}
            /* The identity survives horizontal scrolling — the DataGrid's
               governed capability, pinned on the Manual Purchase No. */
            stickyIdentity={{ columnKey: "mpr_no" }}
            expandable={{
              renderExpansion: (r) => <RequestExpansion row={r} />,
              testId: (r) => `mp-expand-${r.id}`,
            }}
            selectable={{
              selectedKeys: selected,
              onToggle: (id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                }),
              onToggleAll: (keys, allSelected) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const k of keys) {
                    if (allSelected) next.delete(k);
                    else next.add(k);
                  }
                  return next;
                }),
              /* ONLY approved remainder (Card 04): `Ready to order` with live
                 remaining quantity. Everything else refuses the tick. */
              isSelectable: (r: RequestRegisterRow) => selectable(r),
              testId: (r: RequestRegisterRow) => `mp-select-${r.id}`,
            }}
            selectionSummary={(n) => `${n} selected`}
            onRowDoubleClick={(r) => setMode({ detail: r.id })}
            statusSummary={(shown) => {
              const word = shown.length === 1 ? "request" : "requests";
              const line =
                shown.length === rows.length
                  ? `${shown.length} ${word}`
                  : `${shown.length} of ${rows.length} requests`;
              return (
                <span className="block truncate" title={line}>
                  {line}
                </span>
              );
            }}
          />
          </div>

          {/* ── PO DUTY EXISTS ONLY BESIDE A SELECTION (Card 04) — the SO
              Batch sibling bar: the truthful sentence, the resolved person,
              and the one issue action. Nothing renders while nothing is
              ticked. ── */}
          {selectedRows.length > 0 ? (
            <div
              className="mt-2 flex shrink-0 items-center justify-between gap-3 rounded-control border border-kit-slate-6 bg-white px-3 py-2"
              data-testid="mp-selection-bar"
            >
              <span className="truncate text-body" data-testid="mp-selection-sentence">
                {manualPurchaseIssueSentence(
                  selectedRows.length,
                  selectionUnits,
                  selectionPos,
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <PoDutyChip data={q.data!} />
                {q.data?.mayIssue ? (
                  <button
                    type="button"
                    data-testid="mp-issue-selected"
                    className="inline-flex h-7 shrink-0 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white hover:opacity-90"
                    onClick={() => void issueSelected()}
                  >
                    Issue PO
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          {issueError && selectedRows.length > 0 ? (
            <p className="mt-1 text-meta text-kit-red-11" data-testid="mp-issue-selected-error">
              {issueError}
            </p>
          ) : null}
        </div>

      </div>

      {detailId != null && (
        <ManualPurchaseObject
          key={detailId}
          id={detailId}
          registerReqNo={detailRow?.reqNo ?? null}
          position={
            gridIndex >= 0 ? { index: gridIndex + 1, total: gridRows.length } : null
          }
          onStep={(dir) => {
            const next = gridRows[gridIndex + dir];
            if (next) setMode({ detail: next.id });
          }}
          onBack={() => setMode("register")}
        />
      )}
      </div>
    </div>
  );
}

/** The resolved PO duty person — initials + the sibling's own sentence. A
 *  person who cannot be resolved prints the honest sentence instead. */
function PoDutyChip({ data }: { data: ManualPurchaseRegisterPayload }) {
  const person = data.poDutyUnavailable
    ? null
    : (data.actingPoDuty ?? data.currentPoDuty);
  const label = poDutyLabel(data);
  if (!person) {
    return (
      <span
        data-testid="mp-po-duty"
        title={label}
        className="shrink-0 truncate text-meta text-kit-slate-11"
      >
        {label}
      </span>
    );
  }
  const colour = avatarColor(person.userId);
  return (
    <span
      data-testid="mp-po-duty"
      aria-label={label}
      title={label}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-kit-slate-6 bg-white px-2 text-meta text-kit-slate-11"
    >
      <span
        aria-hidden
        className="grid h-5 w-5 place-items-center rounded-full text-label font-semibold leading-none"
        style={{ background: colour.bg, color: colour.fg }}
      >
        {personInitials(person.name, person.name)}
      </span>
      <span>{label}</span>
    </span>
  );
}

/**
 * ▸ THE REQUEST'S OWN LINES — read-only (Card 04): exact per-line
 * quantities and lineage, nothing else. No Approve, no Refuse, no
 * Receive, no price, no PO creation, no PDF. The quantities are the ONE
 * governed arithmetic (`manualPurchaseLineRemainingOf`); the PO numbers
 * are the line's real lineage.
 */
// design-standard: not-a-list-page — the raw <table> below is the CHILD of a
// register row (the DataGrid expansion), not a page: it has no destination, no
// toolbar and no header of its own; the register above it owns all three
// (GoodsMiniTable's own precedent).
/* Every column is a FIXED width (GoodsMiniTable's own alignment law: two
   expansions opened together must read as one listing). The Card fixes the
   ORDER with Item second, so Item gets a constant width rather than flex —
   a flexible middle column would move every column after it. */
const EXPANSION_COLUMNS = [
  { key: "sku", label: MW.expSku, width: 152 },
  { key: "item", label: MW.expItem, width: 220 },
  { key: "requestedQty", label: MW.expRequestedQty, width: 110 },
  { key: "approvedQty", label: MW.expApprovedQty, width: 104 },
  { key: "orderedQty", label: MW.expOrderedQty, width: 100 },
  { key: "stillToOrder", label: MW.expStillToOrder, width: 100 },
  { key: "supplier", label: MW.expSupplier, width: 150 },
  { key: "deliverTo", label: MW.expDeliverTo, width: 150 },
  { key: "poNo", label: MW.expPoNo, width: 144 },
] as const;

function RequestExpansion({ row }: { row: RequestRegisterRow }) {
  return (
    <div
      className="overflow-x-auto rounded-control border border-base-200 bg-white"
      data-testid={`mp-expansion-${row.id}`}
    >
      <table className="w-full table-fixed text-left" style={{ minWidth: 1230 }}>
        <colgroup>
          {EXPANSION_COLUMNS.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead className="border-b border-base-200 bg-base-50">
          <tr className="divide-x divide-base-200">
            {EXPANSION_COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-200 text-body">
          {row.lines.map((l) => (
            <tr
              key={l.id}
              className={`divide-x divide-base-200 align-top${l.cancelled ? " text-base-400" : ""}`}
            >
              <td className="px-2 py-2 font-mono">{l.sku}</td>
              <td className="px-2 py-2">
                {l.item}
                {l.cancelled ? (
                  <span className="block text-label text-base-400">
                    {MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}
                    {l.cancelReason ? ` — ${l.cancelReason}` : ""}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-2 tabular-nums">{l.requestedQty}</td>
              <td className="px-2 py-2 tabular-nums">
                {l.approvedQty == null ? null : l.approvedQty}
              </td>
              <td className="px-2 py-2 tabular-nums">{l.orderedQty}</td>
              <td className="px-2 py-2 tabular-nums">{l.cancelled ? null : l.stillToOrder}</td>
              <td className="px-2 py-2">{l.supplier}</td>
              <td className="px-2 py-2">{l.deliverTo}</td>
              <td className="px-2 py-2 font-mono">
                {l.poNos.length > 0 ? l.poNos.join(", ") : MW.notOrderedYet}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── The create workspace — full page, never a dialog (card §3) ───────────── */

type LineState = "idle" | "pending" | "created" | "failed";

interface LineDraft {
  id: string;
  sku: string | null;
  needle: string;
  qty: string;
  note: string;
  state: LineState;
  error: string | null;
}

let seq = 0;
const blankLine = (): LineDraft => ({
  id: `l${++seq}`,
  sku: null,
  needle: "",
  qty: "1",
  note: "",
  state: "idle",
  error: null,
});
const isBlank = (l: LineDraft) =>
  l.sku == null && l.needle === "" && l.note === "" && (l.qty === "1" || l.qty === "");

/** The picker's five columns — ported unchanged from the retired dialog
 *  (P15's list; the SKU leads because four `Booqit`s differ only by code). */
const PICK_COLUMNS: readonly Column<DemandPickItem>[] = [
  {
    key: "sku",
    label: W.pickerColSku,
    width: 30,
    cell: (i) => <span className="font-mono text-meta">{i.sku}</span>,
  },
  { key: "model", label: W.colModel, width: 30, cell: (i) => i.label },
  {
    key: "onHand",
    label: W.pickerColOnHand,
    width: 15,
    align: "right",
    numeric: true,
    cell: (i) => i.onHand,
  },
  {
    key: "reserved",
    label: W.pickerColReserved,
    width: 13,
    align: "right",
    numeric: true,
    cell: (i) => i.reserved,
  },
  {
    key: "free",
    label: W.pickerColFree,
    width: 12,
    align: "right",
    numeric: true,
    cell: (i) => i.free,
  },
];

const LINE_GRID = "minmax(0,1fr) 53px minmax(0,1fr) auto";

function CreateRequestWorkspace({
  destinations,
  staff,
  onDone,
}: {
  destinations: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string | null }>;
  onDone: () => void;
}) {
  const email = useAuth((s) => s.session?.user?.email ?? "");

  const pick = useQuery({
    queryKey: ["to-order", "pick-items"],
    queryFn: () =>
      apiFetch<{ items: DemandPickItem[] }>(
        "/api/operation/purchase/to-order/demand/pick-items",
      ),
    staleTime: 60_000,
  });
  const items = pick.data?.items ?? [];

  const [purpose, setPurpose] = useState<DemandPurpose>(DEMAND_PURPOSE_DEFAULT);
  const [dest, setDest] = useState<string | undefined>(undefined);
  /** Card 06 §3.2 — `Delivery Date`: when supplier goods must reach the
   *  selected Deliver To. The SERVER proposes it from the slowest selected
   *  line once every lead fact is complete; a person may move it, and a
   *  chosen date is preserved — adding/removing an item never silently
   *  overwrites it. */
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  /** Only `Other Purchase` asks — and must answer — `What is this for?`. */
  const [why, setWhy] = useState("");
  /** The per-purpose structured For fact (Card 04 §4). */
  const [serviceCaseId, setServiceCaseId] = useState<string | undefined>(undefined);
  const [staffUserId, setStaffUserId] = useState<string | undefined>(undefined);
  const [subsidiaryName, setSubsidiaryName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The header, once created, is a record — retries reuse it. */
  const [requestId, setRequestId] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);

  /* The Service Case picker rides the existing governed list read — no
     second door, no duplicate case store. Fetched only while the purpose
     actually asks for it. */
  const casesQ = useQuery({
    queryKey: ["ops", "service-cases", "ongoing"],
    queryFn: () =>
      apiFetch<{ items: Array<{ id: string; caseNo?: string; case_no?: string }> }>(
        "/api/ops/service-cases?state=ongoing",
      ),
    staleTime: 60_000,
    enabled: purpose === "service_case",
  });

  const createHeader = useCreatePurchaseRequest();
  const createLine = useCreatePurchaseRequestLine();

  const active = activeId ?? lines[0]?.id;
  const chosenDest = dest ?? destinations[0]?.id;

  /* ── THE SERVER DATE PLAN (Card 06 §3) ─────────────────────────────────
     The server previews Proceed Date (its Malaysia date) and, once every
     picked line resolves Catalog Supplier × Category with complete
     Settings, proposes Delivery Date from the slowest line. The browser
     performs no working-day arithmetic and never guesses a date. */
  const pickedSkus = useMemo(
    () => [...new Set(lines.map((l) => l.sku).filter((s): s is string => s != null))],
    [lines],
  );
  const plan = useManualPurchasePlan(pickedSkus);
  const planBySku = useMemo(
    () =>
      new Map<string, ManualPurchasePlanLine>(
        (plan.data?.lines ?? []).map((l) => [l.sku, l]),
      ),
    [plan.data],
  );
  /* The server's proposal fills the field only while the person has not
     chosen a date; a chosen date is theirs and is preserved (§3.2). */
  const planDefault = plan.data?.deliveryDateDefault ?? null;
  useEffect(() => {
    if (!dateTouched && planDefault != null) setDeliveryDate(planDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDefault]);

  /** The exact missing lead facts across picked lines — each names its
   *  supplier and repair (§3.4). An unresolved Catalog supplier is named by
   *  the line's own `No supplier yet` fact, not silently a lead-day gap. */
  const leadGaps = useMemo(() => {
    const gaps: Array<{ sku: string; wrong: string; todo: string }> = [];
    for (const sku of pickedSkus) {
      const p = planBySku.get(sku);
      if (!p || p.supplierId == null || p.category == null) continue;
      if (p.productionDays == null) {
        const facts = manualPurchaseLeadDayFacts({
          kind: "production",
          supplierName: p.supplierName,
          categoryLabel: categoryLabel(p.category),
        });
        gaps.push({ sku, ...facts });
      }
      if (p.transitDays == null) {
        const facts = manualPurchaseLeadDayFacts({
          kind: "transit",
          supplierName: p.supplierName,
        });
        gaps.push({ sku, ...facts });
      }
    }
    return gaps;
  }, [pickedSkus, planBySku]);
  /** Send stays blocked until every picked line's lead facts are complete —
   *  and until the plan itself has answered (nothing is assumed). */
  const leadDaysOk =
    pickedSkus.length === 0 ||
    (plan.data != null && !plan.data.planUnavailable && leadGaps.length === 0);

  const patch = (id: string, p: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const qtyOk = (l: LineDraft) => Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1;
  const submittable = lines.filter((l) => l.sku != null && l.state !== "created");
  const everyStartedLineNamesAnItem = lines.every((l) => l.sku != null || isBlank(l));

  /** Card 04 — the per-purpose For gate. Routine purposes carry no extra
   *  question; each exceptional purpose must name its object. */
  const whyOk = purpose !== "other_purchase" || why.trim().length > 0;
  const caseOk = purpose !== "service_case" || serviceCaseId != null;
  const staffOk = purpose !== "internal_staff_purchase" || staffUserId != null;
  const subsidiaryOk =
    purpose !== "subsidiary_purchase" || subsidiaryName.trim().length > 0;
  /** `Delivery Date` is one of the request's facts (MASTER §3) — a request
   *  with no date leaves the approver and the issuer with nothing to plan
   *  against. Found empty-but-sendable on the 2026-08-19 owner walk. */
  const dateOk = deliveryDate !== "";

  const canSend =
    !saving &&
    leadDaysOk &&
    whyOk &&
    caseOk &&
    staffOk &&
    subsidiaryOk &&
    dateOk &&
    chosenDest != null &&
    submittable.length > 0 &&
    submittable.every(qtyOk) &&
    everyStartedLineNamesAnItem;

  /** The disabled button NAMES its gap (the Receiving law) — the first
   *  missing fact wins, in the governed order: lead days first (Card 06),
   *  then the header facts top-to-bottom. While the plan is still being
   *  asked, the button is quiet rather than accusing Settings untruthfully. */
  const leadBlocked =
    pickedSkus.length > 0 &&
    plan.data != null &&
    (plan.data.planUnavailable || leadGaps.length > 0);
  const sendLabel =
    leadBlocked
      ? MW.sendNeedsLeadDays
      : !dateOk
        ? MW.sendNeedsDate
        : !caseOk
          ? MW.sendNeedsServiceCase
          : !staffOk
            ? MW.sendNeedsStaff
            : !subsidiaryOk
              ? MW.sendNeedsSubsidiary
              : !whyOk
                ? MW.sendNeedsWhy
                : MW.send;

  function addLine() {
    const l = blankLine();
    setLines((ls) => [...ls, l]);
    setActiveId(l.id);
  }

  function removeLine(id: string) {
    setLines((ls) => {
      const rest = ls.filter((l) => l.id !== id);
      return rest.length > 0 ? rest : [blankLine()];
    });
    setActiveId((a) => (a === id ? null : a));
  }

  /**
   * ONE act with a per-row result (the retired dialog's proven contract):
   * the header lands first and is reused on retry; then one POST per line in
   * order. A failed line keeps its row with the server's own words, and
   * pressing Send again retries exactly those.
   */
  async function send() {
    if (!canSend || !chosenDest) return;
    setSaving(true);
    setHeaderError(null);

    let reqId = requestId;
    if (reqId === null) {
      try {
        const created = await createHeader.mutateAsync({
          purpose,
          destinationId: chosenDest,
          requiredBy: deliveryDate || null,
          why: purpose === "other_purchase" ? why.trim() : null,
          serviceCaseId: purpose === "service_case" ? (serviceCaseId ?? null) : null,
          staffUserId:
            purpose === "internal_staff_purchase" ? (staffUserId ?? null) : null,
          subsidiaryName:
            purpose === "subsidiary_purchase" ? subsidiaryName.trim() : null,
        });
        reqId = created.id;
        setRequestId(created.id);
      } catch (e) {
        setHeaderError(e instanceof Error ? e.message : W.createFailed);
        setSaving(false);
        return;
      }
    }

    const targets = submittable.map((l) => l.id);
    setLines((ls) =>
      ls.map((l) =>
        targets.includes(l.id) ? { ...l, state: "pending", error: null } : l,
      ),
    );

    let created = 0;
    for (const id of targets) {
      const line = lines.find((l) => l.id === id);
      if (!line || !line.sku) continue;
      try {
        await createLine.mutateAsync({
          requestId: reqId,
          sku: line.sku,
          qty: Number(line.qty),
          destinationId: chosenDest,
          requiredBy: deliveryDate || null,
          note: line.note.trim() || null,
          purpose,
        });
        created += 1;
        patch(id, { state: "created", error: null });
      } catch (e) {
        patch(id, {
          state: "failed",
          error: e instanceof Error ? e.message : W.createFailed,
        });
      }
    }
    setSaving(false);
    if (created === targets.length) onDone();
  }

  const namedStaff = staff.filter((s) => (s.name ?? "").trim() !== "");

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="manual-purchase-create"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold uppercase tracking-[0.1em] text-base-900">
          {MW.createTitle}
        </h2>
        <span className="flex items-center gap-3">
          <Button variant="ghost" onClick={onDone}>
            {MW.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canSend}
            loading={saving}
            onClick={() => void send()}
            data-testid="mp-send"
          >
            {sendLabel}
          </Button>
        </span>
      </div>

      {/* ── The header — asked once for the whole request ── */}
      <div className="grid max-w-[720px] grid-cols-2 gap-3">
        <div>
          <label htmlFor="mp-purpose" className="text-meta text-kit-slate-11">
            {MW.needFor}
          </label>
          <Select
            id="mp-purpose"
            value={purpose}
            onValueChange={(v) => setPurpose(v as DemandPurpose)}
            options={DEMAND_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        <div>
          <label htmlFor="mp-dest" className="text-meta text-kit-slate-11">
            {MW.deliverTo}
          </label>
          <Select
            id="mp-dest"
            value={chosenDest}
            onValueChange={setDest}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {/* Card 06 §4 — `Proceed Date` is a read-only FACT: the server's
            Malaysia-date preview before Send; the stored hand-off truth
            after. Never an input, never a browser clock. */}
        <div>
          <span className="text-meta text-kit-slate-11">{MW.proceedDate}</span>
          <p className="pt-1.5 text-body text-base-900" data-testid="mp-proceed-date">
            {plan.data?.proceedDate ? fmtDate(plan.data.proceedDate) : null}
          </p>
        </div>
        {/* `Delivery Date` — the ONE date input. The server proposes the
            slowest selected line's arrival once lead facts are complete; a
            chosen date is the person's and is never silently overwritten. */}
        <DatePicker
          id="mp-delivery-date"
          label={MW.deliveryDate}
          value={deliveryDate || null}
          onChange={(v) => {
            setDateTouched(true);
            setDeliveryDate(v ?? "");
          }}
        />
        <div>
          <span className="text-meta text-kit-slate-11">{MW.raisedBy}</span>
          {/* A FACT, never a control — the server stamps created_by itself. */}
          <p className="pt-1.5 text-body text-base-900" data-testid="mp-raised-by">
            {email.split("@")[0]} (you)
          </p>
        </div>

        {/* ── THE STRUCTURED FOR (Card 04 §4) — each exceptional purpose
            names its object; routine purposes ask nothing extra. ── */}
        {purpose === "service_case" ? (
          <div data-testid="mp-for-service-case">
            <label htmlFor="mp-service-case" className="text-meta text-kit-slate-11">
              {MW.serviceCase}
            </label>
            <Select
              id="mp-service-case"
              value={serviceCaseId}
              onValueChange={setServiceCaseId}
              options={(casesQ.data?.items ?? []).map((sc) => ({
                value: sc.id,
                label: (sc.caseNo ?? sc.case_no ?? sc.id) as string,
              }))}
            />
          </div>
        ) : null}
        {purpose === "internal_staff_purchase" ? (
          <div data-testid="mp-for-staff">
            <label htmlFor="mp-staff" className="text-meta text-kit-slate-11">
              {MW.staffMember}
            </label>
            <Select
              id="mp-staff"
              value={staffUserId}
              onValueChange={setStaffUserId}
              options={namedStaff.map((s) => ({
                value: s.id,
                label: s.name ?? "",
              }))}
            />
          </div>
        ) : null}
        {purpose === "subsidiary_purchase" ? (
          <div data-testid="mp-for-subsidiary">
            <label htmlFor="mp-subsidiary" className="text-meta text-kit-slate-11">
              {MW.subsidiary}
            </label>
            <Input
              id="mp-subsidiary"
              value={subsidiaryName}
              onChange={(e) => setSubsidiaryName(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* Card 04 — ONLY `Other Purchase` asks the question, and it must be
          answered before Send unlocks. Routine purposes do not ask a
          duplicate `Why`. */}
      {purpose === "other_purchase" ? (
        <div className="max-w-[720px]">
          <label htmlFor="mp-why" className="text-meta text-kit-slate-11">
            {MW.whatIsThisFor}
          </label>
          <textarea
            id="mp-why"
            data-testid="mp-why"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-base-200 bg-white px-3 py-2 text-body text-base-900 outline-none focus:border-kit-blue-9"
          />
        </div>
      ) : null}

      {headerError ? (
        <p className="text-meta text-kit-red-11" data-testid="mp-header-error">
          {headerError}
        </p>
      ) : null}

      {/* ── ITEMS · one row per SKU, the dialog's proven split ── */}
      <div className="flex max-w-[900px] flex-col gap-2" data-testid="mp-lines">
        <div className="flex items-center justify-between">
          <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
            {MW.items}
          </h3>
          <Button variant="ghost" onClick={addLine} data-testid="mp-line-add">
            {MW.addLine}
          </Button>
        </div>

        <div
          className="grid items-center gap-2 text-label text-kit-slate-11"
          style={{ gridTemplateColumns: LINE_GRID }}
        >
          <span>{W.itemLabel}</span>
          <span>{W.itemsColQty}</span>
          <span>{W.remark}</span>
          <span />
        </div>

        {lines.map((line, i) => {
          const picked = items.find((it) => it.sku === line.sku) ?? null;
          const showPicker = line.id === active && line.sku == null;
          const done = line.state === "created";
          return (
            <div key={line.id} className="flex flex-col gap-1">
              <div
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: LINE_GRID }}
                data-testid={`mp-line-${i}`}
              >
                {/* SKU + Model, never the model word alone — four Booqit
                    variants rendered as the single word `Booqit` is P15's
                    own defect returned (2026-08-19 owner walk). */}
                <SearchInput
                  id={`mp-item-${i}`}
                  aria-label={W.itemLabel}
                  value={picked ? `${picked.sku} · ${picked.label}` : line.needle}
                  disabled={done}
                  onFocus={() => setActiveId(line.id)}
                  onChange={(e) => {
                    setActiveId(line.id);
                    patch(line.id, { needle: e.target.value, sku: null });
                  }}
                  placeholder={W.searchItem}
                />
                <Input
                  id={`mp-qty-${i}`}
                  aria-label={W.itemsColQty}
                  value={line.qty}
                  disabled={done}
                  onChange={(e) => patch(line.id, { qty: e.target.value })}
                />
                <Input
                  id={`mp-note-${i}`}
                  aria-label={W.remark}
                  value={line.note}
                  disabled={done}
                  onChange={(e) => patch(line.id, { note: e.target.value })}
                />
                {done ? (
                  <span className="text-meta text-kit-slate-11">{W.createdWord}</span>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => removeLine(line.id)}
                    data-testid={`mp-line-remove-${i}`}
                  >
                    {MW.remove}
                  </Button>
                )}
              </div>

              {picked?.supplier ? (
                <p className="text-meta text-kit-slate-11" data-testid={`mp-supplier-${i}`}>
                  {W.supplierLabel}: {picked.supplier}
                </p>
              ) : null}

              {/* Card 06 §3.4 — a missing lead number is NAMED on its line in
                  the governed two lines, and the act deep-links Settings.
                  Send stays `Send — lead days are not set` until repaired;
                  nothing substitutes zero or a browser date. */}
              {leadGaps
                .filter((g) => g.sku === line.sku)
                .map((g) => (
                  <span
                    key={`${g.sku}-${g.wrong}`}
                    className="flex min-w-0 flex-col"
                    data-testid={`mp-lead-gap-${i}`}
                  >
                    <span className="text-body font-medium text-kit-red-11">
                      {g.wrong}
                    </span>
                    <Link
                      to="/operation?tab=purchasing-settings"
                      className="text-label text-kit-blue-11 underline-offset-2 hover:underline"
                    >
                      {g.todo}
                    </Link>
                  </span>
                ))}

              {picked ? (
                <AlreadyHave
                  sku={picked.sku}
                  free={picked.free}
                  qty={Number(line.qty) || 0}
                  index={i}
                />
              ) : null}

              {line.error ? (
                <p className="text-meta text-kit-red-11" data-testid={`mp-line-failed-${i}`}>
                  {line.error}
                </p>
              ) : null}

              {showPicker ? (
                <LinePicker
                  items={items}
                  needle={line.needle}
                  loading={pick.isLoading}
                  onPick={(sku) => patch(line.id, { sku, needle: "" })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * WHAT WE ALREADY HAVE — computed BEFORE submit, per line (card §3). Half of
 * these requests are for goods Carres already has or already bought, and the
 * cheapest approval is the one nobody had to make. `free` rides the picker's
 * own read (one arithmetic); `already on PO` is the open-cover endpoint; and
 * **`still needed` is PRINTED, never left to the reader.**
 */
function AlreadyHave({
  sku,
  free,
  qty,
  index,
}: {
  sku: string;
  free: number;
  qty: number;
  index: number;
}) {
  const onPo = useAlreadyOnPo(sku);
  const already = onPo.data?.alreadyOnPo ?? 0;
  const still = stillNeededOf(qty, free, already);
  return (
    <div
      className="ml-1 flex flex-col gap-0.5 border-l-2 border-base-100 pl-3 text-meta"
      data-testid={`mp-already-have-${index}`}
    >
      <span className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
        {MW.alreadyHave}
      </span>
      <span className="text-base-700">
        {MW.freeStock} <span className="tabular-nums">{free}</span>
      </span>
      <span className="text-base-700">
        {MW.alreadyOnPo} <span className="tabular-nums">{already}</span>
        {onPo.data?.firstPo ? (
          <span className="text-base-600">
            {" "}
            · {onPo.data.firstPo.id}
            {onPo.data.firstPo.eta ? ` · ${fmtDate(onPo.data.firstPo.eta)}` : ""}
          </span>
        ) : null}
      </span>
      <span className="text-base-700" data-testid={`mp-still-needed-${index}`}>
        {MW.stillNeeded} <span className="tabular-nums font-semibold">{still}</span>
        {still === 0 && qty > 0 ? (
          <span className="text-base-600"> — this request may not be needed at all</span>
        ) : null}
      </span>
    </div>
  );
}

/** The search-result table for ONE line — ported unchanged from the dialog. */
function LinePicker({
  items,
  needle,
  loading,
  onPick,
}: {
  items: readonly DemandPickItem[];
  needle: string;
  loading: boolean;
  onPick: (sku: string) => void;
}) {
  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter(
        (i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n),
      )
      .slice(0, 8);
  }, [items, needle]);

  return (
    <DataTable<DemandPickItem>
      rows={shown}
      columns={PICK_COLUMNS}
      rowId={(i) => i.sku}
      onRowOpen={(i) => onPick(i.sku)}
      label={W.pickerTableLabel}
      loading={loading}
      empty={null}
    />
  );
}

/* ══ THE MANUAL PURCHASE OBJECT — PURCHASING CARD 05 ═══════════════════════════
 *
 * One full-width, calm, read-first object; ONE scroll; no tabs, no split
 * preview, no floating 720/900px islands (ui/MASTER §4.1: Manual Purchase is
 * ONE SCROLL and NEVER splits). Section order is the Card's, exactly:
 * Request → Items Requested → What We Already Have → Approval →
 * Purchase Orders → History.
 *
 * WHAT THIS OBJECT DOES NOT HOLD (Card 05 §7): no second `Issue PO`, no PO
 * Duty block, no consolidation prompt, no price editor, no Receive button,
 * no PDF preview. Approval makes the request eligible for the Register's
 * selected `Issue PO` action — the ONE Manual Purchase issuance placement —
 * and physical arrival belongs to the exact PO in `Receiving`.
 *
 * ONE APPROVAL AUTHORITY (PR 982, preserved): `canApprove` is the server's
 * answer to exactly what `purchasing_decide_request`'s SQL gate asks —
 * `principal` or the real `ops_manager` position duty. The same answer
 * gates the approver-only money AND the Approve/Refuse controls; the shared
 * operation@ login sees neither. The SQL door re-enforces in the decision
 * transaction; a refusal leaves in the governed two lines.
 */

/** The three-rank identity line for one stored event — rank 2 is the
 *  portal-wide `historyActorWords`; a missing individual states the governed
 *  audit defect, never an invented person. */
function mpEventIdentity(e: {
  occurred_at: string;
  actor: string | null;
  actor_role: string | null;
}): string {
  return historyActorWords({
    text: "",
    occurred_at: e.occurred_at,
    by_role: e.actor_role,
    actor: e.actor,
    actor_kind: e.actor ? "human" : "missing",
  });
}

/** One quiet read-only fact table — the object's shared listing grammar
 *  (GoodsMiniTable's alignment law: fixed columns, one visual listing). */
function ObjectTable({
  columns,
  minWidth,
  children,
  testId,
}: {
  columns: ReadonlyArray<{ key: string; label: string; width?: number }>;
  minWidth?: number;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table
        className="w-full table-fixed text-left"
        style={minWidth ? { minWidth } : undefined}
      >
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead className="border-b border-base-200 bg-base-50">
          <tr className="divide-x divide-base-200">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-200 text-body">{children}</tbody>
      </table>
    </div>
  );
}

/** One REQUEST fact — label over value, the object's reading grammar. */
function Fact({
  label,
  children,
  testId,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-full" : undefined}>
      <dt className="text-meta text-kit-slate-11">{label}</dt>
      <dd className="text-body text-base-900" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

/** WHAT WE ALREADY HAVE — one row per live SKU. `free` rides the pick-items
 *  read and `already on PO` the open-cover endpoint (the same reads the
 *  create workspace uses — Law D); `Still Needed` is PRINTED. */
function AlreadyHaveRow({
  sku,
  requestedQty,
  free,
  index,
}: {
  sku: string;
  requestedQty: number;
  free: number;
  index: number;
}) {
  const onPo = useAlreadyOnPo(sku);
  const already = onPo.data?.alreadyOnPo ?? 0;
  return (
    <tr className="divide-x divide-base-200" data-testid={`mp-object-have-${index}`}>
      <td className="px-2 py-2 font-mono">{sku}</td>
      <td className="px-2 py-2 tabular-nums">{free}</td>
      <td className="px-2 py-2 tabular-nums">
        {already}
        {onPo.data?.firstPo ? (
          <span className="pl-1 text-label text-base-600">
            · {onPo.data.firstPo.id}
            {onPo.data.firstPo.eta ? ` · ${fmtDate(onPo.data.firstPo.eta)}` : ""}
          </span>
        ) : null}
      </td>
      <td
        className="px-2 py-2 font-semibold tabular-nums"
        data-testid={`mp-object-still-${index}`}
      >
        {stillNeededOf(requestedQty, free, already)}
      </td>
    </tr>
  );
}

/**
 * One approver line — SKU · Requested Qty · Still Needed · Approved Qty ·
 * Transaction Cost · Line Total (Card 05 §3.5). `Approved Qty` is prefilled
 * ONCE from `Still Needed` when the open-cover read lands; a human edit is
 * theirs and is never overwritten by a background refetch. The cost is
 * read-only approval evidence, never an Operation price control.
 */
function ApprovalLineRow({
  line,
  free,
  value,
  onChange,
  index,
}: {
  line: { id: string; sku: string; qty: number; unit_cost?: number | null };
  free: number;
  value: string | undefined;
  onChange: (v: string) => void;
  index: number;
}) {
  const onPo = useAlreadyOnPo(line.sku);
  const still = stillNeededOf(line.qty, free, onPo.data?.alreadyOnPo ?? 0);
  const seeded = value !== undefined;
  useEffect(() => {
    if (!seeded && onPo.data) onChange(String(still));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPo.data]);
  const qty = Number(value);
  const cost = line.unit_cost ?? null;
  return (
    <tr className="divide-x divide-base-200 align-middle">
      <td className="px-2 py-2 font-mono">{line.sku}</td>
      <td className="px-2 py-2 tabular-nums">{line.qty}</td>
      <td className="px-2 py-2 tabular-nums">{still}</td>
      <td className="px-2 py-1.5">
        <span className="block w-[72px]">
          <Input
            id={`mp-cut-${index}`}
            aria-label={`Approve quantity for ${line.sku}`}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={`mp-cut-${index}`}
          />
        </span>
      </td>
      <td className="px-2 py-2 tabular-nums" data-testid={`mp-detail-cost-${index}`}>
        {cost == null ? (
          <span className="text-base-600">Catalog has no price.</span>
        ) : (
          `RM ${Number(cost).toLocaleString()}`
        )}
      </td>
      <td className="px-2 py-2 tabular-nums">
        {cost == null || !Number.isInteger(qty) || qty < 0
          ? null
          : `RM ${(cost * qty).toLocaleString()}`}
      </td>
    </tr>
  );
}

/** One missing lead-day fact on its own line (Card 06 §3.4) — the governed
 *  two lines, with the act deep-linking Settings. */
function LeadGapLine({ facts }: { facts: { wrong: string; todo: string } }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-label font-medium text-kit-red-11">{facts.wrong}</span>
      <Link
        to="/operation?tab=purchasing-settings"
        className="text-label text-kit-blue-11 underline-offset-2 hover:underline"
      >
        {facts.todo}
      </Link>
    </span>
  );
}

/** The governed two-line refusal/fact copy — Line 1 the fact, Line 2 the
 *  smaller act (COPY-STANDARD's two-line law). */
function TwoLines({
  wrong,
  todo,
  testId,
}: {
  wrong: string;
  todo: string;
  testId?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col" data-testid={testId}>
      <span className="text-body font-medium text-kit-red-11">{wrong}</span>
      <span className="text-label text-base-600">{todo}</span>
    </span>
  );
}

function ManualPurchaseObject({
  id,
  registerReqNo,
  position,
  onStep,
  onBack,
}: {
  id: string;
  /** The Register row's own number — the header identity prints instantly
   *  while the object read is in flight. */
  registerReqNo: string | null;
  /** The filtered Register position (`4 of 69`) — context, never truth;
   *  null when the open object left the filtered list. */
  position: { index: number; total: number } | null;
  onStep: (dir: -1 | 1) => void;
  onBack: () => void;
}) {
  const q = useManualPurchaseDetail(id);
  const pick = useQuery({
    queryKey: ["to-order", "pick-items"],
    queryFn: () =>
      apiFetch<{ items: DemandPickItem[] }>(
        "/api/operation/purchase/to-order/demand/pick-items",
      ),
    staleTime: 60_000,
  });
  const navigate = useNavigate();
  const decide = useDecidePurchaseRequest();

  /** The approver's per-line numbers — seeded once from `Still Needed`. */
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const [refusing, setRefusing] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [decideError, setDecideError] = useState<{ wrong: string; todo: string } | null>(
    null,
  );

  const d = q.data;
  const reqNo = d?.request.req_no ?? registerReqNo ?? "";

  const status = d
    ? manualPurchaseStatusOf({
        approvalRequired: d.request.approval_required,
        approvedAt: d.request.approved_at,
        refusedAt: d.request.refused_at,
        refuseReason: d.request.refuse_reason,
        lines: d.lines.map((l) => ({
          qty: l.qty,
          issuedQty: l.issued_qty,
          remainingQty: l.remaining_qty,
          cancelledAt: l.cancelled_at,
          poId: l.po_id,
          received: l.received,
        })),
      })
    : null;

  async function submitDecision(decision: "approve" | "refuse") {
    if (!d) return;
    setDecideError(null);
    try {
      await decide.mutateAsync({
        id,
        decision,
        reason: decision === "refuse" ? refuseReason.trim() : null,
        cuts:
          decision === "approve"
            ? d.lines
                .filter((l) => l.cancelled_at === null)
                .map((l) => ({ id: l.id, qty: Number(cuts[l.id]) }))
            : null,
      });
      /* Success STAYS on the object (Card 05 §3.5): the mutation invalidates
         the requests reads, the decided facts replace the controls and
         History appends. The operator is not thrown back to the Register. */
      setRefusing(false);
      setRefuseReason("");
    } catch (e) {
      /* THE APPROVED TWO LINES — the fact, then the act; never a raw code. */
      const body = (e as { body?: { message?: string; action?: string; code?: string } })
        .body;
      const fallback = purchasingRefusal(body?.code ?? "decision_not_recorded");
      setDecideError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    }
  }

  /* ── The one Object Header (ui/MASTER §4.1) — the SAME implementation the
     Sales Order and Delivery Order objects draw (Law C), with the Manual
     Purchase Register as its one back destination. `‹ n of m ›` steps the
     operator's own filtered Register order; position is context, never
     another source of row truth. ─────────────────────────────────────── */
  const header = (
    <SalesOrderTabs
      identity={reqNo}
      status={
        status ? (
          <StatusPill tone={STATUS_TONE[status.kind]}>{status.label}</StatusPill>
        ) : null
      }
      backTo="/operation?tab=manual-purchase"
      backLabel={MW.backToRegister}
      onBack={(event) => {
        event.preventDefault();
        onBack();
      }}
      docTitle={reqNo ? `${reqNo} — Carres` : undefined}
      right={
        position ? (
          <span className="flex shrink-0 items-center gap-0.5" data-testid="mp-object-position">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={position.index <= 1}
              aria-label="Previous Manual Purchase"
              title="Previous Manual Purchase in the list"
              className="grid size-7 place-items-center rounded-full text-base-600 hover:bg-hovertint disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="whitespace-nowrap px-0.5 text-meta tabular-nums text-base-500">
              {position.index} of {position.total}
            </span>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={position.index >= position.total}
              aria-label="Next Manual Purchase"
              title="Next Manual Purchase in the list"
              className="grid size-7 place-items-center rounded-full text-base-600 hover:bg-hovertint disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </span>
        ) : null
      }
    />
  );

  if (q.isLoading || (!d && !q.isError)) {
    return (
      <div className="absolute inset-0 flex flex-col bg-kit-slate-3" data-testid="mp-detail-loading">
        {header}
        <div className="px-4 py-4">
          <Loading label={MW.objectLoading} />
        </div>
      </div>
    );
  }
  if (q.isError || !d || !status) {
    return (
      <div className="absolute inset-0 flex flex-col bg-kit-slate-3" data-testid="mp-detail-failed">
        {header}
        <div className="px-4 py-4">
          <div className="rounded-card border border-kit-slate-5 bg-white">
            <EmptyState
              title={MW.objectLoadFailed}
              detail={(q.error as Error | undefined)?.message}
              action={
                <Button variant="neutral" onClick={() => void q.refetch()}>
                  {MW.tryAgain}
                </Button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const { request, lines } = d;
  const destName = new Map(d.destinations.map((dd) => [dd.id, dd.name]));
  const supName = new Map(d.suppliers.map((s) => [s.id, s.name]));
  const live = lines.filter((l) => l.cancelled_at === null);
  /* Card 06 §6 — the SERVER-derived earliest live Order By and its timing
     against the server's Malaysia date; the browser derives nothing. */
  const orderBy = manualPurchaseOrderByOf(live.map((l) => l.order_by ?? null));
  const timing = manualPurchaseTimingOf(orderBy, d.todayIso ?? null);
  const freeOf = (sku: string) => pick.data?.items.find((i) => i.sku === sku)?.free ?? 0;

  const forText = manualPurchaseForOf({
    purpose: request.purpose,
    destinationName: destName.get(request.destination_id) ?? null,
    serviceCaseNo: d.serviceCaseNo,
    staffName: request.for_staff_user_id
      ? (d.users.find((u) => u.id === request.for_staff_user_id)?.name ?? null)
      : null,
    subsidiaryName: request.for_subsidiary_name,
    why: request.why,
  });

  const approval = manualPurchaseApprovalOf({
    approvalRequired: request.approval_required,
    approvedAt: request.approved_at,
    refusedAt: request.refused_at,
  });
  const undecided = request.approved_at === null && request.refused_at === null;
  const showDecision = d.canApprove && request.approval_required && undecided;
  const approverLine = manualPurchaseApproverLine(d.approvers.map((a) => a.name));
  const decidedEvent = (d.history ?? []).find(
    (e) => e.kind === (approval.kind === "refused" ? "refused" : "approved"),
  );

  /* The approver's Approve gate — every live line must carry a whole number
     from 0 through its own ask before the one primary action unlocks. */
  const cutInvalid = live.find((l) => {
    const v = cuts[l.id];
    if (v === undefined) return false; // still seeding — not yet an error
    const n = Number(v);
    return !Number.isInteger(n) || n < 0 || n > l.qty;
  });
  const cutsReady =
    live.length > 0 &&
    live.every((l) => {
      const n = Number(cuts[l.id]);
      return cuts[l.id] !== undefined && Number.isInteger(n) && n >= 0 && n <= l.qty;
    });

  /* WHAT WE ALREADY HAVE — one row per live SKU, quantities summed. */
  const haveRows: Array<{ sku: string; requestedQty: number }> = [];
  for (const l of live) {
    const found = haveRows.find((r) => r.sku === l.sku);
    if (found) found.requestedQty += l.qty;
    else haveRows.push({ sku: l.sku, requestedQty: l.qty });
  }

  /* PURCHASE ORDERS — the exact linked documents; `Still To Order` uses the
     ONE remainder arithmetic over the demand lines each document carries. */
  const supplierChanged = d.pos.some((p) => p.supplier_delivery_date != null);
  const stillToOrderOf = (poId: string) =>
    live
      .filter((l) => (l.po_ids ?? []).includes(poId))
      .reduce(
        (n, l) =>
          n +
          manualPurchaseLineRemainingOf({
            qty: l.qty,
            approvedQty: l.approved_qty,
            issuedQty: l.issued_qty,
          }),
        0,
      );

  const historyGroups = groupHistoryChronology(d.history ?? []);

  return (
    <div className="absolute inset-0 flex flex-col bg-kit-slate-3" data-testid="mp-detail">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {/* ① REQUEST — the six authoritative facts, in the Card 06 order:
              Proceed Date · Delivery Date · Need for · For · Deliver To ·
              Requested By. */}
          <Block title={MW.secRequest}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              <Fact label={MW.colProceedDate} testId="mp-detail-proceed-date">
                {fmtDate(request.created_at.slice(0, 10))}
              </Fact>
              <Fact label={MW.colDeliveryDate} testId="mp-detail-delivery-date">
                {request.required_by ? (
                  fmtDate(request.required_by)
                ) : (
                  /* A historical null stays honest — never backfilled, never
                     given an invented Order By (Card 06 §6). */
                  <span className="text-base-600">{MW.notRecorded}</span>
                )}
                {/* The quiet derived timing fact — `Order by {date}`; when
                    passed, the fact states `Order date passed` first. No
                    Object Issue PO button arrives with it. */}
                {orderBy != null ? (
                  <span className="block text-label text-base-600" data-testid="mp-detail-order-by">
                    {timing === "order_date_passed" ? (
                      <span className="block text-kit-red-11">{MW.orderDatePassed}</span>
                    ) : null}
                    {manualPurchaseOrderByLine(fmtDate(orderBy))}
                  </span>
                ) : null}
              </Fact>
              <Fact label={MW.needFor}>{purposeLabelOf(request.purpose)}</Fact>
              <Fact label={MW.colFor} testId="mp-detail-for">
                {forText}
              </Fact>
              <Fact label={MW.colDeliverTo}>
                {destName.get(request.destination_id) ?? ""}
              </Fact>
              {/* The real staff display name — never `operation`, an email, a
                  role or `(you)`. A shared-account record whose individual
                  cannot be recovered states the audit defect. */}
              <Fact label={MW.colRequestedBy} testId="mp-detail-requested-by">
                {d.requested_by_name ?? (
                  <span className="text-base-600">{MW.staffIdentityNotRecorded}</span>
                )}
              </Fact>
              {/* A pre-Card-04 routine request keeps its stored reason visible
                  under the historical `Why`; Other Purchase answers through
                  `For` above and never prints twice. */}
              {request.why && request.purpose !== "other_purchase" ? (
                <Fact label={MW.why} testId="mp-detail-why" wide>
                  {request.why}
                </Fact>
              ) : null}
            </dl>
          </Block>

          {/* ② ITEMS REQUESTED — read-only; Catalog human words beside the
              explicit SKU; the supplier is Catalog-derived, never chosen. */}
          <Block title={MW.secItemsRequested}>
            <ObjectTable
              testId="mp-object-items"
              minWidth={860}
              columns={[
                { key: "sku", label: MW.expSku, width: 150 },
                { key: "item", label: MW.expItem, width: 220 },
                { key: "supplier", label: MW.expSupplier, width: 180 },
                { key: "qty", label: MW.expRequestedQty, width: 110 },
                { key: "deliver", label: MW.expDeliverTo, width: 170 },
                { key: "note", label: MW.colNote },
              ]}
            >
              {lines.map((l, i) => (
                <tr
                  key={l.id}
                  className={`divide-x divide-base-200 align-top${l.cancelled_at ? " text-base-400" : ""}`}
                  data-testid={`mp-object-item-${i}`}
                >
                  <td className="px-2 py-2 font-mono">{l.sku}</td>
                  <td className="px-2 py-2">
                    {l.item_label ?? l.sku}
                    {l.cancelled_at ? (
                      <span className="block text-label text-base-400">
                        {MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}
                        {l.cancel_reason ? ` — ${l.cancel_reason}` : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {l.supplier_id ? (
                      <span className="flex flex-col">
                        <span>{supName.get(l.supplier_id) ?? ""}</span>
                        {/* Card 06 §3.4 — a live line whose lead numbers
                            nobody set names the exact Settings fact here and
                            deep-links the repair; the engine invents no
                            date. */}
                        {l.production_days_missing ? (
                          <LeadGapLine
                            facts={manualPurchaseLeadDayFacts({
                              kind: "production",
                              supplierName: supName.get(l.supplier_id) ?? null,
                              categoryLabel: l.category
                                ? categoryLabel(l.category)
                                : null,
                            })}
                          />
                        ) : null}
                        {l.transit_days_missing ? (
                          <LeadGapLine
                            facts={manualPurchaseLeadDayFacts({
                              kind: "transit",
                              supplierName: supName.get(l.supplier_id) ?? null,
                            })}
                          />
                        ) : null}
                      </span>
                    ) : (
                      /* A missing Catalog relationship is a NAMED fact on the
                         affected line, fixed at its owning Catalog boundary —
                         never a rail facet, never a guess. */
                      <span className="flex flex-col">
                        <span>{MW.noSupplierYet}</span>
                        <Link
                          to="/operation?tab=catalog"
                          className="text-label text-kit-blue-11 underline-offset-2 hover:underline"
                        >
                          Ask Catalog to set the supplier of {l.sku}.
                        </Link>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{l.qty}</td>
                  <td className="px-2 py-2">
                    {destName.get(l.destination_id ?? request.destination_id) ?? ""}
                  </td>
                  <td className="px-2 py-2">{l.remark}</td>
                </tr>
              ))}
            </ObjectTable>
          </Block>

          {/* ③ WHAT WE ALREADY HAVE — decision facts, not buttons; the one
              shared arithmetic prints `Still Needed`. */}
          <Block title={MW.secAlreadyHave}>
            {haveRows.length === 0 ? (
              <p className="text-body text-base-500">
                {MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}
              </p>
            ) : (
              <ObjectTable
                testId="mp-object-have"
                minWidth={620}
                columns={[
                  { key: "sku", label: MW.expSku, width: 150 },
                  { key: "free", label: MW.colFreeStock, width: 110 },
                  { key: "onpo", label: MW.colAlreadyOnPo },
                  { key: "still", label: MW.colStillNeeded, width: 130 },
                ]}
              >
                {haveRows.map((r, i) => (
                  <AlreadyHaveRow
                    key={r.sku}
                    sku={r.sku}
                    requestedQty={r.requestedQty}
                    free={freeOf(r.sku)}
                    index={i}
                  />
                ))}
              </ObjectTable>
            )}
          </Block>

          {/* ④ APPROVAL — always present: the decision is part of the object.
              Content follows the fact and the caller's real authority. */}
          <Block title={MW.secApproval}>
            {approval.kind === "not_needed" ? (
              <p className="text-body text-base-700" data-testid="mp-approval-fact">
                {MW.noApprovalNeeded}
              </p>
            ) : approval.kind === "need_approval" && !showDecision ? (
              <div className="flex flex-col gap-0.5" data-testid="mp-approval-fact">
                <span className="text-body font-medium text-base-900">
                  {MANUAL_PURCHASE_APPROVAL_WORDS.need_approval}
                </span>
                {approverLine ? (
                  <span className="text-meta text-base-600" data-testid="mp-detail-approver">
                    {approverLine}
                  </span>
                ) : null}
              </div>
            ) : approval.kind === "need_approval" && showDecision ? (
              <div className="flex flex-col gap-3" data-testid="mp-decision">
                <ObjectTable
                  testId="mp-approval-table"
                  minWidth={760}
                  columns={[
                    { key: "sku", label: MW.expSku, width: 150 },
                    { key: "qty", label: MW.expRequestedQty, width: 110 },
                    { key: "still", label: MW.colStillNeeded, width: 110 },
                    { key: "approved", label: MW.expApprovedQty, width: 110 },
                    { key: "cost", label: MW.colTransactionCost, width: 140 },
                    { key: "total", label: MW.colLineTotal },
                  ]}
                >
                  {live.map((l, i) => (
                    <ApprovalLineRow
                      key={l.id}
                      line={l}
                      free={freeOf(l.sku)}
                      value={cuts[l.id]}
                      onChange={(v) => setCuts((c) => ({ ...c, [l.id]: v }))}
                      index={i}
                    />
                  ))}
                </ObjectTable>
                {cutInvalid ? (
                  <TwoLines
                    testId="mp-cut-invalid"
                    wrong={purchasingRefusal("invalid_cut_qty", { qty: cutInvalid.qty }).wrong}
                    todo={purchasingRefusal("invalid_cut_qty", { qty: cutInvalid.qty }).todo}
                  />
                ) : null}
                {decideError ? (
                  <TwoLines
                    testId="mp-decide-error"
                    wrong={decideError.wrong}
                    todo={decideError.todo}
                  />
                ) : null}
                <div className="flex items-center justify-end gap-3">
                  {refusing ? (
                    <span className="flex flex-1 items-center gap-2">
                      <label
                        htmlFor="mp-refuse-reason"
                        className="shrink-0 text-meta text-kit-slate-11"
                      >
                        {MW.decisionReason}
                      </label>
                      <Input
                        id="mp-refuse-reason"
                        aria-label={MW.decisionReason}
                        placeholder="Why is this not going ahead?"
                        value={refuseReason}
                        onChange={(e) => setRefuseReason(e.target.value)}
                        data-testid="mp-refuse-reason"
                      />
                      {/* The reason is REQUIRED — without it a refused request
                          is simply never touched again. */}
                      <Button
                        variant="neutral"
                        disabled={refuseReason.trim().length === 0 || decide.isPending}
                        onClick={() => void submitDecision("refuse")}
                        data-testid="mp-refuse-submit"
                      >
                        {MW.refuse}
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="neutral"
                      onClick={() => setRefusing(true)}
                      data-testid="mp-refuse"
                    >
                      {MW.refuse}
                    </Button>
                  )}
                  {/* The ONE primary action in this section (Card 05 §3.5). */}
                  <Button
                    variant="primary"
                    disabled={!cutsReady}
                    loading={decide.isPending}
                    onClick={() => void submitDecision("approve")}
                    data-testid="mp-approve"
                  >
                    {MW.approve}
                  </Button>
                </div>
              </div>
            ) : (
              /* Decided — the fact, the real actor and time, and (approved)
                 the quantity per line; (refused) the decision reason. */
              <div className="flex flex-col gap-2" data-testid="mp-approval-fact">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body font-semibold text-base-900">
                    {approval.label}
                  </span>
                  {decidedEvent ? (
                    <span className="text-meta text-base-600" data-testid="mp-decided-by">
                      {mpEventIdentity(decidedEvent)}
                    </span>
                  ) : null}
                  {approval.kind === "refused" && request.refuse_reason ? (
                    <span
                      className="text-label text-base-600"
                      data-testid="mp-detail-refuse-reason"
                    >
                      {request.refuse_reason}
                    </span>
                  ) : null}
                </div>
                {approval.kind === "approved" && live.length > 0 ? (
                  <ObjectTable
                    testId="mp-approved-lines"
                    minWidth={380}
                    columns={[
                      { key: "sku", label: MW.expSku, width: 150 },
                      { key: "qty", label: MW.expRequestedQty, width: 120 },
                      { key: "approved", label: MW.expApprovedQty },
                    ]}
                  >
                    {live.map((l) => (
                      <tr key={l.id} className="divide-x divide-base-200">
                        <td className="px-2 py-2 font-mono">{l.sku}</td>
                        <td className="px-2 py-2 tabular-nums">{l.qty}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {l.approved_qty ?? l.qty}
                        </td>
                      </tr>
                    ))}
                  </ObjectTable>
                ) : null}
              </div>
            )}
          </Block>

          {/* ⑤ PURCHASE ORDERS — read-only exact lineage. No Issue PO, no PO
              Duty, no consolidation, no price, no Receive, no PDF: issuance
              is the Register's selected action; arrival is Receiving's. */}
          <Block title={MW.secPurchaseOrders}>
            {d.pos.length === 0 ? (
              <p className="text-body text-base-500" data-testid="mp-object-not-ordered">
                {MW.notOrderedYet}
              </p>
            ) : (
              <ObjectTable
                testId="mp-object-pos"
                minWidth={supplierChanged ? 860 : 700}
                columns={[
                  { key: "po", label: MW.expPoNo, width: 160 },
                  { key: "qty", label: MW.expOrderedQty, width: 110 },
                  { key: "still", label: MW.expStillToOrder, width: 110 },
                  { key: "issued", label: MW.colPoIssued, width: 130 },
                  { key: "date", label: MW.colPoDeliveryDate },
                  ...(supplierChanged
                    ? [{ key: "supdate", label: MW.colSupplierDeliveryDate }]
                    : []),
                ]}
              >
                {d.pos.map((p, i) => (
                  <tr
                    key={p.id}
                    className="divide-x divide-base-200"
                    data-testid={`mp-object-po-${i}`}
                  >
                    <td className="px-2 py-2 font-mono">
                      <button
                        type="button"
                        className="text-kit-blue-11 underline-offset-2 hover:underline"
                        data-testid={`mp-object-po-link-${i}`}
                        onClick={() =>
                          navigate(
                            `/operation/procurement?po=${encodeURIComponent(p.po_no)}`,
                          )
                        }
                      >
                        {p.po_no}
                      </button>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{p.ordered_qty}</td>
                    <td className="px-2 py-2 tabular-nums">{stillToOrderOf(p.id)}</td>
                    <td className="px-2 py-2">
                      {p.placed_at ? fmtDate(p.placed_at.slice(0, 10)) : null}
                    </td>
                    <td className="px-2 py-2">
                      {p.po_delivery_date ? fmtDate(p.po_delivery_date) : null}
                    </td>
                    {supplierChanged ? (
                      <td className="px-2 py-2">
                        {p.supplier_delivery_date
                          ? fmtDate(p.supplier_delivery_date)
                          : MW.sameAsPo}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </ObjectTable>
            )}
          </Block>

          {/* ⑥ HISTORY — stored facts in the locked three-rank grammar,
              grouped Today · Yesterday · Earlier. */}
          <Block title={MW.secHistory}>
            {historyGroups.length === 0 ? (
              <p className="text-body text-base-500">No history recorded</p>
            ) : (
              <div className="flex flex-col gap-4" data-testid="mp-object-history">
                {historyGroups.map((group) => (
                  <section key={group.heading}>
                    <h3
                      className="mb-1.5 text-label font-semibold text-base-500"
                      data-testid={`mp-history-group-${group.heading}`}
                    >
                      {group.heading}
                    </h3>
                    <ul className="flex flex-col divide-y divide-base-200">
                      {group.events.map((event, i) => {
                        const words = manualPurchaseHistoryRecord(event);
                        return (
                          <li
                            key={`${event.kind}-${event.occurred_at}-${i}`}
                            className="flex min-w-0 flex-col gap-0.5 py-2 first:pt-0 last:pb-0"
                          >
                            <RecordRanks
                              words={{
                                title: words.title,
                                identity: mpEventIdentity(event),
                                detail: words.detail,
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}
