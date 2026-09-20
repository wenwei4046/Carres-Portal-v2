// design-standard: not-a-list-page — this is a governed PURCHASING REGISTER
// destination, not a generic List page. Its frame is the module's own shell —
// `PurchasingTabs` draws the destination header, the 240px `FilterRail` draws
// the facets, and `register/DataGrid` (appearance="reference") draws the
// 36px/38px/32px Register Template. That is the approved shape for this
// module (docs/ui/MASTER.md; docs/purchasing/MASTER.md §8.1), and it is the
// shape its sibling SO Batch Purchase already carries; wrapping it in a
// second `ListPageShell` would draw a page header inside a page header.
import { useCallback, useEffect, useMemo, useRef, useState , type ReactNode } from "react";
import "./manual-purchase-create.css";
import registerStyles from "./ManualPurchaseRegister.module.css";
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
  compareManualPurchaseRows,
  demandPurposeLabelOf,
  manualPurchaseApprovalOf,
  manualPurchaseApproverLine,
  manualPurchaseGroupOf,
  manualPurchaseHistoryRecord,
  manualPurchaseDeliverToSummary,
  manualPurchaseForOf,
  manualPurchaseIssueGroupCount,
  manualPurchaseNeedStatusOf,
  MANUAL_PURCHASE_NEED_STATUS_WORDS,
  poSafetyDaysWord,
  tightestPoSafetyDays,
  PO_SAFETY_DAYS_NONE,
  type ManualPurchaseNeedStatus,
  type PoSafetyDays,
  manualPurchaseIssueSentence,
  manualPurchaseItemsSummary,
  manualPurchaseLeadDayFacts,
  manualPurchaseLineRemainingOf,
  manualPurchaseObjectHeading,
  manualPurchaseOrderByLine,
  manualPurchaseOrderByOf,
  manualPurchasePoSummary,
  manualPurchaseRailFacts,
  manualPurchaseRailModel,
  manualPurchaseSelectable,
  manualPurchaseNotSelectableReason,
  manualPurchaseStatusOf,
  manualPurchaseSupplierSummary,
  manualPurchaseTimingOf,
  purchasingRefusal,
  type PurchasingSupplierCollectionSetting,
  stillNeededOf,
  type DemandPickItem,
  type DemandPurpose,
  type ManualPurchaseIntent,
  type ManualPurchaseApprovalKind,
  type ManualPurchaseGroup,
  type ManualPurchaseRailFilter,
  type ManualPurchaseStatus,
  type ManualPurchaseStatusKind,
  type OrderActionTone,
  type ProductCategory,
} from "@carres/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addDaysIso } from "@/lib/excel-date-filter";
import { fmtDate } from "@/lib/fmt-date";
import { conciseLocality, NOT_RECORDED } from "@/lib/locality";
import {
  useAlreadyOnPo,
  useCreatePurchaseRequest,
  useDecidePurchaseRequest,
  useIssuePurchaseRequests,
  useManualPurchaseDetail,
  useManualPurchasePlan,
  useManualPurchaseRegister,
  useMoveManualPurchaseDeliverTo,
  useResubmitManualPurchase,
  useWithdrawManualPurchase,
  type ManualPurchaseDetailPayload,
  type ManualPurchasePlanLine,
  type ManualPurchaseRegisterPayload,
  type PurchaseRequestLineRow,
  type PurchaseRequestRow,
} from "@/lib/queries";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
import GoodsMiniTable, {
  categoryWord,
  goodsCategoryOf,
  type GoodsMiniLine,
} from "./components/GoodsMiniTable";
import {
  ManualPurchaseStockFrame,
  ReadyStockCell,
  useManualPurchaseStock,
} from "./ManualPurchaseStock";
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
  FilterRailSelect,
  useFilterRailOpen,
} from "./components/workspace-rail";

/**
 * MANUAL PURCHASE — the request, the approval, the order
 * (Round 2, owner rulings R1–R4 2026-09-16; `docs/purchasing/MASTER.md` §9.2;
 *  `docs/COPY-STANDARD.md` Manual Purchase).
 *
 * ── ONE TABLE, THREE GROUPS (R2) ────────────────────────────────────────────
 *
 * ```
 * Need approval        waiting for a decision, or sent back for changes
 * To buy               approved, quantity remains (incl. Not planned)
 * No purchase needed   ordered · refused · withdrawn · nothing remains  ▸
 * ```
 *
 * The page follows SO Batch Purchase: the shared DataGrid with the slate
 * palette, responsive Register search, one `Clear filters`, the sticky
 * identity (`Items`, which opens the object), selection that REPLACES the
 * toolbar, an issue refusal in the warning band, and a rail that floats (and
 * starts hidden, S3) on a narrow canvas. Group membership, ordering and the
 * rail counts are ONE arithmetic each in `packages/shared` (Law D).
 *
 * Money appears NOWHERE on the Register: Purchasing has no money, and the
 * approver-only cost evidence is the object's Approval section, server-gated.
 */

/** The remembered open/closed choice for the local filter rail (S3). The key
 *  moved to v2 so a stored "open" from before S3 does not float the rail over
 *  a phone-width list the operator never chose to cover. */
const FILTER_RAIL_STORAGE_KEY = "carres.manualPurchase.filterRail.v2";

/** Approval pills — the waiting states louder, decided states quiet. */
const APPROVAL_TONE: Record<ManualPurchaseApprovalKind, OrderActionTone> = {
  need_approval: "warning",
  sent_back: "warning",
  approved: "success",
  refused: "neutral",
  withdrawn: "neutral",
};

/** Object pills keep the request-status tones. */
const STATUS_TONE: Record<ManualPurchaseStatusKind, OrderActionTone> = {
  waiting_approval: "warning",
  sent_back: "warning",
  withdrawn: "neutral",
  waiting_sku: "warning",
  ready_to_order: "info",
  ordered: "neutral",
  arrived: "success",
  not_going_ahead: "neutral",
};

/**
 * ⭐ ONE GOODS ROW = ONE ALLOCATION (settled design, owner ruling 2026-09-11).
 * A row is the quantity as it was ACTUALLY committed: one row per purchase
 * order the line went onto, with that document's own quantity, destination,
 * supplier and PO Delivery Date, plus one `To purchase` row for what is still
 * to buy.
 */
interface GoodsRow {
  key: string;
  /**
   * ⭐ THE MANUAL PURCHASE LINE THIS ROW IS, when it is one.
   *
   * A row that records a purchase order already made is EVIDENCE and has no
   * demand to act on, so it carries `null` and takes no tick and no stock
   * frame. The `To purchase` row carries the real `purchase_demands.id` — the
   * exact binding a Ready Stock choice is saved against, and the key the
   * goods-level selection uses.
   */
  demandId: string | null;
  sku: string;
  item: string;
  category: string | null;
  qty: number;
  supplier: string;
  deliverTo: string;
  /** The document this quantity went onto; empty = still to purchase. */
  poNos: string[];
  poDeliveryDate: string | null;
  /** Issued, but no document can be named — a different absence entirely. */
  issuedWithoutDocument?: boolean;
  cancelled: boolean;
  cancelReason: string | null;
}

interface RequestRegisterRow {
  id: string;
  /**
   * ⭐ `MPR No` — THE DOCUMENT IDENTITY AGAIN (owner ruling 2026-09-18, which
   * overwrites Card 08's 2026-09-04 retirement). `null` on a request raised
   * while the number was retired: the cell prints the governed absence and the
   * row still opens, because inventing a number to fill a column would put a
   * document reference in the portal that names no document.
   */
  mprNo: string | null;
  /** A retired `REQ-…` identity: searchable, never printed. */
  legacyReqNo: string | null;
  purpose: string;
  /** The actual hand-off fact (`created_at`), immutable. */
  proceedDate: string;
  approval: { kind: ManualPurchaseApprovalKind; label: string };
  /** R2 — exactly one of the three groups. */
  group: ManualPurchaseGroup;
  poNos: string[];
  /** When supplier goods must reach Deliver To (`required_by`). */
  deliveryDate: string | null;
  /** The SERVER-derived earliest line Order By, or null. */
  orderBy: string | null;
  forText: string;
  purposeLabel: string;
  itemsText: string;
  supplierText: string;
  deliverToText: string;
  /** D2 — the ONE server-resolved real staff name, or null. */
  requestedBy: string | null;
  /**
   * ⭐ THE CUSTOMER FACTS, AND THEY ARE BLANK FOR ALMOST EVERY ROW.
   *
   * A Manual Purchase serves a governed internal purpose; only the
   * `Service Case` purpose's structured record names a real customer. These
   * three are read from that record and its linked Sales Order, and they are
   * `null` everywhere else — never the requester, never the destination, never
   * the supplier's town (Purchasing UI dictionary, 2026-09-18).
   */
  customerName: string | null;
  customerRequestedDeliveryDate: string | null;
  customerDeliveryCity: string | null;
  customerDeliveryState: string | null;
  /** The EARLIEST original supplier-facing date across this request's POs;
   *  null before any PO, and null when a PO recorded none. */
  poDefaultDeliveryDate: string | null;
  requestedByUserId: string | null;
  status: ManualPurchaseStatus;
  /** Live remainder still issuable — the selection gate's other half. */
  remainingQty: number;
  /** R2 — false when the lines could not be read: the remainder is UNKNOWN. */
  remainderKnown: boolean;
  lineCategories: (ProductCategory | null)[];
  lineSupplierNames: (string | null)[];
  lineOrderBys: (string | null)[];
  supplierGap: boolean;
  productionDaysMissing: boolean;
  transitDaysMissing: boolean;
  /** The document-partition facts behind `Issue {n} PO{s}`. */
  issueWalls: Array<{
    supplierId: string | null;
    category: string | null;
    destinationId: string;
    purpose: string;
    deliveryDate: string | null;
    remainingQty: number;
  }>;
  goods: GoodsRow[];
  skuTokens: string;
}

/** ONE label arithmetic (Law D) — approved and retired values both answer. */
function purposeLabelOf(value: string): string {
  return demandPurposeLabelOf(value) ?? value;
}

/** The request's stored decision facts, in the shape the shared arithmetic reads. */
function decisionFactsOf(r: PurchaseRequestRow) {
  return {
    approvedAt: r.approved_at,
    refusedAt: r.refused_at,
    withdrawnAt: r.withdrawn_at ?? null,
    sentBackAt: r.sent_back_at ?? null,
  };
}

function buildRows(data: ManualPurchaseRegisterPayload): RequestRegisterRow[] {
  const destName = new Map(data.destinations.map((d) => [d.id, d.name]));
  const userName = new Map(data.users.map((u) => [u.id, u.name ?? ""]));
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const poNo = new Map(data.pos.map((p) => [p.id, p.po_no]));
  const poFacts = new Map(data.pos.map((p) => [p.id, p]));
  const caseNo = new Map(data.serviceCases.map((sc) => [sc.id, sc.case_no]));
  /* The ONE customer source on this page — the Service Case's own record and
     its linked Sales Order. Every other purpose leaves these columns blank. */
  const caseCustomer = new Map(data.serviceCases.map((sc) => [sc.id, sc]));
  const linesByReq = new Map<string, PurchaseRequestLineRow[]>();
  for (const l of data.lines) {
    const list = linesByReq.get(l.request_id) ?? [];
    list.push(l);
    linesByReq.set(l.request_id, list);
  }

  const rows = data.requests.map((r: PurchaseRequestRow): RequestRegisterRow => {
    const lines = linesByReq.get(r.id) ?? [];
    const live = lines.filter((l) => l.cancelled_at === null);
    const linePoNos = (l: PurchaseRequestLineRow): string[] =>
      [
        ...new Set(
          (l.po_ids ?? (l.po_id ? [l.po_id] : [])).map((id) => poNo.get(id) ?? ""),
        ),
      ].filter((n) => n !== "");
    /**
     * ⭐ WHAT IS STILL TO BUY — the approved quantity, less what purchase
     * orders took, LESS the Ready Stock Units saved against this exact line
     * (owner ruling 2026-09-18). The same three terms the SQL door applies on
     * the locked row (`purchasing_mpr_line_remaining_requirement`, 0546), so
     * the screen and the door cannot disagree about what a tick would buy.
     *
     * `qty` and `approved_qty` are untouched: the original ask and the
     * approver's number both keep their authoritative homes.
     */
    const remainingOf = (l: PurchaseRequestLineRow) =>
      Math.max(
        0,
        manualPurchaseLineRemainingOf({
          qty: l.qty,
          approvedQty: l.approved_qty,
          issuedQty: l.issued_qty,
        }) - (l.stock_reserved_qty ?? 0),
      );
    const status = manualPurchaseStatusOf({
      ...decisionFactsOf(r),
      refuseReason: r.refuse_reason,
      lines: lines.map((l) => ({
        qty: l.qty,
        issuedQty: l.issued_qty,
        approvedQty: l.approved_qty,
        cancelledAt: l.cancelled_at,
        poId: l.po_id,
        received: l.received,
      })),
    });
    const approval = manualPurchaseApprovalOf(decisionFactsOf(r));
    /* ⭐ UNKNOWN IS NOT ZERO (R2). A request whose lines did not load — the
       whole read failed, or a header was stored with no lines — has no
       confirmed remainder. It never falls into `No purchase needed`. */
    const remainderKnown = !data.linesUnavailable && lines.length > 0;
    const remainingQty = live.reduce((n, l) => n + remainingOf(l), 0);
    const deliverNames = live.map(
      (l) => destName.get(l.destination_id ?? r.destination_id) ?? "",
    );
    const linkedCase = r.for_service_case_id
      ? (caseCustomer.get(r.for_service_case_id) ?? null)
      : null;
    return {
      id: r.id,
      /**
       * ⭐ WHAT PRINTS UNDER `MPR No`, AND WHAT ONLY STAYS SEARCHABLE
       * (owner ruling 2026-09-18, in its own two sentences).
       *
       *   `MPR-…`   prints exactly as stored — "historical MPR values stay as
       *             they are", and every request minted from 0546 onward is
       *             one of these.
       *   `REQ-…`   does NOT print. The ruling says these "stay searchable",
       *             which is a weaker promise than the one it makes for MPR,
       *             and Card 08 (0424) retired the series from every
       *             operator-facing surface. Printing it would put a second
       *             document series under a heading that names one.
       *   NULL      a request raised while the number was retired. It has no
       *             identity to print and none is invented.
       *
       * All three still open from the row, and all three stay searchable —
       * `searchValue` on this column carries the stored value whatever series
       * it belongs to.
       */
      mprNo: (r.req_no ?? "").startsWith("MPR-") ? r.req_no : null,
      legacyReqNo: (r.req_no ?? "").startsWith("REQ-") ? r.req_no : null,
      purpose: r.purpose,
      proceedDate: r.created_at,
      approval,
      group: manualPurchaseGroupOf({
        approval: approval.kind,
        status: status.kind,
        remainingQty,
        remainderKnown,
      }),
      poNos: [...new Set(live.flatMap(linePoNos))],
      deliveryDate: r.required_by,
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
      purposeLabel: purposeLabelOf(r.purpose),
      itemsText: manualPurchaseItemsSummary(
        (live.length > 0 ? live : lines).map((l) => l.item_label ?? l.sku),
      ),
      supplierText: manualPurchaseSupplierSummary(
        live.map((l) =>
          l.supplier_id ? (supplierName.get(l.supplier_id) ?? "") : "",
        ),
      ),
      deliverToText: manualPurchaseDeliverToSummary(
        deliverNames.length > 0 ? deliverNames : [destName.get(r.destination_id) ?? ""],
      ),
      /* D2 — the server's ONE identity. A shared login or an unnamed account
         is null here and on the object alike; nothing is looked up twice. */
      requestedBy: r.requested_by_name ?? null,
      requestedByUserId: r.requested_by_user_id ?? null,
      customerName: linkedCase?.customer_name ?? null,
      customerRequestedDeliveryDate: linkedCase?.requested_delivery_date ?? null,
      customerDeliveryCity: linkedCase?.delivery_city ?? null,
      customerDeliveryState: linkedCase?.delivery_state ?? null,
      /* The earliest of the ORIGINAL dates the linked POs were issued with —
         `official_delivery_date`, never `eta_date` and never re-derived from
         today's Settings (0428/0430). */
      poDefaultDeliveryDate:
        [
          ...new Set(
            live
              .flatMap((l) => l.po_ids ?? (l.po_id ? [l.po_id] : []))
              .map((id) => poFacts.get(id)?.official_delivery_date ?? null)
              .filter((d): d is string => typeof d === "string" && d !== ""),
          ),
        ]
          .sort()[0] ?? null,
      status,
      remainingQty,
      remainderKnown,
      lineCategories: live.map(
        (l) => (l.category as ProductCategory | null | undefined) ?? null,
      ),
      lineSupplierNames: live.map((l) =>
        l.supplier_id ? (supplierName.get(l.supplier_id) ?? null) : null,
      ),
      lineOrderBys: live.map((l) => l.order_by ?? null),
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
      goods: lines.flatMap((l): GoodsRow[] => {
        const cancelled = l.cancelled_at !== null;
        const item = l.item_label ?? l.sku;
        const catalogSupplier = l.supplier_id
          ? (supplierName.get(l.supplier_id) ?? "")
          : "";
        const lineDestination = destName.get(l.destination_id ?? r.destination_id) ?? "";
        const base = {
          sku: l.sku,
          item,
          category: (l.category as string | null | undefined) ?? null,
          cancelled,
          cancelReason: l.cancel_reason,
        };
        const allocations: GoodsRow[] = (l.allocations ?? []).map((a, index) => ({
          ...base,
          demandId: null,
          key: `${l.id}::po::${a.poId}::${index}`,
          qty: a.qty,
          supplier:
            (poFacts.get(a.poId)?.supplier_id
              ? supplierName.get(poFacts.get(a.poId)!.supplier_id!)
              : null) || catalogSupplier,
          deliverTo:
            (a.destinationId ? destName.get(a.destinationId) : null) || lineDestination,
          poNos: [poNo.get(a.poId) ?? a.poId],
          poDeliveryDate: poFacts.get(a.poId)?.official_delivery_date ?? null,
        }));
        if (allocations.length === 0 && l.issued_qty > 0) {
          allocations.push({
            ...base,
            demandId: null,
            key: `${l.id}::po::legacy`,
            qty: l.issued_qty,
            supplier: catalogSupplier,
            deliverTo: lineDestination,
            poNos: linePoNos(l),
            poDeliveryDate: null,
            issuedWithoutDocument: linePoNos(l).length === 0,
          });
        }
        const remaining = cancelled ? 0 : remainingOf(l);
        const toPurchase =
          remaining > 0 || allocations.length === 0
            ? [
                {
                  ...base,
                  demandId: l.id,
                  /* The LIVE line is keyed by its demand id, so the row, its
                     stock frame and its connector all carry one identity. The
                     allocation rows above it are keyed `${l.id}::po::…`, so
                     nothing collides. */
                  key: l.id,
                  qty: cancelled ? l.qty : remaining,
                  supplier: catalogSupplier,
                  deliverTo: lineDestination,
                  poNos: [] as string[],
                  poDeliveryDate: null,
                },
              ]
            : [];
        return [...allocations, ...toPurchase];
      }),
      skuTokens: lines.map((l) => l.sku).join(" "),
    };
  });
  /* R2 — the default reading order: Order By ascending → Not planned →
     newest Proceed Date; `No purchase needed` newest Proceed Date. */
  return rows.sort(compareManualPurchaseRows);
}

/**
 * ⭐ THE PURCHASE NEED OF ONE REQUEST — `Need PO` · `No PO needed` · unknown
 * (owner ruling 2026-09-18), through the ONE shared arithmetic (Law D).
 *
 * Terminal means *no further authorised purchase*: refused, withdrawn, or
 * every line finished. Approval is NOT consulted — a request waiting for a
 * decision still needs its goods, and saying `No PO needed` because nobody has
 * approved it yet would be the approval state wearing the purchase need's
 * words. `null` is UNKNOWN and the cell prints the missing-coverage fact.
 */
function needStatusOf(r: RequestRegisterRow): ManualPurchaseNeedStatus | null {
  return manualPurchaseNeedStatusOf({
    known: r.remainderKnown,
    remainingQty: r.remainingQty,
    terminal:
      r.approval.kind === "refused" ||
      r.approval.kind === "withdrawn" ||
      r.status.kind === "not_going_ahead" ||
      r.status.kind === "ordered" ||
      r.status.kind === "arrived",
  });
}

function needStatusWordOf(r: RequestRegisterRow): string {
  const need = needStatusOf(r);
  return need == null
    ? MW.remainderNotChecked
    : MANUAL_PURCHASE_NEED_STATUS_WORDS[need];
}

/**
 * THE MARGIN — the tightest OUTSTANDING line's, against the server's own
 * Order By. A line with nothing left to buy contributes no margin, so a
 * finished request is blank rather than alarming.
 */
function safetyDaysOf(r: RequestRegisterRow): PoSafetyDays {
  if (!r.remainderKnown || r.remainingQty <= 0) return PO_SAFETY_DAYS_NONE;
  return tightestPoSafetyDays(todayIsoLocal(), r.lineOrderBys);
}

/** Today in the operator's own day — the same day the rail's timing reads. */
function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The customer's locality through the ONE shared rule Sales Orders and SO
 * Batch read. A row with no customer prints NOTHING — not `Not recorded`,
 * which would claim a customer exists whose address nobody wrote down.
 */
function customerLocalityOf(r: RequestRegisterRow): string {
  if (!r.customerName && !r.customerDeliveryCity && !r.customerDeliveryState) return "";
  const locality = conciseLocality(r.customerDeliveryCity, r.customerDeliveryState);
  return locality === NOT_RECORDED ? NOT_RECORDED : locality;
}

/** The SO Batch sibling's own duty words — one grammar on both pages. */
function poDutyLabel(data: ManualPurchaseRegisterPayload): string {
  if (data.poDutyUnavailable) return "PO duty could not be checked.";
  if (data.actingPoDuty) {
    const normal = data.currentPoDuty ? ` for ${data.currentPoDuty.name}` : "";
    return `${data.actingPoDuty.name} · PO Duty cover${normal}`;
  }
  if (data.currentPoDuty) return `${data.currentPoDuty.name} · PO Duty`;
  return "Nobody holds PO duty this month.";
}

/** Governed absence — a muted sentence, never a bare dash. */
function Absent({ children, title }: { children: string; title?: string }) {
  return (
    <span className="text-kit-slate-11" title={title}>
      {children}
    </span>
  );
}

/**
 * ⭐ R4 · THE REAL REQUESTER OWNS A SENT-BACK ROW. The row is waiting on the
 * person who asked, so their avatar stands beside the fact. A request whose
 * individual was never recorded (a shared login) SAYS so — a shared account is
 * never drawn as somebody's face.
 */
function RequesterAvatar({ name, userId }: { name: string | null; userId: string | null }) {
  if (!name || !userId) {
    return (
      <span className="block text-label text-kit-slate-11" data-testid="mp-row-owner-missing">
        {MW.staffIdentityNotRecorded}
      </span>
    );
  }
  const colour = avatarColor(userId);
  const label = `${name} · ${MW.nextActorRequester}`;
  return (
    <span
      className="inline-grid size-6 shrink-0 place-items-center rounded-full border border-kit-slate-6 text-label font-semibold leading-none"
      style={{ background: colour.bg, color: colour.fg }}
      aria-label={label}
      title={label}
      data-testid="mp-row-owner"
    >
      {personInitials(name, name)}
    </span>
  );
}

export default function OperationManualPurchase() {
  const [mode, setMode] = useState<
    "register" | "create" | { detail: string } | { edit: string }
  >("register");
  const q = useManualPurchaseRegister();
  const navigate = useNavigate();
  const issue = useIssuePurchaseRequests();

  /* A Work action deep-links the exact request by its invisible UUID:
     `?tab=manual-purchase&mp={id}` opens the object directly (`mpr` survives
     as a read-only alias). The param is consumed so `‹ Manual Purchase`
     returns to the Register. `&section=approval` opens the Approval section. */
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRequest = searchParams.get("mp") ?? searchParams.get("mpr");
  const [openSection, setOpenSection] = useState<string | null>(null);
  useEffect(() => {
    if (!linkedRequest) return;
    setMode({ detail: linkedRequest });
    setOpenSection(searchParams.get("section"));
    const next = new URLSearchParams(searchParams);
    next.delete("mp");
    next.delete("mpr");
    next.delete("section");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRequest]);

  const rows = useMemo(() => (q.data ? buildRows(q.data) : []), [q.data]);

  /* ── THE RAIL — one slot per section; sections combine with AND; counts are
     unique requests cross-computed by the one shared model (Law D). ── */
  const [railFilter, setRailFilter] = useState<ManualPurchaseRailFilter>(
    MANUAL_PURCHASE_RAIL_CLEAR,
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const [filterRailOpen, setFilterRailVisible] = useFilterRailOpen(
    FILTER_RAIL_STORAGE_KEY,
    canvasRef,
  );
  const railFacts = useMemo(
    () =>
      manualPurchaseRailFacts(
        rows.map((r) => ({
          requestId: r.id,
          group: r.group,
          purpose: r.purpose,
          remainingQty: r.remainingQty,
          remainderKnown: r.remainderKnown,
          lineCategories: r.lineCategories,
          lineSupplierNames: r.lineSupplierNames,
          lineOrderBys: r.lineOrderBys,
          supplierGap: r.supplierGap,
          productionDaysMissing: r.productionDaysMissing,
          transitDaysMissing: r.transitDaysMissing,
        })),
        /* The SERVER's Malaysia date — never the browser clock. */
        q.data?.todayIso ?? null,
      ),
    [rows, q.data?.todayIso],
  );
  const rail = useMemo(
    () => manualPurchaseRailModel(railFacts, railFilter),
    [railFacts, railFilter],
  );
  /* A setup row whose last affected request was fixed must not survive as an
     invisible narrowing the operator can no longer see or clear. */
  useEffect(() => {
    if (railFilter.setup == null) return;
    if (rail.setupCounts[railFilter.setup] > 0) return;
    if (railFacts.some((f) => railFilter.setup === "supplier_not_set" ? f.supplierGap
      : railFilter.setup === "production_days_not_set" ? f.productionDaysMissing
        : f.transitDaysMissing)) return;
    setRailFilter((prev) => ({ ...prev, setup: null }));
  }, [rail.setupCounts, railFacts, railFilter.setup]);

  const filtered = useMemo(
    () => rows.filter((r) => rail.visibleRequestIds.has(r.id)),
    [rows, rail],
  );

  /* The grid's own filtered + sorted order feeds the object header's
     `‹ n of m ›`, so position is the operator's own Register truth. */
  const [gridRows, setGridRows] = useState<RequestRegisterRow[]>([]);

  /* ── SELECTION — only APPROVED, confirmed `To buy` remainder takes the tick;
     PO Duty exists on this page ONLY beside a live selection, in the toolbar
     the selection replaces (UI MASTER §6.7). ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * ⭐ THE CHOSEN GOODS LINES, per request (owner ruling 2026-09-18).
   *
   * A request with no entry here means *every eligible line* — which is what
   * the parent tick has always meant and keeps meaning. An entry NARROWS the
   * issue to the lines the operator ticked in the expansion, and is what makes
   * the parent tick read MIXED. It is never a second, duplicate purchase: the
   * parent and the children address the same lines.
   */
  const [goodsChoice, setGoodsChoice] = useState<Map<string, Set<string>>>(new Map());
  /**
   * ⭐ THE UNSAVED STOCK TICKS, per Manual Purchase line.
   *
   * Held HERE and not in the frame, because collapsing a cell must not throw
   * a draft away and because `Issue PO` has to be able to ask — and a gate
   * cannot ask a component that is unmounted (MASTER §9.2: pending edits are
   * saved or cancelled before Issue PO).
   */
  const [stockDrafts, setStockDrafts] = useState<Map<string, ReadonlySet<string>>>(
    new Map(),
  );
  const setStockDraft = useCallback(
    (demandId: string, next: ReadonlySet<string> | null) =>
      setStockDrafts((prev) => {
        const map = new Map(prev);
        if (next == null) map.delete(demandId);
        else map.set(demandId, next);
        return map;
      }),
    [],
  );
  const [issueError, setIssueError] = useState<{ wrong: string; todo: string } | null>(
    null,
  );
  const selectable = useCallback(
    (r: RequestRegisterRow) =>
      r.approval.kind === "approved" &&
      manualPurchaseSelectable(r.status.kind, r.remainingQty, r.remainderKnown),
    [],
  );
  /* A tick dies the moment its row stops being buyable — a refetch that
     orders, withdraws or sends a request back must not leave it issuable. */
  useEffect(() => {
    setSelected((prev) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      const next = new Set([...prev].filter((id) => {
        const r = byId.get(id);
        return r != null && selectable(r);
      }));
      return next.size === prev.size ? prev : next;
    });
  }, [rows, selectable]);
  /** The sentence beside a `To buy` row the tick refuses; null otherwise. The
   *  group heading already says why a pending or finished row is not buyable. */
  const deadReason = (r: RequestRegisterRow) =>
    r.group !== "to-buy"
      ? null
      : manualPurchaseNotSelectableReason(
          r.status.kind,
          r.remainingQty,
          r.approval.kind,
          r.remainderKnown,
        );
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id) && selectable(r)),
    [filtered, selected, selectable],
  );
  const selectionUnits = selectedRows.reduce((n, r) => n + r.remainingQty, 0);
  const selectionPos = manualPurchaseIssueGroupCount(
    selectedRows.flatMap((r) => r.issueWalls),
  );

  async function issueSelected() {
    setIssueError(null);
    const ids = selectedRows.map((r) => r.id);
    if (ids.length === 0) return;
    /**
     * ⭐ A DRAFT IS NOT A DECISION, AND IT MAY NOT BE ISSUED AROUND
     * (MASTER §9.2). Ticks that have not been saved or cancelled would change
     * the procurement quantity the moment they were — so the issue waits for
     * the operator to say which it is, rather than buying against a number
     * that is about to move.
     */
    if (stockDrafts.size > 0) {
      setIssueError({
        wrong: MW.stockSaveOrCancelFirst,
        todo: "Open the goods and press Save changes or Cancel.",
      });
      return;
    }
    /* The same collection gate the server applies, before the round trip. */
    if (q.data) {
      const collectionBySupplier = new Map(
        (q.data.supplierCollections ?? []).map((c) => [c.supplierId, c]),
      );
      const destName = new Map(q.data.destinations.map((d) => [d.id, d.name]));
      for (const row of selectedRows) {
        for (const wall of row.issueWalls) {
          const rule = wall.supplierId ? collectionBySupplier.get(wall.supplierId) : undefined;
          if (rule?.destinationId && rule.destinationId !== wall.destinationId) {
            setIssueError(
              purchasingRefusal("supplier_collection_destination_mismatch", {
                supplier: rule.supplierName || null,
                destination: destName.get(rule.destinationId) ?? null,
              }),
            );
            return;
          }
        }
      }
    }
    if (ids.length > 20) {
      setIssueError({
        wrong: "One issue can carry 20 Manual Purchases at most.",
        todo: `Untick ${ids.length - 20} of them, then issue again.`,
      });
      return;
    }
    try {
      /* The chosen LINES, when the operator narrowed any of the selected
         requests in its expansion. The server recomputes every quantity from
         its own read, so this can only narrow the issue, never widen it. */
      const chosenDemandIds = selectedRows.flatMap((r) => {
        const picked = goodsChoice.get(r.id);
        return picked ? [...picked] : [];
      });
      await issue.mutateAsync({
        requestIds: ids,
        together: true,
        ...(chosenDemandIds.length > 0 &&
        selectedRows.every((r) => goodsChoice.has(r.id))
          ? { demandIds: chosenDemandIds }
          : {}),
      });
      setSelected(new Set());
      setGoodsChoice(new Map());
      void q.refetch();
    } catch (e) {
      const body = (
        e as {
          body?: {
            message?: string;
            action?: string;
            code?: string;
            sku?: string | null;
            supplier?: string | null;
            destination?: string | null;
          };
        }
      ).body;
      const fallback = purchasingRefusal(body?.code, {
        sku: body?.sku ?? null,
        supplier: body?.supplier ?? null,
        destination: body?.destination ?? null,
      });
      setIssueError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    }
  }

  const openRequest = useCallback((r: RequestRegisterRow) => setMode({ detail: r.id }), []);
  const rowMenu = useCallback(
    (r: RequestRegisterRow): DataGridContextMenuItem[] => [
      { label: "View", onClick: () => openRequest(r) },
      ...(r.poNos.length === 1
        ? [
            {
              label: `Open ${r.poNos[0]}`,
              onClick: () =>
                navigate(`/operation/procurement?po=${encodeURIComponent(r.poNos[0]!)}`),
            },
          ]
        : []),
    ],
    [navigate, openRequest],
  );

  /**
   * ⭐ THE FIFTEEN COLUMNS, exactly and in this order
   * (owner ruling 2026-09-18; `docs/purchasing/MASTER.md` §9.2;
   *  COPY-STANDARD → Manual Purchase register columns):
   *
   * ```
   * ☐ · ▸ · Status · Proceed Date · MPR No · Approval Status · Purpose ·
   * Requested By · PO Safety Days · Customer Requested Delivery Date ·
   * Customer Delivery Location · Customer · Items · Supplier ·
   * Supplier Deliver To · PO No · PO Default Delivery Date
   * ```
   *
   * ── THE ONE DISTINCTION THIS ORDER EXISTS TO MAKE ──────────────────────────
   *
   * `Status` and `Approval Status` are INDEPENDENT and neither prints the
   * other's words. A request can read `Need PO` while it reads
   * `Need approval`: the goods ARE needed, and the decision is a separate
   * fact. Replacing Status with the approval label — which is what the page
   * effectively did while `Approval Status` was the only state on the row —
   * hid the buying need behind a decision queue.
   *
   * ── AND `MPR No` IS THE IDENTITY, NOT `Items` ──────────────────────────────
   *
   * `Items` was the sticky entrance while the request had no number. It has one
   * again, so the number opens the document and `Items` goes back to being the
   * product summary it always was. A request minted while the number was
   * retired prints the governed absence and still opens by double-click and
   * from the row menu — a column never invents a document reference.
   *
   * ⛔ RETIRED FROM THIS REGISTER: `Order By` (an internal planning fact — the
   * margin is what a buyer acts on, and that is `PO Safety Days`) and
   * `Delivery Date` (the request's internal required-arrival date, which the
   * dictionary forbids substituting for the customer's).
   *
   * Content sets each default width; the complete two-line header and its
   * controls set the minimum. A long value takes an inline second line —
   * never an ellipsis.
   */
  const columns = useMemo<DataGridColumn<RequestRegisterRow>[]>(
    () => [
      {
        /**
         * ⭐ THE PURCHASE NEED, AND IT IS NOT THE APPROVAL STATE.
         *
         * `Need PO` · `No PO needed`. Unknown coverage prints NEITHER — it
         * prints the existing missing-coverage fact, because guessing
         * `No PO needed` would tell an operator to stop buying something
         * nobody checked, and guessing `Need PO` would offer a purchase
         * nobody verified.
         */
        key: "status",
        label: MW.colStatus,
        width: 116,
        minWidth: 92,
        sortable: true,
        chooserGroup: "Buying",
        accessor: (r) => {
          const need = needStatusOf(r);
          if (need == null) {
            return (
              <Absent title={MW.remainderNotCheckedWhy}>{MW.remainderNotChecked}</Absent>
            );
          }
          return (
            <StatusPill tone={need === "need_po" ? "info" : "neutral"}>
              {MANUAL_PURCHASE_NEED_STATUS_WORDS[need]}
            </StatusPill>
          );
        },
        searchValue: (r) => needStatusWordOf(r),
        filterValue: (r) => needStatusWordOf(r),
        exportValue: (r) => needStatusWordOf(r),
        sortFn: (a, b) => needStatusWordOf(a).localeCompare(needStatusWordOf(b)),
      },
      {
        /* The record date leads the facts (ui MASTER §6.7 rule 2). */
        key: "proceed_date",
        label: MW.colProceedDate,
        headerLines: ["Proceed", "Date"],
        width: 112,
        minWidth: 94,
        sortable: true,
        chooserGroup: "Request",
        filterType: "date",
        dateValue: (r) => r.proceedDate,
        accessor: (r) => (
          <span className="tabular-nums">{fmtDate(r.proceedDate.slice(0, 10))}</span>
        ),
        searchValue: (r) => fmtDate(r.proceedDate.slice(0, 10)),
        exportValue: (r) => r.proceedDate.slice(0, 10),
        sortFn: (a, b) => a.proceedDate.localeCompare(b.proceedDate),
      },
      {
        key: "mpr_no",
        label: MW.colMprNo,
        headerLines: ["MPR", "No"],
        /* `MPR-20260918-4103` is 137px at the register's 13px mono; 152 holds
           it beside the sort mark and the filter control. */
        width: 152,
        minWidth: 108,
        sortable: true,
        chooserGroup: "Request",
        accessor: (r) =>
          r.mprNo ? (
            <button
              type="button"
              className="block max-w-full text-left font-mono font-medium text-kit-blue-11 underline-offset-2 hover:underline"
              data-testid={`mp-open-${r.id}`}
              onClick={(event) => {
                event.stopPropagation();
                openRequest(r);
              }}
            >
              {r.mprNo}
            </button>
          ) : (
            /* A REQUEST WITH NO NUMBER IS A FACT, NOT A BUTTON. It opens by
               double-click and from the row menu; nothing here invents a
               document reference to make a column look complete. */
            <Absent>{MW.mprNotRecorded}</Absent>
          ),
        /* The SKUs and the structured `For` stay searchable behind the number. */
        /* Every stored identity stays findable, including a retired `REQ-…`
           the column does not print. */
        searchValue: (r) =>
          `${r.mprNo ?? ""} ${r.legacyReqNo ?? ""} ${r.itemsText} ${r.skuTokens} ${r.forText}`,
        filterValue: (r) => r.mprNo ?? MW.mprNotRecorded,
        exportValue: (r) => r.mprNo ?? "",
        sortFn: (a, b) => (a.mprNo ?? "").localeCompare(b.mprNo ?? ""),
      },
      {
        key: "approval",
        label: MW.colApproval,
        headerLines: ["Approval", "Status"],
        /* Measured 2026-09-17 in the rendered shell: the `Sent back for
           changes` pill is 134px, the requester avatar 24px + 6px gap, plus
           16px padding and the rule — 181px. Narrower clipped the pill. */
        width: 188,
        minWidth: 112,
        sortable: true,
        chooserGroup: "Request",
        /* THE APPROVAL FACT (owner ruling 2026-09-11): no approver name and no
           Approve/Refuse button. Two things may sit beside it — a sent-back
           row's REAL requester (R4), and a row's own selectability
           explanation, computed from the facts the tick reads. */
        accessor: (r) => (
          <span className="flex min-w-0 items-center gap-1.5" data-testid={`mp-approval-${r.id}`}>
            <span className="flex min-w-0 flex-col">
              <StatusPill tone={APPROVAL_TONE[r.approval.kind]}>{r.approval.label}</StatusPill>
              {deadReason(r) ? (
                <span
                  className="block text-label font-normal text-kit-amber-11"
                  data-testid="mp-row-dead-reason"
                  title={r.remainderKnown ? undefined : MW.remainderNotCheckedWhy}
                >
                  {deadReason(r)}
                </span>
              ) : null}
              {r.approval.kind === "sent_back" && !r.requestedBy ? (
                <RequesterAvatar name={null} userId={null} />
              ) : null}
            </span>
            {r.approval.kind === "sent_back" && r.requestedBy ? (
              <RequesterAvatar name={r.requestedBy} userId={r.requestedByUserId} />
            ) : null}
          </span>
        ),
        searchValue: (r) => r.approval.label,
        filterValue: (r) => r.approval.label,
        exportValue: (r) => r.approval.label,
      },
      {
        key: "purpose",
        label: MW.colPurpose,
        wrap: true,
        width: 150,
        minWidth: 104,
        sortable: true,
        chooserGroup: "Request",
        accessor: (r) => <span data-testid={`mp-purpose-${r.id}`}>{r.purposeLabel}</span>,
        searchValue: (r) => r.purposeLabel,
        filterValue: (r) => r.purposeLabel,
        exportValue: (r) => r.purposeLabel,
        sortFn: (a, b) => a.purposeLabel.localeCompare(b.purposeLabel),
      },
      {
        key: "requested_by",
        label: MW.colRequestedBy,
        headerLines: ["Requested", "By"],
        wrap: true,
        width: 124,
        minWidth: 96,
        sortable: true,
        chooserGroup: "Request",
        accessor: (r) =>
          r.requestedBy ? (
            <span data-testid={`mp-requested-by-${r.id}`}>{r.requestedBy}</span>
          ) : (
            <span data-testid={`mp-requested-by-${r.id}`}>
              <Absent>{MW.staffIdentityNotRecorded}</Absent>
            </span>
          ),
        searchValue: (r) => r.requestedBy ?? MW.staffIdentityNotRecorded,
        filterValue: (r) => r.requestedBy ?? MW.staffIdentityNotRecorded,
        exportValue: (r) => r.requestedBy ?? MW.staffIdentityNotRecorded,
      },
      {
        /**
         * ⭐ `PO Safety Days` — THE MARGIN, NOT THE DATE (dictionary, 2026-09-18).
         *
         * Working days remaining if the outstanding demand were ordered today,
         * against this request's own required arrival date. Manual Purchase
         * adds no 14-day reserve: its Delivery Date is already goods arrival at
         * Carres. The parent shows the TIGHTEST outstanding line; nothing
         * outstanding is blank; and a line the engine could not plan is
         * UNKNOWN — never 0, which would read as *order today or be late*.
         */
        key: "po_safety_days",
        label: MW.colPoSafetyDays,
        headerLines: ["PO Safety", "Days"],
        /* CONTENT DECIDES THE WIDTH (§2). The widest thing this cell prints is
           `Order date passed`, measured at 137px in Chromium; 112 truncated it
           to `Order date ...`, which says less than the number it replaced. */
        width: 144,
        minWidth: 120,
        sortable: true,
        chooserGroup: "Buying",
        accessor: (r) => {
          const margin = safetyDaysOf(r);
          if (margin.days == null) {
            return r.remainingQty > 0 || !r.remainderKnown ? (
              <Absent title={MW.remainderNotCheckedWhy}>{MW.notPlanned}</Absent>
            ) : (
              <span />
            );
          }
          /* ⛔ A DAYS COLUMN NEVER PRINTS A NEGATIVE NUMBER — the same refusal
             SO Batch's cell already carries. Past the date is a STATE, not a
             margin of minus eighteen days, and it says so in the request's own
             governed words. The sort still reads the signed number below, so
             the worst row stays first without the reader decoding a minus. */
          return (
            <span
              className="tabular-nums"
              data-testid={`mp-safety-days-${r.id}`}
            >
              {margin.passed ? (
                <Absent>{MW.orderDatePassed}</Absent>
              ) : (
                margin.days
              )}
            </span>
          );
        },
        sortFn: (a, b) =>
          (safetyDaysOf(a).days ?? Number.POSITIVE_INFINITY) -
          (safetyDaysOf(b).days ?? Number.POSITIVE_INFINITY),
        /* Search, filter and export read the SAME word the cell prints; a
           listing whose export says `-18` where the screen says
           `Order date passed` is two answers to one question. */
        searchValue: (r) => poSafetyDaysWord(safetyDaysOf(r), MW.orderDatePassed) ?? "",
        filterValue: (r) => poSafetyDaysWord(safetyDaysOf(r), MW.orderDatePassed) ?? "",
        exportValue: (r) => poSafetyDaysWord(safetyDaysOf(r), MW.orderDatePassed) ?? "",
      },
      {
        key: "customer_requested_delivery_date",
        label: MW.colCustomerRequestedDeliveryDate,
        headerLines: ["Customer Requested", "Delivery Date"],
        width: 168,
        minWidth: 132,
        sortable: true,
        chooserGroup: "Customer",
        filterType: "date",
        dateValue: (r) => r.customerRequestedDeliveryDate,
        /* ⛔ BLANK, NEVER THE REQUEST'S OWN DELIVERY DATE. The dictionary bans
           substituting Manual Purchase's internal required-arrival date for a
           customer's promise, and most rows have no customer at all. */
        accessor: (r) =>
          r.customerRequestedDeliveryDate ? (
            <span className="tabular-nums">{fmtDate(r.customerRequestedDeliveryDate)}</span>
          ) : (
            <span />
          ),
        searchValue: (r) =>
          r.customerRequestedDeliveryDate ? fmtDate(r.customerRequestedDeliveryDate) : "",
        exportValue: (r) => r.customerRequestedDeliveryDate ?? "",
        sortFn: (a, b) =>
          (a.customerRequestedDeliveryDate ?? "").localeCompare(
            b.customerRequestedDeliveryDate ?? "",
          ),
      },
      {
        key: "customer_delivery_location",
        label: MW.colCustomerDeliveryLocation,
        headerLines: ["Customer Delivery", "Location"],
        wrap: true,
        width: 152,
        minWidth: 116,
        sortable: true,
        chooserGroup: "Customer",
        /* The CUSTOMER's locality through the one shared rule Sales Orders and
           SO Batch read — never a warehouse and never the supplier's
           destination, which is its own column three along. */
        accessor: (r) => <span>{customerLocalityOf(r)}</span>,
        searchValue: (r) => customerLocalityOf(r),
        filterValue: (r) => customerLocalityOf(r),
        exportValue: (r) => customerLocalityOf(r),
      },
      {
        key: "customer",
        label: MW.colCustomer,
        wrap: true,
        width: 136,
        minWidth: 100,
        sortable: true,
        chooserGroup: "Customer",
        /* ⛔ THE ACTUAL LINKED CUSTOMER, NEVER `Requested By`. */
        accessor: (r) => <span data-testid={`mp-customer-${r.id}`}>{r.customerName ?? ""}</span>,
        searchValue: (r) => r.customerName ?? "",
        filterValue: (r) => r.customerName ?? "",
        exportValue: (r) => r.customerName ?? "",
        sortFn: (a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? ""),
      },
      {
        key: "items",
        label: MW.colItems,
        wrap: true,
        /* Sized to the CATALOG, not the fixture (measured 2026-09-17): the
           longest live model name is 18 characters, so 180px holds a name and
           its size on one line and `{first} + {n} more` on two. */
        width: 180,
        minWidth: 120,
        sortable: true,
        chooserGroup: "Request",
        /* THE PRODUCT SUMMARY, AND NO LONGER THE DOOR. `MPR No` opens the
           request now; two entrances on one row is two answers to *where does
           clicking take me*. */
        accessor: (r) => <span data-testid={`mp-items-${r.id}`}>{r.itemsText}</span>,
        searchValue: (r) => `${r.itemsText} ${r.skuTokens}`,
        filterValue: (r) => r.itemsText,
        exportValue: (r) => r.itemsText,
        sortFn: (a, b) => a.itemsText.localeCompare(b.itemsText),
      },
      {
        key: "supplier",
        label: MW.colSupplier,
        wrap: true,
        width: 140,
        minWidth: 104,
        sortable: true,
        chooserGroup: "Buying",
        accessor: (r) => <span data-testid={`mp-supplier-${r.id}`}>{r.supplierText}</span>,
        searchValue: (r) =>
          [r.supplierText, ...r.lineSupplierNames.filter(Boolean)].join(" "),
        filterValue: (r) => r.supplierText,
        exportValue: (r) => r.supplierText,
      },
      {
        key: "deliver_to",
        label: MW.colSupplierDeliverTo,
        headerLines: ["Supplier", "Deliver To"],
        wrap: true,
        width: 152,
        minWidth: 108,
        sortable: true,
        chooserGroup: "Buying",
        /* THE DESTINATION INSTRUCTED TO THE SUPPLIER — not the customer's
           address, which is its own column, and not the site the goods
           actually reach, which is Receiving's. */
        accessor: (r) => <span>{r.deliverToText}</span>,
        searchValue: (r) => r.deliverToText,
        filterValue: (r) => r.deliverToText,
        exportValue: (r) => r.deliverToText,
      },
      {
        key: "po_no",
        label: MW.colPoNo,
        width: 144,
        minWidth: 80,
        sortable: true,
        chooserGroup: "Documents",
        /* ONLY real lineage: `—` is a fact, never a button; ONE PO is the
           door to it; several open the object's exact linked PO list. */
        accessor: (r) => {
          if (r.poNos.length === 1) {
            return (
              <button
                type="button"
                className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`mp-po-link-${r.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/operation/procurement?po=${encodeURIComponent(r.poNos[0]!)}`);
                }}
              >
                {r.poNos[0]}
              </button>
            );
          }
          if (r.poNos.length > 1) {
            return (
              <button
                type="button"
                className="text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`mp-po-list-${r.id}`}
                title="Open the linked Purchase Orders"
                onClick={(event) => {
                  event.stopPropagation();
                  openRequest(r);
                }}
              >
                {manualPurchasePoSummary(r.poNos)}
              </button>
            );
          }
          return <Absent>{manualPurchasePoSummary(r.poNos)}</Absent>;
        },
        searchValue: (r) => r.poNos.join(" "),
        filterValue: (r) => manualPurchasePoSummary(r.poNos),
        exportValue: (r) => manualPurchasePoSummary(r.poNos),
      },
      {
        /**
         * `PO Default Delivery Date` — the ORIGINAL planned date the purchase
         * orders were issued with, preserved when the supplier replies or
         * Settings later change (dictionary, 2026-09-18). The supplier's own
         * answer is a different fact with a different name and lives on the
         * object's lineage table.
         */
        key: "po_default_delivery_date",
        label: MW.colPoDefaultDeliveryDate,
        headerLines: ["PO Default", "Delivery Date"],
        width: 152,
        minWidth: 120,
        sortable: true,
        chooserGroup: "Documents",
        filterType: "date",
        dateValue: (r) => r.poDefaultDeliveryDate,
        accessor: (r) =>
          r.poDefaultDeliveryDate ? (
            <span className="tabular-nums">{fmtDate(r.poDefaultDeliveryDate)}</span>
          ) : r.poNos.length > 0 ? (
            /* A PO exists but recorded no date: a stated absence, never a
               planning date back-filled to look complete. */
            <Absent>{MW.notRecorded}</Absent>
          ) : (
            <span />
          ),
        searchValue: (r) => (r.poDefaultDeliveryDate ? fmtDate(r.poDefaultDeliveryDate) : ""),
        exportValue: (r) => r.poDefaultDeliveryDate ?? "",
        sortFn: (a, b) =>
          (a.poDefaultDeliveryDate ?? "").localeCompare(b.poDefaultDeliveryDate ?? ""),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, openRequest],
  );

  const purposeWord = (value: string | null) =>
    MANUAL_PURCHASE_RAIL.purpose.rows.find((p) => p.value === value)?.label ?? value ?? "";
  const activeConditions = [
    ...(railFilter.timing
      ? [{
          key: "timing",
          label: MANUAL_PURCHASE_RAIL.timing.rows.find((row) => row.state === railFilter.timing)?.word ?? "",
          onClear: () => setRailFilter((prev) => ({ ...prev, timing: null })),
        }]
      : []),
    ...(railFilter.purpose
      ? [{
          key: "purpose",
          label: purposeWord(railFilter.purpose),
          onClear: () => setRailFilter((prev) => ({ ...prev, purpose: null })),
        }]
      : []),
    ...(railFilter.product
      ? [{
          key: "product",
          label: MANUAL_PURCHASE_RAIL.product.categories.find((c) => c.category === railFilter.product)?.word ?? "",
          onClear: () => setRailFilter((prev) => ({ ...prev, product: null })),
        }]
      : []),
    ...(railFilter.supplier
      ? [{
          key: "supplier",
          label: railFilter.supplier,
          onClear: () => setRailFilter((prev) => ({ ...prev, supplier: null })),
        }]
      : []),
    ...(railFilter.setup
      ? [{
          key: "setup",
          label: MANUAL_PURCHASE_RAIL.setup.rows.find((row) => row.key === railFilter.setup)?.word ?? "",
          onClear: () => setRailFilter((prev) => ({ ...prev, setup: null })),
        }]
      : []),
  ];

  if (mode === "create" || (typeof mode === "object" && "edit" in mode)) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CreateRequestWorkspace
          editId={typeof mode === "object" && "edit" in mode ? mode.edit : null}
          destinations={q.data?.destinations ?? []}
          defaultDestinationId={q.data?.defaultDestinationId ?? null}
          supplierCollections={q.data?.supplierCollections ?? []}
          staff={q.data?.users ?? []}
          minDeliveryDays={q.data?.minDeliveryDays ?? 0}
          todayIso={q.data?.todayIso ?? null}
          onDone={(returnTo) => {
            setMode(returnTo ? { detail: returnTo } : "register");
            void q.refetch();
          }}
        />
      </div>
    );
  }

  /* The object replaces the Register content; the Register stays MOUNTED
     underneath (visibility only), so `‹ Manual Purchase` restores the complete
     state the operator left — rail, search, column filters, sort, scroll and
     expansion. */
  const detailId = typeof mode === "object" && "detail" in mode ? mode.detail : null;
  const detailRow = detailId != null ? (rows.find((r) => r.id === detailId) ?? null) : null;
  const gridIndex = detailId != null ? gridRows.findIndex((r) => r.id === detailId) : -1;
  const noRequests = !q.isLoading && rows.length === 0;

  return (
    <div className={`${detailId == null ? registerStyles.page : ""} flex h-full min-h-0 flex-col`}>
      {detailId == null && <PurchasingTabs />}
      <div className="relative min-h-0 flex-1">
      <div
        ref={canvasRef}
        className={`${registerStyles.canvas} absolute inset-0 flex overflow-hidden${detailId != null ? " invisible" : ""}`}
        aria-hidden={detailId != null || undefined}
        data-testid="mp-register-surface"
      >
        {filterRailOpen && (
        <FilterRail
          testId="manual-purchase-rail"
          onHide={() => setFilterRailVisible(false)}
          className={registerStyles.rail}
        >
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.timing.heading} icon="date">
            {/* Counts only requests with quantity still to buy — a filter and
                a fact, never an issue permission gate. */}
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
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.purpose.heading} icon="order">
            <FilterRailSelect
              label={MANUAL_PURCHASE_RAIL.purpose.heading}
              allLabel={MANUAL_PURCHASE_RAIL.purpose.all}
              testId="mp-purpose-select"
              value={railFilter.purpose}
              options={MANUAL_PURCHASE_RAIL.purpose.rows.map((p) => ({
                value: p.value,
                label: p.label,
                count: rail.purposeCounts[p.value],
              }))}
              onChange={(purpose) =>
                setRailFilter((prev) => ({
                  ...prev,
                  purpose: purpose as ManualPurchaseRailFilter["purpose"],
                }))
              }
            />
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.product.heading} icon="goods">
            <FilterRailSelect
              label={MANUAL_PURCHASE_RAIL.product.heading}
              allLabel={MANUAL_PURCHASE_RAIL.product.all}
              testId="mp-product-select"
              value={railFilter.product}
              options={MANUAL_PURCHASE_RAIL.product.categories.map((c) => ({
                value: c.category,
                label: c.word,
                count: rail.productCounts[c.category],
              }))}
              onChange={(product) =>
                setRailFilter((prev) => ({
                  ...prev,
                  product: product as ManualPurchaseRailFilter["product"],
                }))
              }
            />
          </FilterRailGroup>
          <FilterRailGroup title={MANUAL_PURCHASE_RAIL.supplier.heading} icon="supplier">
            <FilterRailSelect
              label={MANUAL_PURCHASE_RAIL.supplier.heading}
              allLabel={MANUAL_PURCHASE_RAIL.supplier.all}
              testId="mp-supplier-select"
              value={railFilter.supplier}
              options={rail.suppliers.map((s) => ({
                value: s.name,
                label: s.name,
                count: s.count,
              }))}
              onChange={(supplier) => setRailFilter((prev) => ({ ...prev, supplier }))}
            />
          </FilterRailGroup>
          {/* Only while an affected request exists, and only the rows that
              have one: fixing the setup stays in Catalog / Settings. */}
          {rail.setupExists && (
            <FilterRailGroup title={MANUAL_PURCHASE_RAIL.setup.heading} icon="settings">
              {MANUAL_PURCHASE_RAIL.setup.rows
                .filter((row) => rail.setupRows.includes(row.key))
                .map((row) => (
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
          <div className="flex min-h-0 flex-1 flex-col" data-testid="mp-grid">
          <DataGrid<RequestRegisterRow>
            appearance="reference"
            palette="slate"
            searchPresentation="responsive"
            toolbarStart={
              <>
                {!filterRailOpen && (
                  <button
                    type="button"
                    aria-label="Show filters"
                    title="Show filters"
                    data-testid="manual-purchase-show-filters"
                    onClick={() => setFilterRailVisible(true)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
                  >
                    <Icon name="panelToggle" />
                  </button>
                )}
                {/* Below a 640px canvas the pill keeps its `+` and its full
                    accessible name, and gives the words' width back to the
                    toolbar (measured at 390px: the words pushed Columns off
                    the edge). `ManualPurchaseRegister.module.css`. */}
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  data-testid="manual-purchase-new-request"
                  className={`${registerStyles.create} relative inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90`}
                >
                  <Plus size={14} strokeWidth={2.25} aria-hidden />
                  <span className={registerStyles.createWords}><span className="sr-only">{MW.newRequest.slice(0, 2)}</span>{MW.newRequest.slice(2)}</span>
                </button>
              </>
            }
            rows={filtered}
            columns={columns}
            onFilteredRowsChange={setGridRows}
            /* v5 — round 2 changed the column set and order, so a saved v4
               layout must not replay the old nine columns over the new ten.
               v6 — Proceed Date · Items lead and pin (Jess 2026-09-17). */
            storageKey="carres.manualPurchase.register.v6"
            rowKey={(r) => r.id}
            rowTestId={(r) => `mp-row-${r.id}`}
            exportName="Manual Purchase"
            searchPlaceholder={MW.search}
            isLoading={q.isLoading}
            errorState={
              q.isError ? (
                <EmptyState
                  title="Manual Purchases could not be loaded"
                  action={
                    <Button variant="neutral" onClick={() => void q.refetch()}>
                      {MW.tryAgain}
                    </Button>
                  }
                />
              ) : undefined
            }
            emptyMessage={noRequests ? MW.emptyRegister : MW.noMatch}
            noMatchMessage={MW.noMatch}
            activeConditions={activeConditions}
            onClearConditions={() => setRailFilter(MANUAL_PURCHASE_RAIL_CLEAR)}
            groupBanner={false}
            /**
             * ⭐ THE GROUP SAYS WHAT THE ROW'S OWN `Status` SAYS (owner ruling
             * 2026-09-18). `To buy` and `No purchase needed` are retired on
             * THIS page — a heading and the rows inside it reading as two
             * different answers is the confusion the rename removes. SO Batch
             * Purchase keeps its own group words.
             *
             * ⛔ AND AN EMPTY HISTORY GROUP IS HIDDEN, not printed with a
             * zero: `No PO needed (0)` is a heading for a shelf nobody has put
             * anything on. `Need approval` keeps its empty state, because a
             * page whose approval queue is empty is saying something useful.
             * A nonempty history group stays collapsed and stays counted.
             */
            fixedGroups={{
              groups: [
                {
                  key: "need-approval",
                  label: MW.groupNeedApproval,
                  alwaysOpen: true,
                  emptyLabel: MW.groupNeedApprovalEmpty,
                },
                { key: "to-buy", label: MW.groupNeedPo, alwaysOpen: true },
                /* ⛔ HIDING AN EMPTY HISTORY GROUP IS THE ENGINE'S JOB, NOT
                   THIS PAGE'S. A group declared conditionally is absent on the
                   FIRST render — while the read is still in flight — so its
                   `initiallyCollapsed` never reaches the engine's initial
                   state, and the history arrives EXPANDED. The engine already
                   drops a group with no members unless it is alwaysOpen; the
                   declaration stays constant and the rule stays in one place. */
                {
                  key: "no-purchase-needed",
                  label: MW.groupNoPoNeeded,
                  initiallyCollapsed: true,
                },
              ],
              groupOf: (r) => r.group,
              revealMatches: activeConditions.length > 0,
            }}
            /* The approved order leads with `Status`, so it is NAMED as a
               column ahead of the pair (§6.7 rule 2, `before`): `Proceed Date`
               and `MPR No` still pin — and below 768px `MPR No` pins alone —
               while `Status` scrolls under the block like any other fact. */
            leadingColumns={{
              date: "proceed_date",
              identity: "mpr_no",
              before: ["status"],
            }}
            chooserGroupOrder={["Request", "Buying", "Customer", "Documents"]}
            onRowDoubleClick={openRequest}
            contextMenu={rowMenu}
            expandable={{
              flush: true,
              renderExpansion: (r) => (
                <RequestExpansion
                  row={r}
                  navigate={navigate}
                  drafts={stockDrafts}
                  onDraft={setStockDraft}
                  chosen={goodsChoice.get(r.id) ?? null}
                  requestSelected={selected.has(r.id) && selectable(r)}
                  onChoose={(demandId) => {
                    const eligibleIds = r.goods
                      .filter((g) => g.demandId != null && !g.cancelled && g.poNos.length === 0)
                      .map((g) => g.demandId!);
                    if (!selected.has(r.id) && selectable(r)) {
                      /* A tick on an unselected request means *buy this one*:
                         the request joins the selection with exactly that line
                         narrowed, instead of the tick doing nothing visible. */
                      setSelected((prev) => new Set(prev).add(r.id));
                      setGoodsChoice((prev) => {
                        const map = new Map(prev);
                        if (eligibleIds.length > 1) map.set(r.id, new Set([demandId]));
                        else map.delete(r.id);
                        return map;
                      });
                      return;
                    }
                    setGoodsChoice((prev) => {
                      const map = new Map(prev);
                      /* No entry yet means EVERY eligible line, so the first
                         untick starts from the full set rather than from
                         nothing — otherwise unticking one line would silently
                         deselect the other two. */
                      const next = new Set(map.get(r.id) ?? eligibleIds);
                      if (next.has(demandId)) next.delete(demandId);
                      else next.add(demandId);
                      if (next.size === eligibleIds.length) map.delete(r.id);
                      else map.set(r.id, next);
                      /* Unticking the LAST line is unticking the request:
                         a selection of no goods is not a selection. */
                      if (next.size === 0) {
                        setSelected((sel) => {
                          const s2 = new Set(sel);
                          s2.delete(r.id);
                          return s2;
                        });
                        map.delete(r.id);
                      }
                      return map;
                    });
                  }}
                />
              ),
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
              isSelectable: (r: RequestRegisterRow) => selectable(r),
              testId: (r: RequestRegisterRow) => `mp-select-${r.id}`,
            }}
            selectionSummary={() =>
              manualPurchaseIssueSentence(selectedRows.length, selectionUnits, selectionPos)
            }
            selectionPrimary={
              selectedRows.length > 0 && q.data ? (
                <span
                  className="flex shrink-0 items-center gap-2"
                  data-testid="mp-selection-actions"
                >
                  <PoDutyChip data={q.data} />
                  {q.data.mayIssue ? (
                    <Button
                      variant="primary"
                      size="md"
                      data-testid="mp-issue-selected"
                      onClick={() => void issueSelected()}
                    >
                      {MW.workIssuePo}
                    </Button>
                  ) : null}
                </span>
              ) : null
            }
            /* ⭐ MESSAGE KIND ② — an issue refusal is a WARNING BAND between the
               toolbar and the table (UI MASTER §6.7), and it outlives the
               selection that caused it: the refusal that most needs reading is
               the one where somebody else's act made the rows go away. */
            warning={
              issueError ? (
                <span className="flex min-w-0 flex-col" data-testid="mp-issue-selected-error">
                  <span className="font-medium">{issueError.wrong}</span>
                  <span className="text-label">{issueError.todo}</span>
                </span>
              ) : undefined
            }
            statusSummary={(shown) => {
              /* The footer answers WHAT AM I LOOKING AT — collapsed rows count. */
              const line =
                shown.length === rows.length
                  ? rows.length === 1
                    ? MW.footerOne
                    : `${rows.length} ${MW.footerMany}`
                  : `${shown.length} of ${rows.length} ${MW.footerMany}`;
              return (
                <span className="block truncate" data-testid="mp-footer" title={line}>
                  {line}
                </span>
              );
            }}
          />
          </div>
        </div>

      </div>

      {detailId != null && (
        <ManualPurchaseObject
          key={detailId}
          id={detailId}
          registerHeading={
            detailRow
              ? {
                  identity: manualPurchaseObjectHeading({
                    purposeLabel: purposeLabelOf(detailRow.purpose),
                    forText: detailRow.forText,
                  }),
                  context: [
                    fmtDate(detailRow.proceedDate.slice(0, 10)),
                    detailRow.supplierText,
                  ]
                    .filter((part) => part !== "")
                    .join(" · "),
                }
              : null
          }
          openSection={openSection}
          position={
            gridIndex >= 0 ? { index: gridIndex + 1, total: gridRows.length } : null
          }
          onStep={(dir) => {
            const next = gridRows[gridIndex + dir];
            if (next) setMode({ detail: next.id });
          }}
          onBack={() => setMode("register")}
          onEditAndSendAgain={() => setMode({ edit: detailId })}
        />
      )}
      </div>
    </div>
  );
}

/** The resolved PO duty person — the SO Batch sibling's chip, exactly. */
function PoDutyChip({ data }: { data: ManualPurchaseRegisterPayload }) {
  const person = data.poDutyUnavailable
    ? null
    : (data.actingPoDuty ?? data.currentPoDuty);
  const label = poDutyLabel(data);
  if (!person) {
    return (
      <span
        data-testid="mp-po-duty"
        aria-label={label}
        title={label}
        className="shrink-0 text-meta text-kit-red-11"
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
      className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-kit-slate-6 px-2 text-label font-semibold leading-none"
      style={{ background: colour.bg, color: colour.fg }}
    >
      {personInitials(person.name, person.name)}
    </span>
  );
}

/**
 * ▸ THE REQUEST'S GOODS — the SHARED `GoodsMiniTable` in its Manual Purchase
 * order, with each line's own Ready Stock frame opening beneath it
 * (owner ruling 2026-09-18; MASTER §9.2; UI MASTER §6.8–6.9).
 *
 * ```
 * ☐ · Status · Category · Qty · Item · Ready Stock · Supplier ·
 *     Supplier Deliver To · PO No · PO Default Delivery Date
 * ```
 *
 * ── WHAT MOVED, AND WHY IT IS NOT A RESHUFFLE ──────────────────────────────
 *
 * ① THE GOODS NOW SELECT. The tick used to live only on the parent row, and
 *   the child table said so in a comment: *this register buys from its parent
 *   row, never from a goods row.* A request that carries three items and needs
 *   two of them bought could not say so. Each line has its own tick now; the
 *   parent still selects every eligible line at once and shows MIXED when only
 *   some are ticked. It is not a duplicate purchase — the parent tick and the
 *   child ticks address the same lines.
 *
 * ② READY STOCK MOVED OUT OF THE FOOTER AND UNDER ITS OWN LINE. It was one
 *   read-only box at the bottom of the expansion grouped by product. A Unit
 *   answers a LINE, so the frame opens from that line's own cell, connected to
 *   it by the 1px line UI MASTER §6.9 governs.
 *
 * ③ `SKU` LEFT THE VISIBLE COLUMNS AND STAYED SEARCHABLE. It prints under the
 *   item, which is where a person reads a code; the register's search still
 *   finds it. `To buy` and `Ordered Qty` do NOT return — every row here is one
 *   allocation at the quantity it was actually allocated at.
 */
function RequestExpansion({
  row,
  navigate,
  drafts,
  onDraft,
  chosen,
  onChoose,
  requestSelected,
}: {
  row: RequestRegisterRow;
  navigate: ReturnType<typeof useNavigate>;
  /** The page's draft store — see `ManualPurchaseStockFrame`. */
  drafts: ReadonlyMap<string, ReadonlySet<string>>;
  onDraft: (demandId: string, next: ReadonlySet<string> | null) => void;
  /** `null` = every eligible line, which is what the parent tick means. */
  chosen: ReadonlySet<string> | null;
  onChoose: (demandId: string) => void;
  /**
   * ⚠️ WHETHER THE REQUEST ITSELF IS TICKED — and the goods may not say YES
   * while it says no.
   *
   * Found on the rendered walk (2026-09-18): with no narrowed set the
   * expansion drew every eligible line in the selected blue, on a request
   * nobody had selected. A child tick NARROWS the parent's; it cannot select
   * anything on its own, and a row that paints itself selected while the act
   * would do nothing is a screen making a promise it cannot keep.
   */
  requestSelected: boolean;
}) {
  /* LAZY, like its predecessor: only an OPENED row asks. The Register answers
     for every request at once, and counting the warehouse for rows nobody
     expanded would be work done for nothing. */
  const stock = useManualPurchaseStock(row.id, true);
  const [openCells, setOpenCells] = useState<ReadonlySet<string>>(new Set());
  const stockByDemand = useMemo(
    () => new Map((stock.data?.lines ?? []).map((l) => [l.demandId, l])),
    [stock.data],
  );
  const stockState: "loading" | "error" | "ready" = stock.isPending
    ? "loading"
    : stock.isError
      ? "error"
      : "ready";

  const lines: GoodsMiniLine[] = row.goods.map((g) => {
    const stockLine = g.demandId ? (stockByDemand.get(g.demandId) ?? null) : null;
    const open = g.demandId != null && openCells.has(g.demandId);
    return {
      key: g.key,
      testId: `mp-goods-${g.key}`,
      category: categoryWord(goodsCategoryOf({ sku: g.sku, category: g.category })),
      /* The ruled Unit ID column is not drawn here, so these two are unread —
         the shape still requires them, and an honest absence costs nothing. */
      unitIds: [],
      unitAbsence: "—",
      deliverTo: g.deliverTo ? [g.deliverTo] : [],
      deliverToAbsence: MW.notRecorded,
      supplier: g.supplier || undefined,
      supplierAbsence: MW.noSupplierYet,
      poNos: g.poNos,
      /* A row with no document is what is still to buy — not an omission. */
      poNoAbsence: g.issuedWithoutDocument
        ? MW.poNotRecorded
        : g.cancelled
          ? MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead
          : MW.notOrderedYet,
      poDeliveryDate: g.poDeliveryDate ? fmtDate(g.poDeliveryDate) : undefined,
      poDeliveryDateAbsence: "—",
      sku: g.sku,
      qty: g.qty,
      item: g.item,
      /* THE SKU LEFT THE COLUMNS, NOT THE SCREEN. It rides under the item with
         the line's own note, so a code is still copyable and still searchable. */
      itemDetail: [
        g.sku,
        g.cancelled
          ? `${MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead}${g.cancelReason ? ` — ${g.cancelReason}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      /* `status` is a STRING on the shared box (SO Batch's own API); the
         row's separate refusal sentence rides under the item, because the
         status column states the purchase NEED and nothing else. */
      status: goodsStatusWord(g, row),
      fromStockNode:
        g.demandId == null ? (
          /* A row that is a PO ALLOCATION, not a live line: the goods were
             bought, so there is no shelf question to ask about it. */
          <span />
        ) : (
          <ReadyStockCell
            line={stockLine}
            state={stockState}
            open={open}
            onToggle={() =>
              setOpenCells((prev) => {
                const next = new Set(prev);
                if (next.has(g.demandId!)) next.delete(g.demandId!);
                else next.add(g.demandId!);
                return next;
              })
            }
          />
        ),
      /* Only a LIVE line with something left to buy can be ticked. A row that
         records a purchase order already made is evidence, not a decision. */
      selectable: g.demandId != null && !g.cancelled && g.poNos.length === 0,
    };
  });

  /**
   * THE OPEN STOCK FRAMES, by the row key the shared box names them after.
   * `detailRow` is the sibling's API: the box asks the page what is open under
   * a line, and renders it in one full-width row with the §6.9 connector drawn
   * from the `Ready Stock` cell above it.
   */
  const detailByKey = new Map<string, ReactNode>();
  for (const g of row.goods) {
    if (g.demandId == null || !openCells.has(g.demandId)) continue;
    const stockLine = stockByDemand.get(g.demandId);
    if (!stockLine) continue;
    detailByKey.set(
      g.key,
      <ManualPurchaseStockFrame
        requestId={row.id}
        line={stockLine}
        reference={stock.data?.reference ?? row.mprNo}
        draft={drafts.get(stockLine.demandId) ?? null}
        onDraft={(next) => onDraft(stockLine.demandId, next)}
      />,
    );
  }

  /* THE PARENT'S TICK IS THIS REQUEST'S; the children narrow it. A line is
     chosen when the request is selected AND it is either in the narrowed set
     or there is no narrowed set at all. */
  const selectedKeys = new Set(
    requestSelected
      ? lines
          .filter((l) => {
            const g = row.goods.find((x) => x.key === l.key);
            if (!g?.demandId || !l.selectable) return false;
            return chosen == null ? true : chosen.has(g.demandId);
          })
          .map((l) => l.key)
      : [],
  );

  return (
    <div data-testid={`mp-expansion-${row.id}`}>
      <GoodsMiniTable
        label={`Goods on this ${MW.page}`}
        lines={lines}
        manualPurchaseGoodsLayout
        showStatus
        showSku={false}
        showFromStock
        detailRow={(l) => detailByKey.get(l.key) ?? null}
        selection={{
          selectedKeys,
          onToggle: (key) => {
            const g = row.goods.find((x) => x.key === key);
            if (g?.demandId) onChoose(g.demandId);
          },
          /* Ticking a goods line on a request nobody has selected means
             *buy this one* — so the request joins the selection with exactly
             that line narrowed, rather than the tick doing nothing visible. */
        }}
        showUnitId={false}
        showSupplier
        showPoNo
        showPoDeliveryDate
        /* The number is a door here, exactly as it is on the sibling: the
           parent cell links only when there is ONE purchase order, and with
           several it points the reader at this table. */
        onPoClick={(poId) =>
          navigate(`/operation/procurement?po=${encodeURIComponent(poId)}`)
        }
      />
    </div>
  );
}

/**
 * ⭐ ONE GOODS LINE'S PURCHASE NEED — `Need PO` · `No PO needed`, and the row's
 * own reason when the tick is refused.
 *
 * The STATUS is about the goods; the REASON is about this operator's ability
 * to act on them right now. A line that reads `Need PO` under a request that
 * reads `Need approval` is correct and is exactly what the ruling asks for —
 * so the refusal sentence sits BELOW the pill rather than replacing it.
 */
function goodsStatusWord(goods: GoodsRow, row: RequestRegisterRow): string {
  if (goods.demandId == null) {
    /* A purchase-order allocation: this quantity stopped being something to
       buy the day the document was issued. */
    return MANUAL_PURCHASE_NEED_STATUS_WORDS.no_po_needed;
  }
  /* ⛔ UNKNOWN IS NEITHER ANSWER — the row states the missing-coverage fact
     instead of guessing an operator into or out of a purchase. */
  if (!row.remainderKnown) return MW.remainderNotChecked;
  return goods.cancelled || goods.qty <= 0
    ? MANUAL_PURCHASE_NEED_STATUS_WORDS.no_po_needed
    : MANUAL_PURCHASE_NEED_STATUS_WORDS.need_po;
}

/* ── The create workspace — full page, never a dialog (card §3) ───────────── */

type LineState = "idle" | "pending" | "created" | "failed";

interface LineDraft {
  id: string;
  /** R4 — the stored demand line this draft edits; absent on a new line. */
  demandId?: string;
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
/** The picker window. Bounded because `/demand/pick-items` returns every
 *  supplied SKU (to-order.ts) — the ceiling is a render budget, not a rule.
 *  The list scrolls inside a `max-h-64` box, so a needle that matches many
 *  items reaches all of them instead of stopping at the eighth. */
const PICK_LIMIT = 50;

function CreateRequestWorkspace({
  editId,
  destinations,
  defaultDestinationId,
  supplierCollections,
  staff,
  minDeliveryDays,
  todayIso,
  onDone,
}: {
  /** R4 · `Edit and send again` — the SAME request, prefilled once from its
   *  object read. Null for a new request. */
  editId: string | null;
  destinations: Array<{ id: string; name: string }>;
  defaultDestinationId: string | null;
  supplierCollections: PurchasingSupplierCollectionSetting[];
  staff: Array<{ id: string; name: string | null }>;
  /** 0422 — Purchasing Settings' calendar days after the Proceed Date, as
   *  the Register read it. 0 means no floor. */
  minDeliveryDays: number;
  /** The server's Malaysia date — the Proceed Date fallback while the plan
   *  has not answered yet. */
  todayIso: string | null;
  /** Back to the object that was being edited (its id), or the Register. */
  onDone: (returnTo?: string) => void;
}) {
  const email = useAuth((s) => s.session?.user?.email ?? "");
  const editing = editId != null;
  const existing = useManualPurchaseDetail(editId);
  const resubmit = useResubmitManualPurchase();

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
  /**
   * ⭐ THE RECORDED INTENT (owner rulings 2026-09-18 / 2026-09-20; 0546 ·
   * 0549). Whether Units already on the shelf may answer this request, or it
   * is buying EXTRA on top of them.
   *
   * ⛔ IT STARTS EMPTY AND HAS NO DEFAULT. The ruling forbids inferring the
   * intent from the SKU, the shelf count or the purpose, and a pre-selected
   * option is that inference wearing the operator's name. `Send` names the
   * gap instead, exactly as it does for every other missing header fact.
   */
  const [stockAnswer, setStockAnswer] = useState<ManualPurchaseIntent | null>(null);
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
  /* ⭐ THE HEADER IS NO LONGER REMEMBERED ACROSS A FAILURE (0410). It used to
     be: "the header, once created, is a record — retries reuse it." That was
     true of the old six-transaction shape, where a failed Send really did
     leave a committed header worth re-using. `0410` makes the whole request
     one transaction, so a refusal leaves nothing to re-use and remembering an
     id would point at a row that was rolled back. The setter stays because the
     successful id is still read by the caller. */
  const [, setRequestId] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);

  /* R4 — the edit opens on the request exactly as it was sent back: its
     Deliver To, Delivery Date, For fact and live lines. Seeded ONCE, so a
     background refetch never overwrites what the requester is typing. */
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!editing || seeded || !existing.data) return;
    const r = existing.data.request;
    setPurpose(r.purpose as DemandPurpose);
    /* R4 — an edit reopens the request exactly as it was sent back, including
       an intent it never recorded: NULL stays NULL and Send asks for it. */
    setStockAnswer((r.fulfilment_intent as ManualPurchaseIntent | null) ?? null);
    setDest(r.destination_id);
    if (r.required_by) {
      setDeliveryDate(r.required_by);
      setDateTouched(true);
    }
    setWhy(r.purpose === "other_purchase" ? (r.why ?? "") : "");
    setServiceCaseId(r.for_service_case_id ?? undefined);
    setStaffUserId(r.for_staff_user_id ?? undefined);
    setSubsidiaryName(r.for_subsidiary_name ?? "");
    const live = existing.data.lines.filter((l) => l.cancelled_at === null);
    setLines(
      live.length > 0
        ? live.map((l) => ({
            ...blankLine(),
            demandId: l.id,
            sku: l.sku,
            qty: String(l.qty),
            note: l.remark ?? "",
          }))
        : [blankLine()],
    );
    setSeeded(true);
  }, [editing, seeded, existing.data]);

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

  const active = activeId ?? lines[0]?.id;

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

  /* ── DELIVER TO IS THE RULE'S WHEN A RULE EXISTS (owner, 2026-09-03) ────
     A supplier Carres collects from has ONE place its goods land, kept in
     Purchasing Settings. The issue door refuses any purchase that names
     somewhere else, and a Manual Purchase has no door to move its Deliver To
     afterwards — so offering the choice here was offering a dead end (the
     SoBatchRegister.changeWholeLeaf principle: a governed destination is not
     the purchase's to move; the operator changes the rule in Settings). The
     plan already names each picked SKU's supplier, so the rule is derived,
     never stored: pick a collected item and the field locks; remove it and
     the choice returns. Two picked items governed to DIFFERENT places cannot
     be one request (0401 pins one Deliver To per request); that case is left
     to the issue door's refusal until the owner rules split-or-refuse.
     Otherwise: the person's choice, then the governed default, then the
     first destination — the same order SO Batch uses. */
  const governed = useMemo(() => {
    const bySupplier = new Map(supplierCollections.map((c) => [c.supplierId, c]));
    const seen = new Map<string, PurchasingSupplierCollectionSetting>();
    for (const sku of pickedSkus) {
      const supplierId = planBySku.get(sku)?.supplierId;
      const rule = supplierId ? bySupplier.get(supplierId) : undefined;
      if (rule?.destinationId) seen.set(rule.destinationId, rule);
    }
    return [...seen.values()];
  }, [pickedSkus, planBySku, supplierCollections]);
  const governedRule = governed.length === 1 ? governed[0] : null;
  const chosenDest =
    governedRule?.destinationId ?? dest ?? defaultDestinationId ?? destinations[0]?.id;
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
  /** 0422 — the earliest Delivery Date a Manual Purchase may ask for is the
   *  Proceed Date + Purchasing Settings' calendar days. The Proceed Date is
   *  the one this form already shows from `/plan` (today on the server),
   *  falling back to the Register's `todayIso`. A chosen date before that
   *  floor is refused HERE in the door's own words, so the person moves it
   *  before Send rather than after a 422. 0 days: no floor, no sentence.
   *  The plan's proposed date is a proposal only and is NOT combined with
   *  this floor. */
  const proceedDateIso = plan.data?.proceedDate ?? todayIso;
  const earliestDeliveryDate =
    minDeliveryDays > 0 && proceedDateIso != null
      ? addDaysIso(proceedDateIso, minDeliveryDays)
      : null;
  const dateTooEarly =
    dateOk && earliestDeliveryDate != null && deliveryDate < earliestDeliveryDate;
  const dateTooEarlyWords = dateTooEarly
    ? purchasingRefusal("delivery_date_before_earliest", {
        date: fmtDate(deliveryDate),
        earliest: fmtDate(earliestDeliveryDate),
      })
    : null;

  const canSend =
    (!editing || seeded) &&
    !saving &&
    leadDaysOk &&
    whyOk &&
    caseOk &&
    staffOk &&
    subsidiaryOk &&
    stockAnswer != null &&
    dateOk &&
    !dateTooEarly &&
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
        : dateTooEarly
          ? MW.sendNeedsLaterDate
        : !caseOk
          ? MW.sendNeedsServiceCase
          : !staffOk
            ? MW.sendNeedsStaff
            : !subsidiaryOk
              ? MW.sendNeedsSubsidiary
              : !whyOk
                ? MW.sendNeedsWhy
                : stockAnswer == null
                  ? MW.sendNeedsStockAnswer
                : editing
                  ? MW.sendAgain
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
   * ⭐ ONE ACT, ONE TRANSACTION (0410, YH 2026-09-01).
   *
   * THE SHAPE THIS REPLACES. The header landed in its own call, its id was
   * read back, and then one call per line ran in a loop — six network writes
   * and six database transactions for one thing the operator did once. A
   * failure on line 3 left a COMMITTED header holding two of five lines, on no
   * screen, behind no door, and it travelled: the Register listed it, an
   * approver could Approve it, and the issue door would raise a Purchase Order
   * for the two lines that happened to land.
   *
   * ⛔ AND THE BROWSER COULD NOT FIX IT HERE. A retry, a cleanup call, a
   * confirm dialog — each is a second client-side write that can itself fail,
   * leaving the same window open. Only a database transaction can make a group
   * of writes all-or-nothing, which is what `0410` is.
   *
   * The per-row result is KEPT, because it is the thing the retired dialog
   * proved and the operator reads. What changed is its meaning: a refused
   * request now leaves NOTHING behind, so pressing Send again re-sends the
   * whole thing rather than resuming a half-written record. `requestId`
   * therefore stops being remembered across a failure — remembering it was
   * only ever a way to re-use an orphan.
   */
  async function send() {
    if (!canSend || !chosenDest) return;
    setSaving(true);
    setHeaderError(null);

    const targets = submittable.map((l) => l.id);
    const payload = targets
      .map((id) => lines.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> & { sku: string } => Boolean(l?.sku));
    if (payload.length === 0) {
      setSaving(false);
      return;
    }
    setLines((ls) =>
      ls.map((l) =>
        targets.includes(l.id) ? { ...l, state: "pending", error: null } : l,
      ),
    );

    if (editing && editId) {
      try {
        await resubmit.mutateAsync({
          id: editId,
          destinationId: chosenDest,
          requiredBy: deliveryDate,
          why: purpose === "other_purchase" ? why.trim() : null,
          serviceCaseId: purpose === "service_case" ? (serviceCaseId ?? null) : null,
          staffUserId: purpose === "internal_staff_purchase" ? (staffUserId ?? null) : null,
          subsidiaryName: purpose === "subsidiary_purchase" ? subsidiaryName.trim() : null,
          lines: payload.map((l) => ({
            id: l.demandId ?? null,
            sku: l.sku,
            qty: Number(l.qty),
            note: l.note.trim() || null,
          })),
        });
        setSaving(false);
        onDone(editId);
      } catch (e) {
        const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
        const fallback = purchasingRefusal(body?.code);
        const word = `${body?.message ?? fallback.wrong} ${body?.action ?? fallback.todo}`;
        setHeaderError(word);
        for (const l of payload) patch(l.id, { state: "failed", error: null });
        setSaving(false);
      }
      return;
    }

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
        /* The recorded intent (0546 · 0549) — `Send` already refused an
           unanswered form, so this is always a real answer here. */
        fulfilmentIntent: stockAnswer,
        lines: payload.map((l) => ({
          sku: l.sku,
          qty: Number(l.qty),
          requiredBy: deliveryDate || null,
          note: l.note.trim() || null,
        })),
      });
      setRequestId(created.id);
      for (const l of payload) patch(l.id, { state: "created", error: null });
      setSaving(false);
      onDone();
    } catch (e) {
      /* Nothing was written, so every row goes back to failed together —
         naming one line as the culprit would be a guess, and the server's own
         sentence already names it when it knows. */
      const word = e instanceof Error ? e.message : W.createFailed;
      setHeaderError(word);
      for (const l of payload) patch(l.id, { state: "failed", error: word });
      setSaving(false);
    }
  }

  const namedStaff = staff.filter((s) => (s.name ?? "").trim() !== "");

  /* ⭐ D1 · SEND STAYS ON SCREEN (measured 2026-09-17: at 390px the header's
     action pair sat past the right edge and the goods input shrank to ~42px).
     The pair is drawn ONCE per width: in the shell header on a wide canvas,
     and as a bar pinned to the bottom of the form below 640px — CSS shows
     exactly one, so the accessibility tree never holds two Send buttons. */
  const actions = (where: "header" | "footer") => (
    <span className={`mp-create-actions mp-create-actions-${where} flex items-center gap-3`}>
      <Button variant="ghost" onClick={() => onDone(editId ?? undefined)}>
        {MW.cancel}
      </Button>
      <Button
        variant="primary"
        disabled={!canSend}
        loading={saving}
        onClick={() => void send()}
        data-testid={where === "header" ? "mp-send" : "mp-send-footer"}
      >
        {sendLabel}
      </Button>
    </span>
  );

  return (
    <div className="mp-create-shell flex min-h-0 flex-1 flex-col">
      {/* The action pair lives on the shell's own header row (壳画头) on a
          wide canvas — never inside the card. */}
      <PurchasingTabs right={actions("header")} />
      <div
        className="mp-create-page flex min-h-0 flex-1 flex-col overflow-auto p-4"
        data-testid="manual-purchase-create"
      >
      <section className="mp-create-card">
      <div className="mp-create-header">
        <h2 className="mp-create-title">
          {editing ? MW.editAndSendAgain : "New Manual Purchase"}
        </h2>
      </div>

      {/* ── The header — asked once for the whole request ── */}
      <div className="mp-create-body flex flex-col gap-6">
      <div className="mp-create-general grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="mp-purpose" className="text-meta text-kit-slate-11">
            {MW.needFor}
          </label>
          <Select
            id="mp-purpose"
            value={purpose}
            /* R4 — the purpose is the request's identity; editing keeps it. */
            disabled={editing}
            onValueChange={(v) => setPurpose(v as DemandPurpose)}
            options={DEMAND_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        {/* ⭐ CAN STOCK ANSWER THIS? — beside `Need for`, because it is the
            same breath: the operator says what the purchase is for, then
            whether goods already on the shelf can answer it. It is the ONE
            fact the whole Ready Stock allocation reads (0546), and 0549 is
            the file that finally writes it.

            No default option and no pre-selection: the ruling of 2026-09-18
            forbids inferring the intent, and a pre-picked answer is that
            inference with the operator's name on it. `Send` names the gap. */}
        <div>
          <label htmlFor="mp-stock-answer" className="text-meta text-kit-slate-11">
            {MW.canStockAnswer}
          </label>
          <Select
            id="mp-stock-answer"
            value={stockAnswer ?? undefined}
            onValueChange={(v) => setStockAnswer(v as ManualPurchaseIntent)}
            options={[
              { value: "concrete_need", label: MW.canStockAnswerYes },
              { value: "additional_stock", label: MW.canStockAnswerNo },
            ]}
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
            disabled={governedRule != null}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
          {/* The lock names its rule in the ONE approved sentence for this
              fact (COPY-STANDARD, `supplier_collection_destination_mismatch`
              line 1) — no new word reaches the screen. */}
          {governedRule ? (
            <p className="pt-1 text-meta text-kit-slate-11" data-testid="mp-dest-governed">
              {
                purchasingRefusal("supplier_collection_destination_mismatch", {
                  supplier: governedRule.supplierName || null,
                  destination:
                    destinations.find((d) => d.id === governedRule.destinationId)?.name ?? null,
                }).wrong
              }
            </p>
          ) : null}
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
        <div>
          <DatePicker
            id="mp-delivery-date"
            label={MW.deliveryDate}
            /* The SETTINGS floor (0422), never a hard-coded number: the
               picker used to refuse anything within 14 days whatever
               Purchasing Settings said. */
            minDate={earliestDeliveryDate ?? undefined}
            value={deliveryDate || null}
            onChange={(v) => {
              setDateTouched(true);
              setDeliveryDate(v ?? "");
            }}
          />
          {/* 0422 — the door's own refusal, printed before Send is pressed. */}
          {dateTooEarlyWords ? (
            <p className="mt-1 text-meta text-kit-red-11" data-testid="mp-date-too-early">
              {dateTooEarlyWords.wrong} {dateTooEarlyWords.todo}
            </p>
          ) : null}
        </div>
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

      {/* ── ITEMS · one row per SKU, the dialog's proven split ──
          ONE grid holds the caption row and every line, so the four tracks are
          resolved once and `Note` sits over the note it names. Two grids
          sharing a template do not share widths — the trailing `auto` track
          held nothing in the caption row and `Remove` in the lines, and the
          captions drifted (owner, 2026-09-03). A line is `contents`: its four
          cells join the grid directly; whatever stacks under it (supplier,
          lead gap, already-have, error, picker) spans the full row. */}
      <div className="mp-create-items flex min-w-0 flex-col gap-3" data-testid="mp-lines">
        <h3 className="text-body font-semibold text-base-900">
          Order Items
        </h3>

        {/* D1 — below a 640px form the four tracks reflow: the item takes the
            whole row, Qty · Note · Remove sit under it, and each cell carries
            its own caption (the caption row hides). `manual-purchase-create.css`. */}
        <div
          className="mp-create-lines grid items-center gap-x-2 gap-y-2"
          style={{ gridTemplateColumns: LINE_GRID }}
        >
          <span className="mp-line-head text-label text-kit-slate-11">{W.itemLabel}</span>
          <span className="mp-line-head text-label text-kit-slate-11">{W.itemsColQty}</span>
          <span className="mp-line-head text-label text-kit-slate-11">{MW.note}</span>
          <span className="mp-line-head" />

          {lines.map((line, i) => {
            const picked = items.find((it) => it.sku === line.sku) ?? null;
            const showPicker = line.id === active && line.sku == null;
            const done = line.state === "created";
            return (
              <div key={line.id} className="contents" data-testid={`mp-line-${i}`}>
                {/* SKU + Model, never the model word alone — four Booqit
                    variants rendered as the single word `Booqit` is P15's
                    own defect returned (2026-08-19 owner walk). */}
                <div className="mp-line-item min-w-0">
                  <span className="mp-line-caption text-label text-kit-slate-11" aria-hidden>
                    {W.itemLabel}
                  </span>
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
                </div>
                <div className="mp-line-qty min-w-0">
                  <span className="mp-line-caption text-label text-kit-slate-11" aria-hidden>
                    {W.itemsColQty}
                  </span>
                  <Input
                    id={`mp-qty-${i}`}
                    aria-label={W.itemsColQty}
                    inputMode="numeric"
                    value={line.qty}
                    disabled={done}
                    onChange={(e) => patch(line.id, { qty: e.target.value })}
                  />
                </div>
                <div className="mp-line-note min-w-0">
                  <span className="mp-line-caption text-label text-kit-slate-11" aria-hidden>
                    {MW.note}
                  </span>
                  <Input
                    id={`mp-note-${i}`}
                    aria-label={MW.note}
                    value={line.note}
                    disabled={done}
                    onChange={(e) => patch(line.id, { note: e.target.value })}
                  />
                </div>
                <div className="mp-line-action">
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

                {/* Everything that stacks under the line spans the row. An
                    empty stack draws nothing, so it costs no grid gap. */}
                <div className="col-span-full flex flex-col gap-1 empty:hidden">
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
              </div>
            );
          })}
        </div>

        {/* The add control sits where the operator's eye ends — under the last
            line — and wears the neutral box, not the ghost: in this block it
            is the only road to a second item, and a boxless grey word next to
            grey captions read as one more caption (owner, 2026-09-03). Not
            `primary`: `Send for approval` already holds the screen's one. */}
        <div className="flex">
          <Button variant="neutral" onClick={addLine} data-testid="mp-line-add">
            {MW.addLine}
          </Button>
        </div>
      </div>
      </div>
      </section>
    </div>
      <div className="mp-create-footer" data-testid="mp-create-footer">
        {actions("footer")}
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
    if (!n) return items.slice(0, PICK_LIMIT);
    return items
      .filter(
        (i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n),
      )
      .slice(0, PICK_LIMIT);
  }, [items, needle]);

  /* The kit's DataTable is its own scroller (`min-h-0 flex-1 overflow-auto`)
     and needs a parent that BOUNDS its height to shrink against; in an
     auto-height column `flex-1` resolves to content height and the list
     never scrolls. The wrapper carries the ceiling ONLY — never a second
     `overflow-*`, which DataTable.tsx warns scrolls in jsdom and dies in a
     browser. 256px = the head plus five rows and half of the sixth, the
     kit's own bounded-list height (DataTable's column filter). */
  return (
    <div className="mp-create-picker flex max-h-64 min-h-0 flex-col">
      <DataTable<DemandPickItem>
        rows={shown}
        columns={PICK_COLUMNS}
        rowId={(i) => i.sku}
        onRowOpen={(i) => onPick(i.sku)}
        label={W.pickerTableLabel}
        loading={loading}
        empty={null}
      />
    </div>
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

/**
 * R4 · WHAT CHANGED BETWEEN TWO ROUNDS, in plain words. The door stores the
 * change as facts (field, before, after); names and dates are resolved here so
 * History reads `Delivery Date: Tue, 23 Sep → Fri, 30 Oct`, never an id.
 */
function historyChangeWords(
  event: { changes?: unknown },
  d: Pick<ManualPurchaseDetailPayload, "destinations">,
): string[] {
  const raw = Array.isArray(event.changes) ? event.changes : [];
  const place = (v: unknown) =>
    d.destinations.find((x) => x.id === v)?.name ?? MW.notRecorded;
  const day = (v: unknown) => (typeof v === "string" && v ? fmtDate(v) : MW.notRecorded);
  return raw.flatMap((c): string[] => {
    const change = (c ?? {}) as { field?: string; from?: unknown; to?: unknown; sku?: string };
    switch (change.field) {
      case "destination_id":
        return [`${MW.colDeliverTo}: ${place(change.from)} → ${place(change.to)}`];
      case "required_by":
        return [`${MW.colDeliveryDate}: ${day(change.from)} → ${day(change.to)}`];
      case "why":
        return [`${MW.whatIsThisFor} ${String(change.to ?? "")}`.trim()];
      case "for":
        return [`${MW.colFor} changed`];
      case "line":
        return [`${change.sku ?? ""} · Qty ${String(change.from)} → ${String(change.to)}`];
      case "line_added":
        return [`${change.sku ?? ""} added · Qty ${String(change.to)}`];
      case "line_removed":
        return [`${change.sku ?? ""} removed`];
      default:
        return [];
    }
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

/**
 * THE DELIVER TO DOOR ON AN EXISTING REQUEST (0421).
 *
 * MPR-20260903-3381 was refused at Issue with "Set Deliver To to Ohana, then
 * issue again" and the request had nowhere to do that. This fact swaps into a
 * choice of open places behind `Change`; `Save` asks the server to move the
 * header and every live line together. The same rule the create form applies
 * (1083) applies here: when every live line's supplier is collected to ONE
 * place, the choice is locked to that place and the approved sentence says
 * why — so the operator's Save simply moves the request where the issue door
 * wants it.
 */
function DeliverToFact({
  requestId,
  destinationId,
  destinations,
  live,
  supplierCollections,
  movable,
}: {
  requestId: string;
  destinationId: string;
  destinations: Array<{ id: string; name: string; active?: boolean }>;
  live: PurchaseRequestLineRow[];
  supplierCollections: PurchasingSupplierCollectionSetting[];
  movable: boolean;
}) {
  const move = useMoveManualPurchaseDeliverTo();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [error, setError] = useState<{ wrong: string; todo: string } | null>(null);

  const name = destinations.find((d) => d.id === destinationId)?.name ?? "";
  const governed = useMemo(() => {
    const bySupplier = new Map(supplierCollections.map((c) => [c.supplierId, c]));
    const seen = new Map<string, PurchasingSupplierCollectionSetting>();
    for (const l of live) {
      const rule = l.supplier_id ? bySupplier.get(l.supplier_id) : undefined;
      if (rule?.destinationId) seen.set(rule.destinationId, rule);
    }
    return [...seen.values()];
  }, [live, supplierCollections]);
  const governedRule = governed.length === 1 ? governed[0] : null;
  const value = governedRule?.destinationId ?? chosen ?? destinationId;
  /* Open places only — plus the request's own, so the field never shows a
     blank for a place that has since closed. */
  const options = destinations
    .filter((d) => d.active !== false || d.id === destinationId)
    .map((d) => ({ value: d.id, label: d.name }));

  function close() {
    setEditing(false);
    setChosen(undefined);
    setError(null);
  }

  async function save() {
    setError(null);
    try {
      await move.mutateAsync({ id: requestId, destinationId: value });
      close();
    } catch (e) {
      /* THE APPROVED TWO LINES, with every fact the server sent. */
      const body = (
        e as {
          body?: {
            message?: string;
            action?: string;
            code?: string;
            supplier?: string | null;
            destination?: string | null;
          };
        }
      ).body;
      const fallback = purchasingRefusal(body?.code, {
        supplier: body?.supplier ?? null,
        destination: body?.destination ?? null,
      });
      setError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
    }
  }

  if (!editing) {
    return (
      <>
        {name}
        {movable ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-2 text-label text-kit-blue-11 underline-offset-2 hover:underline"
            data-testid="mp-detail-deliver-to-change"
          >
            {MW.change}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <span className="flex flex-col gap-1.5">
      <Select
        id="mp-detail-deliver-to-select"
        value={value}
        onValueChange={setChosen}
        disabled={governedRule != null || move.isPending}
        options={options}
      />
      {governedRule ? (
        <span className="text-meta text-kit-slate-11" data-testid="mp-detail-deliver-to-governed">
          {
            purchasingRefusal("supplier_collection_destination_mismatch", {
              supplier: governedRule.supplierName || null,
              destination:
                destinations.find((d) => d.id === governedRule.destinationId)?.name ?? null,
            }).wrong
          }
        </span>
      ) : null}
      {error ? (
        <TwoLines wrong={error.wrong} todo={error.todo} testId="mp-detail-deliver-to-error" />
      ) : null}
      <span className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={move.isPending}
          data-testid="mp-detail-deliver-to-save"
        >
          {MW.save}
        </Button>
        <Button size="sm" variant="neutral" onClick={close} disabled={move.isPending}>
          {MW.cancel}
        </Button>
      </span>
    </span>
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
  /* `Still Needed` is printed for the approver to read, never typed in for
     them — the Approved Qty is seeded by the object from the requested
     quantity (see `ManualPurchaseObject`). */
  const still = stillNeededOf(line.qty, free, onPo.data?.alreadyOnPo ?? 0);
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
  registerHeading,
  position,
  onStep,
  onBack,
  openSection,
  onEditAndSendAgain,
}: {
  id: string;
  /** `approval` when a Work action asked for that section; null otherwise. */
  openSection?: string | null;
  /** The Register row's own business heading (Card 08 §3.3 — `{Need for} ·
   *  {For}` plus the quieter `{Proceed Date} · {supplier}` context) — the
   *  header prints instantly while the object read is in flight. No number,
   *  no UUID. */
  registerHeading: { identity: string; context: string } | null;
  /** The filtered Register position (`4 of 69`) — context, never truth;
   *  null when the open object left the filtered list. */
  position: { index: number; total: number } | null;
  onStep: (dir: -1 | 1) => void;
  onBack: () => void;
  /** R4 — opens the create form on THIS request for `Edit and send again`. */
  onEditAndSendAgain: () => void;
}) {
  const q = useManualPurchaseDetail(id);
  /**
   * ⭐ THE ASKED-FOR SECTION IS BROUGHT INTO VIEW ONCE THE OBJECT HAS LOADED
   * (owner ruling 2026-09-11: "Work must open the exact request's Approval
   * section").
   *
   * It runs after the read lands, because the section does not exist in the
   * DOM while the object is still opening. `Block` already stamps
   * `data-block={title}` on every section, so this needs no new markup and no
   * anchor vocabulary — the governed section NAME is the address.
   */
  useEffect(() => {
    if (!openSection || q.isPending) return;
    const title = openSection === "approval" ? MW.secApproval : null;
    if (!title) return;
    const section = document.querySelector(`[data-block="${title}"]`);
    section?.scrollIntoView({ block: "start" });
  }, [openSection, q.isPending]);
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
  const withdraw = useWithdrawManualPurchase();

  /** The approver's per-line numbers, seeded once per line from the REQUESTED
   *  quantity the moment the detail read lands. Field-guide defect 23: this
   *  used to be seeded inside each row from `Still Needed`, which is
   *  `qty − free − already on PO` — two separate reads (the pick-items list and
   *  the already-have read), and the seed fired when the SECOND arrived using
   *  whatever the FIRST had returned by then. So the field could open at 0 from
   *  a half-read, and a click on Approve saved that 0 as the decision. The
   *  request's own ask is one fact from one read; the approver cuts it down. */
  const [cuts, setCuts] = useState<Record<string, string>>({});
  /* R4 — `Send back` and `Refuse` share ONE required `Decision reason`. */
  const [reasonFor, setReasonFor] = useState<"refuse" | "send_back" | null>(null);
  const [refuseReason, setRefuseReason] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<{ wrong: string; todo: string } | null>(null);
  const [decideError, setDecideError] = useState<{ wrong: string; todo: string } | null>(
    null,
  );

  const d = q.data;
  /* Card 08 §3.3 — the object header speaks business facts only:
     `{Need for} · {For}` as the identity, `{Proceed Date} · {supplier}` as
     the quieter context. The loaded object recomputes them from its own
     read; until it lands, the Register row's hand-off prints. No MPR, no
     UUID, in the heading or the browser title. */
  const loadedHeading = (() => {
    if (!d) return null;
    const destNameById = new Map(d.destinations.map((dd) => [dd.id, dd.name]));
    const liveL = d.lines.filter((l) => l.cancelled_at === null);
    const supNameById = new Map(d.suppliers.map((s) => [s.id, s.name]));
    return {
      identity: manualPurchaseObjectHeading({
        purposeLabel: purposeLabelOf(d.request.purpose),
        forText: manualPurchaseForOf({
          purpose: d.request.purpose,
          destinationName: destNameById.get(d.request.destination_id) ?? null,
          serviceCaseNo: d.serviceCaseNo,
          staffName: d.request.for_staff_user_id
            ? (d.users.find((u) => u.id === d.request.for_staff_user_id)?.name ?? null)
            : null,
          subsidiaryName: d.request.for_subsidiary_name,
          why: d.request.why,
        }),
      }),
      context: [
        fmtDate(d.request.created_at.slice(0, 10)),
        manualPurchaseSupplierSummary(
          liveL.map((l) =>
            l.supplier_id ? (supNameById.get(l.supplier_id) ?? "") : "",
          ),
        ),
      ]
        .filter((part) => part !== "")
        .join(" · "),
    };
  })();
  const heading = loadedHeading ??
    registerHeading ?? { identity: MW.page, context: "" };
  useEffect(() => {
    if (!d) return;
    setCuts((c) => {
      const next = { ...c };
      for (const l of d.lines) {
        if (l.cancelled_at === null && next[l.id] === undefined) next[l.id] = String(l.qty);
      }
      return next;
    });
  }, [d]);

  const status = d
    ? manualPurchaseStatusOf({
        ...decisionFactsOf(d.request),
        refuseReason: d.request.refuse_reason,
        lines: d.lines.map((l) => ({
          qty: l.qty,
          issuedQty: l.issued_qty,
          /* The APPROVER's number — see `manualPurchaseStatusOf`. */
          approvedQty: l.approved_qty,
          cancelledAt: l.cancelled_at,
          poId: l.po_id,
          received: l.received,
        })),
      })
    : null;

  async function submitDecision(decision: "approve" | "refuse" | "send_back") {
    if (!d) return;
    setDecideError(null);
    try {
      await decide.mutateAsync({
        id,
        decision,
        reason: decision === "approve" ? null : refuseReason.trim(),
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
      setReasonFor(null);
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
      /* R4 · A LOST RACE RE-READS THE REQUEST (walk, 2026-09-17). The door
         refused because somebody else's act landed first; leaving Approve on
         screen invites a second click against a request that is already
         withdrawn, sent back or decided. The re-read replaces the controls
         with the fact that won. */
      void q.refetch();
    }
  }

  /* ── The one Object Header (ui/MASTER §4.1) — the SAME implementation the
     Sales Order and Delivery Order objects draw (Law C), with the Manual
     Purchase Register as its one back destination. `‹ n of m ›` steps the
     operator's own filtered Register order; position is context, never
     another source of row truth. ─────────────────────────────────────── */
  const header = (
    <SalesOrderTabs
      identity={heading.identity}
      customer={heading.context || null}
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
      docTitle={`${MW.page} — Carres`}
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

  const approval = manualPurchaseApprovalOf(decisionFactsOf(request));
  /* The approver's controls exist only while the request waits on THEM — a
     sent-back request waits on its requester, a withdrawn one on nobody. */
  const showDecision = d.canApprove && approval.kind === "need_approval";

  async function withdrawRequest() {
    setWithdrawError(null);
    try {
      await withdraw.mutateAsync({ id });
      setConfirmWithdraw(false);
    } catch (e) {
      const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
      const fallback = purchasingRefusal(body?.code ?? "decision_not_recorded");
      setWithdrawError({
        wrong: body?.message ?? fallback.wrong,
        todo: body?.action ?? fallback.todo,
      });
      void q.refetch();
    }
  }
  const approverLine = manualPurchaseApproverLine(d.approvers.map((a) => a.name));
  const decidedEvent = [...(d.history ?? [])]
    .reverse()
    .find((e) =>
      e.kind ===
      (approval.kind === "refused"
        ? "refused"
        : approval.kind === "withdrawn"
          ? "withdrawn"
          : approval.kind === "sent_back"
            ? "sent_back"
            : "approved"),
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
  /* Approving EVERY line at 0 is a refusal wearing the wrong button: the
     status arithmetic derives `Not going ahead` from it, with no reason on
     record (MPR-20260904-8935). One line at 0 among others is a legitimate
     partial cut and stays allowed. */
  const allZero = cutsReady && live.every((l) => Number(cuts[l.id]) === 0);

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
              <Fact label={MW.colDeliverTo} testId="mp-detail-deliver-to">
                <DeliverToFact
                  requestId={request.id}
                  destinationId={request.destination_id}
                  destinations={d.destinations}
                  live={live}
                  supplierCollections={d.supplierCollections ?? []}
                  /* Movable until a line is on a PO: the RPC refuses the rest
                     (refused, every line cancelled) and the same arithmetic
                     hides the door here so it is never offered and refused. */
                  movable={
                    status != null &&
                    (status.kind === "waiting_approval" || status.kind === "ready_to_order") &&
                    !lines.some((l) => l.po_id != null || (l.po_ids?.length ?? 0) > 0)
                  }
                />
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
                  className={`divide-x divide-base-200 align-top${l.cancelled_at ? " text-kit-slate-11" : ""}`}
                  data-testid={`mp-object-item-${i}`}
                >
                  <td className="px-2 py-2 font-mono">{l.sku}</td>
                  <td className="px-2 py-2">
                    {l.item_label ?? l.sku}
                    {l.cancelled_at ? (
                      <span className="block text-label text-kit-slate-11">
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
            {haveRows.length > 0 ? (
              <p className="mb-2 text-meta text-kit-slate-11" data-testid="mp-object-have-note">
                {MW.skuReferenceNote}
              </p>
            ) : null}
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
            {approval.kind === "need_approval" && !showDecision ? (
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
                {allZero ? (
                  <TwoLines
                    testId="mp-approve-zero"
                    wrong="Every line is approved at 0."
                    todo="Refuse the request instead."
                  />
                ) : null}
                {decideError ? (
                  <TwoLines
                    testId="mp-decide-error"
                    wrong={decideError.wrong}
                    todo={decideError.todo}
                  />
                ) : null}
                {reasonFor ? (
                  /* ONE required reason for whichever of the two was chosen —
                     the requester reads it on a returned request, and it is
                     the only record of why a refused one stopped. */
                  <div className="flex flex-wrap items-end gap-2" data-testid="mp-reason-row">
                    <span className="flex min-w-[240px] flex-1 flex-col gap-1">
                      <label htmlFor="mp-refuse-reason" className="text-meta text-kit-slate-11">
                        {MW.decisionReason}
                      </label>
                      <Input
                        id="mp-refuse-reason"
                        aria-label={MW.decisionReason}
                        value={refuseReason}
                        onChange={(e) => setRefuseReason(e.target.value)}
                        data-testid="mp-refuse-reason"
                      />
                    </span>
                    <Button
                      variant="neutral"
                      onClick={() => {
                        setReasonFor(null);
                        setRefuseReason("");
                      }}
                    >
                      {MW.cancel}
                    </Button>
                    <Button
                      variant="neutral"
                      disabled={refuseReason.trim().length === 0 || decide.isPending}
                      onClick={() => void submitDecision(reasonFor)}
                      data-testid={reasonFor === "refuse" ? "mp-refuse-submit" : "mp-send-back-submit"}
                    >
                      {reasonFor === "refuse" ? MW.refuse : MW.sendBack}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                      variant="neutral"
                      onClick={() => setReasonFor("send_back")}
                      data-testid="mp-send-back"
                    >
                      {MW.sendBack}
                    </Button>
                    <Button
                      variant="neutral"
                      onClick={() => setReasonFor("refuse")}
                      data-testid="mp-refuse"
                    >
                      {MW.refuse}
                    </Button>
                    {/* The ONE primary action in this section. */}
                    <Button
                      variant="primary"
                      disabled={!cutsReady || allZero}
                      loading={decide.isPending}
                      onClick={() => void submitDecision("approve")}
                      data-testid="mp-approve"
                    >
                      {MW.approve}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Decided, returned or withdrawn — the fact, the real actor and
                 time, and what the fact carries: the approved quantities, the
                 refusal reason, or the reason it came back. */
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
                  {approval.kind === "sent_back" && request.sent_back_reason ? (
                    <span
                      className="text-label text-base-600"
                      data-testid="mp-detail-sent-back-reason"
                    >
                      {request.sent_back_reason}
                    </span>
                  ) : null}
                </div>
                {approval.kind === "sent_back" && d.canEditAndSendAgain ? (
                  <span className="flex">
                    <Button
                      variant="primary"
                      onClick={onEditAndSendAgain}
                      data-testid="mp-edit-and-send-again"
                    >
                      {MW.editAndSendAgain}
                    </Button>
                  </span>
                ) : null}
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
            {/* R3 · `Withdraw request` — the requester's own door, only while
                nothing is decided and no PO exists. It asks once more before
                it acts, because a withdrawn request cannot come back. */}
            {d.canWithdraw ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-base-200 pt-3" data-testid="mp-withdraw">
                {withdrawError ? (
                  <TwoLines
                    testId="mp-withdraw-error"
                    wrong={withdrawError.wrong}
                    todo={withdrawError.todo}
                  />
                ) : null}
                <span className="flex flex-wrap items-center gap-2">
                  {confirmWithdraw ? (
                    <>
                      <Button
                        variant="neutral"
                        onClick={() => setConfirmWithdraw(false)}
                        disabled={withdraw.isPending}
                      >
                        {MW.cancel}
                      </Button>
                      <Button
                        variant="primary"
                        loading={withdraw.isPending}
                        onClick={() => void withdrawRequest()}
                        data-testid="mp-withdraw-confirm"
                      >
                        {MW.withdraw}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="neutral"
                      onClick={() => setConfirmWithdraw(true)}
                      data-testid="mp-withdraw-request"
                    >
                      {MW.withdraw}
                    </Button>
                  )}
                </span>
              </div>
            ) : null}
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
                  { key: "issued", label: MW.colPoIssued, width: 170 },
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
                    {/* D5 — `PO Issued` is the CURRENT version's marked-sent
                        time, the same fact the Purchase Orders page prints. */}
                    <td className="px-2 py-2" data-testid={`mp-object-po-issued-${i}`}>
                      {p.marked_sent_at ? (
                        fmtDate(p.marked_sent_at, { time: true })
                      ) : (
                        <span className="text-base-600">{MW.notMarkedAsSent}</span>
                      )}
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
                        const words = manualPurchaseHistoryRecord({
                          ...event,
                          changes: historyChangeWords(event, d),
                        });
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
