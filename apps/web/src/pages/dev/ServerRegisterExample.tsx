/** /ui only: an in-memory server response demonstrates full-population choices. */
// design-standard: not-a-list-page — shared DataGrid capability example.
import { useCallback, useMemo, useState } from "react";
import { matchesRegisterColumnFilters, type RegisterColumnQuery } from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
const RECORDS = Array.from({ length: 61 }, (_, index) => ({ id: `Preview ${index + 1}`, supplier: index === 60 ? "Preview supplier B" : "Preview supplier A" }));
const COLUMNS: DataGridColumn<(typeof RECORDS)[number]>[] = [
  { key: "id", label: "Record", width: 160, sortable: false, accessor: row => row.id, filterable: false },
  { key: "supplier", label: "Supplier", width: 240, sortable: false, accessor: row => row.supplier },
];
const EMPTY: RegisterColumnQuery = { filters: {}, dateFilters: {}, numberFilters: {}, dateRangeFilters: {}, sort: null };
export default function ServerRegisterExample() {
  const [query, setQuery] = useState(EMPTY); const [offset, setOffset] = useState(0); const [search, setSearch] = useState("");
  const change = useCallback((next: RegisterColumnQuery) => { setQuery(next); setOffset(0); }, []);
  const find = useCallback((next: string) => { setSearch(next); setOffset(0); }, []);
  const all = useMemo(() => RECORDS.filter(row => `${row.id} ${row.supplier}`.toLowerCase().includes(search.toLowerCase()) && matchesRegisterColumnFilters(query, key => key === "supplier" ? { text: row.supplier } : undefined)), [query, search]);
  return <div className="flex flex-col gap-2">
    <DataGrid appearance="reference" presentationTools groupBanner={false} allowColumnGrouping={false} rows={all.slice(offset, offset + 5)} columns={COLUMNS} rowKey={row => row.id}
      storageKey="ui.server-register.example" searchPlaceholder="Search preview records…" onSearchChange={find}
      serverColumns={{ values: { supplier: ["Preview supplier A", "Preview supplier B"] }, onChange: change }}
      statusSummary={() => `${all.length} preview record${all.length === 1 ? "" : "s"}`} />
    <div className="flex gap-2"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 5))}>Previous</Button><Button disabled={offset + 5 >= all.length} onClick={() => setOffset(offset + 5)}>Next</Button></div>
  </div>;
}
