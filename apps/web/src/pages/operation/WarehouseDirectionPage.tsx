import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import Tabs from "@/components/kit/Tabs";

/** Directional page navigation only. Existing schedules and work surfaces
 * retain their own data, Site/date scope and action ownership. */
export default function WarehouseDirectionPage({ direction, workSurface, scheduleSurface }: {
  direction: "inbound" | "outbound"; workSurface: ReactNode; scheduleSurface: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const work = direction === "inbound" ? "warehouse-inbound" : "warehouse-outbound";
  const schedule = direction === "inbound" ? "warehouse-arrival-schedule" : "warehouse-pickup-schedule";
  const showingSchedule = params.get("tab") === schedule;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="shrink-0 overflow-x-auto border-b border-c-card-border bg-c-card px-3 py-2">
      <Tabs label={direction === "inbound" ? "Inbound view" : "Outbound view"}
        value={params.get("tab") === schedule ? schedule : work}
        onValueChange={value => {
          const next = new URLSearchParams(params);
          next.set("tab", value);
          setParams(next);
        }} tabs={[
          { value: work, label: direction === "inbound" ? "Inbound" : "Outbound" },
          { value: schedule, label: direction === "inbound" ? "Arrival Schedule" : "Pickup Schedule" },
        ]} />
    </div>
    <div className={showingSchedule ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}>{workSurface}</div>
    <div className={showingSchedule ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>{scheduleSurface}</div>
  </div>;
}
