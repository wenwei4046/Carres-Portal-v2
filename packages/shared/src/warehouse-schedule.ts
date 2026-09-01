import { subtractWorkingDays, type IsoDate } from "./working-days";

export interface WarehouseScheduleRow {
  id: string;
  date: IsoDate;
  event: string;
  unitCodes: string[];
  units: number;
  from: string | null;
  to: string | null;
  company: string | null;
  source: string;
  sourcePath: string;
  timing: string;
  operationsReadyBy: IsoDate | null;
  evidence: string | null;
  placeholder?: boolean;
}

export function warehouseOperationsReadyBy(
  eventDate: IsoDate,
  holidays: ReadonlySet<IsoDate> = new Set(),
): IsoDate {
  return subtractWorkingDays(eventDate, 1, { offDays: [0, 6], holidays });
}

function addCalendarDays(iso: IsoDate, amount: number): IsoDate {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + amount));
  return date.toISOString().slice(0, 10);
}

export function warehouseWeekDays(anchor: IsoDate): IsoDate[] {
  const date = new Date(`${anchor.slice(0, 10)}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const monday = addCalendarDays(anchor, -daysSinceMonday);
  return Array.from({ length: 6 }, (_, index) => addCalendarDays(monday, index));
}

export function warehouseScheduleRowsForWeek(
  rows: WarehouseScheduleRow[],
  anchor: IsoDate,
): WarehouseScheduleRow[] {
  const days = warehouseWeekDays(anchor);
  const week = new Set(days);
  const byDate = new Map<IsoDate, WarehouseScheduleRow[]>();
  for (const row of rows) {
    if (!week.has(row.date)) continue;
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  return days.flatMap((date) => {
    const governed = byDate.get(date);
    if (governed?.length) return governed;
    return [{
      id: `blank:${date}`,
      date,
      event: "No warehouse event planned",
      unitCodes: [],
      units: 0,
      from: null,
      to: null,
      company: null,
      source: "—",
      sourcePath: "",
      timing: "—",
      operationsReadyBy: null,
      evidence: null,
      placeholder: true,
    }];
  });
}
