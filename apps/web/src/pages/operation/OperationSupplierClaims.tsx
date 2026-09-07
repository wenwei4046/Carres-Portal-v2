// design-standard: not-a-list-page — this page runs THE REGISTER ENGINE
// (components/register/DataGrid) beside the governed 240px FilterRail, the
// same composition Sales Orders and SO Batch Purchase ship. The engine owns
// the one toolbar (search · export · columns), the grid and the status
// footer; the rail owns the factual filters; nothing wraps a second chrome
// around either (docs/ui/MASTER.md §6.5 LOCAL FILTER RAIL / REGISTER LISTING
// BOUNDARY).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import { carresExecutionLabel, customerResolutionLabel, supplierClaimRequestLabel, supplierClaimResponseLabel, supplierClaimTypeLabel } from "@carres/shared";
import { useOperationSupplierClaims, type SupplierClaimListRow } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import DropdownMenu from "@/components/kit/DropdownMenu";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import StatusPill from "@/components/kit/StatusPill";
import { fmtDate } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";
import SalesOrderTabs from "./SalesOrderTabs";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import SupplierClaimPanel, { ClaimSource, SupplierClaimInspector } from "./components/SupplierClaimPanel";

const absent = "Not recorded";
const statusLabel = (row: SupplierClaimListRow) => ({ open: "Open", closed: "Closed", cancelled: "Cancelled" })[row.status] ?? absent;
type Facet = "supplier" | "problem" | "status" | "response" | "evidence";
const titles: Record<Facet, string> = { supplier: "Supplier", problem: "Problem", status: "Claim status", response: "Supplier Response", evidence: "Evidence" };
/** Rail predicates are FACTS about the row (§9.5: factual predicates with
 *  truthful counts). `null` means the predicate does not apply to this row,
 *  so it is never counted — an absent source is a fact; a linked one is not
 *  an "Evidence" value. */
const valueOf = (row: SupplierClaimListRow, facet: Facet): string | null => {
  switch (facet) {
    case "supplier": return row.supplier_name || absent;
    case "problem": return supplierClaimTypeLabel(row.claim_type);
    case "status": return statusLabel(row);
    case "response": return row.supplier_response ? supplierClaimResponseLabel(row.supplier_response) : absent;
    case "evidence": return row.po_id ? null : "Source not linked";
  }
};
/** Remembered like SO Batch Purchase's rail: the browser keeps the open/closed
 *  choice (LOCAL FILTER RAIL COLLAPSE, owner ruling 2026-08-27). */
const RAIL_KEY = "carres.supplier-claims.rail";

/** Purchasing §9.5: the shared Register lists facts; the full object owns detail.
 * Keep the Register mounted under the object so the engine retains search,
 * sort, selection, expansion and scroll. Named links read the full allowed set.
 */
export default function OperationSupplierClaims() {
  const query = useOperationSupplierClaims("all");
  const errorTitle = (query.error as { status?: number } | null)?.status === 403
    ? "You do not have access to Supplier Claims." : "Supplier Claims could not be loaded.";
  const [params, setParams] = useSearchParams();
  const claimId = params.get("claim");
  const objectRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (claimId) objectRef.current?.querySelector<HTMLAnchorElement>("a")?.focus(); }, [claimId]);
  const po = params.get("po");
  const [picks, setPicks] = useState<Partial<Record<Facet, string>>>({});
  const [railOpen, setRailOpen] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) !== "0"; } catch { return true; }
  });
  const setRailVisible = useCallback((open: boolean) => {
    setRailOpen(open);
    try { localStorage.setItem(RAIL_KEY, open ? "1" : "0"); } catch { /* storage may be unavailable; the live state still works */ }
  }, []);
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

  const columns = useMemo<DataGridColumn<SupplierClaimListRow>[]>(() => [
    { key: "claim", label: "Claim No.", width: 186, accessor: (row) => <button className="text-kit-blue-11 underline font-semibold" onClick={(event) => { event.stopPropagation(); open(row); }}>{row.claim_no || "Not issued"}</button>, searchValue: (row) => row.claim_no || "Not issued", filterType: "numbering" },
    { key: "reported", label: "Reported", width: 144, accessor: (row) => fmtDate(row.reported_at), dateValue: (row) => row.reported_at, filterType: "date", exportValue: (row) => fmtDate(row.reported_at) },
    { key: "supplier", label: "Supplier", width: 180, accessor: (row) => row.supplier_name || absent, searchValue: (row) => row.supplier_name || absent },
    { key: "source", label: "Source", width: 190, accessor: (row) => <ClaimSource claim={row} />, searchValue: (row) => [row.po_id, row.grn_no, row.do_number].filter(Boolean).join(" "), exportValue: (row) => [row.po_id, row.grn_no].filter(Boolean).join(" · ") || "Source not linked" },
    { key: "product", label: "Product", width: 240, accessor: (row) => row.product_description || row.sku, searchValue: (row) => `${row.product_description || ""} ${row.sku}`, exportValue: (row) => row.product_description || row.sku },
    { key: "qty", label: "Affected Qty", width: 110, align: "right", accessor: (row) => row.qty, numberValue: (row) => row.qty, filterType: "number", exportValue: (row) => row.qty },
    { key: "problem", label: "Problem", width: 176, accessor: (row) => supplierClaimTypeLabel(row.claim_type), searchValue: (row) => `${supplierClaimTypeLabel(row.claim_type)} ${row.note || ""}`, exportValue: (row) => supplierClaimTypeLabel(row.claim_type) },
    { key: "response", label: "Supplier Response", width: 180, accessor: (row) => valueOf(row, "response"), searchValue: (row) => valueOf(row, "response") ?? absent },
    { key: "status", label: "Claim status", width: 124, accessor: statusLabel, searchValue: statusLabel },
    { key: "units", label: "Units on hold", width: 240, defaultHidden: true, accessor: (row) => row.held_unit_codes?.join(" · ") || absent, searchValue: (row) => row.held_unit_codes?.join(" ") || "" },
    { key: "requested", label: "Requested Result", width: 190, defaultHidden: true, accessor: (row) => row.requested_action ? supplierClaimRequestLabel(row.requested_action) : absent, searchValue: (row) => row.requested_action ? supplierClaimRequestLabel(row.requested_action) : absent },
    { key: "customer", label: "Customer Resolution", width: 205, defaultHidden: true, accessor: (row) => row.customer_resolution ? customerResolutionLabel(row.customer_resolution) : absent, searchValue: (row) => row.customer_resolution ? customerResolutionLabel(row.customer_resolution) : absent },
    { key: "execution", label: "Carres Execution", width: 205, defaultHidden: true, accessor: (row) => row.carres_execution ? carresExecutionLabel(row.carres_execution) : absent, searchValue: (row) => row.carres_execution ? carresExecutionLabel(row.carres_execution) : absent },
  ], [open]);

  return <div className="relative flex h-full min-h-0 flex-col" data-testid="operation-supplier-claims">
    <div className={`flex h-full min-h-0 flex-col ${claimId ? "hidden" : ""}`} aria-hidden={claimId ? true : undefined}>
      {!claimId && <PurchasingTabs />}
      {query.isError ? <div role="alert"><EmptyState title={errorTitle} detail={query.error?.message} action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>} /></div>
        : <div className="flex min-h-0 flex-1 overflow-hidden">
          {railOpen && <FilterRail testId="supplier-claims-rail" onHide={() => setRailVisible(false)}>
            {po && <FilterRailGroup title="Source">
              <FilterRailRow label={`PO: ${po}`} active onClick={clearSource} title="Clear the purchase order filter" testId="claims-rail-source" />
            </FilterRailGroup>}
            {(Object.keys(titles) as Facet[]).map((facet) => {
              const counts = new Map<string, number>();
              inSource.filter((row) => matches(row, facet)).forEach((row) => { const value = valueOf(row, facet); if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1); });
              if (counts.size === 0) return null;
              return <FilterRailGroup key={facet} title={titles[facet]}>
                {[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => <FilterRailRow key={value} label={value} count={count} active={picks[facet] === value} testId={`claims-rail-${facet}-${value}`}
                  onClick={() => setPicks((previous) => { const next = { ...previous }; if (next[facet] === value) delete next[facet]; else next[facet] = value; return next; })} />)}
              </FilterRailGroup>;
            })}
            {anyFilter && <div><Button variant="ghost" onClick={() => { setPicks({}); clearSource(); }}>Clear filters</Button></div>}
          </FilterRail>}
          <div className="flex min-w-0 flex-1 flex-col p-2">
            <DataGrid rows={rows} columns={columns} rowKey={(row) => row.id} storageKey="carres.supplier-claims.register.v1"
              appearance="reference" exportName="Supplier Claims" groupBanner={false} stickyIdentity={{ columnKey: "claim" }}
              isLoading={query.isLoading} emptyMessage="No matching claims." searchPlaceholder="Search claims…"
              toolbarStart={<><DropdownMenu label="View" align="start" trigger={<Button variant="neutral" size="sm">View: {picks.status || "All"}</Button>} items={["All", "Open", "Closed"].map((label) => ({ key: label, label, onSelect: () => setPicks((previous) => { const next = { ...previous }; if (label === "All") delete next.status; else next.status = label; return next; }) }))} />{!railOpen ? <button type="button" aria-label="Show filters" title="Show filters" data-testid="claims-show-filters"
                onClick={() => setRailVisible(true)}
                className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12">
                <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
              </button> : null}</>}
              onFilteredRowsChange={setVisibleRows} onRowDoubleClick={open}
              expandable={{ renderExpansion: (row) => <SupplierClaimInspector claim={row} onOpen={() => open(row)} />, testId: (row) => `claim-inspect-${row.claim_no}` }}
              selectable={{ selectedKeys, onToggle: (key) => setSelectedKeys((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; }), onToggleAll: (keys, all) => setSelectedKeys((previous) => { const next = new Set(previous); keys.forEach((key) => { if (all) next.delete(key); else next.add(key); }); return next; }) }}
              statusSummary={(visible) => <span>{visible.length}{visible.length !== claims.length ? ` of ${claims.length}` : ""} {claims.length === 1 ? "claim" : "claims"} · {visible.reduce((sum, row) => sum + row.qty, 0)} affected quantity</span>}
            />
          </div>
        </div>}
    </div>
    {claimId && <div ref={objectRef} className="absolute inset-0 flex min-h-0 flex-col bg-background" data-testid="claim-object">
      <SalesOrderTabs identity={claim?.claim_no || "Supplier Claim"} customer={claim?.supplier_name} backLabel="Supplier Claims" backTo="/operation?tab=claims" onBack={(event) => { event.preventDefault(); close(); }}
        status={claim ? <StatusPill tone="neutral">{statusLabel(claim)}</StatusPill> : undefined}
        right={position >= 0 ? <div className="flex items-center gap-2">
          <Button variant="ghost" aria-label="Previous Claim" disabled={position === 0} onClick={() => open(visibleRows[position - 1])}><ChevronLeft size={16} /></Button>
          <span className="text-meta tabular-nums">{position + 1} of {visibleRows.length}</span>
          <Button variant="ghost" aria-label="Next Claim" disabled={position === visibleRows.length - 1} onClick={() => open(visibleRows[position + 1])}><ChevronRight size={16} /></Button>
        </div> : undefined} />
      <div className="min-h-0 flex-1 overflow-auto p-4" key={claim?.id ?? claimId} data-testid="claim-object-scroll">
        {query.isError ? <div role="alert"><EmptyState title={errorTitle} detail={query.error?.message} action={<Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button>} /></div>
          : query.isLoading ? <EmptyState title="Loading claim…" />
          : claim ? <SupplierClaimPanel claim={claim} />
          : <EmptyState title="Claim is not available." action={<Button variant="neutral" onClick={close}>Supplier Claims</Button>} />}
      </div>
    </div>}
  </div>;
}
