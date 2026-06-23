import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Save, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  SO_GRID_COLUMNS,
  soGridColumnDef,
  type SoGridConfig,
} from "@carres/shared";
import { useSalesOrderGrid, useUpdateSoGridConfig } from "@/lib/queries";
import DataGrid, { type DataGridColumn, type DataGridRow } from "@/components/data-grid/DataGrid";
import SalesOrderColumnSettings from "./SalesOrderColumnSettings";

// ===========================================================================
// Sales Order Maintenance (2026-06-16) — AutoCount-style configurable SO grid.
// Rows are read-only (every order flattened to one row per line); the page
// owns the shared column config (visibility/order/width/labels + option lists)
// and persists it via PUT on Save.
// ===========================================================================

export default function SalesOrderMaintenancePage() {
  const gridQ = useSalesOrderGrid();
  const saveMut = useUpdateSoGridConfig();

  const [config, setConfig] = useState<SoGridConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  // Sync the draft config from the server whenever there are no local edits.
  const serverConfig = gridQ.data?.config;
  useEffect(() => {
    if (serverConfig && !dirty) setConfig(serverConfig);
  }, [serverConfig, dirty]);

  // Close the Columns popover on outside click.
  useEffect(() => {
    if (!columnsOpen) return;
    const h = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [columnsOpen]);

  // Option-column choices = curated (config) ∪ values seen in the data.
  const optionsByKey = useMemo(() => {
    const rows = gridQ.data?.rows ?? [];
    const out: Record<string, string[]> = {};
    for (const def of SO_GRID_COLUMNS) {
      if (!def.option) continue;
      const set = new Set<string>(config?.options?.[def.key] ?? []);
      for (const r of rows) {
        const v = r[def.key];
        if (v !== null && v !== undefined && v !== "") set.add(String(v));
      }
      out[def.key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [gridQ.data, config]);

  const visibleColumns: DataGridColumn[] = useMemo(() => {
    if (!config) return [];
    return [...config.columns]
      .filter((c) => c.visible)
      .sort((a, b) => a.order - b.order)
      .map((c): DataGridColumn | null => {
        const def = soGridColumnDef(c.key);
        if (!def) return null;
        return {
          key: c.key,
          label: c.label ?? def.label,
          type: def.type,
          width: c.width,
          align: def.align,
          option: def.option,
          options: def.option ? optionsByKey[c.key] : undefined,
        };
      })
      .filter((x): x is DataGridColumn => x !== null);
  }, [config, optionsByKey]);

  const totalCols = config?.columns.length ?? SO_GRID_COLUMNS.length;
  const visibleCount = visibleColumns.length;

  function onResize(key: string, width: number) {
    setConfig((prev) =>
      prev ? { ...prev, columns: prev.columns.map((c) => (c.key === key ? { ...c, width } : c)) } : prev,
    );
    setDirty(true);
  }

  function toggleColVisible(key: string) {
    setConfig((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)) }
        : prev,
    );
    setDirty(true);
  }

  function onConfigChange(next: SoGridConfig) {
    setConfig(next);
    setDirty(true);
  }

  function onSave() {
    if (!config) return;
    saveMut.mutate(config, {
      onSuccess: (res) => {
        setConfig(res.config);
        setDirty(false);
        toast.success("Column config saved");
      },
      onError: (e) => toast.error(e.message ?? "Save failed"),
    });
  }

  function onReset() {
    if (serverConfig) {
      setConfig(serverConfig);
      setDirty(false);
    }
  }

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <div className="kicker">Sales Orders</div>
          <h1 className="t-h1 font-display mt-1.5 text-base-900">Sales Order Maintenance</h1>
          <p className="t-small text-base-600 mt-1">
            Every sales order, flattened by line. Resize, filter, and choose which columns
            show — your column setup is saved and shared.
          </p>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="pl-8 pr-3 py-2 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500 w-64"
          />
        </div>

        <div className="relative" ref={columnsRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((o) => !o)}
            className="btn-secondary text-[12px] inline-flex items-center gap-1.5"
          >
            <Columns3 className="w-3.5 h-3.5" /> Columns{" "}
            <span className="t-tiny text-base-500">
              {visibleCount}/{totalCols}
            </span>
          </button>
          {columnsOpen && config && (
            <div className="absolute z-30 mt-1 left-0 w-64 max-h-80 overflow-auto bg-card text-card-foreground border border-base-200 rounded-[4px] shadow-lg p-2">
              <div className="t-micro text-base-500 px-1 mb-1">Show columns</div>
              {[...config.columns]
                .sort((a, b) => a.order - b.order)
                .map((c) => {
                  const def = soGridColumnDef(c.key);
                  if (!def) return null;
                  return (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-base-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={c.visible}
                        onChange={() => toggleColVisible(c.key)}
                      />
                      <span className="t-small text-base-700 truncate">{c.label ?? def.label}</span>
                    </label>
                  );
                })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="btn-secondary text-[12px] inline-flex items-center gap-1.5"
        >
          <Settings2 className="w-3.5 h-3.5" /> Column Settings
        </button>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="t-tiny text-warning">Unsaved changes</span>}
          {dirty && (
            <button type="button" onClick={onReset} className="btn-ghost text-[12px]">
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saveMut.isPending}
            className="btn-primary text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> {saveMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {gridQ.isLoading && <div className="t-small text-base-500">Loading sales orders…</div>}
      {gridQ.isError && !gridQ.isLoading && (
        <div className="t-small text-danger">Failed to load. Try refreshing.</div>
      )}

      {gridQ.data && config && (
        <DataGrid
          columns={visibleColumns}
          rows={gridQ.data.rows as DataGridRow[]}
          getRowId={(r) => String(r.rowId)}
          onResize={onResize}
          search={search}
          rowCap={300}
          emptyHint="No sales orders match."
        />
      )}

      {settingsOpen && config && (
        <SalesOrderColumnSettings
          config={config}
          optionsByKey={optionsByKey}
          onChange={onConfigChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
