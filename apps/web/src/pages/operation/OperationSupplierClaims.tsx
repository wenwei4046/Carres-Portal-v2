// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid) beside the governed 240px FilterRail, the
// same composition Sales Orders and SO Batch Purchase ship. The engine owns
// the one toolbar (search · export · columns), the grid and the status
// footer; the rail owns the factual filters; nothing wraps a second chrome
// around either (docs/ui/MASTER.md §6.5 LOCAL FILTER RAIL / REGISTER LISTING
// BOUNDARY).
/**
 * ⭐ SUPPLIER CLAIMS — `docs/purchasing/MASTER.md` §9.5, the owner-confirmed
 * register (Jess 2026-09-18) and the record where work happens (2026-09-25).
 *
 * ```text
 * ☐ · ▸ · Claim status · Supplier Claim No · Claim Reported · Supplier ·
 * PO No (Unit ID on line two) · GRN No · Items · Qty · Problem · Supplier Response
 * ```
 *
 * One ungrouped list, newest report first. `☐` is for Export only; `▸` opens
 * the row's read-only per-Unit evidence inspector (`SupplierClaimUnitsTable`). The engine's `pinnedPrefix` pins the two
 * controls plus `Claim status` and `Supplier Claim No` at a ≥768px canvas and
 * `Supplier Claim No` alone below it — never the date (§6.7 rule 2 exception).
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  SUPPLIER_CLAIM_ABSENT,
  SUPPLIER_CLAIM_COLUMN_LABEL as L,
  SUPPLIER_CLAIM_IN_PROGRESS_TOOLTIP,
  SUPPLIER_CLAIM_NOT_ISSUED,
  supplierClaimFooter,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  supplierClaimStatusWord,
  supplierClaimTypeLabel,
  supplierClaimUnitLine,
} from "@carres/shared";
import { useOperationSupplierClaims, type SupplierClaimListRow } from "@/lib/queries";
import { DataGrid, DataGridRowExpansionContext, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import type { IconName } from "@/components/kit/Icon";
import StatusPill from "@/components/kit/StatusPill";
import Tooltip from "@/components/kit/Tooltip";
import { fmtDate } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";
import SalesOrderTabs from "./SalesOrderTabs";
import { FilterRail, FilterRailGroup, FilterRailRow, ShowFiltersButton, useFilterRailOpen } from "./components/workspace-rail";
import SecondLine from "./components/register-cell";
import SupplierClaimPanel from "./components/SupplierClaimPanel";
import SupplierClaimUnitsTable from "./components/SupplierClaimUnitsTable";

type Facet = "supplier" | "problem" | "status" | "response";
const FACETS: Facet[] = ["supplier", "problem", "status", "response"];
const titles: Record<Facet, string> = { supplier: "Supplier", problem: "Problem", status: "Claim status", response: "Supplier Response" };
const facetIcons: Record<Facet, IconName> = { supplier: "supplier", problem: "late", status: "flag", response: "message" };
/** Rail predicates are FACTS about the row (§9.5: factual predicates with
 *  truthful counts): the same stored value the column prints. */
const valueOf = (row: SupplierClaimListRow, facet: Facet): string => {
  switch (facet) {
    case "supplier": return row.supplier_name || SUPPLIER_CLAIM_ABSENT;
    case "problem": return supplierClaimTypeLabel(row.claim_type);
    case "status": return supplierClaimStatusWord(row.status);
    case "response": return row.supplier_response ? supplierClaimResponseLabel(row.supplier_response) : SUPPLIER_CLAIM_ABSENT;
  }
};
/** Remembered per browser (useFilterRailOpen: starts hidden below 896px). */
const RAIL_KEY = "carres.supplier-claims.rail";

function Absence({ children = SUPPLIER_CLAIM_ABSENT }: { children?: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/** `{n} Units` is a disclosure into THIS row's expansion (§6.9): the same
 *  state the leading ▸ toggles, never a second panel. */
function UnitsDisclosure({ row, label }: { row: SupplierClaimListRow; label: string }) {
  const expansion = useContext(DataGridRowExpansionContext);
  const open = expansion?.isExpanded(row.id) ?? false;
  return (
    <button
      type="button"
      className="mt-0.5 text-meta text-kit-blue-11 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9"
      aria-expanded={open}
      data-testid={`claim-units-${row.id}`}
      onClick={(event) => {
        event.stopPropagation();
        expansion?.toggle(row.id);
        if (!open) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-claim-units="${row.id}"]`)?.focus());
      }}
    >
      {label}
    </button>
  );
}

/** The confirmed columns, in the confirmed order (§9.5, 2026-09-18). */
export function supplierClaimColumns(open: (row: SupplierClaimListRow) => void, needsSku: boolean): DataGridColumn<SupplierClaimListRow>[] {
  return [
    {
      key: "status", label: L.status, width: 112, minWidth: 112,
      accessor: (row) => row.status === "open"
        ? <Tooltip content={SUPPLIER_CLAIM_IN_PROGRESS_TOOLTIP}><span tabIndex={0} data-testid="claim-status-in-progress">{supplierClaimStatusWord(row.status)}</span></Tooltip>
        : supplierClaimStatusWord(row.status),
      searchValue: (row) => supplierClaimStatusWord(row.status),
      exportValue: (row) => supplierClaimStatusWord(row.status),
    },
    {
      key: "claim", label: L.claim, width: W.documentNo, minWidth: 150,
      accessor: (row) => <button type="button" className="font-semibold text-kit-blue-11 hover:underline" onClick={(event) => { event.stopPropagation(); open(row); }}>{row.claim_no || SUPPLIER_CLAIM_NOT_ISSUED}</button>,
      searchValue: (row) => row.claim_no || SUPPLIER_CLAIM_NOT_ISSUED,
      exportValue: (row) => row.claim_no || SUPPLIER_CLAIM_NOT_ISSUED,
      filterType: "numbering",
    },
    { key: "reported", label: L.reported, width: W.date, accessor: (row) => (row.reported_at ? fmtDate(row.reported_at) : <Absence />), dateValue: (row) => row.reported_at, filterType: "date", exportValue: (row) => (row.reported_at ? fmtDate(row.reported_at) : "") },
    { key: "supplier", label: L.supplier, width: W.supplier, accessor: (row) => row.supplier_name || <Absence />, searchValue: (row) => row.supplier_name || "" },
    {
      key: "po", label: L.po, width: W.sourceAndUnitId,
      accessor: (row) => {
        const line = supplierClaimUnitLine(row.units ?? null);
        return <>
          {row.po_id ? <Link className="text-kit-blue-11 hover:underline" onClick={(event) => event.stopPropagation()} to={`/operation/procurement/${encodeURIComponent(row.po_id)}`}>{row.po_id}</Link> : <Absence />}
          {/^\d+ Units$/.test(line) ? <div><UnitsDisclosure row={row} label={line} /></div> : <SecondLine>{line}</SecondLine>}
        </>;
      },
      searchValue: (row) => `${row.po_id || ""} ${(row.units ?? []).map((u) => u.unit_code ?? "").join(" ")}`,
      exportValue: (row) => `${row.po_id || ""} ${supplierClaimUnitLine(row.units ?? null)}`.trim(),
    },
    {
      key: "grn", label: L.grn, width: W.documentNo,
      accessor: (row) => row.grn_no && row.warehouse_receipt_id
        ? <Link className="text-kit-blue-11 hover:underline" onClick={(event) => event.stopPropagation()} to={`/operation?tab=receiving&session=${encodeURIComponent(row.warehouse_receipt_id)}`}>{row.grn_no}</Link>
        : row.grn_no || null,
      searchValue: (row) => row.grn_no || "",
      exportValue: (row) => row.grn_no || "",
    },
    {
      key: "items", label: L.items, width: W.items,
      /* Catalog's own words; when Catalog cannot name the goods the RECORDED
         SKU prints and says so — never relabelled as a product name. */
      accessor: (row) => row.product_description
        ? <><div className="break-words">{row.product_description}</div>{row.product_variant ? <SecondLine>{row.product_variant}</SecondLine> : null}</>
        : <><div className="break-words">{row.sku}</div><SecondLine>Recorded SKU</SecondLine></>,
      searchValue: (row) => `${row.product_description || ""} ${row.product_variant || ""} ${row.sku}`,
      exportValue: (row) => row.product_description || row.sku,
    },
    { key: "qty", label: L.qty, width: W.qty, align: "right", accessor: (row) => row.qty, numberValue: (row) => row.qty, filterType: "number", exportValue: (row) => row.qty },
    { key: "problem", label: L.problem, width: W.status, accessor: (row) => supplierClaimTypeLabel(row.claim_type), searchValue: (row) => `${supplierClaimTypeLabel(row.claim_type)} ${row.note || ""}`, exportValue: (row) => supplierClaimTypeLabel(row.claim_type) },
    {
      key: "response", label: L.response, width: W.status,
      accessor: (row) => (row.supplier_response ? supplierClaimResponseLabel(row.supplier_response) : <Absence />),
      searchValue: (row) => valueOf(row, "response"),
      exportValue: (row) => valueOf(row, "response"),
    },
    // Optional Columns (§9.5): off by default except SKU while Catalog is silent.
    { key: "sku", label: "SKU", width: W.documentNo, defaultHidden: !needsSku, accessor: (row) => row.sku, searchValue: (row) => row.sku, exportValue: (row) => row.sku },
    { key: "supplier_do", label: "Supplier DO", width: W.supplierDoNo, defaultHidden: true, accessor: (row) => row.do_number || <Absence />, searchValue: (row) => row.do_number || "", exportValue: (row) => row.do_number || "" },
    { key: "requested", label: "Requested Result", width: W.approvalStatus, defaultHidden: true, accessor: (row) => (row.requested_action ? supplierClaimRequestLabel(row.requested_action) : <Absence />), searchValue: (row) => (row.requested_action ? supplierClaimRequestLabel(row.requested_action) : SUPPLIER_CLAIM_ABSENT) },
  ];
}

/** Purchasing §9.5: the shared Register lists facts; the full record owns
 * detail and the supplier reply. The Register stays mounted under the record
 * so search, sort, selection, expansion and scroll survive the round trip.
 */
export default function OperationSupplierClaims() {
  const query = useOperationSupplierClaims("all");
  const forbidden = (query.error as { status?: number } | null)?.status === 403;
  const errorTitle = forbidden ? "You do not have access to Supplier Claims." : "Supplier Claims could not be loaded";
  const [params, setParams] = useSearchParams();
  const claimId = params.get("claim");
  const objectRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (claimId) objectRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(); }, [claimId]);
  const po = params.get("po");
  const [picks, setPicks] = useState<Partial<Record<Facet, string>>>({});
  const [railOpen, setRailVisible] = useFilterRailOpen(RAIL_KEY, canvasRef);
  const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
  const [visibleRows, setVisibleRows] = useState<SupplierClaimListRow[]>([]);
  const claims = useMemo(() => query.data?.claims ?? [], [query.data]);
  const inSource = useMemo(() => claims.filter((row) => !po || row.po_id === po), [claims, po]);
  const matches = (row: SupplierClaimListRow, except?: Facet) => (Object.keys(picks) as Facet[]).every((key) => key === except || valueOf(row, key) === picks[key]);
  const rows = useMemo(() => inSource.filter((row) => (Object.keys(picks) as Facet[]).every((key) => valueOf(row, key) === picks[key])), [inSource, picks]);
  const claim = claims.find((row) => row.id === claimId || row.claim_no === claimId);
  const position = visibleRows.findIndex((row) => row.id === claim?.id);
  const open = useCallback((row: SupplierClaimListRow) => setParams((previous) => {
    const next = new URLSearchParams(previous); next.set("claim", row.id); return next;
  }), [setParams]);
  const close = () => setParams((previous) => {
    const next = new URLSearchParams(previous); next.delete("claim"); return next;
  });
  const clearSource = useCallback(() => setParams((previous) => {
    const next = new URLSearchParams(previous); next.delete("po"); return next;
  }), [setParams]);
  const anyFilter = po != null || Object.keys(picks).length > 0;
  const needsSku = claims.some((row) => !row.product_description);
  const columns = useMemo(() => supplierClaimColumns(open, needsSku), [open, needsSku]);
  const errorState = query.isError
    ? <div role="alert"><EmptyState title={errorTitle} action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>} /></div>
    : undefined;

  return <div className="relative flex h-full min-h-0 flex-col" data-testid="operation-supplier-claims">
    <div className={`flex h-full min-h-0 flex-col ${claimId ? "hidden" : ""}`} aria-hidden={claimId ? true : undefined}>
      {!claimId && <PurchasingTabs />}
      <div ref={canvasRef} className="flex min-h-0 flex-1 overflow-hidden">
        {railOpen && !query.isError && <FilterRail testId="supplier-claims-rail" onHide={() => setRailVisible(false)}>
          {po && <FilterRailGroup title="Source" icon="order">
            <FilterRailRow label={`PO: ${po}`} active onClick={clearSource} title="Clear the purchase order filter" testId="claims-rail-source" />
          </FilterRailGroup>}
          {FACETS.map((facet) => {
            const counts = new Map<string, number>();
            inSource.filter((row) => matches(row, facet)).forEach((row) => { const value = valueOf(row, facet); counts.set(value, (counts.get(value) ?? 0) + 1); });
            if (counts.size === 0) return null;
            return <FilterRailGroup key={facet} title={titles[facet]} icon={facetIcons[facet]}>
              {[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => <FilterRailRow key={value} label={value} count={count} active={picks[facet] === value} testId={`claims-rail-${facet}-${value}`}
                onClick={() => setPicks((previous) => { const next = { ...previous }; if (next[facet] === value) delete next[facet]; else next[facet] = value; return next; })} />)}
            </FilterRailGroup>;
          })}
          {anyFilter && <div><Button variant="ghost" onClick={() => { setPicks({}); clearSource(); }}>Clear filters</Button></div>}
        </FilterRail>}
        <div className="flex min-w-0 flex-1 flex-col p-2">
          <DataGrid rows={rows} columns={columns} rowKey={(row) => row.id} storageKey="carres.supplier-claims.register.v3"
            appearance="reference" exportName="Supplier Claims" groupBanner={false}
            pinnedPrefix={{ columns: ["status", "claim"], narrow: ["claim"] }}
            rowHeight={51}
            isLoading={query.isLoading}
            errorState={errorState}
            emptyMessage={claims.length === 0 ? "No Supplier Claims yet." : "No Supplier Claims match these filters"}
            searchPlaceholder="Search Supplier Claims"
            toolbarStart={<>{!railOpen ? <ShowFiltersButton onShow={() => setRailVisible(true)} testId="claims-show-filters" /> : null}</>}
            onFilteredRowsChange={setVisibleRows} onRowDoubleClick={open}
            expandable={{ renderExpansion: (row) => <SupplierClaimUnitsTable claim={row} />, testId: (row) => `claim-inspect-${row.claim_no}` }}
            selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; }), onToggleAll: (keys, all) => setSelectedKeys((previous) => { const next = new Set(previous); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next; }) }}
            statusSummary={(visible) => <span>{supplierClaimFooter(visible.length, claims.length)}</span>}
          />
        </div>
      </div>
    </div>
    {claimId && <div ref={objectRef} className="absolute inset-0 flex min-h-0 flex-col bg-background" data-testid="claim-object">
      <SalesOrderTabs identity={claim ? claim.claim_no || SUPPLIER_CLAIM_NOT_ISSUED : "Supplier Claim"} customer={claim?.supplier_name} backLabel="Supplier Claims" backTo="/operation?tab=claims" onBack={(event) => { event.preventDefault(); close(); }}
        status={claim ? <StatusPill tone="neutral">{supplierClaimStatusWord(claim.status)}</StatusPill> : undefined}
        right={position >= 0 ? <div className="flex items-center gap-2">
          <Button variant="ghost" aria-label="Previous Claim" disabled={position === 0} onClick={() => open(visibleRows[position - 1])}><ChevronLeft size={16} /></Button>
          <span className="text-meta tabular-nums">{position + 1} of {visibleRows.length}</span>
          <Button variant="ghost" aria-label="Next Claim" disabled={position === visibleRows.length - 1} onClick={() => open(visibleRows[position + 1])}><ChevronRight size={16} /></Button>
        </div> : undefined} />
      <div className="min-h-0 flex-1 overflow-auto p-4" key={claim?.id ?? claimId} data-testid="claim-object-scroll">
        {query.isError ? errorState
          : query.isLoading ? <EmptyState title="Loading claim…" />
          : claim ? <SupplierClaimPanel claim={claim} />
          : <EmptyState title="Claim is not available." action={<Button variant="neutral" onClick={close}>Supplier Claims</Button>} />}
      </div>
    </div>}
  </div>;
}
