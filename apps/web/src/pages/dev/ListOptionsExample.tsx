/** /ui only: the four list options of 13 Oct 2026 (01 §5) on preview rows. */
// design-standard: not-a-list-page — shared DataGrid capability example.
import { useState } from "react";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";

type Row = { id: string; model: string; lastMonth: number; thisMonth: number; suggested: number; why: string | null };
const ROWS: Row[] = [
  { id: "a", model: "Preview model A", lastMonth: 4, thisMonth: 2, suggested: 0, why: "Enough stock · nothing to buy" },
  { id: "b", model: "Preview model B", lastMonth: 9, thisMonth: 6, suggested: 3, why: null },
  { id: "c", model: "Preview model C", lastMonth: 1, thisMonth: 4, suggested: 2, why: null },
];
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "model", label: "Model", width: 220, accessor: (row) => row.model },
  { key: "lastMonth", label: "Sep", width: 72, align: "right", filterable: false, accessor: (row) => String(row.lastMonth), numberValue: (row) => row.lastMonth },
  { key: "thisMonth", label: "Oct", width: 72, align: "right", filterable: false, band: true, accessor: (row) => <span className="font-semibold">{row.thisMonth}</span>, numberValue: (row) => row.thisMonth },
  { key: "suggested", label: "12 Oct", headerSub: "Mon", width: 88, align: "right", filterable: false, accessor: (row) => String(row.suggested), numberValue: (row) => row.suggested },
];

export default function ListOptionsExample() {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setTicked((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <DataGrid<Row> appearance="reference" palette="slate" presentationTools groupBanner={false} allowColumnGrouping={false} rowHeight={54}
      rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} storageKey="ui.list-options.example" exportName="Preview list options"
      sortDefault={{ key: "suggested", dir: "desc" }}
      selectable={{
        selectedKeys: ticked,
        onToggle: toggle,
        onToggleAll: (keys, allSelected) => setTicked(allSelected ? new Set() : new Set(keys)),
        isSelectable: (row: Row) => row.why == null,
        unselectableReason: (row: Row) => row.why,
      }}
      statusSummary={() => `${ROWS.length} preview models`} />
  );
}
