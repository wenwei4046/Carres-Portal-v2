// design-standard: not-a-list-page — this page uses the approved full-bleed
// Register engine (components/register/DataGrid), which already owns search,
// filters, columns, export and footer. ListPageShell would add a second set of
// list chrome around the same register, contrary to the Sales Orders template.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileCheck2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  poDateHistoryOf,
  purchaseOrderRegisterFacts,
  purchaseOrderWork,
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
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import {
  useOperationPoAudit,
  useOperationPoDuty,
  useOperationPos,
  useOperationPoUnits,
  useOperationSupplierClaims,
  useOperationSuppliers,
  useOperationWarehouse,
  usePoReceiving,
  useRecordSend,
  useRevisePo,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import PurchasingTabs from "../PurchasingTabs";
import PoIssueEvidence, { doorsForIssuedPo } from "../components/PoIssueEvidence";

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
    heading: "DELIVERY DATE",
    rows: [
      { key: "supplier_date_missing", label: "Supplier date missing" },
      { key: "supplier_date_passed", label: "Supplier date passed" },
    ],
  },
  {
    heading: "RECEIVING",
    rows: [
      { key: "partly_received", label: "Partly received" },
      { key: "completed", label: "Completed" },
    ],
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
  const refs = sources.map((source) => source.reference);
  return {
    display: refs.length === 1 ? refs[0]! : `${refs[0]} +${refs.length - 1}`,
    search: refs.join(" "),
  };
}

function supplierDateOf(po: operationPoListRow): string | null {
  return poDateHistoryOf(po.promises ?? []).currentDate;
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
  const dutyQ = useOperationPoDuty();
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

  const requiredReadError = posQ.isError || suppliersQ.isError || warehouseQ.isError || dutyQ.isError;
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
              void dutyQ.refetch();
            }}
          />
        </div>
      </div>
    );
  }
  const requiredReadLoading = posQ.isLoading || suppliersQ.isLoading || warehouseQ.isLoading || dutyQ.isLoading;
  if (requiredReadLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <PurchasingTabs />
        <div className="m-4 text-body text-kit-slate-9">Loading purchase orders…</div>
      </div>
    );
  }

  const selectedPoId = params.get("po");
  const selected = allRows.find((row) => row.id === selectedPoId) ?? null;
  if (selectedPoId && selected) {
    return (
      <PurchaseOrderObject
        row={selected}
        messageTemplate={posQ.data?.messageTemplate ?? null}
        owner={dutyQ.data?.holder ?? null}
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
      key: "po",
      label: "PO No.",
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
      label: "PO Issued",
      width: 174,
      sortable: true,
      accessor: (row) => row.facts.currentSend
        ? fmtDate(row.facts.currentSend.sentAt, { time: true })
        : <Absence>Not sent</Absence>,
      searchValue: (row) => row.facts.documentState,
      filterValue: (row) => row.facts.documentState,
    },
    {
      key: "supplier",
      label: "Supplier",
      width: 150,
      sortable: true,
      accessor: (row) => row.supplierName,
      searchValue: (row) => row.supplierName,
      filterValue: (row) => row.supplierName,
    },
    {
      key: "source",
      label: "Source",
      width: 164,
      sortable: true,
      accessor: (row) => row.source === "Not recorded" ? <Absence /> : row.source,
      searchValue: (row) => row.sourceSearch,
      filterValue: (row) => row.source,
    },
    {
      key: "deliver_to",
      label: "Deliver To",
      width: 160,
      sortable: true,
      accessor: (row) => row.deliverTo === "Not recorded" ? <Absence /> : row.deliverTo,
      searchValue: (row) => row.deliverTo,
      filterValue: (row) => row.deliverTo,
    },
    {
      key: "po_delivery_date",
      label: "PO Delivery Date",
      width: 150,
      sortable: true,
      accessor: (row) => row.po.eta_date ? fmtDate(row.po.eta_date) : <Absence />,
      searchValue: (row) => row.po.eta_date ?? "Not recorded",
      filterValue: (row) => row.po.eta_date ?? "Not recorded",
      dateValue: (row) => row.po.eta_date,
      filterType: "date",
    },
    {
      key: "supplier_delivery_date",
      label: "Supplier Delivery Date",
      width: 166,
      sortable: true,
      accessor: (row) => row.po.eta_date && (!row.supplierDate || row.supplierDate === row.po.eta_date)
        ? "Same as PO"
        : row.supplierDate ? fmtDate(row.supplierDate) : <Absence />,
      searchValue: (row) => row.po.eta_date && (!row.supplierDate || row.supplierDate === row.po.eta_date)
        ? "Same as PO"
        : row.supplierDate ?? "Not recorded",
      filterValue: (row) => row.po.eta_date && (!row.supplierDate || row.supplierDate === row.po.eta_date)
        ? "Same as PO"
        : row.supplierDate ?? "Not recorded",
      dateValue: (row) => row.supplierDate === row.po.eta_date ? null : row.supplierDate,
      filterType: "date",
    },
    ...(["ordered", "received", "open"] as const).map((key): DataGridColumn<RegisterRow> => ({
      key,
      label: key === "open" ? "Open Balance" : key[0]!.toUpperCase() + key.slice(1),
      width: key === "open" ? 118 : 94,
      align: "right",
      sortable: true,
      accessor: (row) => row.facts.quantities[key],
      searchValue: (row) => String(row.facts.quantities[key]),
      filterValue: (row) => String(row.facts.quantities[key]),
      numberValue: (row) => row.facts.quantities[key],
      filterType: "number",
      footerTotal: (rows) => rows.reduce((sum, row) => sum + row.facts.quantities[key], 0),
    })),
    {
      key: "current_version",
      label: "Current Version",
      width: 138,
      sortable: true,
      accessor: (row) => (
        <span className="flex flex-col leading-4">
          <span>Version {row.facts.version}</span>
          <span className="text-[11px] text-kit-slate-9">
            {row.facts.operationStatus ?? row.facts.documentState}
          </span>
        </span>
      ),
      searchValue: (row) => `Version ${row.facts.version} ${row.facts.operationStatus ?? row.facts.documentState}`,
      filterValue: (row) => `Version ${row.facts.version}`,
    },
    {
      key: "supplier_has",
      label: "Supplier Has",
      width: 128,
      sortable: true,
      accessor: (row) => row.facts.supplierHas === "No current PDF"
        ? <Absence>{row.facts.supplierHas}</Absence>
        : row.facts.supplierHas,
      searchValue: (row) => row.facts.supplierHas,
      filterValue: (row) => row.facts.supplierHas,
    },
    {
      key: "work",
      label: "Work",
      width: 330,
      sortable: true,
      accessor: (row) => row.work ? (
        <span className="flex min-w-0 items-start gap-2 py-0.5">
          <OwnerBadge userId={dutyQ.data?.holder?.userId ?? null} name={dutyQ.data?.holder?.name ?? null} />
          <span className="flex min-w-0 flex-col leading-4">
            <span className="truncate font-semibold text-kit-slate-12">{row.work.problem}</span>
            <span className="truncate text-[11px] text-kit-slate-9">{row.work.action}</span>
          </span>
        </span>
      ) : <Absence>—</Absence>,
      searchValue: (row) => row.work ? `${row.work.problem} ${row.work.action}` : "",
      filterValue: (row) => row.work?.problem ?? "No open work",
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
                          <span className="font-medium">{item.label}</span>
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
              stickyIdentity
              groupBanner={false}
              chooserGroupOrder={["Document", "Supplier", "Goods", "Receiving", "Work"]}
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
                return <span>{filtered.length} purchase orders · Ordered {ordered} · Received {received} · Open {open}</span>;
              }}
            />
        </div>
      </div>
    </div>
  );
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

type ObjectView = "Document" | "Revisions" | "History" | "Order Route";
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
  owner: { userId: string; name: string | null; email: string } | null;
  destinations: Array<{ id: string; name: string }>;
  activeDestinations: Array<{ id: string; name: string }>;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<ObjectView>("Document");
  const [mode, setMode] = useState<DocumentMode>("read");
  const [pdfProblem, setPdfProblem] = useState<string | null>(null);
  const unitsQ = useOperationPoUnits(row.id);
  const receivingQ = usePoReceiving(row.id);
  const claimsQ = useOperationSupplierClaims("all", row.id);
  const auditQ = useOperationPoAudit(row.id);
  const recordOpen = useRecordSend(row.id);
  const po = row.po;
  const issueNeeded = row.facts.currentSend == null && po.status === "open";

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="purchase-order-object">
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
            <p className="text-meta text-kit-slate-9">Version {row.facts.version} · {row.facts.operationStatus ?? row.facts.documentState}</p>
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
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-kit-slate-5 px-3 text-meta" onClick={() => {
              setPdfProblem(null);
              void downloadOfficialPdf(po.id).catch(() => {
                setPdfProblem("The official PDF could not be downloaded");
              });
            }}>
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>
        {pdfProblem ? (
          <div className="mt-2">
            <ReadProblem
              problem={pdfProblem}
              action="Use Download PDF again. If it still fails, ask the system owner to check the PO document."
            />
          </div>
        ) : null}
        <nav className="mt-3 flex gap-1 overflow-x-auto whitespace-nowrap" aria-label="Purchase order views">
          {(["Document", "Revisions", "History", "Order Route"] as const).map((item) => (
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

      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {view === "Document" && mode !== "read" ? (
          <div
            className="grid min-h-[640px] grid-cols-1 gap-3 min-[1130px]:grid-cols-2"
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
            empty="No revised version is recorded. Version 1 is the original purchase order."
            problem={auditQ.isError ? "The PO revisions could not be loaded" : null}
            action="Try again. If it still fails, ask the system owner to check the PO history."
            onRetry={() => void auditQ.refetch()}
            rows={[
              {
                id: "current-document",
                title: `Current document · Version ${po.version ?? 1}`,
                meta: "Live purchase order",
                detail: "This is the version used by the official PDF.",
              },
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

function DocumentView({ row, owner, units, receiving, claims, destinations, unitLoading, receivingLoading, claimsLoading, unitError, receivingError, claimsError, onRetryUnits, onRetryReceiving, onRetryClaims }: {
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
}) {
  const po = row.po;
  const returnRows = receiving.filter((receipt) => receipt.return_reason);
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-3">
      <WorkCard row={row} owner={owner} />
      <section className="border border-kit-slate-5 bg-white p-4">
        <h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Purchase order</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Supplier" value={row.supplierName} />
          <Fact label="Deliver To" value={row.deliverTo} />
          <Fact label="Source" value={row.source} />
          <Fact label="PO Issued" value={row.facts.currentSend ? fmtDate(row.facts.currentSend.sentAt, { time: true }) : "Not sent"} />
          <Fact label="PO Delivery Date" value={row.po.eta_date ? fmtDate(row.po.eta_date) : "Not recorded"} />
          <Fact label="Supplier Delivery Date" value={row.po.eta_date && (!row.supplierDate || row.supplierDate === row.po.eta_date) ? "Same as PO" : row.supplierDate ? fmtDate(row.supplierDate) : "Not recorded"} />
          <Fact label="Current Version" value={`Version ${row.facts.version}`} />
          <Fact label="Supplier Has" value={row.facts.supplierHas} />
          <Fact label="Status" value={row.facts.operationStatus ?? row.facts.documentState} />
        </dl>
      </section>
      <section className="overflow-hidden border border-kit-slate-5 bg-white">
        <h2 className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-kit-slate-9">Goods lines</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-body">
            <thead className="h-9 border-y border-kit-slate-5 bg-kit-slate-3 text-left text-label uppercase tracking-wide text-kit-slate-9">
              <tr><th className="px-3">SKU</th><th className="px-3">Item</th><th className="px-3">Source</th><th className="px-3">Deliver To</th><th className="px-3 text-right">Ordered</th><th className="px-3 text-right">Received</th><th className="px-3 text-right">Open</th></tr>
            </thead>
            <tbody>
              {po.purchase_order_lines.map((line) => (
                <tr key={line.id} className="h-[38px] border-b border-kit-slate-4">
                  <td className="px-3 font-mono">{line.sku}</td>
                  <td className="px-3">{[line.model_name, line.size].filter(Boolean).join(" · ") || line.sku}</td>
                  <td className="px-3">{line.governed_sources?.length ? line.governed_sources.map((source) => source.qty == null ? source.reference : `${source.reference} ×${source.qty}`).join(" · ") : <Absence />}</td>
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
      </section>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ConnectionBlock title="Unit IDs" empty="No Unit ID is recorded for this PO." hasContent={units.length > 0} loading={unitLoading} problem={unitError ? "The Unit ID connection could not be loaded" : null} action="Try again. If it still fails, ask the system owner to check the PO Unit IDs." onRetry={onRetryUnits}>
          {units.map((unit) => <ConnectionRow key={unit.unit_code} primary={unit.unit_code} secondary={`${unit.sku} · ${unit.status}`} />)}
        </ConnectionBlock>
        <ConnectionBlock title="Receiving" empty="No receiving session is connected to this PO." hasContent={receiving.length > 0} loading={receivingLoading} problem={receivingError ? "The Receiving connection could not be loaded" : null} action="Try again. If it still fails, ask the system owner to check the receiving connection." onRetry={onRetryReceiving}>
          {receiving.map((receipt) => <ConnectionRow key={receipt.id} primary={receipt.do_number ?? "Supplier DO not recorded"} secondary={`${receipt.status} · ${fmtDate(receipt.goods_received_at)}`} />)}
          {receiving.length > 0 ? <Link className="mt-2 text-meta font-medium text-kit-blue-11 hover:underline" to={`/operation?tab=receiving&po=${encodeURIComponent(po.id)}`}>Open Receiving</Link> : null}
        </ConnectionBlock>
        <ConnectionBlock title="Claims and returns" empty="No claim or return is connected to this PO." hasContent={claims.length + returnRows.length > 0} loading={claimsLoading || receivingLoading} problem={claimsError || receivingError ? "The claims and returns connection could not be loaded" : null} action="Try again. If it still fails, ask the system owner to check the claim and receiving return connections." onRetry={() => { onRetryClaims(); onRetryReceiving(); }}>
          {claims.map((claim) => <ConnectionRow key={claim.id} primary={claim.claim_no} secondary={`${claim.status}${claim.requested_action === "return" ? " · Return requested" : ""}`} />)}
          {returnRows.map((receipt) => <ConnectionRow key={`return-${receipt.id}`} primary="Receiving return" secondary={receipt.return_reason!} />)}
          {claims.length > 0 ? <Link className="mt-2 text-meta font-medium text-kit-blue-11 hover:underline" to={`/operation?tab=claims&po=${encodeURIComponent(po.id)}`}>Open Claims and Returns</Link> : null}
        </ConnectionBlock>
      </div>
      <OfficialPreview poId={po.id} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-label text-kit-slate-9">{label}</dt><dd className="mt-0.5 text-body font-medium text-kit-slate-12">{value === "Not recorded" ? <Absence /> : value}</dd></div>;
}

function ConnectionBlock({ title, empty, children, hasContent, loading, problem, action, onRetry }: { title: string; empty: string; children: React.ReactNode; hasContent: boolean; loading?: boolean; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <section className="flex min-h-[150px] flex-col border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">{title}</h2><div className="mt-3 flex flex-col gap-2">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : loading ? <Absence>Loading…</Absence> : hasContent ? children : <Absence>{empty}</Absence>}</div></section>;
}

function ConnectionRow({ primary, secondary }: { primary: string; secondary: string }) {
  return <div><div className="text-body font-medium text-kit-slate-12">{primary}</div><div className="text-meta text-kit-slate-9">{secondary}</div></div>;
}

function RecordList({ title, empty, rows, problem, action, onRetry }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; detail?: string }>; problem?: string | null; action?: string; onRetry?: () => void }) {
  return <section className="mx-auto max-w-[980px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">{title}</h2><div className="mt-3 divide-y divide-kit-slate-4">{problem ? <ReadProblem problem={problem} action={action ?? "Try again."} onRetry={onRetry} /> : rows.length ? rows.map((row) => <article key={row.id} className="py-3"><div className="text-body font-semibold text-kit-slate-12">{row.title}</div><div className="mt-0.5 text-meta text-kit-slate-9">{row.meta}</div>{row.detail ? <div className="mt-1 text-body text-kit-slate-11">{row.detail}</div> : null}</article>) : <Absence>{empty}</Absence>}</div></section>;
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
  return <section className="mx-auto max-w-[1100px] border border-kit-slate-5 bg-white p-4"><h2 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Order Route</h2><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"><RouteNode title="Source" main={row.source} detail={row.sourceSearch === "Not recorded" ? "No governed source is recorded" : row.sourceSearch} /><RouteNode title="Purchase Order" main={row.id} detail={`Version ${row.facts.version} · ${row.facts.documentState}`} />{receivingError ? <RouteProblem title="Receiving" problem="The Receiving connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the receiving connection." onRetry={onRetryReceiving} /> : <RouteNode title="Receiving" main={receivingLoading ? "Loading…" : receiving.length ? `${receiving.length} connected` : "None recorded"} detail={receivingLoading ? "Checking the receiving record" : receiving.map((receipt) => receipt.do_number ?? receipt.status).join(" · ") || "Receiving owns this fact"} />}{problemError ? <RouteProblem title="Claims and returns" problem="The claims and returns connection could not be loaded" action="Try again. If it still fails, ask the system owner to check the claim and receiving return connections." onRetry={() => { onRetryClaims(); onRetryReceiving(); }} /> : <RouteNode title="Claims and returns" main={problemLoading ? "Loading…" : problemCount ? `${problemCount} connected` : "None recorded"} detail={problemLoading ? "Checking the claim and receiving return records" : [...claims.map((claim) => claim.claim_no), ...returnRows.map(() => "Receiving return")].join(" · ") || "No connected problem record"} />}</div></section>;
}

function RouteNode({ title, main, detail }: { title: string; main: string; detail: string }) {
  return <div className="border-l-2 border-kit-blue-9 bg-kit-slate-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-9">{title}</div><div className="mt-1 text-body font-semibold text-kit-slate-12">{main}</div><div className="mt-1 text-meta text-kit-slate-9">{detail}</div></div>;
}

function RouteProblem({ title, problem, action, onRetry }: { title: string; problem: string; action: string; onRetry: () => void }) {
  return <div className="border-l-2 border-kit-red-9 bg-kit-red-3 p-3"><div className="text-label uppercase tracking-wide text-kit-slate-9">{title}</div><ReadProblem problem={problem} action={action} onRetry={onRetry} /></div>;
}

function OfficialPreview({ poId }: { poId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const data = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);
        const blob = await renderPoPdf(data);
        if (typeof URL.createObjectURL === "function") objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "The official PDF could not be opened");
      }
    })();
    return () => { active = false; if (objectUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl); };
  }, [poId]);
  return <section className="flex min-h-[640px] min-w-0 flex-col border border-kit-slate-5 bg-kit-slate-3"><div className="flex h-10 items-center justify-between border-b border-kit-slate-5 bg-white px-3"><span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">Official document</span><span className="font-mono text-meta text-kit-slate-9">{poId}</span></div>{error ? <div className="border-b border-kit-red-9 bg-kit-red-3 px-3 py-2"><div className="text-meta text-kit-red-11">The official PDF could not be opened</div><div className="text-meta text-kit-slate-11">Try again. If it still fails, ask the system owner to check the PO document.</div></div> : null}<iframe title="Official purchase order preview" aria-label="Official purchase order preview" className="min-h-[600px] w-full flex-1 bg-white" src={url ?? "about:blank"} /></section>;
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
  })}</div><label className="mt-4 block text-meta text-kit-slate-11">Why<input className="mt-1 h-8 w-full rounded-control border border-kit-slate-5 px-2" value={reason} onChange={(event) => setReason(event.target.value)} /></label>{gap ? <div className="mt-3"><div className="text-meta text-kit-red-11">{gap}</div><div className="text-meta text-kit-slate-11">{action}</div></div> : null}{error ? <div className="mt-3"><div className="text-meta text-kit-red-11">The revision could not be saved</div><div className="text-meta text-kit-slate-11">{error}</div></div> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" className="h-8 rounded-control border border-kit-slate-5 px-3 text-meta" onClick={onCancel}>Cancel</button><button type="button" disabled={!!gap || save.isPending} className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:bg-kit-slate-6" onClick={() => { if (gap) return; setError(null); save.mutate({ reason: reason.trim(), lines: changes }, { onSuccess: onSaved, onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)) }); }}>{save.isPending ? "Saving…" : `Save Version ${(po.version ?? 1) + 1}`}</button></div></div>;
}
