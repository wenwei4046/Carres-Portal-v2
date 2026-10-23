// design-standard: not-a-list-page — a destination with module views; each view is the kit DataGrid inside the Warehouse shell, like Inventory.
/**
 * WAREHOUSES — the Houzs-way warehouse pages for office staff.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * "just clear Carress rules and Implement Houzs inside". Jess was not part of
 * this decision. Five Houzs pages become views of one destination:
 *
 *   Warehouses      every Site (Warehouse Settings' own `warehouses` rows)
 *   Inventory       Units per item at the chosen Site (Houzs: qty per SKU)
 *   Racks and Bins  Bins per Site with a colour fill overview (0718)
 *   Loading List    what is still to load, per item per DO
 *   Stock Card      one item's in/out lines from the Unit lineage
 *
 * Carres keeps its per-Unit model: every number here is a COUNT of Units read
 * from the one register. No second ledger, no cost (Finance owns valuation).
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  loadingListRows,
  warehouseOutboundCards,
  type DeliveryWarehouseScheduleEvent,
  type LoadingListRow,
  type StockCardLine,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useDeliveryWarehouseSchedule, useOperationWarehouse } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import ModuleHeader from "./components/ModuleHeader";

/** COPY-STANDARD "Warehouses — Houzs-way views (Weisiang 2026-10-22)". */
const W = {
  page: "Warehouses",
  sites: "Warehouses",
  inventory: "Inventory",
  bins: "Racks and Bins",
  loading: "Loading List",
  stockCard: "Stock Card",
  site: "Site",
  address: "Address",
  item: "Item",
  units: "Units",
  available: "Available",
  reserved: "Reserved",
  items: "Items",
  rack: "Rack",
  bin: "Bin",
  addBin: "Add bin",
  unitId: "Unit ID",
  putInBin: "Put in bin",
  takeOut: "Take out of bin",
  empty: "Empty",
  holding: "Holding goods",
  holdingReserved: "Holding reserved goods",
  doNo: "DO No",
  soNo: "SO No",
  date: "Pickup date",
  toLoad: "To load",
  qty: "Qty",
  loaded: "Loaded",
  logistics: "Logistics",
  when: "Date",
  what: "Movement",
  qtyIn: "In",
  qtyOut: "Out",
  balance: "Balance",
  allSites: "All Sites",
  back: "Back to Inventory",
  counted: "Counted stock",
  notRecorded: "Not recorded",
  chooseSite: "Choose a Site",
  noSites: "No Site is set up.",
  noStock: "No goods at this Site.",
  noBins: "No bins at this Site yet.",
  nothingToLoad: "Nothing to load.",
  noLines: "No movements for this item.",
  couldNotRead: "Could not be loaded. Try again.",
  saved: "Saved",
} as const;

const MOVEMENT_WORD: Record<string, string> = {
  unit_born: "Recorded",
  status_changed: "Status changed",
  site_changed: "Moved Site",
};

type View = "sites" | "inventory" | "bins" | "loading";
const VIEWS: readonly View[] = ["sites", "inventory", "bins", "loading"];

interface BinRow {
  id: string;
  rack: string;
  bin: string;
  units: Array<{ unitCode: string; sku: string; availability: string }>;
}

/** The Bin's fill: empty, holding goods, or holding goods a customer is waiting for. */
export function binFill(b: Pick<BinRow, "units">): "empty" | "holding" | "reserved" {
  if (b.units.length === 0) return "empty";
  return b.units.some((u) => u.availability === "reserved") ? "reserved" : "holding";
}

const FILL_CLASS = {
  empty: "bg-white border-c-card-border",
  holding: "bg-c-ok-bg border-c-card-border",
  reserved: "bg-c-hold-bg border-c-card-border",
} as const;
const FILL_WORD = { empty: W.empty, holding: W.holding, reserved: W.holdingReserved } as const;

export default function WarehousesPage() {
  const [params, setParams] = useSearchParams();
  const viewParam = params.get("view") as View | null;
  const view: View = viewParam && VIEWS.includes(viewParam) ? viewParam : "sites";
  const sku = params.get("sku");
  const warehouses = useOperationWarehouse();
  const sites = warehouses.data?.warehouses ?? [];
  const siteId = params.get("site") ?? sites[0]?.id ?? "";

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    p.set("tab", "warehouses");
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p);
  };

  const sitePicker = (
    <Select
      id="warehouses-site"
      toolbar
      value={siteId || undefined}
      placeholder={W.chooseSite}
      onValueChange={(v) => go({ site: v })}
      options={sites.map((s) => ({ value: s.id, label: s.name }))}
    />
  );
  const viewTabs = (
    <Tabs
      variant="segmented"
      label={W.page}
      value={view}
      onValueChange={(v) => go({ view: v, sku: null })}
      tabs={[
        { value: "sites", label: W.sites },
        { value: "inventory", label: W.inventory },
        { value: "bins", label: W.bins },
        { value: "loading", label: W.loading },
      ]}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col" data-testid="warehouses-page">
      <ModuleHeader testId="warehouses-destination-header" word={W.page} docTitle="Warehouses · Warehouse — Carres" destinationHeader />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        {sku ? (
          <StockCard sku={sku} siteId={siteId} sites={sites} toolbar={<>
            <Button onClick={() => go({ sku: null, view: "inventory" })}>{W.back}</Button>
            {sitePicker}
          </>} />
        ) : view === "sites" ? (
          <DataGrid
            appearance="reference"
            storageKey="carres.warehouse.warehouses.v1"
            rows={sites}
            rowKey={(s) => s.id}
            isLoading={warehouses.isLoading}
            emptyMessage={warehouses.isError ? W.couldNotRead : W.noSites}
            exportName={W.page}
            toolbarStart={viewTabs}
            onRowClick={(s) => go({ view: "inventory", site: s.id })}
            columns={[
              { key: "name", label: W.site, accessor: (s) => s.name, searchValue: (s) => s.name, exportValue: (s) => s.name, sortable: true },
              { key: "address", label: W.address, accessor: (s) => s.address ?? W.notRecorded, exportValue: (s) => s.address ?? "" },
              {
                key: "items", label: W.items, align: "right", sortable: true,
                numberValue: (s) => (warehouses.data?.byWarehouse[s.id] ?? []).filter((e) => e.qty > 0).length,
                accessor: (s) => (warehouses.data?.byWarehouse[s.id] ?? []).filter((e) => e.qty > 0).length,
              },
              {
                key: "units", label: W.units, align: "right", sortable: true,
                numberValue: (s) => (warehouses.data?.byWarehouse[s.id] ?? []).reduce((n, e) => n + e.qty, 0),
                accessor: (s) => (warehouses.data?.byWarehouse[s.id] ?? []).reduce((n, e) => n + e.qty, 0),
              },
            ] satisfies DataGridColumn<(typeof sites)[number]>[]}
          />
        ) : view === "inventory" ? (
          <DataGrid
            appearance="reference"
            storageKey="carres.warehouse.inventory-by-item.v1"
            rows={(warehouses.data?.byWarehouse[siteId] ?? []).filter((e) => e.qty > 0 || e.reserved > 0)}
            rowKey={(e) => e.sku}
            isLoading={warehouses.isLoading}
            emptyMessage={warehouses.isError ? W.couldNotRead : W.noStock}
            exportName={W.inventory}
            toolbarStart={<>{viewTabs}{sitePicker}</>}
            onRowClick={(e) => go({ sku: e.sku })}
            columns={[
              { key: "sku", label: W.item, accessor: (e) => e.sku, searchValue: (e) => e.sku, exportValue: (e) => e.sku, sortable: true },
              { key: "qty", label: W.units, align: "right", sortable: true, numberValue: (e) => e.qty, exportValue: (e) => e.qty, accessor: (e) => e.qty },
              { key: "available", label: W.available, align: "right", sortable: true, numberValue: (e) => e.available ?? 0, exportValue: (e) => e.available ?? 0, accessor: (e) => e.available ?? 0 },
              { key: "reserved", label: W.reserved, align: "right", sortable: true, numberValue: (e) => e.reserved, exportValue: (e) => e.reserved, accessor: (e) => e.reserved },
            ]}
          />
        ) : view === "bins" ? (
          <RacksAndBins siteId={siteId} toolbar={<>{viewTabs}{sitePicker}</>} />
        ) : (
          <LoadingList siteId={siteId} toolbar={<>{viewTabs}{sitePicker}</>} />
        )}
      </div>
    </div>
  );
}

function StockCard({ sku, siteId, sites, toolbar }: {
  sku: string;
  siteId: string;
  sites: ReadonlyArray<{ id: string; name: string }>;
  toolbar: React.ReactNode;
}) {
  const q = useQuery<{ sku: string; lines: StockCardLine[] }>({
    queryKey: ["operation", "stock-card", sku, siteId],
    queryFn: () => apiFetch(`/api/ops/stock/stock-card?sku=${encodeURIComponent(sku)}${siteId ? `&site=${encodeURIComponent(siteId)}` : ""}`),
  });
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const valueWord = (line: StockCardLine, v: string | null) =>
    v === null ? "" : line.event === "site_changed" ? siteName.get(v) ?? v : v;
  return (
    <DataGrid<StockCardLine>
      appearance="reference"
      storageKey="carres.warehouse.stock-card.v1"
      rows={[...(q.data?.lines ?? [])].reverse()}
      rowKey={(l) => String(l.seq)}
      isLoading={q.isLoading}
      emptyMessage={q.isError ? W.couldNotRead : W.noLines}
      exportName={`${W.stockCard} ${sku}`}
      toolbarStart={<>{toolbar}<span className="text-body font-medium text-c-ink" data-testid="stock-card-item">{W.stockCard} · {sku}</span></>}
      columns={[
        { key: "when", label: W.when, accessor: (l) => fmtDate(l.eventAt), exportValue: (l) => l.eventAt, sortable: true },
        { key: "unit", label: W.unitId, accessor: (l) => l.unitCode ?? W.counted, searchValue: (l) => l.unitCode ?? "" },
        {
          key: "what", label: W.what,
          accessor: (l) => [MOVEMENT_WORD[l.event] ?? l.event, [valueWord(l, l.fromValue), valueWord(l, l.toValue)].filter(Boolean).join(" to ")].filter(Boolean).join(" · "),
        },
        { key: "in", label: W.qtyIn, align: "right", numberValue: (l) => l.qtyIn, exportValue: (l) => l.qtyIn, accessor: (l) => (l.qtyIn ? l.qtyIn : "") },
        { key: "out", label: W.qtyOut, align: "right", numberValue: (l) => l.qtyOut, exportValue: (l) => l.qtyOut, accessor: (l) => (l.qtyOut ? l.qtyOut : "") },
        { key: "balance", label: W.balance, align: "right", numberValue: (l) => l.balance, exportValue: (l) => l.balance, accessor: (l) => l.balance },
      ]}
    />
  );
}

function RacksAndBins({ siteId, toolbar }: { siteId: string; toolbar: React.ReactNode }) {
  const qc = useQueryClient();
  const key = ["operation", "warehouse-bins", siteId];
  const q = useQuery<{ bins: BinRow[] }>({
    queryKey: key,
    queryFn: () => apiFetch(`/api/ops/stock/bins?site=${encodeURIComponent(siteId)}`),
    enabled: Boolean(siteId),
  });
  const [rack, setRack] = useState("");
  const [bin, setBin] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [binId, setBinId] = useState<string | undefined>();
  const add = useMutation({
    mutationFn: () => apiFetch("/api/ops/stock/bins", { method: "POST", body: JSON.stringify({ siteId, rack, bin }) }),
    onSuccess: () => { setBin(""); toast.success(W.saved); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const place = useMutation({
    mutationFn: (target: string | null) =>
      apiFetch(`/api/ops/stock/register/${encodeURIComponent(unitCode.trim())}/bin`, { method: "POST", body: JSON.stringify({ binId: target }) }),
    onSuccess: () => { setUnitCode(""); toast.success(W.saved); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bins = q.data?.bins ?? [];
  const racks = useMemo(() => {
    const m = new Map<string, BinRow[]>();
    for (const b of bins) m.set(b.rack, [...(m.get(b.rack) ?? []), b]);
    return [...m.entries()];
  }, [bins]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto" data-testid="racks-and-bins">
      <div className="flex flex-wrap items-end gap-2">{toolbar}</div>
      <div className="flex flex-wrap items-end gap-2">
        <Input id="bin-rack" label={W.rack} value={rack} onChange={(e) => setRack(e.target.value)} />
        <Input id="bin-bin" label={W.bin} value={bin} onChange={(e) => setBin(e.target.value)} />
        <Button disabled={!siteId || !rack.trim() || !bin.trim() || add.isPending} onClick={() => add.mutate()}>{W.addBin}</Button>
        <Input id="bin-unit" label={W.unitId} value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
        <Select id="bin-target" label={W.bin} value={binId} onValueChange={setBinId}
          options={bins.map((b) => ({ value: b.id, label: `${b.rack} · ${b.bin}` }))} />
        <Button disabled={!unitCode.trim() || !binId || place.isPending} onClick={() => place.mutate(binId ?? null)}>{W.putInBin}</Button>
        <Button variant="ghost" disabled={!unitCode.trim() || place.isPending} onClick={() => place.mutate(null)}>{W.takeOut}</Button>
      </div>
      <div className="flex flex-wrap gap-3 text-meta text-c-secondary" aria-hidden="true">
        {(["empty", "holding", "reserved"] as const).map((f) => (
          <span key={f} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded border ${FILL_CLASS[f]}`} />{FILL_WORD[f]}
          </span>
        ))}
      </div>
      {q.isLoading ? null : q.isError ? (
        <p className="text-body text-c-secondary" role="alert">{W.couldNotRead}</p>
      ) : racks.length === 0 ? (
        <p className="text-body text-c-secondary">{W.noBins}</p>
      ) : (
        racks.map(([r, list]) => (
          <section key={r} aria-label={`${W.rack} ${r}`} className="flex flex-col gap-1.5">
            <h3 className="text-body font-medium text-c-ink">{W.rack} {r}</h3>
            <div className="flex flex-wrap gap-2">
              {list.map((b) => {
                const fill = binFill(b);
                return (
                  <div key={b.id} data-testid={`bin-${r}-${b.bin}`} data-fill={fill}
                    aria-label={`${W.bin} ${b.bin} · ${FILL_WORD[fill]} · ${b.units.length} ${W.units}`}
                    title={b.units.map((u) => `${u.unitCode} ${u.sku}`).join("\n")}
                    className={`flex min-w-[96px] flex-col rounded-lg border px-3 py-2 ${FILL_CLASS[fill]}`}>
                    <span className="text-body font-medium text-c-ink">{b.bin}</span>
                    <span className="text-meta text-c-secondary">{b.units.length} {W.units}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function LoadingList({ siteId, toolbar }: { siteId: string; toolbar: React.ReactNode }) {
  const q = useDeliveryWarehouseSchedule();
  const rows = useMemo(
    () => loadingListRows(warehouseOutboundCards((q.data?.events ?? []) as DeliveryWarehouseScheduleEvent[]))
      .filter((r) => !siteId || r.warehouseSiteId === null || r.warehouseSiteId === siteId),
    [q.data, siteId],
  );
  return (
    <DataGrid<LoadingListRow>
      appearance="reference"
      storageKey="carres.warehouse.loading-list.v1"
      rows={rows}
      rowKey={(r) => r.key}
      isLoading={q.isLoading}
      emptyMessage={q.isError ? W.couldNotRead : W.nothingToLoad}
      exportName={W.loading}
      toolbarStart={toolbar}
      initialGroupBy={["doNumber"]}
      columns={[
        { key: "eventDate", label: W.date, accessor: (r) => fmtDate(r.eventDate), exportValue: (r) => r.eventDate, sortable: true },
        { key: "doNumber", label: W.doNo, accessor: (r) => r.doNumber, groupValue: (r) => r.doNumber, searchValue: (r) => r.doNumber, exportValue: (r) => r.doNumber, sortable: true, groupable: true },
        { key: "source", label: W.soNo, accessor: (r) => r.source, exportValue: (r) => r.source },
        { key: "item", label: W.item, accessor: (r) => r.name ?? r.sku ?? W.notRecorded, searchValue: (r) => `${r.name ?? ""} ${r.sku ?? ""}`, exportValue: (r) => r.name ?? r.sku ?? "" },
        { key: "qty", label: W.qty, align: "right", numberValue: (r) => r.qty, exportValue: (r) => r.qty, accessor: (r) => r.qty },
        { key: "loaded", label: W.loaded, align: "right", numberValue: (r) => r.loaded, exportValue: (r) => r.loaded, accessor: (r) => r.loaded },
        { key: "toLoad", label: W.toLoad, align: "right", numberValue: (r) => r.toLoad, exportValue: (r) => r.toLoad, accessor: (r) => r.toLoad },
        { key: "logistics", label: W.logistics, accessor: (r) => r.logisticsPartner, exportValue: (r) => r.logisticsPartner },
      ]}
    />
  );
}
