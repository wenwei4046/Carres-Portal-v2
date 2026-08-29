import { useEffect, useMemo, useState } from "react";
import {
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  MANUAL_PURCHASE_RAIL,
  MANUAL_PURCHASE_RAIL_CLEAR,
  MANUAL_PURCHASE_STATUS_WORDS,
  MANUAL_PURCHASE_WORDS as MW,
  TO_ORDER_WORDS as W,
  demandPurposeLabelOf,
  manualPurchaseApprovalOf,
  manualPurchaseApproverLine,
  manualPurchaseDeliverToSummary,
  manualPurchaseForOf,
  manualPurchaseIssueGroupCount,
  manualPurchaseIssueSentence,
  manualPurchaseItemsSummary,
  manualPurchaseLineRemainingOf,
  manualPurchasePoSummary,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseSelectable,
  manualPurchaseStatusOf,
  manualPurchaseSupplierSummary,
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
import { PanelLeftOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
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
  useDeliveryPartners,
  useIssuePurchaseRequests,
  useManualPurchaseDetail,
  useManualPurchaseRegister,
  type ManualPurchaseRegisterPayload,
  type PurchaseRequestLineRow,
  type PurchaseRequestRow,
} from "@/lib/queries";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
import PurchasingTabs from "./PurchasingTabs";
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
  requestedDate: string;
  approval: { kind: ManualPurchaseApprovalKind; label: string };
  poNos: string[];
  neededBy: string | null;
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
  /** The document-partition facts behind `Issue {n} PO{s}`. */
  issueWalls: Array<{
    supplierId: string | null;
    category: string | null;
    destinationId: string;
    purpose: string;
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
      requestedDate: r.created_at,
      approval: manualPurchaseApprovalOf({
        approvalRequired: r.approval_required,
        approvedAt: r.approved_at,
        refusedAt: r.refused_at,
      }),
      poNos: [...new Set(live.flatMap(linePoNos))],
      neededBy: r.required_by,
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
      issueWalls: live.map((l) => ({
        supplierId: l.supplier_id,
        category: (l.category as string | null | undefined) ?? null,
        destinationId: l.destination_id ?? r.destination_id,
        purpose: r.purpose,
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
          lineCategories: r.lineCategories,
          lineSupplierNames: r.lineSupplierNames,
        })),
      ),
    [rows],
  );
  const rail = useMemo(
    () => manualPurchaseRailModel(railFacts, railFilter),
    [railFacts, railFilter],
  );

  const filtered = useMemo(
    () => rows.filter((r) => rail.visibleRequestIds.has(r.id)),
    [rows, rail],
  );

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
        key: "requested_date",
        label: MW.colRequestedDate,
        width: 118,
        sortable: true,
        filterType: "date",
        dateValue: (r) => r.requestedDate,
        accessor: (r) => fmtDate(r.requestedDate.slice(0, 10)),
        searchValue: (r) => fmtDate(r.requestedDate.slice(0, 10)),
        filterValue: (r) => fmtDate(r.requestedDate.slice(0, 10)),
        sortFn: (a, b) => a.requestedDate.localeCompare(b.requestedDate),
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
        key: "needed_by",
        label: MW.colNeededBy,
        width: 113,
        sortable: true,
        filterType: "date",
        dateValue: (r) => r.neededBy,
        accessor: (r) => (r.neededBy ? fmtDate(r.neededBy) : null),
        searchValue: (r) => (r.neededBy ? fmtDate(r.neededBy) : ""),
        filterValue: (r) => (r.neededBy ? fmtDate(r.neededBy) : ""),
        sortFn: (a, b) => (a.neededBy ?? "").localeCompare(b.neededBy ?? ""),
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

  if (typeof mode === "object") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PurchasingTabs />
        <RequestDetail
          id={mode.detail}
          readySiblingIds={(() => {
            const mine = new Set(
              (q.data?.lines ?? [])
                .filter((l) => l.request_id === mode.detail && l.cancelled_at === null)
                .map((l) => l.supplier_id),
            );
            return rows
              .filter(
                (r) =>
                  r.id !== mode.detail &&
                  r.status.kind === "ready_to_order" &&
                  (q.data?.lines ?? []).some(
                    (l) =>
                      l.request_id === r.id &&
                      l.cancelled_at === null &&
                      mine.has(l.supplier_id),
                  ),
              )
              .map((r) => r.id);
          })()}
          onBack={() => {
            setMode("register");
            void q.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Card 03 — the readable 240px shell, BYTE-BEHAVIOURALLY UNCHANGED
            by Card 04 (the sixth purpose row arrives through the one shared
            `DEMAND_PURPOSES` list, Law D). */}
        {filterRailOpen && (
        <FilterRail
          testId="manual-purchase-rail"
          onHide={() => setFilterRailVisible(false)}
        >
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.toOrder.heading}>
            {/* Three DERIVED request states (`manualPurchaseStatusOf`), never
                a stored status. A second click clears the row. */}
            {MANUAL_PURCHASE_RAIL.toOrder.rows.map((row) => (
              <FilterRailRow
                key={row.state}
                active={railFilter.toOrder === row.state}
                onClick={() =>
                  setRailFilter((prev) => ({
                    ...prev,
                    toOrder: prev.toOrder === row.state ? null : row.state,
                  }))
                }
                testId={`mp-to-order-${row.state}`}
                label={row.word}
                count={rail.toOrderCounts[row.state]}
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
            storageKey="carres.manualPurchase.register.v2"
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
  const [neededBy, setNeededBy] = useState("");
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
  /** `Needed by` is one of the request's six facts (MASTER §3) — a request
   *  with no date leaves the approver and the issuer with nothing to plan
   *  against. Found empty-but-sendable on the 2026-08-19 owner walk. */
  const dateOk = neededBy !== "";

  const canSend =
    !saving &&
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
   *  missing header fact wins, in the form's own top-to-bottom order. */
  const sendLabel = !dateOk
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
          requiredBy: neededBy || null,
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
          requiredBy: neededBy || null,
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
        <DatePicker
          id="mp-needed"
          label={MW.neededBy}
          value={neededBy || null}
          onChange={(v) => setNeededBy(v ?? "")}
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

/* ── The object detail — ONE SCROLL, no tabs (ui/MASTER §4.1; card §8) ────── */

/**
 * One request, read top to bottom: the facts the card rules (raised by ·
 * for · what · how many · deliver to · needed by), then
 * `WHAT WE ALREADY HAVE` per line, then — for the APPROVER only — the money
 * and the decision. The same screen renders for both roles minus the money,
 * never a permission error.
 *
 * The Approve control pre-fills `still needed`, NOT what was asked (card §4):
 * an approver who has to do the subtraction will not do it. Cutting is not
 * refusing. `Refuse` cannot be submitted without a reason.
 */
function RequestDetail({
  id,
  onBack,
  readySiblingIds,
}: {
  id: string;
  onBack: () => void;
  /** Other READY requests sharing a supplier with this one — the
   *  consolidation OFFER's candidates (card §6). */
  readySiblingIds: string[];
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
  const decide = useDecidePurchaseRequest();
  const issue = useIssuePurchaseRequests();
  const partnersQ = useDeliveryPartners();

  /**
   * ⭐ THE TRANSACTION COSTS THIS ISSUE WILL COMMIT TO (0380; Card 02 closure §2).
   *
   * The prices are READ and SHOWN before `Issue PO`, and the same numbers are
   * declared with the request. `Issue as one PO` can pull in sibling requests
   * whose lines are not on this screen, so the read covers them too.
   */
  const issueIds = useMemo(() => [id, ...readySiblingIds], [id, readySiblingIds]);
  const costsQ = useQuery({
    queryKey: ["operation", "purchasing", "requests", "issue-costs", issueIds],
    queryFn: () =>
      apiFetch<{ costs: { sku: string; unitCost: number | null }[] }>(
        `/api/operation/purchasing/requests/issue-costs?requestIds=${encodeURIComponent(
          issueIds.join(","),
        )}`,
      ),
    staleTime: 15_000,
  });

  /** The approver's per-line numbers — seeded from `still needed` once the
   *  stock facts land; the human may override before approving. */
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const [refusing, setRefusing] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const [issueError, setIssueError] = useState<string | null>(null);

  if (q.isLoading || !q.data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-meta text-base-500">
        {q.isError ? (q.error as Error).message : "Loading…"}
      </div>
    );
  }

  const { request, lines, destinations, users, canApprove } = q.data;
  const destName = destinations.find((d) => d.id === request.destination_id)?.name ?? "";
  const raisedBy = users.find((u) => u.id === request.created_by)?.name ?? "";
  const freeOf = (sku: string) =>
    pick.data?.items.find((i) => i.sku === sku)?.free ?? 0;

  /* The structured For — the same one arithmetic the Register prints. */
  const forText = manualPurchaseForOf({
    purpose: request.purpose,
    destinationName: destName || null,
    serviceCaseNo: q.data.serviceCaseNo,
    staffName: request.for_staff_user_id
      ? (users.find((u) => u.id === request.for_staff_user_id)?.name ?? null)
      : null,
    subsidiaryName: request.for_subsidiary_name,
    why: request.why,
  });

  const status = manualPurchaseStatusOf({
    approvalRequired: request.approval_required,
    approvedAt: request.approved_at,
    refusedAt: request.refused_at,
    refuseReason: request.refuse_reason,
    lines: lines.map((l) => ({
      qty: l.qty,
      issuedQty: l.issued_qty,
      remainingQty: l.remaining_qty,
      cancelledAt: l.cancelled_at,
      poId: l.po_id,
      received: l.received,
    })),
  });
  const undecided = request.approved_at === null && request.refused_at === null;
  const showDecision = canApprove && request.approval_required && undecided;

  async function submitIssue(together: boolean) {
    setIssueError(null);
    if (!q.data) return;
    const liveSuppliers = new Set(
      q.data.lines.filter((l) => l.cancelled_at === null).map((l) => l.supplier_id),
    );
    const partners: Record<string, string> = {};
    for (const sp of q.data.suppliers) {
      if (liveSuppliers.has(sp.id) && sp.kind === "factory_pickup") {
        if (!partnerId) {
          setIssueError("Select a procurement partner for this factory-pickup supplier.");
          return;
        }
        partners[sp.id] = partnerId;
      }
    }
    /* THE PRICES SHOWN ON THIS SCREEN, declared. A SKU with no Catalog price is
       a configuration hole; it is not declared as zero, and the server refuses
       the line by name. */
    const expectedCosts: Record<string, number> = {};
    for (const c of costsQ.data?.costs ?? []) {
      if (c.unitCost != null) expectedCosts[c.sku] = c.unitCost;
    }
    if (Object.keys(expectedCosts).length === 0) {
      setIssueError("The transaction costs are still loading. Wait, then issue again.");
      return;
    }
    try {
      await issue.mutateAsync({
        requestIds: together ? [id, ...readySiblingIds] : [id],
        together,
        partners: Object.keys(partners).length > 0 ? partners : null,
        expectedCosts,
      });
      onBack();
    } catch (e) {
      /* THE APPROVED TWO LINES (closure §9): the fact, then the act. */
      const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
      const fallback = purchasingRefusal(body?.code);
      setIssueError(
        `${body?.message ?? fallback.wrong} ${body?.action ?? fallback.todo}`.trim(),
      );
    }
  }

  async function submitDecision(decision: "approve" | "refuse") {
    setError(null);
    try {
      await decide.mutateAsync({
        id,
        decision,
        reason: decision === "refuse" ? refuseReason.trim() : null,
        cuts:
          decision === "approve"
            ? lines
                .filter((l) => l.cancelled_at === null)
                .map((l) => ({ id: l.id, qty: Number(cuts[l.id] ?? l.qty) }))
                .filter((c) => Number.isInteger(c.qty) && c.qty >= 0)
            : null,
      });
      onBack();
    } catch (e) {
      /* THE APPROVED TWO LINES (closure §9): when the door refuses with the
         fact and the act, print both — never the raw code word. */
      const body = (e as { body?: { message?: string; action?: string } }).body;
      setError(
        body?.action
          ? `${body.message ?? ""} ${body.action}`.trim()
          : e instanceof Error
            ? e.message
            : "The decision was not recorded",
      );
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="mp-detail"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-base-900">
          <span className="font-mono">{request.req_no}</span>
          <span className="pl-3">
            <StatusPill tone={STATUS_TONE[status.kind]}>{status.label}</StatusPill>
          </span>
        </h2>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      {status.reasonLabel ? (
        <p className="text-meta text-base-700" data-testid="mp-detail-refuse-reason">
          {status.reasonLabel}
        </p>
      ) : null}

      {/* Card 03 §3 — the object names the REAL action owner while the
          request waits. Nothing resolved prints nothing. */}
      {status.kind === "waiting_approval"
        ? (() => {
            const line = manualPurchaseApproverLine(
              (q.data?.approvers ?? []).map((a) => a.name),
            );
            return line ? (
              <p className="text-meta text-base-700" data-testid="mp-detail-approver">
                {line}
              </p>
            ) : null;
          })()
        : null}

      {/* The facts, in the card's own order. */}
      <dl className="grid max-w-[720px] grid-cols-2 gap-x-6 gap-y-2 text-body">
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.raisedBy}</dt>
          <dd className="text-base-900">{raisedBy}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.needFor}</dt>
          <dd className="text-base-900">{purposeLabelOf(request.purpose)}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.colFor}</dt>
          <dd className="text-base-900" data-testid="mp-detail-for">
            {forText}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.deliverTo}</dt>
          <dd className="text-base-900">{destName}</dd>
        </div>
        <div>
          <dt className="text-meta text-kit-slate-11">{MW.neededBy}</dt>
          <dd className="text-base-900">
            {request.required_by ? fmtDate(request.required_by) : null}
          </dd>
        </div>
        {/* A routine purpose that carries a historical reason still shows it
            truthfully; Other Purchase shows its own answer under its own
            question through `For` above. */}
        {request.why && request.purpose !== "other_purchase" ? (
          <div className="col-span-2">
            <dt className="text-meta text-kit-slate-11">{MW.why}</dt>
            <dd className="text-base-900" data-testid="mp-detail-why">
              {request.why}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* The lines, each with WHAT WE ALREADY HAVE — and, for the approver,
          the money and the pre-filled still-needed control. */}
      <div className="flex max-w-[900px] flex-col gap-3">
        <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-base-500">
          {MW.items}
        </h3>
        {lines.map((l, i) => {
          const free = freeOf(l.sku);
          return (
            <div key={l.id} className="flex flex-col gap-1 border-b border-base-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-body text-base-900">{l.sku}</span>
                <span className="text-meta text-base-600">× {l.qty}</span>
                {l.remark ? (
                  <span className="text-meta text-base-600">· {l.remark}</span>
                ) : null}
                {l.cancelled_at ? (
                  <span className="text-meta text-base-500">
                    {MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}
                    {l.cancel_reason ? ` — ${l.cancel_reason}` : ""}
                  </span>
                ) : null}
                {"unit_cost" in l && l.unit_cost != null ? (
                  /* THE MONEY — approver only; the server omits the key for
                     everyone else, so nothing here can leak it. */
                  <span
                    className="ml-auto tabular-nums text-meta text-base-700"
                    data-testid={`mp-detail-cost-${i}`}
                  >
                    RM {Number(l.unit_cost).toLocaleString()} × {l.qty}
                  </span>
                ) : null}
              </div>

              {l.cancelled_at === null ? (
                <AlreadyHave sku={l.sku} free={free} qty={l.qty} index={i} />
              ) : null}

              {showDecision && l.cancelled_at === null ? (
                <StillNeededControl
                  line={l}
                  free={free}
                  value={cuts[l.id]}
                  onChange={(v) => setCuts((c) => ({ ...c, [l.id]: v }))}
                  index={i}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-meta text-kit-red-11" data-testid="mp-decide-error">
          {error}
        </p>
      ) : null}

      {showDecision ? (
        <div className="flex max-w-[900px] items-center gap-3" data-testid="mp-decision">
          <Button
            variant="primary"
            loading={decide.isPending}
            onClick={() => void submitDecision("approve")}
            data-testid="mp-approve"
          >
            Approve
          </Button>
          {refusing ? (
            <span className="flex flex-1 items-center gap-2">
              <Input
                id="mp-refuse-reason"
                aria-label="Refuse reason"
                placeholder="Why is this not going ahead?"
                value={refuseReason}
                onChange={(e) => setRefuseReason(e.target.value)}
                data-testid="mp-refuse-reason"
              />
              {/* The reason is REQUIRED — without it a refused request is
                  simply never touched again (card §4). */}
              <Button
                variant="ghost"
                disabled={refuseReason.trim().length === 0 || decide.isPending}
                onClick={() => void submitDecision("refuse")}
                data-testid="mp-refuse-submit"
              >
                Refuse
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setRefusing(true)}
              data-testid="mp-refuse"
            >
              Refuse
            </Button>
          )}
        </div>
      ) : null}

      {/* ── ISSUE — same day, no PO-day gate; consolidation is an OFFER
          (card §6): issuing separately is ALWAYS available on the same
          screen. An offer that cannot be declined is a gate wearing an
          offer's clothes. */}
      {status.kind === "ready_to_order" ? (
        <div className="flex max-w-[900px] flex-col gap-2" data-testid="mp-issue">
          {(() => {
            const liveSuppliers = new Set(
              lines.filter((l) => l.cancelled_at === null).map((l) => l.supplier_id),
            );
            const needsPartner = q.data!.suppliers.some(
              (sp) => liveSuppliers.has(sp.id) && sp.kind === "factory_pickup",
            );
            return needsPartner ? (
              <div className="flex items-center gap-2">
                <label htmlFor="mp-issue-partner" className="text-meta text-kit-slate-11">
                  Procurement partner
                </label>
                <span className="w-[220px]">
                  <Select
                    id="mp-issue-partner"
                    value={partnerId}
                    onValueChange={setPartnerId}
                    options={(partnersQ.data?.partners ?? []).map(
                      (dp: { id: string; name: string }) => ({
                        value: dp.id,
                        label: dp.name,
                      }),
                    )}
                  />
                </span>
              </div>
            ) : null;
          })()}
          {/* ⭐ THE PRICES THIS ISSUE COMMITS TO (0380; closure §2).
              Shown before the button, because the request DECLARES them and a
              number nobody was shown is not a number anybody reviewed. `Issue as
              one PO` widens the set to the sibling requests, so this list does
              too. A SKU Catalog has no price for is named, not defaulted. */}
          {(costsQ.data?.costs ?? []).length > 0 ? (
            <div className="flex flex-col gap-0.5" data-testid="mp-issue-costs">
              <span className="text-label uppercase tracking-wide text-base-500">
                Transaction cost
              </span>
              {(costsQ.data?.costs ?? []).map((c) => (
                <span
                  key={c.sku}
                  className="flex items-center justify-between gap-3 text-meta"
                  data-testid={`mp-issue-cost-${c.sku}`}
                >
                  <span className="min-w-0 truncate font-mono">{c.sku}</span>
                  {c.unitCost == null ? (
                    <span className="flex shrink-0 flex-col text-right">
                      <span className="text-base-900">Catalog has no price.</span>
                      <span className="text-base-500">
                        Ask Catalog to set the cost of {c.sku}.
                      </span>
                    </span>
                  ) : (
                    <span className="shrink-0 tabular-nums text-base-900">
                      RM {Number(c.unitCost).toLocaleString()}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {readySiblingIds.length > 0 ? (
              <>
                <span className="text-meta text-base-700" data-testid="mp-issue-offer">
                  Issue as one PO? {readySiblingIds.length + 1} approved requests share
                  this supplier.
                </span>
                <Button
                  variant="primary"
                  loading={issue.isPending}
                  onClick={() => void submitIssue(true)}
                  data-testid="mp-issue-together"
                >
                  Issue as one PO
                </Button>
                <Button
                  variant="ghost"
                  disabled={issue.isPending}
                  onClick={() => void submitIssue(false)}
                  data-testid="mp-issue-separate"
                >
                  Issue separately
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                loading={issue.isPending}
                onClick={() => void submitIssue(false)}
                data-testid="mp-issue-po"
              >
                Issue PO
              </Button>
            )}
          </div>
          {issueError ? (
            <p className="text-meta text-kit-red-11" data-testid="mp-issue-error">
              {issueError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The approver's quantity — PRE-FILLED with `still needed`, never with what
 * was asked (card §4, `purchasing/MASTER.md`): an approver who has to do the
 * subtraction will not do it. The seed lands once the already-on-PO read
 * answers; a human edit afterwards is theirs and is not overwritten.
 */
function StillNeededControl({
  line,
  free,
  value,
  onChange,
  index,
}: {
  line: { id: string; sku: string; qty: number };
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
  return (
    <div className="flex items-center gap-2 text-meta">
      <label htmlFor={`mp-cut-${index}`} className="text-kit-slate-11">
        Approve
      </label>
      <span className="w-[64px]">
        <Input
          id={`mp-cut-${index}`}
          aria-label={`Approve quantity for ${line.sku}`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`mp-cut-${index}`}
        />
      </span>
      <span className="text-base-600">
        of {line.qty} asked — {MW.stillNeeded} {still}
      </span>
    </div>
  );
}
