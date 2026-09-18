// design-standard: not-a-list-page — this page uses the approved full-bleed
// Register engine (components/register/DataGrid), which already owns search,
// filters, columns, export and footer. ListPageShell would add a second set of
// list chrome around the same register, contrary to the Sales Orders template.
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import "./purchase-order-detail.css";
import registerStyles from "./PurchaseOrdersRegister.module.css";
import type { IconName } from "@/components/kit/Icon";
import { FilterRail, FilterRailGroup, FilterRailRow, FilterRailSelect, useFilterRailOpen } from "../components/workspace-rail";
import { ArrowLeft, Download, FileCheck2, RotateCcw, PanelLeftOpen, X } from "lucide-react";
import {
  demandPurposeLabelOf,
  manualPurchaseSourceLine,
  poRecordedReplyOf,
  poReplyDateOf,
  poSupplierDeliveryDateOf,
  poSupplierReplyOf,
  recordSupplierReplyInput,
  PO_DELAY_REASONS,
  purchaseOrderRegisterFacts,
  purchaseOrderWork,
  purchasingRefusal,
  supplierClaimRequestLabel,
  type PurchaseOrderRegisterFacts,
  type PurchaseOrderRegisterFilter,
  type PurchaseOrderRegisterInput,
} from "@carres/shared";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
  type DataGridPersonalLayouts,
} from "@/components/register/DataGrid";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import { Modal } from "../components/Modal";
import { apiFetch } from "@/lib/api";
import Input from "@/components/kit/Input";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import { usePdfCanvases } from "@/lib/pdf/use-pdf-canvases";
/* The Sales Order's card: same heading face, same border, same padding. The
   PO document is read against the SO every day; two card grammars on two
   sister pages read as two apps (YH, 2026-09-04). */
import { Block } from "../SalesOrderWorkspace";
import type { PoTemplateData } from "@/lib/pdf/types";
import {
  useOperationPoAudit,
  useOperationPos,
  useOperationPoUnits,
  useOperationSupplierClaims,
  useOperationSuppliers,
  useOperationWarehouse,
  usePoReceiving,
  useRecordSend,
  useRecordSupplierDate,
  useRegisterLayouts,
  useRevisePo,
  useSaveRegisterLayout,
  useSetDefaultRegisterLayout,
  useSetPoTermsDays,
  useWorkspaceDuties,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { workspaceDutyActor } from "../workspace-duty-owner";
import PurchasingTabs from "../PurchasingTabs";
import PoIssueEvidence, { CHANNEL_WORD, doorsForIssuedPo } from "../components/PoIssueEvidence";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "../components/GoodsMiniTable";
import { lineConfigBits } from "../../dealer/new-order/special-addons-picker";
import { personInitials } from "@/lib/staff-avatar";

/* ⭐ THE RAIL — Purchasing MASTER §9.3, owner correction 2026-09-18. Facts that
   narrow the listing, and nothing that the four groups already say: no `All
   purchase orders` row, no DOCUMENT group, no action sentence. SUPPLIER REPLY
   counts only current versions marked as sent with goods still pending.

   ⭐ THE LABEL IS THE WHOLE SENTENCE, EVERYWHERE. `Date changed` is three
   words that do not say WHICH date or WHOSE answer moved it, and the page
   carries three different dates — a PO Default Delivery Date, a Supplier
   Confirmed Delivery Date and a Goods Received Date. A row that shortens the
   only word distinguishing them saves 90px and costs the operator the fact.
   The group heading is not a reliable qualifier either: it scrolls away, and
   the same condition is read again on a chip where no heading exists at all.
   So one complete label serves the row, the chip and the export, which also
   removes the row/chip pair that could drift apart.

   ⭐ AND THE ICONS NAME WHAT THE GROUP IS ABOUT: a supplier's reply is a
   message, receiving is goods, a supplier is a supplier, and `Supplier Deliver
   To` is the warehouse the current Site filter is choosing between. They are
   the shared kit's own glyphs at its 16px / stroke 2 / inherited neutral ink,
   beside a label that still carries the meaning on its own. */
type RailRow = { key: PurchaseOrderRegisterFilter; label: string };

const RAIL_GROUPS: Array<{ heading: string; icon: IconName; rows: RailRow[] }> = [
  {
    heading: "Supplier reply",
    icon: "message",
    rows: [
      { key: "supplier_date_missing", label: "Supplier has not confirmed the PO date" },
      { key: "supplier_date_changed", label: "Supplier Confirmed Delivery Date changed" },
      { key: "supplier_date_passed", label: "Supplier delivery date passed" },
    ],
  },
  {
    heading: "Receiving",
    icon: "goods",
    rows: [{ key: "partly_received", label: "Partly received" }],
  },
];

const RAIL_ROWS: RailRow[] = RAIL_GROUPS.flatMap((group) => group.rows);

/* The four governed groups, in display order: the two open headings first,
   then the collapsed history. Membership is the shared classifier's. */
const PO_GROUPS = [
  { key: "not_marked_as_sent", label: "Confirm PO sent to supplier", alwaysOpen: true },
  { key: "issued", label: "Waiting for goods from supplier", alwaysOpen: true },
  { key: "completed", label: "Completed", initiallyCollapsed: true },
  { key: "cancelled", label: "Cancelled", initiallyCollapsed: true },
] as const;

type RailFilter = {
  facet: PurchaseOrderRegisterFilter | null;
  supplier: string | null;
  deliverTo: string | null;
};
const RAIL_CLEAR: RailFilter = { facet: null, supplier: null, deliverTo: null };

/**
 * One governed reference behind the PO, as the `SO No / MPR No` column reads
 * it: the real document number and the door it opens. Card 08 §3.5's label
 * `Manual Purchase` survives only where the request has no stored MPR number —
 * a number is READ, never minted for a screen.
 */
type SourceRef = {
  kind: "sales_order" | "manual_purchase";
  reference: string;
  /** A Sales Order's own id, so its number opens its order. */
  orderId: string | null;
  /** A Manual Purchase request's id, so its number opens the request. */
  requestId: string | null;
};

/** One posted receipt of this PO, as `Goods Received Date` / `GRN No` read it. */
type Receipt = {
  id: string;
  grnNo: string;
  /** The PHYSICAL arrival day. Null = the Worker did not send it — unknown,
   *  never "today" and never the GRN's own creation date. */
  receivedOn: string | null;
  /** Good units on THIS receipt. Null = not sent by this Worker. */
  receivedQty: number | null;
};

type RegisterRow = {
  id: string;
  po: operationPoListRow;
  supplier: SupplierRow | null;
  supplierName: string;
  sourceSearch: string;
  deliverTo: string;
  supplierDate: string | null;
  /** `PO Date` — the issue/document date the PO number carries. */
  poDate: string | null;
  sources: SourceRef[];
  receipts: Receipt[];
  items: string[];
  input: PurchaseOrderRegisterInput;
  facts: PurchaseOrderRegisterFacts;
  work: ReturnType<typeof purchaseOrderWork>;
};

/**
 * `PO Date` (ui MASTER §6.7 rule 2): the document date the number itself
 * carries (`PO-YYYYMMDD-NNNN`), never the sent-mark date. A number without a
 * date (legacy) falls back to the stored placement date; nothing is invented.
 */
export function poDateOf(po: Pick<operationPoListRow, "id" | "placed_at">): string | null {
  const m = /^PO-(\d{4})(\d{2})(\d{2})-/.exec(po.id);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (!po.placed_at) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(po.placed_at));
}

/** One name per distinct item, in line order: `Cody · King`, else the SKU. */
function itemNamesOf(po: operationPoListRow): string[] {
  const names: string[] = [];
  for (const line of po.purchase_order_lines ?? []) {
    const name = [line.model_name, line.size].filter(Boolean).join(" · ") || line.sku;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** `{first item} + {n} more` (COPY-STANDARD, Purchase Orders register). */
function itemsSummary(names: readonly string[]): string {
  if (names.length === 0) return "";
  return names.length === 1 ? names[0]! : `${names[0]} + ${names.length - 1} more`;
}

/* Default reading order per group (MASTER §9.3): not marked by PO Delivery
   Date, Issued by Expected Delivery Date, history newest PO Date first.
   An unknown date sorts after every known one — explicit, never invented. */
const GROUP_RANK: Record<string, number> = { not_marked_as_sent: 0, issued: 1, completed: 2, cancelled: 3 };
function compareDefault(a: RegisterRow, b: RegisterRow): number {
  const ga = a.facts.group;
  const gb = b.facts.group;
  if (ga !== gb) return GROUP_RANK[ga]! - GROUP_RANK[gb]!;
  const asc = (x: string | null, y: string | null) =>
    x === y ? 0 : x == null ? 1 : y == null ? -1 : x.localeCompare(y);
  if (ga === "not_marked_as_sent") return asc(a.po.official_delivery_date ?? null, b.po.official_delivery_date ?? null) || a.id.localeCompare(b.id);
  if (ga === "issued") return asc(a.facts.expected.date, b.facts.expected.date) || a.id.localeCompare(b.id);
  return asc(b.poDate, a.poDate) || b.id.localeCompare(a.id);
}

function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

/**
 * ⭐ `SO No / MPR No` — THE REAL DOCUMENTS BEHIND THE PO (MASTER §9.3, owner
 * ruling 2026-09-18; the MPR half overwrites Card 08 §3.5's 2026-09-04
 * retirement).
 *
 * Every governed source keeps its own number and its own door. A Manual
 * Purchase request prints `MPR-YYYYMMDD-RRRR` where one is stored and the
 * governed label `Manual Purchase` where none is — the number is read from
 * the request, never minted for a listing, and a UUID is never shown. Manual
 * sources still dedupe by request identity, not by label, so two purchases
 * that happen to share a word stay two rows.
 *
 * There is no `CO No`: a PO marked consignment does not prove a consignment
 * order created it (owner ruling 2026-09-18).
 */
function sourceRefsOf(po: operationPoListRow): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const source of po.sources ?? []) {
    const identity =
      source.kind === "manual_purchase"
        ? `mp:${source.request_id ?? source.reference}`
        : `so:${source.reference}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push({
      kind: source.kind,
      reference: source.reference,
      orderId: source.kind === "sales_order" ? source.order_id ?? null : null,
      requestId: source.kind === "manual_purchase" ? source.request_id ?? null : null,
    });
  }
  return out;
}

/** The cell's own summary. One reference prints itself; several print the
 *  approved count when they are all Sales Orders, and otherwise the first
 *  number and how many more ride with it. Every one of them stays reachable
 *  through the PO's Order Route. */
function sourceSummary(sources: readonly SourceRef[]): string {
  if (sources.length === 0) return "Not recorded";
  if (sources.length === 1) return sources[0]!.reference;
  if (sources.every((source) => source.kind === "sales_order")) return `${sources.length} SOs`;
  return `${sources[0]!.reference} +${sources.length - 1}`;
}

/** The posted receipts of this PO, oldest arrival first. An absent `grns` is
 *  an older Worker — unknown, and the cells stay empty rather than claiming
 *  nothing ever arrived. */
function receiptsOf(po: operationPoListRow): Receipt[] {
  return (po.grns ?? []).map((grn) => ({
    id: grn.id,
    grnNo: grn.grn_no,
    receivedOn: grn.goods_received_at ?? null,
    receivedQty: grn.received_qty ?? null,
  }));
}

function supplierDateOf(po: operationPoListRow): string | null {
  return poSupplierDeliveryDateOf(po.promises, po.version ?? 1);
}

function toRegisterInput(po: operationPoListRow, supplierName: string): PurchaseOrderRegisterInput {
  return {
    id: po.id,
    supplierName,
    status: po.status,
    version: po.version ?? 1,
    supplierDate: supplierDateOf(po),
    originalDate: po.official_delivery_date ?? null,
    expectedReadyDate: po.expected_ready_date ?? null,
    /* A missing line read stays unknown — never zero, never Completed. */
    lines: Array.isArray(po.purchase_order_lines)
      ? po.purchase_order_lines.map((line) => ({
          qty: line.qty ?? null,
          receivedQty: line.received_qty ?? null,
        }))
      : null,
    sends: (po.sends ?? []).map((send) => ({
      kind: send.kind ?? null,
      channel: send.channel,
      recipient: send.recipient ?? null,
      sentAt: send.sent_at,
      poVersion: send.po_version ?? null,
      sentByName: send.sent_by_name ?? null,
      dutyName: send.duty_name ?? null,
      actingName: send.acting_name ?? null,
    })),
  };
}

function OwnerBadge({
  userId,
  name,
}: {
  userId: string | null;
  name: string | null;
}) {
  const label = name?.trim() || "PO Duty not assigned";
  const initials = name?.trim() ? personInitials(name, "") : "PO";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      data-owner-id={userId ?? "not-assigned"}
      data-owner-duty="PO Duty"
      title={`${label} · PO Duty`}
    >
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-kit-blue-3 text-[10px] font-semibold text-kit-blue-11">
        {initials}
      </span>
      <span className="sr-only">{label} · PO Duty</span>
    </span>
  );
}

function Absence({ children = "Not recorded" }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

export default function PurchaseOrdersPage() {
  const posQ = useOperationPos({ status: "all" });
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const dutyQ = useWorkspaceDuties();
  const poDutyActor = workspaceDutyActor(dutyQ.data, "po_duty");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RailFilter>(RAIL_CLEAR);
  /* The personal saved-layout pilot (ui MASTER §6.7 rule 4). A failed read
     leaves the Columns menu without saved layouts; the register still works. */
  const layoutsQ = useRegisterLayouts("purchase_orders");
  const saveLayout = useSaveRegisterLayout("purchase_orders");
  const setDefaultLayout = useSetDefaultRegisterLayout("purchase_orders");
  const personalLayouts = useMemo<DataGridPersonalLayouts>(() => ({
    layouts: (layoutsQ.data?.layouts ?? []).map((l) => ({ id: l.id, name: l.name, layout: l.layout, isDefault: l.is_default })),
    limit: layoutsQ.data?.limit ?? 10,
    onSave: async (name, layout) => {
      try {
        await saveLayout.mutateAsync({ name, layout });
      } catch (e) {
        const code = (e as { body?: { code?: string } }).body?.code;
        throw new Error(code === "register_layout_limit"
          ? "You can keep 10 layouts. Save under an existing name to replace one."
          : "The layout could not be saved. Try again.");
      }
    },
    onSetDefault: async (id) => {
      try {
        await setDefaultLayout.mutateAsync(id);
      } catch {
        throw new Error("Your default could not be saved. Try again.");
      }
    },
  }), [layoutsQ.data, saveLayout, setDefaultLayout]);
  /* The shared purchasing rail law (S3): a remembered choice wins; with none,
     the rail starts hidden on a canvas narrower than 896px, where it would
     float over the very rows the operator came to read. */
  const canvasRef = useRef<HTMLDivElement>(null);
  const [railOpen, setRailVisible] = useFilterRailOpen("carres.purchaseOrders.filterRail", canvasRef);
  const [pdfProblem, setPdfProblem] = useState<string | null>(null);
  /* The PO whose receipts are open. `{n} receipt dates` and `{n} GRNs` are
     two doors into the SAME list, because they are two facts about one set of
     receipts — not two different collections. */
  const [receiptsFor, setReceiptsFor] = useState<RegisterRow | null>(null);
  const today = todayMYT();

  const suppliers = useMemo(
    () => new Map((suppliersQ.data?.suppliers ?? []).map((supplier) => [supplier.id, supplier])),
    [suppliersQ.data],
  );
  const activeDestinations = posQ.data?.destinations ?? [];
  const destinations = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const destination of posQ.data?.destinations ?? []) byId.set(destination.id, destination);
    for (const destination of posQ.data?.referencedDestinations ?? []) byId.set(destination.id, destination);
    return [...byId.values()];
  }, [posQ.data?.destinations, posQ.data?.referencedDestinations]);
  const warehouses = useMemo(
    () => new Map((warehouseQ.data?.warehouses ?? []).map((warehouse) => [warehouse.id, warehouse])),
    [warehouseQ.data],
  );
  const destinationName = (po: operationPoListRow): string => {
    const id = po.destination_id ?? po.purchase_order_lines.find((line) => line.destination_id)?.destination_id;
    return destinations.find((destination) => destination.id === id)?.name ??
      warehouses.get(po.warehouse_id)?.name ??
      "Not recorded";
  };

  const allRows = useMemo<RegisterRow[]>(() => {
    return (posQ.data?.pos ?? []).map((po) => {
      const supplier = suppliers.get(po.supplier_id) ?? null;
      const supplierName = supplier?.name ?? "Supplier not recorded";
      const input = toRegisterInput(po, supplierName);
      const facts = purchaseOrderRegisterFacts(input, today);
      const sources = sourceRefsOf(po);
      return {
        id: po.id,
        po,
        supplier,
        supplierName,
        sourceSearch: sources.map((source) => source.reference).join(" ") || "Not recorded",
        deliverTo: destinationName(po),
        supplierDate: supplierDateOf(po),
        poDate: poDateOf(po),
        sources,
        receipts: receiptsOf(po),
        items: itemNamesOf(po),
        input,
        facts,
        work: purchaseOrderWork(input, facts),
      };
    }).sort(compareDefault);
  }, [destinations, posQ.data, suppliers, today, warehouses]);

  /* ⛔ A DECORATIVE BADGE MAY NOT BLANK THE REGISTER (YH, 2026-09-01, defect 14).
     `dutyQ` was in both mandatory-read gates, and it is the ONE query on this
     page configured never to retry — while its own docblock promises it "fails
     soft". So a blip on a badge threw away every purchase order fact already
     fetched and sitting in memory, and told the operator the register could not
     be loaded. Its data feeds two decorative badges and nothing else, and
     `OwnerBadge` already degrades to "PO Duty not assigned" on a null holder,
     which is the right thing to show. */
  const requiredReadError = posQ.isError || suppliersQ.isError || warehouseQ.isError;
  if (requiredReadError) {
    return (
      <div ref={canvasRef} className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <PurchasingTabs />
        <div className="m-4 max-w-[720px]">
          <ReadProblem
            problem="The purchase order register could not be loaded"
            action="Try again. If it still fails, ask the system owner to check the PO register and owner roster."
            onRetry={() => {
              void posQ.refetch();
              void suppliersQ.refetch();
              void warehouseQ.refetch();
              /* Still retried on demand — it just no longer decides whether
                 the page renders at all. */
              void dutyQ.refetch();
            }}
          />
        </div>
      </div>
    );
  }
  const requiredReadLoading = posQ.isLoading || suppliersQ.isLoading || warehouseQ.isLoading;
  if (requiredReadLoading) {
    return (
      <div ref={canvasRef} className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <PurchasingTabs />
        <div className="m-4 text-body text-kit-slate-11">Loading purchase orders…</div>
      </div>
    );
  }

  /* ⛔ A LINK THAT MISSES SAYS SO (YH, 2026-09-01, defect 11).
     The match was exact and case-sensitive, so `?po=po-2054` failed the same
     silent way as a number that never existed — the plain register, no message,
     and the bad parameter still in the address bar. The PO number is the
     identifier every purchasing link, email and WhatsApp message carries, so
     the operator's only reading was "the PO was deleted" or "I clicked the
     wrong thing". It also made every integration that builds these links
     untestable: a wrong link and a right link looked identical. */
  const selectedPoId = params.get("po")?.trim().toUpperCase() || null;
  const selected = allRows.find((row) => row.id.toUpperCase() === selectedPoId) ?? null;
  if (selectedPoId && !selected) {
    return (
      <div ref={canvasRef} className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <PurchasingTabs />
        <div className="m-4 max-w-[720px]" data-testid="po-not-found">
          <ReadProblem
            problem={`${selectedPoId} is not in the purchase order register`}
            action="Check the number. If it is right, the purchase order may never have been raised."
            onRetry={() => {
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.delete("po");
                next.delete("view");
                return next;
              });
            }}
          />
        </div>
      </div>
    );
  }
  if (selectedPoId && selected) {
    return (
      <PurchaseOrderObject
        row={selected}
        messageTemplate={posQ.data?.messageTemplate ?? null}
        owner={poDutyActor}
        destinations={destinations}
        activeDestinations={activeDestinations}
        onBack={() => {
          setParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("po");
            next.delete("view");
            return next;
          });
        }}
        onChanged={() => void posQ.refetch()}
      />
    );
  }

  const matchesRail = (row: RegisterRow, rail: RailFilter) =>
    (rail.facet == null || row.facts.filters.includes(rail.facet)) &&
    (rail.supplier == null || row.supplierName === rail.supplier) &&
    (rail.deliverTo == null || row.deliverTo === rail.deliverTo);
  const visibleRows = allRows.filter((row) => matchesRail(row, filter));
  /* Counts describe the whole register, so a facet's number never depends on
     which other facet happens to be open. */
  const counts = new Map(
    RAIL_ROWS.map(({ key }) => [key, allRows.filter((row) => row.facts.filters.includes(key)).length]),
  );
  const optionsOf = (valueOf: (row: RegisterRow) => string) => {
    const tally = new Map<string, number>();
    for (const row of allRows) tally.set(valueOf(row), (tally.get(valueOf(row)) ?? 0) + 1);
    return [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value, count }));
  };
  const supplierOptions = optionsOf((row) => row.supplierName);
  const deliverToOptions = optionsOf((row) => row.deliverTo);
  const facetRow = RAIL_ROWS.find((r) => r.key === filter.facet);
  const activeConditions = [
    ...(filter.facet ? [{ key: "facet", label: facetRow?.label ?? filter.facet, onClear: () => setFilter((f) => ({ ...f, facet: null })) }] : []),
    ...(filter.supplier ? [{ key: "supplier", label: `Supplier: ${filter.supplier}`, onClear: () => setFilter((f) => ({ ...f, supplier: null })) }] : []),
    ...(filter.deliverTo ? [{ key: "deliverTo", label: `Supplier Deliver To: ${filter.deliverTo}`, onClear: () => setFilter((f) => ({ ...f, deliverTo: null })) }] : []),
  ];
  const openObject = (row: RegisterRow, view?: ObjectView) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("po", row.id);
      if (view) next.set("view", view);
      else next.delete("view");
      return next;
    });
  };
  /** The actual receipt, in Receiving, which owns it. */
  const openReceipt = (receiptId: string) =>
    navigate(`/operation?tab=receiving&session=${encodeURIComponent(receiptId)}`);
  const link = "font-medium text-kit-blue-11 underline-offset-2 hover:underline";
  const supporting = "text-[11px] leading-4 text-kit-slate-11";

  /**
   * ⭐ THE ELEVEN COLUMNS, EXACTLY (Purchasing MASTER §9.3, Jess 2026-09-18):
   *
   * ```
   * PO Date · PO No · SO No / MPR No · Supplier · Items · Supplier Deliver To ·
   * PO Default Delivery Date · Supplier Confirmed Delivery Date ·
   * Goods Received Date · GRN No · PO Version
   * ```
   *
   * ⭐ AND THE THREE DATES ARE THREE COLUMNS, NEVER ONE. The retired
   * `Expected Delivery Date` cell printed whichever of the two it had and a
   * word underneath saying which — so an operator comparing what we planned
   * against what the factory actually promised had to read a sentence to
   * discover which number was in front of them, and the two could never be
   * sorted or filtered against each other at all. What we planned, what the
   * supplier confirmed and when the goods actually landed are three different
   * questions; none of them may ever be filled in from another.
   *
   * WIDTHS COME FROM THE SHARED FIELD REGISTRY (ui MASTER §6.8), not from a
   * fresh per-page guess: the same field is the same width on SO Batch,
   * Manual Purchase and here. They are prototype starting widths — the page
   * scrolls sideways under the pinned `PO Date · PO No` rather than squeezing
   * any of them, and no document number truncates.
   */
  const columns: Array<DataGridColumn<RegisterRow>> = [
    {
      key: "po_date",
      chooserGroup: "Document",
      label: "PO Date",
      /* The registry's number, not this page's: SO Batch measured a cross-year
         date at 99px and landed on 120, which is the widest measurement of the
         field, so the field is 120 here too (ui MASTER §6.8). */
      width: 120,
      sortable: true,
      accessor: (row) => (row.poDate ? <span className="tabular-nums">{fmtDate(row.poDate)}</span> : <Absence />),
      searchValue: (row) => (row.poDate ? fmtDate(row.poDate) : "Not recorded"),
      exportValue: (row) => row.poDate ?? "Not recorded",
      dateValue: (row) => row.poDate,
      filterType: "date",
      sortFn: (a, b) => (a.poDate ?? "").localeCompare(b.poDate ?? ""),
    },
    {
      key: "po",
      chooserGroup: "Document",
      label: "PO No",
      width: 170,
      sortable: true,
      filterType: "numbering",
      /* ⭐ THE NUMBER OPENS THE PO, AND NOTHING ELSE SHARES IT (§6.8). The
         goods disclosure is the grid's own separate control in the gutter: a
         decorative arrow concatenated into a document number makes one target
         out of two different acts. */
      accessor: (row) => (
        <button
          type="button"
          className="font-mono font-semibold text-kit-blue-11 hover:underline"
          onClick={(event) => { event.stopPropagation(); openObject(row); }}
        >
          {row.id}
        </button>
      ),
      /* The document states stay findable by typing them (defect 27). */
      searchValue: (row) => `${row.id} ${row.facts.documentState}`,
      filterValue: (row) => row.id,
      exportValue: (row) => row.id,
    },
    {
      key: "source",
      chooserGroup: "Document",
      label: "SO No / MPR No",
      headerLines: ["SO No /", "MPR No"],
      width: 176,
      sortable: true,
      /* One reference is its own door; several open the PO's Order Route,
         where each one is a row. The listing never picks one of them to stand
         for the rest, and never invents a reference the PO does not carry. */
      accessor: (row) => {
        if (row.sources.length === 0) return <Absence />;
        if (row.sources.length === 1) {
          const [only] = row.sources;
          const href = sourceHref(only!);
          return href ? (
            <button
              type="button"
              className={`${link} font-mono`}
              data-testid={`po-source-${row.id}`}
              onClick={(event) => { event.stopPropagation(); navigate(href); }}
            >
              {only!.reference}
            </button>
          ) : <span className="font-mono">{only!.reference}</span>;
        }
        return (
          <button
            type="button"
            className={link}
            data-testid={`po-source-${row.id}`}
            onClick={(event) => { event.stopPropagation(); openObject(row, "Order Route"); }}
          >
            {sourceSummary(row.sources)}
          </button>
        );
      },
      /* Every governed reference and the legacy CR/TCF mirrors stay
         searchable, without a Source column. */
      searchValue: (row) => [row.sourceSearch, row.po.so ?? "", ...(row.po.so_refs ?? [])].join(" "),
      filterValue: (row) => sourceSummary(row.sources),
      exportValue: (row) => row.sources.map((source) => source.reference).join(" · ") || "Not recorded",
    },
    {
      key: "supplier",
      chooserGroup: "Supplier",
      label: "Supplier",
      /* 140, the registry's number: Manual Purchase measured a 17-character
         live supplier name, which is wider than anything this page's fixtures
         carry. One field, one width (ui MASTER §6.8). */
      width: 140,
      sortable: true,
      overflowText: (row) => row.supplierName,
      accessor: (row) => row.supplierName,
      searchValue: (row) => row.supplierName,
      filterValue: (row) => row.supplierName,
    },
    {
      key: "items",
      chooserGroup: "Goods",
      label: "Items",
      width: 208,
      sortable: true,
      overflowText: (row) => itemsSummary(row.items),
      accessor: (row) => itemsSummary(row.items),
      searchValue: (row) => [...row.items, ...(row.po.purchase_order_lines ?? []).map((line) => line.sku)].join(" "),
      filterValue: (row) => itemsSummary(row.items),
    },
    {
      key: "deliver_to",
      chooserGroup: "Receiving",
      /* `Supplier Deliver To` — where the SUPPLIER was told to deliver. It is
         not the customer's address and not the site the goods actually
         reached; both of those are other columns on other pages. */
      label: "Supplier Deliver To",
      headerLines: ["Supplier", "Deliver To"],
      width: 150,
      sortable: true,
      accessor: (row) => row.deliverTo === "Not recorded" ? <Absence /> : row.deliverTo,
      searchValue: (row) => row.deliverTo,
      filterValue: (row) => row.deliverTo,
    },
    {
      key: "default_delivery",
      chooserGroup: "Goods",
      /* The ORIGINAL planned date, preserved when the supplier replies and
         when Settings later change (0428). A supplier's answer never
         overwrites it and it is never back-filled from one. */
      label: "PO Default Delivery Date",
      headerLines: ["PO Default", "Delivery Date"],
      width: 150,
      sortable: true,
      accessor: (row) => {
        const date = row.po.official_delivery_date ?? null;
        return date ? <span className="tabular-nums">{fmtDate(date)}</span> : <Absence />;
      },
      searchValue: (row) => (row.po.official_delivery_date ? fmtDate(row.po.official_delivery_date) : "Not recorded"),
      exportValue: (row) => row.po.official_delivery_date ?? "Not recorded",
      dateValue: (row) => row.po.official_delivery_date ?? null,
      filterType: "date",
      sortFn: (a, b) => (a.po.official_delivery_date ?? "9999").localeCompare(b.po.official_delivery_date ?? "9999"),
    },
    {
      key: "supplier_delivery",
      chooserGroup: "Goods",
      /* The supplier's EVIDENCED current-version answer. No answer reads
         `Not confirmed by supplier` — it is never filled with the PO default,
         which is the whole reason these are two columns. */
      label: "Supplier Confirmed Delivery Date",
      headerLines: ["Supplier Confirmed", "Delivery Date"],
      width: 180,
      sortable: true,
      accessor: (row) => (
        <span className="flex flex-col leading-4" data-testid={`po-supplier-date-${row.id}`}>
          <span className="tabular-nums">
            {/* The dictionary's word for THIS column (COPY-STANDARD,
                Purchasing UI dictionary). `Not confirmed by supplier` was the
                second line of the retired merged cell, where the column head
                did not say whose date it was; here the head already does. */}
            {row.supplierDate ? fmtDate(row.supplierDate) : <Absence>Not confirmed</Absence>}
          </span>
          {row.facts.expected.supplier === "changed" ? (
            <span className={supporting}>
              Supplier changed from {row.facts.expected.changedFrom ? fmtDate(row.facts.expected.changedFrom) : "Not recorded"}
            </span>
          ) : null}
        </span>
      ),
      searchValue: (row) => (row.supplierDate ? fmtDate(row.supplierDate) : "Not confirmed"),
      filterValue: (row) => (row.supplierDate ? fmtDate(row.supplierDate) : "Not confirmed"),
      exportValue: (row) => row.supplierDate ?? "Not confirmed",
      dateValue: (row) => row.supplierDate,
      filterType: "date",
      sortFn: (a, b) => (a.supplierDate ?? "9999").localeCompare(b.supplierDate ?? "9999"),
    },
    {
      key: "goods_received",
      chooserGroup: "Receiving",
      /* ⭐ NEVER ONE DATE FOR SEVERAL TRUCKS. A PO with three receipts has
         three arrival dates, and printing the latest as if all the goods
         landed then is the defect this column's count link exists to stop. */
      label: "Goods Received Date",
      headerLines: ["Goods Received", "Date"],
      width: 140,
      sortable: true,
      accessor: (row) => {
        if (row.receipts.length === 0) return <span />;
        if (row.receipts.length > 1) {
          return (
            <button
              type="button"
              className={link}
              data-testid={`po-receipt-dates-${row.id}`}
              onClick={(event) => { event.stopPropagation(); setReceiptsFor(row); }}
            >
              {row.receipts.length} receipt dates
            </button>
          );
        }
        const only = row.receipts[0]!;
        return (
          <span className="flex flex-col leading-4" data-testid={`po-received-${row.id}`}>
            <span className="tabular-nums">{only.receivedOn ? fmtDate(only.receivedOn) : <Absence />}</span>
            {/* The receipt record carries a DATE and no clock (0314), so the
                time is stated as missing rather than guessed from the moment
                somebody filed the paperwork. */}
            <span className={supporting}>Time not recorded</span>
          </span>
        );
      },
      searchValue: (row) => row.receipts.map((receipt) => (receipt.receivedOn ? fmtDate(receipt.receivedOn) : "")).join(" "),
      filterValue: (row) => {
        if (row.receipts.length === 0) return "";
        if (row.receipts.length > 1) return `${row.receipts.length} receipt dates`;
        return row.receipts[0]!.receivedOn ? fmtDate(row.receipts[0]!.receivedOn) : "Not recorded";
      },
      exportValue: (row) => row.receipts.map((receipt) => receipt.receivedOn ?? "Not recorded").join(" · "),
      dateValue: (row) => (row.receipts.length === 1 ? row.receipts[0]!.receivedOn : null),
      sortFn: (a, b) => (firstArrival(a) ?? "9999").localeCompare(firstArrival(b) ?? "9999"),
    },
    {
      key: "grn",
      chooserGroup: "Receiving",
      label: "GRN No",
      width: 170,
      sortable: true,
      /* One GRN opens it in Receiving; several open this PO's receipts, where
         each date, number and quantity is its own row with its own door. A
         Worker that sent no GRN list is not "no GRN". */
      accessor: (row) => {
        if (row.receipts.length === 0) return <span />;
        if (row.receipts.length === 1) {
          const only = row.receipts[0]!;
          return (
            <button
              type="button"
              className={`${link} font-mono`}
              onClick={(event) => { event.stopPropagation(); openReceipt(only.id); }}
            >
              {only.grnNo}
            </button>
          );
        }
        return (
          <button
            type="button"
            className={link}
            data-testid={`po-grns-${row.id}`}
            onClick={(event) => { event.stopPropagation(); setReceiptsFor(row); }}
          >
            {row.receipts.length} GRNs
          </button>
        );
      },
      searchValue: (row) => row.receipts.map((receipt) => receipt.grnNo).join(" "),
      filterValue: (row) =>
        row.receipts.length === 1 ? row.receipts[0]!.grnNo
          : row.receipts.length > 1 ? `${row.receipts.length} GRNs` : "",
      exportValue: (row) => row.receipts.map((receipt) => receipt.grnNo).join(" · "),
    },
    {
      key: "current_version",
      chooserGroup: "Document",
      label: "PO Version",
      /* MEASURED, not the registry's prototype 238: the longest evidence line
         `PO sent to supplier · WhatsApp · Wed, 28 Sep` needs 247px of content
         at the register's 11px second line, and 238 clipped it. Content
         decides the width (CLAUDE.md §2); the registry entry is corrected in
         ui MASTER §6.8 rather than the cell being squeezed to fit it. */
      width: 265,
      sortable: true,
      /* The CURRENT version only; earlier marks stay in Revisions. A mark is
         a person's statement of sending, never supplier receipt — and its
         ABSENCE is not proof that no send happened. */
      accessor: (row) => (
        <span className="flex flex-col leading-4" data-testid={`po-version-${row.id}`}>
          <span>PO V{row.facts.version}</span>
          <span className={supporting}>{versionLine(row)}</span>
        </span>
      ),
      searchValue: (row) => `PO V${row.facts.version} ${versionLine(row)}`,
      filterValue: (row) => `PO V${row.facts.version}`,
      exportValue: (row) => `PO V${row.facts.version} · ${versionLine(row)}`,
    },
  ];

  const contextMenu = (row: RegisterRow): DataGridContextMenuItem[] => [
    { label: "View", onClick: () => openObject(row) },
    {
      label: "Download official PDF",
      onClick: () => {
        setPdfProblem(null);
        void downloadOfficialPdf(row.id).catch(() => {
          setPdfProblem("The official PDF could not be downloaded");
        });
      },
    },
  ];

  return (
    <div ref={canvasRef} className={`${registerStyles.page} flex h-full min-h-0 flex-col`} data-testid="purchase-orders-register">
      <PurchasingTabs />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {railOpen && (
        <FilterRail
          className="max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30"
          onHide={() => setRailVisible(false)}
          ariaLabel="Purchase order filters"
          testId="po-filter-rail"
        >
          {RAIL_GROUPS.map((group) => (
            <FilterRailGroup key={group.heading} title={group.heading} icon={group.icon}>
              {group.rows.map((item) => (
                <FilterRailRow
                  key={item.key}
                  label={item.label}
                  count={counts.get(item.key) ?? 0}
                  active={filter.facet === item.key}
                  onClick={() => setFilter((f) => ({ ...f, facet: f.facet === item.key ? null : item.key }))}
                  testId={`po-filter-${item.key}`}
                />
              ))}
            </FilterRailGroup>
          ))}
          <FilterRailGroup title="Supplier" icon="supplier">
            <FilterRailSelect
              label="Supplier"
              allLabel="All suppliers"
              testId="po-supplier-select"
              value={filter.supplier}
              options={supplierOptions}
              onChange={(supplier) => setFilter((f) => ({ ...f, supplier }))}
            />
          </FilterRailGroup>
          <FilterRailGroup title="Supplier Deliver To" icon="warehouse">
            <FilterRailSelect
              label="Supplier Deliver To"
              allLabel="All destinations"
              testId="po-deliver-to-select"
              value={filter.deliverTo}
              options={deliverToOptions}
              onChange={(deliverTo) => setFilter((f) => ({ ...f, deliverTo }))}
            />
          </FilterRailGroup>
        </FilterRail>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2" data-testid="po-register-content">
          {pdfProblem ? (
            <ReadProblem
              problem={pdfProblem}
              action="Use Download official PDF again. If it still fails, ask the system owner to check the PO document."
            />
          ) : null}
            <DataGrid<RegisterRow>
              appearance="reference"
              palette="slate"
              searchPresentation="responsive"
              rows={visibleRows}
              columns={columns}
              /* v2 — the nine-column date-first register replaces v1's twelve. */
              storageKey="carres.purchaseOrders.register.v2"
              rowKey={(row) => row.id}
              rowTestId={(row) => `grid-row-${row.id}`}
              exportName="Purchase Orders"
              searchPlaceholder="Search purchase orders…"
              isLoading={posQ.isLoading}
              emptyMessage={allRows.length === 0 ? "No purchase orders yet" : "No purchase orders match these filters"}
              noMatchMessage="No purchase orders match these filters"
              activeConditions={activeConditions}
              onClearConditions={() => setFilter(RAIL_CLEAR)}
              leadingColumns={{ date: "po_date", identity: "po" }}
              personalLayouts={personalLayouts}
              groupBanner={false}
              fixedGroups={{
                groups: PO_GROUPS,
                groupOf: (row) => row.facts.group,
                revealMatches: activeConditions.length > 0,
              }}
              chooserGroupOrder={["Document", "Supplier", "Goods", "Receiving"]}
              onRowDoubleClick={openObject}
              contextMenu={contextMenu}
              expandTitle="Show goods"
              expandable={{
                flush: true,
                alignToColumn: "po_date",
                testId: (row) => `po-expand-${row.id}`,
                renderExpansion: (row) => <OrderedGoods row={row} destinations={destinations} />,
              }}
              toolbarStart={!railOpen && (
                <button
                  type="button"
                  aria-label="Show filters"
                  title="Show filters"
                  data-testid="purchase-orders-show-filters"
                  className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
                  onClick={() => setRailVisible(true)}
                >
                  <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
                </button>
              )}
              /* One total, including collapsed groups; no quantity totals. */
              statusSummary={(filtered) => (
                <span data-testid="po-footer">
                  {filtered.length === allRows.length
                    ? allRows.length === 1 ? "1 purchase order" : `${allRows.length} purchase orders`
                    : `${filtered.length} of ${allRows.length} purchase orders`}
                </span>
              )}
            />
        </div>
      </div>
      {receiptsFor ? (
        <ReceiptsDialog
          row={receiptsFor}
          onOpenReceipt={(id) => { setReceiptsFor(null); openReceipt(id); }}
          onClose={() => setReceiptsFor(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * ⭐ EVERY RECEIPT, ONE ROW EACH — MASTER §9.3 (Jess, 2026-09-18).
 *
 * A PO that took three deliveries has three arrival dates, three GRN numbers
 * and three quantities. The listing cell states HOW MANY and this is where
 * they are named, one per row, each with the door to the actual receipt.
 * Nothing here is summed and nothing is picked to stand for the rest: a single
 * latest date printed as if all the goods landed then is exactly the lie the
 * count link exists to prevent.
 */
function ReceiptsDialog({
  row,
  onOpenReceipt,
  onClose,
}: {
  row: RegisterRow;
  onOpenReceipt: (receiptId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`Receipts on ${row.id}`} onClose={onClose}>
      <div data-testid="po-receipts-dialog" className="overflow-x-auto rounded-control border border-kit-slate-5">
        <table className="w-full text-left text-body" aria-label={`Receipts on ${row.id}`}>
          <thead className="border-b border-kit-slate-5 bg-kit-slate-3">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-label font-semibold text-kit-slate-11">Goods Received Date</th>
              <th scope="col" className="px-2 py-1.5 text-label font-semibold text-kit-slate-11">GRN No</th>
              <th scope="col" className="px-2 py-1.5 text-label font-semibold text-kit-slate-11">Received Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kit-slate-5">
            {row.receipts.map((receipt) => (
              <tr key={receipt.id} data-testid={`po-receipt-${receipt.grnNo}`}>
                <td className="px-2 py-1.5 align-top">
                  <span className="flex flex-col leading-4">
                    <span className="tabular-nums">
                      {receipt.receivedOn ? fmtDate(receipt.receivedOn) : <Absence />}
                    </span>
                    <span className="text-[11px] leading-4 text-kit-slate-11">Time not recorded</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <button
                    type="button"
                    className="font-mono font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                    onClick={() => onOpenReceipt(receipt.id)}
                  >
                    {receipt.grnNo}
                  </button>
                </td>
                {/* An older Worker sends no quantity. That is unknown, and
                    unknown is never printed as zero. */}
                <td className="px-2 py-1.5 align-top tabular-nums">
                  {receipt.receivedQty == null ? <Absence /> : receipt.receivedQty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** Where one governed reference opens. A Manual Purchase request with no
 *  stored identity opens nothing — it prints its governed label as a fact. */
function sourceHref(source: SourceRef): string | null {
  if (source.kind === "sales_order") return source.orderId ? `/operation/orders/so/${source.orderId}` : null;
  return source.requestId ? `/operation?tab=manual-purchase&request=${encodeURIComponent(source.requestId)}` : null;
}

/** The first arrival this PO recorded — the sort key for Goods Received Date.
 *  An unknown arrival sorts after every known one; it is never treated as
 *  today and never as "never arrived". */
function firstArrival(row: RegisterRow): string | null {
  const dates = row.receipts.map((receipt) => receipt.receivedOn).filter((date): date is string => !!date);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a <= b ? a : b));
}

/** Line 2 of PO Version — the CURRENT version's sent mark, or its absence. */
function versionLine(row: RegisterRow): string {
  const mark = row.facts.currentSend;
  return mark
    ? `PO sent to supplier · ${CHANNEL_WORD[mark.channel] ?? mark.channel} · ${fmtDate(mark.sentAt)}`
    : "Sending not confirmed";
}

/**
 * ⭐ THE ORDERED GOODS — READ ONLY (Purchasing MASTER §9.3, Jess 2026-09-18):
 *
 * ```
 * Category · Supplier · Supplier Deliver To · PO No / Unit ID · Qty · Items
 * ```
 *
 * It is a TRUTH table: no purchasing checkbox, no Ready Stock allocation
 * control, nothing that could commit a unit. The Purchase Orders register
 * states what was ordered; buying happens at SO Batch Purchase and Manual
 * Purchase, which own those acts and their guards.
 *
 * ⭐ AND THE UNIT IDs ARE THE REAL ONES. Every piece of an exact-unit line got
 * a permanent `U1-000-001` in the SAME transaction that issued the PO (§6.2,
 * migrations 0442–0444), bound to that line's immutable id. They are read from
 * the PO's own units, never generated for the screen and never copied from a
 * sample — a Unit ID is a thing written on a package in a factory, and an
 * invented one sends somebody to look for furniture that does not exist.
 *
 * The three states a cell can honestly be in, and they are three different
 * sentences:
 *   · a QUANTITY line has no Unit IDs by law and prints `—`;
 *   · an EXACT-UNIT line whose units came back empty is an INTEGRITY FAILURE
 *     and says so — never an ordinary empty state;
 *   · a read that failed or has not answered yet says that instead, because
 *     "we have not looked" and "they are missing" are not the same fact.
 */
function OrderedGoods({ row, destinations }: { row: RegisterRow; destinations: Array<{ id: string; name: string }> }) {
  const unitsQ = useOperationPoUnits(row.id);
  const unitsByLine = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const unit of unitsQ.data?.units ?? []) {
      if (!unit.po_line_id) continue;
      const current = map.get(unit.po_line_id) ?? [];
      current.push(unit.unit_code);
      map.set(unit.po_line_id, current);
    }
    for (const codes of map.values()) codes.sort((a, b) => a.localeCompare(b));
    return map;
  }, [unitsQ.data]);

  const lines: GoodsMiniLine[] = (row.po.purchase_order_lines ?? []).map((line) => {
    const destination = line.destination_id
      ? destinations.find((d) => d.id === line.destination_id)?.name ?? null
      : row.deliverTo === "Not recorded" ? null : row.deliverTo;
    const config = lineConfigBits(line.attrs as Record<string, unknown> | null | undefined).join(" · ");
    const unitIds = unitsByLine.get(line.id) ?? [];
    const counted = line.identity_mode === "quantity";
    return {
      key: line.id,
      category: goodsCategoryOf(line),
      unitIds: counted ? [] : unitIds,
      unitNode: counted
        ? <Absence>—</Absence>
        : unitsQ.isError
        ? <span className="text-kit-amber-11">Unit IDs could not be read</span>
        : unitsQ.isLoading
        ? <Absence>Reading Unit IDs…</Absence>
        : unitIds.length === 0
        ? <span className="text-kit-amber-11">Unit IDs missing on this line — do not send this PO</span>
        : undefined,
      unitAbsence: "",
      deliverTo: destination ? [destination] : [],
      deliverToAbsence: "Not recorded",
      supplier: row.supplierName,
      poNos: [row.id],
      sku: line.sku,
      qty: line.qty,
      item: [line.model_name, line.size].filter(Boolean).join(" · ") || line.sku,
      itemDetail: config || undefined,
      selectable: false,
    };
  });
  return (
    <div className="px-2 py-3" data-testid={`po-goods-${row.id}`}>
      <GoodsMiniTable
        label={`Goods on ${row.id}`}
        lines={lines}
        purchaseOrderLayout
        showSupplier
        deliverToHeading="Supplier Deliver To"
        itemHeading="Items"
      />
    </div>
  );
}

/** 0430 — reprint the KEPT document of an already-sent version, exactly as it
 *  was recorded at that version's first confirmed send. */
async function downloadKeptPdf(poId: string, version: number): Promise<void> {
  const data = await apiFetch<PoTemplateData>(
    `/api/operation/pos/${encodeURIComponent(poId)}/print-data?version=${version}`,
  );
  const blob = await renderPoPdf(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${poId}-V${version}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function downloadOfficialPdf(poId: string): Promise<void> {
  const data = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);
  const blob = await renderPoPdf(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${poId}.pdf`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const OBJECT_VIEWS = ["Document", "Revisions", "History", "Order Route"] as const;
type ObjectView = (typeof OBJECT_VIEWS)[number];
type DocumentMode = "read" | "issue" | "revise";

function PurchaseOrderObject({
  row,
  messageTemplate,
  owner,
  destinations,
  activeDestinations,
  onBack,
  onChanged,
}: {
  row: RegisterRow;
  messageTemplate: string | null;
  owner: { userId: string; name: string | null } | null;
  destinations: Array<{ id: string; name: string }>;
  activeDestinations: Array<{ id: string; name: string }>;
  onBack: () => void;
  onChanged: () => void;
}) {
  /* ⭐ THE VIEW LIVES IN THE ADDRESS (YH, 2026-09-01, defect 29).
     It was local component state, while the Back handler deleted a `view`
     parameter that NOTHING ever set or read. So every link anyone shared
     landed on Document, any reload mid-investigation threw the reader back to
     the start, and the orphaned delete read as a working feature to the next
     person who touched the file. Driving it from the URL makes that delete
     correct instead of dead. Validated against the four names and defaulting
     to Document, so a hand-typed `?view=nonsense` cannot render a blank tab. */
  const [objectParams, setObjectParams] = useSearchParams();
  const viewParam = objectParams.get("view");
  const view: ObjectView = (OBJECT_VIEWS as readonly string[]).includes(viewParam ?? "")
    ? (viewParam as ObjectView)
    : "Document";
  const setView = (next: ObjectView) => {
    setObjectParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "Document") updated.delete("view");
      else updated.set("view", next);
      return updated;
    }, { replace: true });
  };
  const [mode, setMode] = useState<DocumentMode>("read");
  const [pdfProblem, setPdfProblem] = useState<string | null>(null);
  const [pdfAction, setPdfAction] = useState<string | null>(null);
  /* Cancelled is the one document state with no official PDF to show. */
  const cancelled = row.po.status === "cancelled";
  const unitsQ = useOperationPoUnits(row.id);
  const receivingQ = usePoReceiving(row.id);
  const claimsQ = useOperationSupplierClaims("all", row.id);
  const auditQ = useOperationPoAudit(row.id);
  const recordOpen = useRecordSend(row.id);
  const po = row.po;
  const issueNeeded = row.facts.currentSend == null && po.status === "open";

  return (
    <div className="po-detail-style flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="purchase-order-object">
      <PurchasingTabs />
      <header className="shrink-0 border-b border-kit-slate-5 bg-white px-4 pt-3">
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" aria-label="Back to Purchase Orders" className="mt-1 text-kit-slate-11 hover:text-kit-slate-12" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-page font-semibold text-kit-slate-12">
              <span className="font-mono">{po.id}</span> · {row.supplierName}
            </h1>
            <p className="text-meta text-kit-slate-11">PO V{row.facts.version} · {row.facts.operationStatus ?? row.facts.documentState}</p>
          </div>
          <div className="ml-auto flex flex-wrap justify-end gap-2 max-[960px]:basis-full max-[960px]:pl-7" data-testid="po-object-actions">
            {po.status === "open" && mode === "read" ? (
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-kit-slate-5 px-3 text-meta font-medium" onClick={() => setMode("revise")}>
                <RotateCcw size={14} /> Revise
              </button>
            ) : null}
            {issueNeeded && mode === "read" ? (
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white" onClick={() => setMode("issue")}>
                <FileCheck2 size={14} /> Issue current PDF
              </button>
            ) : null}
            {/* ⛔ A BUTTON THAT CAN ONLY REFUSE IS NOT AN ACTION (defect 18).
                The database refuses to print a cancelled PO BY DESIGN
                (`po_not_printable`, 0402), and cancelled POs are deliberately
                KEPT in the register — so operators met this routinely. The page
                mounted the button and the preview unconditionally, threw away
                the server's actual reason and printed a constant sentence
                telling them to escalate a HEALTHY refusal, which teaches a team
                to distrust the page's error strip. */}
            {cancelled ? null : (
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-kit-slate-5 px-3 text-meta" onClick={() => {
                setPdfProblem(null);
                setPdfAction(null);
                void downloadOfficialPdf(po.id).catch((e: unknown) => {
                  /* The server's OWN two lines, the way PoIssueEvidence already
                     does it; a refusal carrying only a code becomes governed
                     words rather than a code on screen. */
                  const body = (e as { body?: { message?: string; action?: string; code?: string } }).body;
                  if (body?.message || body?.code) {
                    const fallback = purchasingRefusal(body.code, { po: po.id, supplier: row.supplierName });
                    setPdfProblem(body.message ?? fallback.wrong);
                    setPdfAction(body.action ?? fallback.todo);
                    return;
                  }
                  /* No body at all is a READ that failed, not a refusal — and
                     "try again, then escalate" is the right advice for that.
                     Defect 18 was about the opposite case: a HEALTHY refusal
                     (a cancelled PO) wearing those words. */
                  setPdfProblem("The official PDF could not be downloaded");
                  setPdfAction(null);
                });
              }}>
                <Download size={14} /> Download PDF
              </button>
            )}
          </div>
        </div>
        {pdfProblem ? (
          <div className="mt-2">
            <ReadProblem
              problem={pdfProblem}
              action={pdfAction ?? "Use Download PDF again. If it still fails, ask the system owner to check the PO document."}
            />
          </div>
        ) : null}
        <nav className="mt-3 flex gap-1 overflow-x-auto whitespace-nowrap" aria-label="Purchase order views">
          {OBJECT_VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              className={`h-8 border-b-2 px-3 text-meta font-medium ${view === item ? "border-kit-blue-9 text-kit-blue-11" : "border-transparent text-kit-slate-11 hover:text-kit-slate-12"}`}
              onClick={() => { setView(item); setMode("read"); }}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      {/* The Document view hands the height to its two panes (each scrolls on
          its own, the SalesOrderWorkspace shape); every other view scrolls the
          page as before. Below `lg` the panes stack and the page scrolls. */}
      <main
        className={
          view === "Document" && mode === "read"
            ? "min-h-0 flex-1 overflow-auto lg:overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
        }
      >
        {view === "Document" && mode !== "read" ? (
          <div
            className="grid grid-cols-1 gap-3 min-[1130px]:grid-cols-2"
            data-testid="po-document-split"
            data-layout="50-50"
          >
            <section className="min-w-0 border border-kit-slate-5 bg-white p-4">
              <div className="mb-3 flex items-center justify-between border-b border-kit-slate-5 pb-3">
                <div>
                  <h2 className="text-body font-semibold">{mode === "issue" ? "Issue purchase order" : "Revise purchase order"}</h2>
                  <p className="text-meta text-kit-slate-11">Check the official document beside these fields before you finish.</p>
                </div>
                <button type="button" aria-label="Close document work" onClick={() => setMode("read")}><X size={16} /></button>
              </div>
              {mode === "issue" ? (
                <PoIssueEvidence
                  po={{
                    id: po.id,
                    supplierId: po.supplier_id,
                    supplierName: row.supplierName,
                    destinationId: po.destination_id ?? "not-recorded",
                    destination: row.deliverTo,
                    whatsappGroupUrl: row.supplier?.whatsapp_group_url ?? null,
                    contactEmail: row.supplier?.contact_email ?? null,
                    contact: row.supplier?.contact ?? null,
                  }}
                  version={po.version ?? 1}
                  evidence={po.sends ?? []}
                  doors={doorsForIssuedPo({
                    id: po.id,
                    supplierId: po.supplier_id,
                    supplierName: row.supplierName,
                    destinationId: po.destination_id ?? "not-recorded",
                    destination: row.deliverTo,
                    whatsappGroupUrl: row.supplier?.whatsapp_group_url ?? null,
                    contactEmail: row.supplier?.contact_email ?? null,
                    contact: row.supplier?.contact ?? null,
                  }, messageTemplate)}
                  onOpened={(channel) => recordOpen.mutate({ channel })}
                  onConfirmed={() => { onChanged(); setMode("read"); }}
                />
              ) : (
                <RevisionForm
                  po={po}
                  destinations={destinations}
                  activeDestinations={activeDestinations}
                  onSaved={() => { onChanged(); setMode("read"); }}
                  onCancel={() => setMode("read")}
                />
              )}
            </section>
            <OfficialPreview poId={po.id} />
          </div>
        ) : view === "Document" ? (
          <DocumentView
            row={row}
            owner={owner}
            onSupplierDateSaved={onChanged}
            units={unitsQ.data?.units ?? []}
            receiving={receivingQ.data?.sessions ?? []}
            claims={claimsQ.data?.claims ?? []}
            destinations={destinations}
            unitLoading={unitsQ.isLoading}
            receivingLoading={receivingQ.isLoading}
            claimsLoading={claimsQ.isLoading}
            unitError={unitsQ.isError}
            receivingError={receivingQ.isError}
            claimsError={claimsQ.isError}
            onRetryUnits={() => void unitsQ.refetch()}
            onRetryReceiving={() => void receivingQ.refetch()}
            onRetryClaims={() => void claimsQ.refetch()}
          />
        ) : view === "Revisions" ? (
          <RecordList
            title="Revisions"
            empty="No revised version is recorded. PO V1 is the original purchase order."
            problem={auditQ.isError ? "The PO revisions could not be loaded" : null}
            action="Try again. If it still fails, ask the system owner to check the PO history."
            onRetry={() => void auditQ.refetch()}
            rows={[
              {
                id: "current-document",
                title: `Current document · PO V${po.version ?? 1}`,
                meta: "Live purchase order",
                detail: "This is the version used by the official PDF.",
              },
              /* 0430 — every version the supplier actually received, with its
                 KEPT document where one was recorded at confirm-sent. A send
                 before document keeping began answers with a named absence,
                 never a reconstruction. */
              ...[...new Set(
                (po.sends ?? [])
                  .filter((send) => send.kind === "confirmed_sent" && send.po_version != null)
                  .map((send) => send.po_version as number),
              )].sort((a, b) => b - a).map((sentVersion) => ({
                id: `sent-v${sentVersion}`,
                title: `Sent document · PO V${sentVersion}`,
                meta: "Recorded at the confirmed send",
                action: (
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1.5 rounded-control border border-kit-slate-5 px-2 text-meta"
                    data-testid={`po-sent-version-pdf-${sentVersion}`}
                    onClick={() => void downloadKeptPdf(po.id, sentVersion).catch((e: unknown) => {
                      const body = (e as { body?: { message?: string } }).body;
                      window.alert(body?.message ?? "The kept document could not be downloaded");
                    })}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                ),
              })),
              ...(auditQ.data?.revisions ?? []).map((revision) => ({
                id: revision.id,
                title: `Snapshot ${revision.rev_no}`,
                meta: `${revision.actor_name ?? "Staff identity not recorded"} · ${fmtDate(revision.created_at, { time: true })}`,
                detail: revision.reason ?? "Send snapshot · No document change reason",
              })),
            ]}
          />
        ) : view === "History" ? (
          <RecordList
            title="History"
            empty="No history is recorded for this purchase order."
            problem={auditQ.isError ? "The PO history could not be loaded" : null}
            action="Try again. If it still fails, ask the system owner to check the PO history."
            onRetry={() => void auditQ.refetch()}
            rows={(auditQ.data?.history ?? []).map((event) => ({
              id: event.id,
              title: event.text,
              meta: `${event.actor_name ?? "Staff identity not recorded"} · ${event.by_role ?? "Role not recorded"} · ${fmtDate(event.occurred_at, { time: true })}`,
            }))}
          />
        ) : (
          <OrderRoute
            row={row}
            receiving={receivingQ.data?.sessions ?? []}
            claims={claimsQ.data?.claims ?? []}
            receivingLoading={receivingQ.isLoading}
            claimsLoading={claimsQ.isLoading}
            receivingError={receivingQ.isError}
            claimsError={claimsQ.isError}
            onRetryReceiving={() => void receivingQ.refetch()}
            onRetryClaims={() => void claimsQ.refetch()}
          />
        )}
      </main>
    </div>
  );
}

function WorkCard({ row, owner }: { row: RegisterRow; owner: { userId: string; name: string | null } | null }) {
  if (!row.work) return null;
  return (
    <div className="flex items-start gap-3 border border-kit-slate-5 bg-kit-amber-3 px-3 py-2" data-testid="po-object-work">
      <OwnerBadge userId={owner?.userId ?? null} name={owner?.name ?? null} />
      <div className="min-w-0">
        <div className="text-body font-semibold text-kit-slate-12">{row.work.problem}</div>
        <div className="text-meta text-kit-slate-11">{row.work.action}</div>
      </div>
    </div>
  );
}

function DocumentView({ row, owner, units, receiving, claims, destinations, unitLoading, receivingLoading, claimsLoading, unitError, receivingError, claimsError, onRetryUnits, onRetryReceiving, onRetryClaims, onSupplierDateSaved }: {
  row: RegisterRow;
  owner: { userId: string; name: string | null } | null;
  units: Array<{ unit_code: string; sku: string; status: string; po_line_id?: string | null }>;
  receiving: Array<{ id: string; do_number: string | null; status: string; goods_received_at: string; return_reason: string | null }>;
  claims: Array<{ id: string; claim_no: string; status: string; requested_action: string | null }>;
  destinations: Array<{ id: string; name: string }>;
  unitLoading: boolean;
  receivingLoading: boolean;
  claimsLoading: boolean;
  unitError: boolean;
  receivingError: boolean;
  claimsError: boolean;
  onRetryUnits: () => void;
  onRetryReceiving: () => void;
  onRetryClaims: () => void;
  onSupplierDateSaved: () => void;
}) {
  const po = row.po;
  /* 0442 — a Unit belongs to the LINE it was born for (`po_line_id`); a Unit
     born before the binding, on a PO with one line of its SKU, falls back to
     the SKU match, which is exact for that case. Retired (voided) Units of a
     reduced revision are not current IDs. */
  const unitsByLine = new Map<string, typeof units>();
  for (const unit of units) {
    if (unit.status === "voided") continue;
    const key = unit.po_line_id ?? `sku:${unit.sku}`;
    unitsByLine.set(key, [...(unitsByLine.get(key) ?? []), unit]);
  }
  const unitsOf = (line: { id: string; sku: string }) =>
    unitsByLine.get(line.id) ?? unitsByLine.get(`sku:${line.sku}`) ?? [];
  const returnRows = receiving.filter((receipt) => receipt.return_reason);
  /* Card 08 §3.5 — how many DISTINCT Manual Purchases feed this document.
     One: the bare label suffices everywhere. Several: each detailed source
     line adds its business facts so the reader can tell them apart. */
  const manualSourceCount = new Set(
    (po.sources ?? [])
      .filter((source) => source.kind === "manual_purchase")
      .map((source) => source.request_id ?? source.reference),
  ).size;
  return (
    /* ⭐ THE FACTS AND THE DOCUMENT, SIDE BY SIDE — AS TWO PANES (YH, 2026-09-03).
       The first cut put them in one grid inside a scrolling page and pinned the
       document with `sticky`: a bordered box holding an iframe holding the
       browser's PDF viewer, with its own grey chrome and its own scrollbar,
       jumping as the page scrolled under it. The Sales Order does not do that.
       Its facts and its document are two panes that each scroll on their own
       and the page does not; the document is sheets of paper on the canvas, no
       box, no caption strip. This is that shape, 50/50 at `lg`; below it the
       two stack, facts first, and the page scrolls normally.

       `min-w-0` on the facts pane is load-bearing. A flex item defaults to
       `min-width: auto`, so the Goods lines table's `min-w-[900px]` would size
       the PANE rather than scroll inside it, and the document would be
       squeezed to nothing. */
    <div className="flex h-full min-h-0 flex-col lg:flex-row" data-testid="po-document-panes">
      <div className="flex min-h-0 min-w-0 flex-col gap-3 p-3 sm:p-4 lg:w-1/2 lg:overflow-auto">
      <WorkCard row={row} owner={owner} />
      <Block title="Purchase order">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Supplier" value={row.supplierName} />
          <Fact label="Deliver To" value={row.deliverTo} />
          <Fact label="Source" value={sourceSummary(row.sources)} />
          <Fact label="PO Delivery Date" value={row.po.official_delivery_date ? fmtDate(row.po.official_delivery_date) : "Not recorded"} />
          {/* Same law as the register column: absence FIRST, then equality.
              `Same as PO` is a claim about what the supplier said. */}
          <Fact label="Supplier Delivery Date" value={!row.supplierDate ? "Not confirmed" : row.supplierDate === row.po.official_delivery_date ? "Same as PO" : fmtDate(row.supplierDate)} />
          {/* The CURRENT version and its sent mark, in the register's own words;
              earlier versions' marks stay in Revisions (MASTER §9.3). */}
          <Fact label="PO Version" value={`PO V${row.facts.version} · ${versionLine(row)}`} />
          <Fact label="Status" value={row.facts.operationStatus ?? row.facts.documentState} />
        </dl>
        <PoTermsBlock key={`${row.id}:terms:${row.po.terms_days ?? ""}`} poId={row.id} saved={row.po.terms_days ?? null} />
        <SupplierDateBlock key={`${row.id}:${row.facts.version}`} row={row} onSaved={onSupplierDateSaved} />
      </Block>
      <Block title="Goods lines">
        {/* Keep horizontal scrolling inside the card's padded content. */}
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-body">
            <thead className="h-9 border-y border-kit-slate-5 bg-kit-slate-3 text-left text-label uppercase tracking-wide text-kit-slate-11">
              <tr><th className="px-3 py-2.5 align-top text-left">SKU</th><th className="px-3 py-2.5 align-top text-left">Item</th><th className="px-3 py-2.5 align-top text-left">Unit ID</th><th className="px-3 py-2.5 align-top text-left">Source</th><th className="px-3 py-2.5 align-top text-left">Deliver To</th><th className="px-3 py-2.5 align-top text-left">Order Qty</th><th className="px-3 py-2.5 align-top text-left">Received Qty</th><th className="px-3 py-2.5 align-top text-left">Pending Delivery Qty</th></tr>
            </thead>
            <tbody>
              {po.purchase_order_lines.map((line) => (
                <tr key={line.id} className="h-[38px] border-b border-kit-slate-4">
                  <td className="px-3 py-2.5 align-top text-left whitespace-nowrap font-mono">{line.sku}</td>
                  <td className="px-3 py-2.5 align-top text-left">{[line.model_name, line.size].filter(Boolean).join(" · ") || line.sku}</td>
                  {/* The Units are the line's own rows: one permanent Unit ID
                      per physical piece, born with the official PO and bound
                      to this line (0442/0443). A quantity line has none by
                      law and prints `—`; an exact-unit line with none is an
                      integrity failure, never an ordinary empty state. They
                      used to sit in a card of their own at the bottom of the
                      page, cut off from the line (YH, 2026-09-04). */}
                  <td className="px-3 py-2.5 align-top text-left" data-testid={`po-line-units-${line.id}`}>{
                    unitLoading ? <span className="text-kit-slate-11">Loading…</span>
                    : unitError ? <button type="button" className="text-kit-blue-11 hover:underline" onClick={onRetryUnits}>Unit IDs could not be loaded. Try again</button>
                    : line.identity_mode === "quantity"
                      ? <Absence>—</Absence>
                    : unitsOf(line).length
                      ? <div className="flex max-w-[220px] flex-wrap gap-1">{unitsOf(line).map((unit) => <span key={unit.unit_code} className="whitespace-nowrap rounded border border-kit-slate-5 bg-kit-slate-3 px-1.5 py-0.5 font-mono text-meta text-base-700">{unit.unit_code}</span>)}</div>
                    : line.identity_mode === "exact_unit" && po.status !== "cancelled"
                      ? <span role="alert" className="text-kit-red-11" data-testid={`po-line-units-missing-${line.id}`}>Unit IDs missing on this line — do not send this PO</span>
                      : <Absence>No Unit ID</Absence>
                  }</td>
                  <td className="px-3 py-2.5 align-top text-left">{line.governed_sources?.length ? line.governed_sources.map((source) => {
                    /* Card 08 §3.5 — several Manual Purchases behind one
                       document stay apart by business facts, never by a
                       number: the purpose and Proceed Date join the label
                       exactly when the label alone is ambiguous. */
                    const label = source.kind === "manual_purchase" && manualSourceCount > 1
                      ? manualPurchaseSourceLine({
                          purposeLabel: source.purpose ? (demandPurposeLabelOf(source.purpose) ?? source.purpose) : null,
                          proceedDateLabel: source.proceed_date ? fmtDate(source.proceed_date) : null,
                        })
                      : source.reference;
                    return source.qty == null ? label : `${label} ×${source.qty}`;
                  }).join(" · ") : <Absence />}</td>
                  <td className="px-3 py-2.5 align-top text-left">{
                    line.destination_id
                      ? destinations.find((destination) => destination.id === line.destination_id)?.name ?? <Absence />
                      : row.deliverTo === "Not recorded" ? <Absence /> : row.deliverTo
                  }</td>
                  <td className="px-3 py-2.5 align-top text-left tabular-nums">{line.qty}</td>
                  <td className="px-3 py-2.5 align-top text-left tabular-nums">{line.received_qty}</td>
                  <td className="px-3 py-2.5 align-top text-left tabular-nums">{Math.max(0, line.qty - line.received_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
      {/* Two cards, each its own row across the pane (YH, 2026-09-04).
          Half-width cards left every receipt and claim wrapping. The Unit
          IDs card is gone: units live on their Goods line above. */}
      <div className="flex flex-col gap-3">
        <ConnectionBlock title="Receiving" empty="No receiving session is connected to this PO." hasContent={receiving.length > 0} loading={receivingLoading} problem={receivingError ? "The Receiving connection could not be loaded" : null} action="Try again. If it still fails, ask the system owner to check the receiving connection." onRetry={onRetryReceiving}>
          {receiving.map((receipt) => <ConnectionRow key={receipt.id} primary={receipt.do_number ?? "Supplier DO not recorded"} secondary={`${receipt.status} · ${fmtDate(receipt.goods_received_at)}`} />)}
          {receiving.length > 0 ? <Link className="mt-2 text-meta font-medium text-kit-blue-11 hover:underline" to={`/operation?tab=receiving&po=${encodeURIComponent(po.id)}`}>Open Receiving</Link> : null}
        </ConnectionBlock>
        <ConnectionBlock title="Claims and returns" empty="No claim or return is connected to this PO." hasContent={claims.length + returnRows.length > 0} loading={claimsLoading || receivingLoading} problem={claimsError || receivingError ? "The claims and returns connection could not be loaded" : null} action="Try again. If it still fails, ask the system owner to check the claim and receiving return connections." onRetry={() => { onRetryClaims(); onRetryReceiving(); }}>
          {claims.map((claim) => <ConnectionRow key={claim.id} primary={claim.claim_no} secondary={`${claim.status}${claim.requested_action === "return_for_inspection" ? ` · ${supplierClaimRequestLabel("return_for_inspection")}` : ""}`} />)}
          {returnRows.map((receipt) => <ConnectionRow key={`return-${receipt.id}`} primary="Receiving return" secondary={receipt.return_reason!} />)}
          {claims.length > 0 ? <Link className="mt-2 text-meta font-medium text-kit-blue-11 hover:underline" to={`/operation?tab=claims&po=${encodeURIComponent(po.id)}`}>Open Claims and Returns</Link> : null}
        </ConnectionBlock>
      </div>
      </div>
      {/* The document pane. Its own scroller, so the paper holds its place
          while the facts scroll beside it — the whole reason the two are side
          by side. */}
      <aside
        className="min-h-0 min-w-0 border-t border-kit-slate-5 p-3 sm:p-4 lg:w-1/2 lg:border-l lg:border-t-0 lg:overflow-auto"
        aria-label="Purchase order document"
        data-testid="po-document-column"
      >
        {/* A cancelled purchase order has no official document to preview —
            0402 refuses to print one by design. Saying so beats mounting a frame
            that can only fill with an error strip. */}
        {row.po.status === "cancelled" ? (
          <section className="border border-kit-slate-5 bg-white px-3 py-2" data-testid="po-cancelled-no-document">
            <div className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">Official document</div>
            <div className="mt-1 text-body text-kit-slate-11">A cancelled purchase order has no official document.</div>
          </section>
        ) : (
          <OfficialPreview poId={po.id} />
        )}
      </aside>
    </div>
  );
}

/**
 * THE DATE THE FACTORY GAVE YOU ON THE PHONE (YH, 2026-09-01, defect 5).
 *
 * The register counted this work in TWO rail rows and named it in TWO Work
 * sentences - "Ask {supplier} for the delivery date" - and there was nowhere on
 * the live surface to record the answer. The only writer,
 * `useRecordSupplierDate`, was called from exactly one place: a form inside the
 * retired legacy tree that no route mounts, sitting BELOW that file's live
 * re-export, so it was dead code that made the door look wired.
 *
 * The buyer phoned the factory, got the date, and had nowhere to put it. The
 * count never fell, and the register's most urgent-looking numbers became
 * wallpaper. The RPC, the route and the hook all existed and were tested; only
 * this was missing.
 *
 * A supplier can confirm the original PO date or give a different date with a
 * reason. Both answers require evidence tied to the exact sent version.
 */
/** 0530 — the PO's own payment terms. They win over the supplier's when a
 *  bill's due date is filled in. Empty = not set; nothing waits on it. */
function PoTermsBlock({ poId, saved }: { poId: string; saved: number | null }) {
  const [draft, setDraft] = useState(saved == null ? "" : String(saved));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSetPoTermsDays(poId);
  const n = draft.trim() === "" ? null : Number(draft);
  const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 365);
  const dirty = valid && n !== saved;
  return (
    <div className="mt-4 flex items-end gap-2 border-t border-kit-slate-4 pt-3" data-testid="po-terms">
      <div className="w-40">
        <Input
          id={`po-terms-days-${poId}`}
          label="Terms (days)"
          type="number"
          min={0}
          max={365}
          step={1}
          value={draft}
          hint="Blank uses the supplier's terms"
          error={valid ? undefined : "0 to 365"}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      <button
        type="button"
        disabled={!dirty || save.isPending}
        onClick={() => {
          setProblem(null);
          save.mutate(n, {
            onError: (e: unknown) => {
              const body = (e as { body?: { message?: string } }).body;
              setProblem(body?.message ?? "The terms could not be saved");
            },
          });
        }}
        data-testid="po-terms-save"
        className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-5 disabled:text-kit-slate-9"
      >
        {save.isPending ? "Saving..." : "Save"}
      </button>
      {problem ? <div className="text-meta text-kit-red-11">{problem}</div> : null}
    </div>
  );
}

function SupplierDateBlock({ row, onSaved }: { row: RegisterRow; onSaved: () => void }) {
  const [date, setDate] = useState("");
  /* 0430 — NO pre-selected delay reason. "Production Delay" used to ship on
     every distracted save; a delay now requires the operator to choose. */
  const [reason, setReason] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "email" | "phone" | "in_person">("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [reportedAt, setReportedAt] = useState("");
  const record = useRecordSupplierDate(row.id);

  const canRecord = !!row.facts.currentSend && row.facts.quantities.open > 0 && row.facts.operationStatus !== "Cancelled";
  const known = row.supplierDate;
  const savedReply = poSupplierReplyOf(row.po.promises, row.facts.version);
  /* A reply recorded before the evidence law is a fact, not an absence. */
  const recordedReply = poRecordedReplyOf(row.po.promises, row.facts.version);
  const allReplies = [...(row.po.promises ?? [])]
    .filter((p) => p.kind === "tomorrow_delivery" && poReplyDateOf(p))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  /* The block appears whenever there is anything to RECORD or anything to
     READ. A revision must never hide the previous versions' replies: an
     unsent V2 still shows V1's answers and evidence as history (item 3 —
     replies stay readable by version). */
  if (!row.facts.currentSend && allReplies.length === 0) return null;
  /* The server owns the classification. These mirrors only decide which
     fields the form shows: a LATER date asks why, nothing else does. */
  const official = row.po.official_delivery_date;
  const later = date !== "" && official != null && date > official;
  const earlier = date !== "" && official != null && date < official;
  const replyInput = recordSupplierReplyInput.safeParse({
    poVersion: row.facts.version,
    supplierDate: date,
    ...(later && reason ? { reason } : {}),
    remarks: remarks.trim() || undefined,
    channel, recipient, evidence, reportedBy,
    reportedAt: reportedAt && Number.isFinite(Date.parse(reportedAt)) ? new Date(reportedAt).toISOString() : "",
  });
  const ready = date !== "" && (!later || reason !== "") && replyInput.success && !record.isPending;

  function save() {
    if (!ready) return;
    setProblem(null);
    if (!replyInput.success) return;
    const input = replyInput.data;
    record.mutate(input, {
      onSuccess: () => {
        setDate("");
        setRemarks("");
        setEvidence("");
        setReportedAt("");
        onSaved();
      },
      onError: (e: unknown) => {
        const body = (e as { body?: { message?: string } }).body;
        setProblem(body?.message ?? "The supplier date could not be recorded");
      },
    });
  }

  return (
    <div className="mt-4 border-t border-kit-slate-4 pt-3" data-testid="po-supplier-date">
      <div className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">
        SUPPLIER REPLY
      </div>
      <p className="mt-1 text-meta text-kit-slate-11">
        {known
          ? `Supplier Delivery Date · ${fmtDate(known)}`
          : recordedReply
            ? `Supplier reply recorded without evidence · ${fmtDate(poReplyDateOf(recordedReply)!)}`
            : "Supplier has not confirmed the PO date"}
      </p>
      {savedReply ? (
        <div className="mt-2 text-meta text-kit-slate-11">
          <p>{savedReply.channel} · {savedReply.recipient} · Reported by {savedReply.reported_by} · {fmtDate(savedReply.reported_at!, { time: true })}</p>
          <p>Recorded by {savedReply.recorded_by_name ?? "Not recorded"} · {fmtDate(savedReply.recorded_at, { time: true })}{savedReply.duty_name ? ` · PO Duty ${savedReply.duty_name}` : ""}{savedReply.acting_name ? ` · Covered by ${savedReply.acting_name}` : ""}</p>
          <button type="button" className="text-kit-blue-11 underline" onClick={async () => {
            const { data, error } = await supabase.storage.from("delivery-orders").createSignedUrl(savedReply.evidence!, 3600);
            if (error || !data?.signedUrl) { setProblem("The reply evidence could not be opened"); return; }
            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
          }}>Reply evidence</button>
        </div>
      ) : null}
      {/* 0430 — every reply stays readable, BY VERSION. A previous version's
          answer never confirms the current one (`poSupplierReplyOf` gates
          that); here it is history the operator can still open and check. */}
      {allReplies.length > 0 ? (
        <div className="mt-2" data-testid="po-supplier-reply-history">
          <div className="text-label text-kit-slate-11">Reply history</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {allReplies.map((p) => (
              <li key={`${p.recorded_at}:${p.new_date ?? p.about_date}`} className="text-meta text-kit-slate-11">
                {p.po_version != null ? `PO V${p.po_version}` : "PO version not recorded"}
                {" · "}{fmtDate(poReplyDateOf(p)!)}
                {" · "}{replyAnswerWord(p.answer, p.reason)}
                {p.evidence?.trim() ? (
                  <>
                    {" · "}
                    <button type="button" className="text-kit-blue-11 underline" onClick={async () => {
                      const { data, error } = await supabase.storage.from("delivery-orders").createSignedUrl(p.evidence!, 3600);
                      if (error || !data?.signedUrl) { setProblem("The reply evidence could not be opened"); return; }
                      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                    }}>Reply evidence</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canRecord ? <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Supplier Delivery Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="po-supplier-date-input"
            className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta"
          />
        </label>
        {date !== "" && official != null ? (
          <span className="pb-2 text-meta text-kit-slate-11" data-testid="po-supplier-date-compare">
            {later ? "Later than the PO date" : earlier ? "Earlier than the PO date" : "Same as PO"}
          </span>
        ) : null}
        {later ? (
          <label className="flex flex-col gap-1">
            {/* A LOCKED CATEGORY, never free text (Jess, 2026-08-02) - the
                ledger has to be countable. The story goes in Remarks.
                0430 — only a LATER date asks why, and nothing is pre-chosen:
                an earlier or matching date is not a delay and gets no delay
                reason, silently or otherwise. */}
            <span className="text-label text-kit-slate-11">Why has it moved?</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="po-supplier-date-reason"
              className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta"
            >
              <option value="">Choose a reason</option>
              {PO_DELAY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-label text-kit-slate-11">Remarks</span>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            data-testid="po-supplier-date-remarks"
            placeholder="What the factory actually said (optional)"
            className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Channel</span>
          <select value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta">
            <option value="whatsapp">WhatsApp</option><option value="email">Email</option>
            <option value="phone">Phone</option><option value="in_person">In person</option>
          </select>
        </label>
        {([
          ["Recipient", recipient, setRecipient],
          ["Reported by", reportedBy, setReportedBy],
        ] as const).map(([label, value, setValue]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-label text-kit-slate-11">{label}</span>
            <input value={value} onChange={e => setValue(e.target.value)} required className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta" />
          </label>
        ))}
        <ClaimPhotoUploadField poId={row.id} doNumber={`PO-V${row.facts.version}-reply`}
          paths={evidence ? [evidence] : []} onChange={paths => setEvidence(paths[paths.length - 1] ?? "")}
          label="Reply evidence" testId="po-supplier-reply-evidence" />
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-11">Reported at</span>
          <input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)} required className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta" />
        </label>
        <button
          type="button"
          disabled={!ready}
          onClick={save}
          data-testid="po-supplier-date-save"
          className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-5 disabled:text-kit-slate-11"
        >
          {record.isPending ? "Recording..." : "Record supplier answer"}
        </button>
      </div> : null}
      {problem ? (
        <div className="mt-2 text-meta text-kit-red-11" data-testid="po-supplier-date-problem">{problem}</div>
      ) : null}
    </div>
  );
}

/** The reply vocabulary, one place: legacy `shipping` reads as a confirmation,
 *  0430's answers read as themselves, and a delay names its recorded reason. */
function replyAnswerWord(answer: string, reason: string | null | undefined): string {
  switch (answer) {
    case "confirmed":
    case "shipping":
      return "Confirms the PO date";
    case "earlier":
      return "Earlier than the PO date";
    case "delayed":
      return `Delayed — ${reason ?? "Not recorded"}`;
    default:
      return "Date reported";
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-label text-kit-slate-11">{label}</dt><dd className="mt-0.5 text-body font-medium text-kit-slate-12">{value === "Not recorded" ? <Absence /> : value}</dd></div>;
}

function ConnectionBlock({ title, empty, children, hasContent, loading, problem, action, onRetry }: { title: string; empty: string; children: React.ReactNode; hasContent: boolean; loading?: boolean; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <Block title={title}><div className="flex flex-col gap-2">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : loading ? <Absence>Loading…</Absence> : hasContent ? children : <Absence>{empty}</Absence>}</div></Block>;
}

function ConnectionRow({ primary, secondary }: { primary: string; secondary: string }) {
  return <div><div className="text-body font-medium text-kit-slate-12">{primary}</div><div className="text-meta text-kit-slate-11">{secondary}</div></div>;
}

function RecordList({ title, empty, rows, problem, action, onRetry }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; detail?: string; action?: React.ReactNode }>; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <section className="mx-auto max-w-[980px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">{title}</h2><div className="mt-3 divide-y divide-kit-slate-4">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : rows.length ? rows.map((row) => <article key={row.id} className="py-3"><div className="text-body font-semibold text-kit-slate-12">{row.title}</div><div className="mt-0.5 text-meta text-kit-slate-11">{row.meta}</div>{row.detail ? <div className="mt-1 text-body text-kit-slate-11">{row.detail}</div> : null}{row.action ? <div className="mt-1">{row.action}</div> : null}</article>) : <Absence>{empty}</Absence>}</div></section>;
}

function ReadProblem({ problem, action, onRetry }: { problem: string; action: string; onRetry?: () => void }) {
  return <div className="bg-kit-red-3 px-3 py-2"><div className="text-meta font-semibold text-kit-red-11">{problem}</div><div className="text-meta text-kit-slate-11">{action}</div>{onRetry ? <button type="button" className="mt-2 h-7 rounded-control border border-kit-red-9 bg-white px-2 text-meta font-medium text-kit-red-11" onClick={onRetry}>Try again</button> : null}</div>;
}

function OrderRoute({ row, receiving, claims, receivingLoading, claimsLoading, receivingError, claimsError, onRetryReceiving, onRetryClaims }: {
  row: RegisterRow;
  receiving: Array<{ id: string; do_number: string | null; status: string; return_reason: string | null }>;
  claims: Array<{ id: string; claim_no: string; status: string }>;
  receivingLoading: boolean;
  claimsLoading: boolean;
  receivingError: boolean;
  claimsError: boolean;
  onRetryReceiving: () => void;
  onRetryClaims: () => void;
}) {
  const returnRows = receiving.filter((receipt) => receipt.return_reason);
  const problemCount = claims.length + returnRows.length;
  const problemLoading = claimsLoading || receivingLoading;
  const problemError = claimsError || receivingError;
  return <section className="mx-auto max-w-[1100px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-11">Order Route</h2><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"><RouteNode title="Source" main={sourceSummary(row.sources)} detail={row.sources.length === 0 ? "No governed source is recorded" : ""}>{row.sources.map((source) => { const href = sourceHref(source); return href ? <Link key={source.reference} to={href} className="block font-mono text-meta text-kit-blue-11 underline-offset-2 hover:underline">{source.reference}</Link> : <span key={source.reference} className="block font-mono text-meta text-kit-slate-11">{source.reference}</span>; })}</RouteNode><RouteNode title="Purchase Order" main={row.id} detail={`PO V${row.facts.version} · ${row.facts.documentState}`} />{receivingError ? <RouteProblem title="Receiving" problem="The Receiving connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the receiving connection." onRetry={onRetryReceiving} /> : <RouteNode title="Receiving" main={receivingLoading ? "Loading…" : receiving.length ? `${receiving.length} connected` : "None recorded"} detail={receivingLoading ? "Checking the receiving record" : receiving.map((receipt) => receipt.do_number ?? receipt.status).join(" · ") || "Receiving owns this fact"} />}{problemError ? <RouteProblem title="Claims and returns" problem="The claims and returns connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the claim and receiving return connections." onRetry={() => { onRetryClaims(); onRetryReceiving(); }} /> : <RouteNode title="Claims and returns" main={problemLoading ? "Loading…" : problemCount ? `${problemCount} connected` : "None recorded"} detail={problemLoading ? "Checking the claim and receiving return records" : [...claims.map((claim) => claim.claim_no), ...returnRows.map(() => "Receiving return")].join(" · ") || "No connected problem record"} />}</div></section>;
}

/** `children` — where a node's facts are individually REACHABLE rather than
 *  summarised: the Source node names every SO and MPR behind this PO, each
 *  one a door (MASTER §9.3, "individually reachable"). */
function RouteNode({ title, main, detail, children }: { title: string; main: string; detail: string; children?: ReactNode }) {
  return <div className="border-l-2 border-kit-blue-9 bg-kit-slate-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-11">{title}</div><div className="mt-1 text-body font-semibold text-kit-slate-12">{main}</div>{detail ? <div className="mt-1 text-meta text-kit-slate-11">{detail}</div> : null}{children ? <div className="mt-1 space-y-0.5">{children}</div> : null}</div>;
}

function RouteProblem({ title, problem, action, onRetry }: { title: string; problem: string; action: string; onRetry: () => void }) {
  return <div className="border-l-2 border-kit-red-9 bg-kit-red-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-11">{title}</div><ReadProblem problem={problem} action={action} onRetry={onRetry} /></div>;
}

function OfficialPreview({ poId }: { poId: string }) {
  /* The same blob `Download PDF` saves, painted as pages. The header already
     names the PO, so the paper carries no caption strip of its own. */
  const [refusal, setRefusal] = useState<{ wrong: string; todo: string } | null>(null);
  const render = useCallback(async () => {
    setRefusal(null);
    try {
      const data = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);
      return await renderPoPdf(data);
    } catch (error) {
      const body = (error as { body?: { message?: string; action?: string; code?: string } } | null)?.body;
      if (body?.message || body?.code) {
        const fallback = purchasingRefusal(body.code, { po: poId });
        setRefusal({ wrong: body.message ?? fallback.wrong, todo: body.action ?? fallback.todo });
      }
      throw error;
    }
  }, [poId]);
  const { pdfError, setPane, retry } = usePdfCanvases(poId, render);
  return (
    <div className="mx-auto w-full max-w-[700px]">
      {pdfError ? (
        <div className="mb-3">
          <ReadProblem problem={refusal?.wrong ?? "The official PDF could not be opened"} action={refusal?.todo ?? "Try again. If it still fails, ask the system owner to check the PO document."} onRetry={retry} />
        </div>
      ) : null}
      <div ref={setPane} data-testid="pdf-pane" aria-label="Official purchase order preview" />
    </div>
  );
}

function RevisionForm({
  po,
  destinations,
  activeDestinations,
  onSaved,
  onCancel,
}: {
  po: operationPoListRow;
  destinations: Array<{ id: string; name: string }>;
  activeDestinations: Array<{ id: string; name: string }>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const save = useRevisePo(po.id);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => Object.fromEntries(po.purchase_order_lines.map((line) => [line.id, String(line.qty)])));
  const [destinationDraft, setDestinationDraft] = useState(() => Object.fromEntries(
    po.purchase_order_lines.map((line) => [line.id, line.destination_id ?? po.destination_id ?? ""]),
  ));
  const changes = po.purchase_order_lines.flatMap((line) => {
    const value = draft[line.id];
    if (value == null) return [];
    const qty = Number(value);
    const currentDestinationId = line.destination_id ?? po.destination_id ?? "";
    const nextDestinationId = destinationDraft[line.id] ?? currentDestinationId;
    if (qty === line.qty && nextDestinationId === currentDestinationId) return [];
    return [{
      lineId: line.id,
      qty,
      destinationId: nextDestinationId === (po.destination_id ?? "") ? null : nextDestinationId || null,
    }];
  });
  const invalidNumber = po.purchase_order_lines.some((line) => !Number.isInteger(Number(draft[line.id])));
  const belowMinimum = po.purchase_order_lines.some((line) => Number(draft[line.id]) < 1);
  const belowReceived = po.purchase_order_lines.some((line) => Number(draft[line.id]) < line.received_qty);
  const gap = invalidNumber ? "A quantity is not a whole number" : belowMinimum ? "A quantity is below one" : belowReceived ? "A quantity is below goods already received" : !changes.length ? "No change is entered" : !reason.trim() ? "The revision reason is missing" : null;
  const action = invalidNumber ? "Enter a whole number for every quantity." : belowMinimum ? "Enter at least one for every quantity." : belowReceived ? "Enter a quantity equal to or above received." : !changes.length ? "Change a quantity or Deliver To." : !reason.trim() ? "Say why this purchase order is changing." : null;
  return <div><div className="space-y-3">{po.purchase_order_lines.map((line) => {
    const value = draft[line.id] ?? String(line.qty);
    const currentDestinationId = line.destination_id ?? po.destination_id ?? "";
    const currentDestination = destinations.find((destination) => destination.id === currentDestinationId) ?? null;
    const pickerDestinations = activeDestinations.some((destination) => destination.id === currentDestinationId) || !currentDestination
      ? activeDestinations
      : [currentDestination, ...activeDestinations];
    return <div key={line.id} className="grid grid-cols-1 gap-2 border-b border-kit-slate-4 pb-3 sm:grid-cols-[minmax(0,1fr)_88px_minmax(150px,0.8fr)]"><div><div className="text-body font-semibold">{line.model_name ?? line.sku}</div><div className="text-meta text-kit-slate-11">{line.sku} · {line.received_qty} received</div></div><label className="text-meta text-kit-slate-11">Qty<input aria-label={`Qty for ${line.sku}`} type="number" min={Math.max(1, line.received_qty)} value={value} className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 px-2 text-right" onChange={(event) => setDraft((current) => ({ ...current, [line.id]: event.target.value }))} /></label><label className="text-meta text-kit-slate-11">Deliver To<select aria-label={`Deliver To for ${line.sku}`} value={destinationDraft[line.id] ?? currentDestinationId} className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2" onChange={(event) => setDestinationDraft((current) => ({ ...current, [line.id]: event.target.value }))}>{currentDestinationId ? null : <option value="" disabled>Not recorded</option>}{pickerDestinations.map((destination) => { const closed = !activeDestinations.some((active) => active.id === destination.id); return <option key={destination.id} value={destination.id} disabled={closed}>{destination.name}{closed ? " (closed)" : ""}</option>; })}</select></label></div>;
  })}</div><label className="mt-4 block text-meta text-kit-slate-11">Why<input className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 px-2" value={reason} onChange={(event) => setReason(event.target.value)} /></label>{gap ? <div className="mt-3"><div className="text-meta text-kit-red-11">{gap}</div><div className="text-meta text-kit-slate-11">{action}</div></div> : null}{error ? <div className="mt-3"><div className="text-meta text-kit-red-11">The revision could not be saved</div><div className="text-meta text-kit-slate-11">{error}</div></div> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" className="h-8 rounded-control border border-kit-slate-5 px-3 text-meta" onClick={onCancel}>Cancel</button><button type="button" disabled={!!gap || save.isPending} className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-6" onClick={() => { if (gap) return; setError(null); save.mutate({ reason: reason.trim(), lines: changes }, { onSuccess: onSaved, onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) }); }}>{save.isPending ? "Saving…" : `Save PO V${(po.version ?? 1) + 1}`}</button></div></div>;
}
