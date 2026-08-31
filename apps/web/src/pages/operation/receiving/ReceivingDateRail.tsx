import type { ReceivingDateRailRow, ReceivingRegisterFilter } from "@carres/shared";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "../components/workspace-rail";

function dateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export default function ReceivingDateRail({
  rows,
  selected,
  onSelect,
  onHide,
}: {
  rows: readonly ReceivingDateRailRow[];
  selected: ReceivingRegisterFilter | null;
  onSelect: (filter: ReceivingRegisterFilter) => void;
  onHide?: () => void;
}) {
  return (
    <FilterRail testId="receiving-date-rail" onHide={onHide}>
      <FilterRailGroup title="RECEIVING DATE">
        {rows.map((row) => (
          <FilterRailRow
            key={row.key}
            label={dateLabel(row.label)}
            count={row.count}
            active={selected === row.key}
            onClick={() => onSelect(row.key)}
            title={/^\d{4}-\d{2}-\d{2}$/.test(row.key) ? row.key : undefined}
            testId={`receiving-date-${row.key}`}
          />
        ))}
      </FilterRailGroup>
    </FilterRail>
  );
}
