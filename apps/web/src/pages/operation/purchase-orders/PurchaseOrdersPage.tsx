// design-standard: not-a-list-page — this page uses the approved full-bleed
// Register engine (components/register/DataGrid), which already owns search,
// filters, columns, export and footer. ListPageShell would add a second set of
// list chrome around the same register, contrary to the Sales Orders template.
import { useCallback, useMemo, useState } from "react";
import "./purchase-order-detail.css";
import { ArrowLeft, Download, FileCheck2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  demandPurposeLabelOf,
  manualPurchaseSourceLine,
  manualPurchaseSourceSummary,
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
import { Link, useSearchParams } from "react-router-dom";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import { apiFetch } from "@/lib/api";
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
  useRevisePo,
  useWorkspaceDuties,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { workspaceDutyActor } from "../workspace-duty-owner";
import PurchasingTabs from "../PurchasingTabs";
import PoIssueEvidence, { CHANNEL_WORD, doorsForIssuedPo } from "../components/PoIssueEvidence";

// Card 07 (owner correction 2026-08-31): the rail explains the business
// dimension, never the UI mechanism — grouped rows, no visible `Filters`
// heading. `action` renders a deliberate second line (fact, then the act),
// not a wrapped sentence; the row stays ONE button with ONE count on the
// same `supplier_update_required` key.
type RailRow = { key: PurchaseOrderRegisterFilter; label: string; action?: string };

const RAIL_GROUPS: Array<{ heading: string; rows: RailRow[] }> = [
  {
    heading: "DOCUMENT",
    rows: [
      { key: "pdf_not_sent", label: "PDF not sent" },
      {
        key: "supplier_update_required",
        label: "Version changed",
        action: "Send the new version to supplier",
      },
    ],
  },
  {
    heading: "SUPPLIER REPLY",
    rows: [
      { key: "supplier_date_missing", label: "Supplier has not confirmed the PO date" },
      { key: "supplier_date_passed", label: "Supplier delivery date passed" },
    ],
  },
  {
    heading: "RECEIVING",
    rows: [
      { key: "partly_received", label: "Partly received" },
      { key: "completed", label: "Completed" },
    ],
  },
  /* A cancelled purchase order is kept, never deleted — so there must be a way
     to look at one. Until 2026-09-01 the only door was the `PO Issued` funnel,
     which offered document states on a column of timestamps (defect 27). The
     funnel is a date filter now, so the state gets a row of its own. */
  {
    heading: "DOCUMENT STATE",
    rows: [{ key: "cancelled", label: "Cancelled" }],
  },
];

const RAIL_ROWS: RailRow[] = RAIL_GROUPS.flatMap((group) => group.rows);

type RegisterRow = {
  id: string;
  po: operationPoListRow;
  supplier: SupplierRow | null;
  supplierName: string;
  source: string;
  sourceSearch: string;
  deliverTo: string;
  supplierDate: string | null;
  input: PurchaseOrderRegisterInput;
  facts: PurchaseOrderRegisterFacts;
  work: ReturnType<typeof purchaseOrderWork>;
};

function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

function sourceText(po: operationPoListRow): { display: string; search: string } {
  const sources = po.sources ?? [];
  if (sources.length === 0) return { display: "Not recorded", search: "Not recorded" };
  /* Card 08 §3.5 — SO sources keep their real numbers; Manual Purchase
     sources have no number: one prints `Manual Purchase`, several print
     `{n} Manual Purchases`, counted by DISTINCT source request UUIDs. */
  const soRefs = sources
    .filter((source) => source.kind !== "manual_purchase")
    .map((source) => source.reference);
  const manualCount = new Set(
    sources
      .filter((source) => source.kind === "manual_purchase")
      .map((source) => source.request_id ?? source.reference),
  ).size;
  const manualLabel = manualPurchaseSourceSummary(manualCount);
  const refs = [...soRefs, ...(manualLabel ? [manualLabel] : [])];
  if (refs.length === 0) return { display: "Not recorded", search: "Not recorded" };
  return {
    display: refs.length === 1 ? refs[0]! : `${refs[0]} +${refs.length - 1}`,
    search: refs.join(" "),
  };
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
    expectedReadyDate: po.expected_ready_date ?? null,
    lines: po.purchase_order_lines.map((line) => ({
      qty: line.qty,
      receivedQty: line.received_qty,
    })),
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
  const initials = name
    ? name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
    : "PO";
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
  return <span className="text-kit-slate-9">{children}</span>;
}

export default function PurchaseOrdersPage() {
  const posQ = useOperationPos({ status: "all" });
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const dutyQ = useWorkspaceDuties();
  const poDutyActor = workspaceDutyActor(dutyQ.data, "po_duty");
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<PurchaseOrderRegisterFilter | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [pdfProblem, setPdfProblem] = useState<string | null>(null);
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
      const source = sourceText(po);
      return {
        id: po.id,
        po,
        supplier,
        supplierName,
        source: source.display,
        sourceSearch: source.search,
        deliverTo: destinationName(po),
        supplierDate: supplierDateOf(po),
        input,
        facts,
        work: purchaseOrderWork(input, facts),
      };
    });
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
      <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
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
      <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <PurchasingTabs />
        <div className="m-4 text-body text-kit-slate-9">Loading purchase orders…</div>
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
      <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
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

  const visibleRows = filter
    ? allRows.filter((row) => row.facts.filters.includes(filter))
    : allRows;
  const counts = new Map(
    RAIL_ROWS.map(({ key }) => [key, allRows.filter((row) => row.facts.filters.includes(key)).length]),
  );
  const openObject = (row: RegisterRow) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("po", row.id);
      return next;
    });
  };

  const columns: Array<DataGridColumn<RegisterRow>> = [
    {
      /* ⛔ EVERY COLUMN NAMES ITS GROUP (YH, 2026-09-01, defect 39).
         `chooserGroupOrder` asked the grid for five business groups while NO
         column declared a `chooserGroup`, so the grid short-circuited to a flat
         list: the Columns popover showed 13 ungrouped checkboxes, and the next
         reader believed the grouping shipped. A prop that orders nothing is
         worse than no prop. */
      key: "po",
      chooserGroup: "Document",
      label: "PO No",
      width: 182,
      sortable: true,
      accessor: (row) => (
        <button
          type="button"
          className="font-mono font-semibold text-kit-blue-11 hover:underline"
          onClick={(event) => { event.stopPropagation(); openObject(row); }}
        >
          {row.id}
        </button>
      ),
      searchValue: (row) => row.id,
      filterValue: (row) => row.id,
    },
    {
      key: "issued",
      chooserGroup: "Document",
      label: "PO Issued",
      width: 174,
      sortable: true,
      accessor: (row) => row.facts.currentSend
        ? fmtDate(row.facts.currentSend.sentAt, { time: true })
        : <Absence>Not sent</Absence>,
      /* ⭐ ONE COLUMN, ONE FACT (defect 27). The funnel used to offer Issued /
         Not sent to supplier / Completed / Cancelled — words that appear
         NOWHERE in the column being filtered, on a column of timestamps. So an
         operator could not narrow the register to POs issued this month, which
         is the commonest thing anyone asks of an issue date.

         The state words stay in SEARCH, where they cost nothing and someone
         typing "cancelled" still finds what they meant; the FUNNEL is a date
         filter, matching what the column actually shows. The states that were
         only reachable through the old funnel now have the rail's own
         `Cancelled` row and `PDF not sent` / `Completed` above it. */
      searchValue: (row) => row.facts.documentState,
      filterValue: (row) =>
        row.facts.currentSend ? row.facts.currentSend.sentAt : "Not sent",
      dateValue: (row) => row.facts.currentSend?.sentAt ?? null,
      filterType: "date",
      sortFn: (a, b) =>
        (a.facts.currentSend?.sentAt ?? "").localeCompare(b.facts.currentSend?.sentAt ?? ""),
    },
    {
      key: "supplier",
      chooserGroup: "Supplier",
      label: "Supplier",
      width: 150,
      sortable: true,
      accessor: (row) => row.supplierName,
      searchValue: (row) => row.supplierName,
      filterValue: (row) => row.supplierName,
    },
    {
      key: "source",
      chooserGroup: "Supplier",
      label: "Source",
      width: 164,
      sortable: true,
      accessor: (row) => row.source === "Not recorded" ? <Absence /> : row.source,
      searchValue: (row) => row.sourceSearch,
      filterValue: (row) => row.source,
    },
    {
      key: "deliver_to",
      chooserGroup: "Receiving",
      label: "Deliver To",
      width: 160,
      sortable: true,
      accessor: (row) => row.deliverTo === "Not recorded" ? <Absence /> : row.deliverTo,
      searchValue: (row) => row.deliverTo,
      filterValue: (row) => row.deliverTo,
    },
    {
      key: "po_delivery_date",
      chooserGroup: "Goods",
      label: "PO Delivery Date",
      width: 150,
      sortable: true,
      accessor: (row) => row.po.official_delivery_date ? fmtDate(row.po.official_delivery_date) : <Absence />,
      searchValue: (row) => row.po.official_delivery_date ?? "Not recorded",
      filterValue: (row) => row.po.official_delivery_date ?? "Not recorded",
      dateValue: (row) => row.po.official_delivery_date,
      filterType: "date",
      /* ⛔ A DATE COLUMN SORTS BY DATE (defect 26). Without this the grid falls
         back to comparing the RENDERED text — and these render as "Wed, 12
         Aug", so the register sorted alphabetically by WEEKDAY NAME: every
         "Fri, …" together, then "Mon, …", then "Sat, …". "Which POs land
         first" is the register's main question, and the header that promises
         to answer it produced a meaningless order that still looked plausible,
         because dates do increase inside each weekday block. ISO, so the
         string comparison IS the chronological one. */
      sortFn: (a, b) => (a.po.official_delivery_date ?? "").localeCompare(b.po.official_delivery_date ?? ""),
    },
    {
      key: "supplier_delivery_date",
      chooserGroup: "Goods",
      label: "Supplier Delivery Date",
      width: 166,
      sortable: true,
      /* ⛔ NO PROMISE ON FILE IS NOT A CONFIRMED DATE (YH, 2026-09-01).
         The test was `!row.supplierDate || row.supplierDate === row.po.official_delivery_date`,
         and the first half turned "the supplier has said nothing" into "the
         supplier confirmed our date" — asserted on the same row whose Work
         column says the date is MISSING. A buyer skips the chase call; a
         manager reads a factory promise that does not exist. It also broke the
         column's own date filter, because the shown value had no date behind
         it. Absence first, THEN the equality. */
      accessor: (row) =>
        !row.supplierDate
          ? <Absence>Not confirmed</Absence>
          : row.supplierDate === row.po.official_delivery_date
            ? "Same as PO"
            : fmtDate(row.supplierDate),
      searchValue: (row) =>
        !row.supplierDate
          ? "Not confirmed"
          : row.supplierDate === row.po.official_delivery_date
            ? "Same as PO"
            : row.supplierDate,
      filterValue: (row) =>
        !row.supplierDate
          ? "Not confirmed"
          : row.supplierDate === row.po.official_delivery_date
            ? "Same as PO"
            : row.supplierDate,
      /* The real date, always — a row that prints `Same as PO` still HAS one,
         and hiding it from the filter made the column's own funnel lie too. */
      dateValue: (row) => row.supplierDate,
      filterType: "date",
      sortFn: (a, b) => (a.supplierDate ?? "").localeCompare(b.supplierDate ?? ""),
    },
    /* The quantity words are the plain receiving facts an inexperienced reader
       can act on: `Order Qty` is what the current PO says, `Received Qty` is
       what Receiving posted as correct and accepted, `Pending Delivery Qty` is
       their difference — pieces of goods, never money. `Open Balance` read as
       an amount owed and is retired. */
    ...(["ordered", "received", "open"] as const).map((key): DataGridColumn<RegisterRow> => ({
      key,
      label: key === "open" ? "Pending Delivery Qty" : key === "received" ? "Received Qty" : "Order Qty",
      width: key === "open" ? 152 : 110,
      align: "right",
      sortable: true,
      chooserGroup: "Goods",
      accessor: (row) => row.facts.quantities[key],
      searchValue: (row) => String(row.facts.quantities[key]),
      filterValue: (row) => String(row.facts.quantities[key]),
      numberValue: (row) => row.facts.quantities[key],
      filterType: "number",
      footerTotal: (rows) => rows.reduce((sum, row) => sum + row.facts.quantities[key], 0),
    })),
    {
      key: "current_version",
      chooserGroup: "Document",
      label: "PO Version",
      width: 138,
      sortable: true,
      /* `PO V{n}` is the current OFFICIAL document version — never the
         WhatsApp or email copy. The quieter second line is the document's
         state, a fact, never an instruction. */
      accessor: (row) => (
        <span className="flex flex-col leading-4">
          <span>PO V{row.facts.version}</span>
          <span className="text-[11px] text-kit-slate-9">
            {row.facts.operationStatus ?? row.facts.documentState}
          </span>
        </span>
      ),
      searchValue: (row) => `PO V${row.facts.version} ${row.facts.operationStatus ?? row.facts.documentState}`,
      filterValue: (row) => `PO V${row.facts.version}`,
    },
    {
      key: "supplier_has",
      chooserGroup: "Document",
      label: "Sent to Supplier",
      width: 148,
      sortable: true,
      /* The latest PO version with confirmed-send evidence, beside the current
         PO Version so a mismatch (`PO V2` vs `PO V1`) is visible at a glance.
         The second line is the evidence — channel and date — never an
         instruction. Only `confirmed_sent` counts: opening or downloading the
         PDF proves nothing, and a legacy PO without a send record stays
         honestly `Not sent`. */
      accessor: (row) => row.facts.latestConfirmedSend ? (
        <span className="flex flex-col leading-4">
          <span>{row.facts.sentToSupplier}</span>
          <span className="text-[11px] text-kit-slate-9">
            {CHANNEL_WORD[row.facts.latestConfirmedSend.channel] ?? row.facts.latestConfirmedSend.channel}
            {" · "}
            {fmtDate(row.facts.latestConfirmedSend.sentAt)}
          </span>
        </span>
      ) : <Absence>Not sent</Absence>,
      searchValue: (row) => row.facts.latestConfirmedSend
        ? `${row.facts.sentToSupplier} ${CHANNEL_WORD[row.facts.latestConfirmedSend.channel] ?? row.facts.latestConfirmedSend.channel}`
        : "Not sent",
      filterValue: (row) => row.facts.sentToSupplier,
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
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="purchase-orders-register">
      <PurchasingTabs />
      <div className="relative flex min-h-0 flex-1 p-2">
        <aside
          className={[
            "w-[240px] shrink-0 overflow-y-auto border border-r-0 border-kit-slate-5 bg-white p-3",
            "max-md:absolute max-md:inset-y-2 max-md:left-2 max-md:z-30 max-md:shadow-lg",
            railOpen ? "max-md:block" : "max-md:hidden",
          ].join(" ")}
          aria-label="Purchase order filters"
          data-testid="po-filter-rail"
        >
          <div className="mb-2 flex items-center justify-end md:hidden">
            <button type="button" aria-label="Close filters" onClick={() => setRailOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-5">
            <div>
              <div className="px-1.5 text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                PURCHASE ORDERS
              </div>
              <div className="mt-2 flex flex-col gap-0.5">
                <button
                  type="button"
                  className={`flex h-8 w-full items-center justify-between rounded-control px-2 text-left text-body ${filter == null ? "bg-kit-blue-3 font-semibold text-kit-blue-11" : "hover:bg-kit-slate-3"}`}
                  onClick={() => setFilter(null)}
                >
                  <span>All purchase orders</span><span className="tabular-nums">{allRows.length}</span>
                </button>
              </div>
            </div>
            {RAIL_GROUPS.map((group) => (
              <div key={group.heading}>
                <div className="px-1.5 text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                  {group.heading}
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {group.rows.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`flex min-h-8 w-full items-start justify-between gap-2 rounded-control px-2 py-1.5 text-left text-body ${filter === item.key ? "bg-kit-blue-3 font-semibold text-kit-blue-11" : "hover:bg-kit-slate-3"}`}
                      onClick={() => setFilter(filter === item.key ? null : item.key)}
                    >
                      {item.action ? (
                        <span className="flex min-w-0 flex-col">
                          <span className={filter === item.key ? "" : "font-medium"}>{item.label}</span>
                          <span className="text-[11px] font-normal leading-4 text-kit-slate-9">{item.action}</span>
                        </span>
                      ) : (
                        <span className="min-w-0 break-words">{item.label}</span>
                      )}
                      <span className="shrink-0 tabular-nums">{counts.get(item.key) ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col border border-kit-slate-5 bg-white">
          {pdfProblem ? (
            <ReadProblem
              problem={pdfProblem}
              action="Use Download official PDF again. If it still fails, ask the system owner to check the PO document."
            />
          ) : null}
            <DataGrid<RegisterRow>
              appearance="reference"
              rows={visibleRows}
              columns={columns}
              storageKey="carres.purchaseOrders.register.v1"
              rowKey={(row) => row.id}
              exportName="Purchase Orders"
              searchPlaceholder="Search purchase orders…"
              isLoading={posQ.isLoading}
              emptyMessage={filter ? "No purchase orders match this filter." : "No purchase orders yet."}
              /* 0430 — the pinned identity is PO NO BY NAME, not "whatever
                 column the saved layout happens to put first": a reordered
                 chooser layout must never unpin the number the operator
                 navigates by while scrolling the wide register. */
              stickyIdentity={{ columnKey: "po" }}
              groupBanner={false}
              chooserGroupOrder={["Document", "Supplier", "Goods", "Receiving"]}
              onRowDoubleClick={openObject}
              contextMenu={contextMenu}
              toolbarStart={(
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-control border border-kit-slate-5 px-2 text-meta md:hidden"
                  onClick={() => setRailOpen(true)}
                >
                  <SlidersHorizontal size={14} /> Filters
                </button>
              )}
              statusSummary={(filtered) => {
                const ordered = filtered.reduce((sum, row) => sum + row.facts.quantities.ordered, 0);
                const received = filtered.reduce((sum, row) => sum + row.facts.quantities.received, 0);
                const open = filtered.reduce((sum, row) => sum + row.facts.quantities.open, 0);
                return <span>{filtered.length} purchase orders · Order Qty {ordered} · Received Qty {received} · Pending Delivery Qty {open}</span>;
              }}
            />
        </div>
      </div>
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
          <button type="button" aria-label="Back to Purchase Orders" className="mt-1 text-kit-slate-9 hover:text-kit-slate-12" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-page font-semibold text-kit-slate-12">
              <span className="font-mono">{po.id}</span> · {row.supplierName}
            </h1>
            <p className="text-meta text-kit-slate-9">PO V{row.facts.version} · {row.facts.operationStatus ?? row.facts.documentState}</p>
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
              className={`h-8 border-b-2 px-3 text-meta font-medium ${view === item ? "border-kit-blue-9 text-kit-blue-11" : "border-transparent text-kit-slate-9 hover:text-kit-slate-12"}`}
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
                  <p className="text-meta text-kit-slate-9">Check the official document beside these fields before you finish.</p>
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
  units: Array<{ unit_code: string; sku: string; status: string }>;
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
  const unitsBySku = new Map<string, typeof units>();
  for (const unit of units) unitsBySku.set(unit.sku, [...(unitsBySku.get(unit.sku) ?? []), unit]);
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
          <Fact label="Source" value={row.source} />
          <Fact label="PO Issued" value={row.facts.currentSend ? fmtDate(row.facts.currentSend.sentAt, { time: true }) : "Not sent"} />
          <Fact label="PO Delivery Date" value={row.po.official_delivery_date ? fmtDate(row.po.official_delivery_date) : "Not recorded"} />
          {/* Same law as the register column: absence FIRST, then equality.
              `Same as PO` is a claim about what the supplier said. */}
          <Fact label="Supplier Delivery Date" value={!row.supplierDate ? "Not confirmed" : row.supplierDate === row.po.official_delivery_date ? "Same as PO" : fmtDate(row.supplierDate)} />
          <Fact label="PO Version" value={`PO V${row.facts.version}`} />
          <Fact label="Sent to Supplier" value={row.facts.sentToSupplier} />
          <Fact label="Status" value={row.facts.operationStatus ?? row.facts.documentState} />
        </dl>
        <SupplierDateBlock key={`${row.id}:${row.facts.version}`} row={row} onSaved={onSupplierDateSaved} />
      </Block>
      <Block title="Goods lines">
        {/* The table bleeds to the card edge so its own scroller, not the
            card, is what moves sideways. */}
        <div className="-mx-4 -mb-3 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-body">
            <thead className="h-9 border-y border-kit-slate-5 bg-kit-slate-3 text-left text-label uppercase tracking-wide text-kit-slate-9">
              <tr><th className="px-3">SKU</th><th className="px-3">Item</th><th className="px-3">Unit IDs</th><th className="px-3">Source</th><th className="px-3">Deliver To</th><th className="px-3 text-right">Order Qty</th><th className="px-3 text-right">Received Qty</th><th className="px-3 text-right">Pending Delivery Qty</th></tr>
            </thead>
            <tbody>
              {po.purchase_order_lines.map((line) => (
                <tr key={line.id} className="h-[38px] border-b border-kit-slate-4">
                  <td className="px-3 font-mono">{line.sku}</td>
                  <td className="px-3">{[line.model_name, line.size].filter(Boolean).join(" · ") || line.sku}</td>
                  {/* The units are the line's own rows: one code per physical
                      piece, keyed back to the line by SKU (0153). They used to
                      sit in a card of their own at the bottom of the page,
                      cut off from the line they belong to (YH, 2026-09-04). */}
                  <td className="px-3 py-1.5 align-top" data-testid={`po-line-units-${line.id}`}>{
                    unitLoading ? <span className="text-kit-slate-9">Loading…</span>
                    : unitError ? <button type="button" className="text-kit-blue-11 hover:underline" onClick={onRetryUnits}>Unit IDs could not be loaded. Try again</button>
                    : unitsBySku.get(line.sku)?.length
                      ? <ul className="m-0 list-none p-0">{unitsBySku.get(line.sku)!.map((unit) => <li key={unit.unit_code} className="whitespace-nowrap"><span className="font-mono">{unit.unit_code}</span> <span className="text-meta text-kit-slate-9">{unit.status}</span></li>)}</ul>
                      : <Absence>No Unit ID</Absence>
                  }</td>
                  <td className="px-3">{line.governed_sources?.length ? line.governed_sources.map((source) => {
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
                  <td className="px-3">{
                    line.destination_id
                      ? destinations.find((destination) => destination.id === line.destination_id)?.name ?? <Absence />
                      : row.deliverTo === "Not recorded" ? <Absence /> : row.deliverTo
                  }</td>
                  <td className="px-3 text-right tabular-nums">{line.qty}</td>
                  <td className="px-3 text-right tabular-nums">{line.received_qty}</td>
                  <td className="px-3 text-right tabular-nums">{Math.max(0, line.qty - line.received_qty)}</td>
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
            <div className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Official document</div>
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
      <div className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
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
          <div className="text-label text-kit-slate-9">Reply history</div>
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
          <span className="text-label text-kit-slate-9">Supplier Delivery Date</span>
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
            <span className="text-label text-kit-slate-9">Why has it moved?</span>
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
          <span className="text-label text-kit-slate-9">Remarks</span>
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
          <span className="text-label text-kit-slate-9">Channel</span>
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
            <span className="text-label text-kit-slate-9">{label}</span>
            <input value={value} onChange={e => setValue(e.target.value)} required className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta" />
          </label>
        ))}
        <ClaimPhotoUploadField poId={row.id} doNumber={`PO-V${row.facts.version}-reply`}
          paths={evidence ? [evidence] : []} onChange={paths => setEvidence(paths[paths.length - 1] ?? "")}
          label="Reply evidence" testId="po-supplier-reply-evidence" />
        <label className="flex flex-col gap-1">
          <span className="text-label text-kit-slate-9">Reported at</span>
          <input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)} required className="h-8 rounded-control border border-kit-slate-5 px-2 text-meta" />
        </label>
        <button
          type="button"
          disabled={!ready}
          onClick={save}
          data-testid="po-supplier-date-save"
          className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-5 disabled:text-kit-slate-9"
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
  return <div><dt className="text-label text-kit-slate-9">{label}</dt><dd className="mt-0.5 text-body font-medium text-kit-slate-12">{value === "Not recorded" ? <Absence /> : value}</dd></div>;
}

function ConnectionBlock({ title, empty, children, hasContent, loading, problem, action, onRetry }: { title: string; empty: string; children: React.ReactNode; hasContent: boolean; loading?: boolean; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <Block title={title}><div className="flex flex-col gap-2">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : loading ? <Absence>Loading…</Absence> : hasContent ? children : <Absence>{empty}</Absence>}</div></Block>;
}

function ConnectionRow({ primary, secondary }: { primary: string; secondary: string }) {
  return <div><div className="text-body font-medium text-kit-slate-12">{primary}</div><div className="text-meta text-kit-slate-9">{secondary}</div></div>;
}

function RecordList({ title, empty, rows, problem, action, onRetry }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; detail?: string; action?: React.ReactNode }>; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <section className="mx-auto max-w-[980px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">{title}</h2><div className="mt-3 divide-y divide-kit-slate-4">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : rows.length ? rows.map((row) => <article key={row.id} className="py-3"><div className="text-body font-semibold text-kit-slate-12">{row.title}</div><div className="mt-0.5 text-meta text-kit-slate-9">{row.meta}</div>{row.detail ? <div className="mt-1 text-body text-kit-slate-11">{row.detail}</div> : null}{row.action ? <div className="mt-1">{row.action}</div> : null}</article>) : <Absence>{empty}</Absence>}</div></section>;
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
  return <section className="mx-auto max-w-[1100px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Order Route</h2><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"><RouteNode title="Source" main={row.source} detail={row.sourceSearch === "Not recorded" ? "No governed source is recorded" : row.sourceSearch} /><RouteNode title="Purchase Order" main={row.id} detail={`PO V${row.facts.version} · ${row.facts.documentState}`} />{receivingError ? <RouteProblem title="Receiving" problem="The Receiving connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the receiving connection." onRetry={onRetryReceiving} /> : <RouteNode title="Receiving" main={receivingLoading ? "Loading…" : receiving.length ? `${receiving.length} connected` : "None recorded"} detail={receivingLoading ? "Checking the receiving record" : receiving.map((receipt) => receipt.do_number ?? receipt.status).join(" · ") || "Receiving owns this fact"} />}{problemError ? <RouteProblem title="Claims and returns" problem="The claims and returns connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the claim and receiving return connections." onRetry={() => { onRetryClaims(); onRetryReceiving(); }} /> : <RouteNode title="Claims and returns" main={problemLoading ? "Loading…" : problemCount ? `${problemCount} connected` : "None recorded"} detail={problemLoading ? "Checking the claim and receiving return records" : [...claims.map((claim) => claim.claim_no), ...returnRows.map(() => "Receiving return")].join(" · ") || "No connected problem record"} />}</div></section>;
}

function RouteNode({ title, main, detail }: { title: string; main: string; detail: string }) {
  return <div className="border-l-2 border-kit-blue-9 bg-kit-slate-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-9">{title}</div><div className="mt-1 text-body font-semibold text-kit-slate-12">{main}</div><div className="mt-1 text-meta text-kit-slate-9">{detail}</div></div>;
}

function RouteProblem({ title, problem, action, onRetry }: { title: string; problem: string; action: string; onRetry: () => void }) {
  return <div className="border-l-2 border-kit-red-9 bg-kit-red-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-9">{title}</div><ReadProblem problem={problem} action={action} onRetry={onRetry} /></div>;
}

function OfficialPreview({ poId }: { poId: string }) {
  /* The same blob `Download PDF` saves, painted as pages. The header already
     names the PO, so the paper carries no caption strip of its own. */
  const render = useCallback(async () => {
    const data = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);
    return renderPoPdf(data);
  }, [poId]);
  const { pdfError, setPane, retry } = usePdfCanvases(poId, render);
  return (
    <div className="mx-auto w-full max-w-[700px]">
      {pdfError ? (
        <div className="mb-3">
          <ReadProblem problem="The official PDF could not be opened" action="Try again. If it still fails, ask the system owner to check the PO document." onRetry={retry} />
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
    return <div key={line.id} className="grid grid-cols-1 gap-2 border-b border-kit-slate-4 pb-3 sm:grid-cols-[minmax(0,1fr)_88px_minmax(150px,0.8fr)]"><div><div className="text-body font-semibold">{line.model_name ?? line.sku}</div><div className="text-meta text-kit-slate-9">{line.sku} · {line.received_qty} received</div></div><label className="text-meta text-kit-slate-11">Qty<input aria-label={`Qty for ${line.sku}`} type="number" min={Math.max(1, line.received_qty)} value={value} className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 px-2 text-right" onChange={(event) => setDraft((current) => ({ ...current, [line.id]: event.target.value }))} /></label><label className="text-meta text-kit-slate-11">Deliver To<select aria-label={`Deliver To for ${line.sku}`} value={destinationDraft[line.id] ?? currentDestinationId} className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2" onChange={(event) => setDestinationDraft((current) => ({ ...current, [line.id]: event.target.value }))}>{currentDestinationId ? null : <option value="" disabled>Not recorded</option>}{pickerDestinations.map((destination) => { const closed = !activeDestinations.some((active) => active.id === destination.id); return <option key={destination.id} value={destination.id} disabled={closed}>{destination.name}{closed ? " (closed)" : ""}</option>; })}</select></label></div>;
  })}</div><label className="mt-4 block text-meta text-kit-slate-11">Why<input className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 px-2" value={reason} onChange={(event) => setReason(event.target.value)} /></label>{gap ? <div className="mt-3"><div className="text-meta text-kit-red-11">{gap}</div><div className="text-meta text-kit-slate-11">{action}</div></div> : null}{error ? <div className="mt-3"><div className="text-meta text-kit-red-11">The revision could not be saved</div><div className="text-meta text-kit-slate-11">{error}</div></div> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" className="h-8 rounded-control border border-kit-slate-5 px-3 text-meta" onClick={onCancel}>Cancel</button><button type="button" disabled={!!gap || save.isPending} className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-6" onClick={() => { if (gap) return; setError(null); save.mutate({ reason: reason.trim(), lines: changes }, { onSuccess: onSaved, onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) }); }}>{save.isPending ? "Saving…" : `Save PO V${(po.version ?? 1) + 1}`}</button></div></div>;
}
