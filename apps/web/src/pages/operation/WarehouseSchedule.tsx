import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  warehouseScheduleRowsForWeek,
  warehouseWeekDays,
  type WarehouseScheduleRow,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { useWarehouseSchedule } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";

// design-standard: not-a-list-page — ERP Master Page Control requires this
// Register to sit directly under its one Destination Header, with no enclosing
// ListPageShell frame; DataGrid remains the one shared Register engine.

function dash(value: string | null) {
  return value || "—";
}

function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

export default function WarehouseSchedule({
  todayIso = todayMYT(),
}: {
  todayIso?: string;
} = {}) {
  const navigate = useNavigate();
  const days = useMemo(() => warehouseWeekDays(todayIso), [todayIso]);
  const { data, isLoading, isError, refetch } = useWarehouseSchedule(days[0]!, days[5]!);
  const rows = useMemo(
    () => warehouseScheduleRowsForWeek(data?.rows ?? [], todayIso),
    [data?.rows, todayIso],
  );

  const columns = useMemo<DataGridColumn<WarehouseScheduleRow>[]>(() => [
    {
      key: "date",
      label: "Date",
      width: 142,
      sortable: true,
      groupable: true,
      filterType: "date",
      dateValue: (row) => row.date,
      groupValue: (row) => fmtDate(row.date),
      exportValue: (row) => row.date,
      accessor: (row) => <span className="text-meta text-base-700">{fmtDate(row.date)}</span>,
    },
    {
      key: "event",
      label: "Event",
      minWidth: 210,
      sortable: true,
      searchValue: (row) => row.event,
      exportValue: (row) => row.event,
      accessor: (row) => (
        <span className={row.placeholder ? "text-meta text-base-400" : "text-body text-base-900"}>
          {row.event}
        </span>
      ),
    },
    {
      key: "units",
      label: "Units",
      width: 100,
      align: "right",
      sortable: true,
      numberValue: (row) => row.units,
      filterType: "number",
      exportValue: (row) => row.units,
      accessor: (row) => row.placeholder ? "—" : (
        <span title={row.unitCodes.join(", ") || undefined}>{row.units}</span>
      ),
    },
    { key: "from", label: "From", minWidth: 180, sortable: true, exportValue: (row) => row.from ?? "", accessor: (row) => dash(row.from) },
    { key: "to", label: "To", minWidth: 180, sortable: true, exportValue: (row) => row.to ?? "", accessor: (row) => dash(row.to) },
    { key: "company", label: "Company", minWidth: 170, sortable: true, exportValue: (row) => row.company ?? "", accessor: (row) => dash(row.company) },
    {
      key: "source",
      label: "Source",
      minWidth: 150,
      sortable: true,
      searchValue: (row) => row.source,
      exportValue: (row) => row.source,
      accessor: (row) => row.placeholder ? "—" : (
        <Link
          className="font-medium text-kit-blue-11 hover:underline"
          to={row.sourcePath}
          onClick={(event) => event.stopPropagation()}
        >
          {row.source}
        </Link>
      ),
    },
    { key: "timing", label: "Expected/actual", minWidth: 180, sortable: true, exportValue: (row) => row.timing, accessor: (row) => row.timing },
    {
      key: "operationsReadyBy",
      label: "Operations ready by",
      width: 170,
      sortable: true,
      filterType: "date",
      dateValue: (row) => row.operationsReadyBy,
      exportValue: (row) => row.operationsReadyBy ?? "",
      accessor: (row) => row.operationsReadyBy ? fmtDate(row.operationsReadyBy) : "—",
    },
    { key: "evidence", label: "Evidence", minWidth: 200, sortable: true, exportValue: (row) => row.evidence ?? "", accessor: (row) => dash(row.evidence) },
  ], []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <ModuleHeader
        testId="warehouse-schedule-destination-header"
        word="Schedule"
        docTitle="Schedule · Warehouse — Carres"
        destinationHeader
      />
      {isError ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
          <p className="text-body text-base-700">Schedule could not be loaded</p>
          <button
            type="button"
            className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-11 hover:bg-kit-slate-3"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-white">
          <DataGrid
            rows={rows}
            columns={columns}
            storageKey="carres.warehouse.schedule.layout.v1"
            rowKey={(row) => row.id}
            exportName="Warehouse Schedule"
            searchPlaceholder="Search schedule…"
            defaultGroupBy={["date"]}
            groupBanner={false}
            stickyIdentity={{ columnKey: "event" }}
            isLoading={isLoading}
            emptyMessage="No warehouse event planned."
            onRowDoubleClick={(row) => {
              if (row.sourcePath) navigate(row.sourcePath);
            }}
          />
        </div>
      )}
    </div>
  );
}
