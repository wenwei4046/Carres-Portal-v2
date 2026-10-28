/**
 * THE ROUTE TAB of the one task view (owner's round 3 brief of 13 Oct 2026,
 * point 2): where the Sales Order behind the task stands, top to bottom.
 *
 * A SUMMARY (Law B). Every point is `missionRouteModel`'s reading, through the
 * same `useMissionRoute` the Work page draws its Order Route from: one
 * arithmetic, two drawings. Nothing is recalculated here and nothing is
 * written. A task that serves several Sales Orders shows one at a time.
 */
import { Component, useState, type ReactNode } from "react";
import { MISSION_ROUTE_COPY as R, type RouteTone } from "@carres/shared";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import { useMissionRoute } from "../work/WorkOrderRoute";
import { TASK_VIEW_WORDS as W } from "./task-view";

export interface TaskOrder {
  orderId: string;
  /** `SO-1256` */
  label: string;
}

const DOT: Record<RouteTone, string> = {
  done: "border-c-ok-fg bg-c-ok-fg",
  current: "border-c-ink bg-c-ink",
  attention: "border-c-warn-fg bg-c-warn-fg",
  missed: "border-c-warn-fg bg-c-warn-fg",
  future: "border-c-chip-border bg-white",
};
const LATE = (tone: RouteTone) => tone === "attention" || tone === "missed";

/** A summary may never take the task down with it: a route that cannot be
 *  drawn says so in one line, and the task's own steps stay usable. */
class RouteGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="status" className="text-body text-c-secondary" data-testid="task-route-state">{W.routeFailed}</p>
      : this.props.children;
  }
}

function OrderRoute({ order, onOpen }: { order: TaskOrder; onOpen: (orderId: string) => void }) {
  const { route, loading, failed } = useMissionRoute(order.orderId);
  if (!route) {
    return <p role="status" className="text-body text-c-secondary" data-testid="task-route-state">{loading && !failed ? W.routeLoading : W.routeFailed}</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid={`task-route-${order.orderId}`}>
      {route.header ? (
        <p className={`text-meta font-medium ${LATE(route.header.tone) ? "text-c-warn-fg" : "text-c-secondary"}`} data-testid="task-route-header">{route.header.text}</p>
      ) : null}
      <ol className="m-0 flex list-none flex-col p-0" aria-label={R.heading}>
        {route.points.map((point, index) => (
          <li key={point.key} className="flex items-stretch gap-2.5" data-tone={point.tone} data-testid={`task-route-point-${point.key}`}>
            <span className="flex w-2.5 shrink-0 flex-col items-center" aria-hidden="true">
              <span className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full border ${DOT[point.tone]}`} />
              {index < route.points.length - 1 ? <span className={`w-px flex-1 ${point.tone === "done" ? "bg-c-ok-fg" : "bg-c-chip-border"}`} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 items-start justify-between gap-3 pb-2.5">
              <span className="flex min-w-0 flex-col">
                <span className={`text-body ${point.tone === "future" ? "text-c-secondary" : "font-medium text-c-ink"}`}>{point.label}</span>
                <span className={`text-meta ${LATE(point.tone) ? "text-c-warn-fg" : "text-c-secondary"}`}>{point.status}</span>
              </span>
              {point.dateText ? <span className={`shrink-0 text-meta ${LATE(point.tone) ? "font-medium text-c-warn-fg" : "text-c-secondary"}`}>{point.dateText}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {route.paymentLine ? (
        <p className={`text-meta ${LATE(route.paymentLine.tone) ? "font-medium text-c-warn-fg" : "text-c-secondary"}`} data-testid="task-route-payment">{route.paymentLine.text}</p>
      ) : null}
      <div><Button size="sm" onClick={() => onOpen(order.orderId)} data-testid="task-route-open">{W.open(order.label)}</Button></div>
    </div>
  );
}

export default function TaskRoute({ orders, onOpen }: { orders: readonly TaskOrder[]; onOpen: (orderId: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (orders.length === 0) return <p className="text-body text-c-secondary" data-testid="task-route-none">{W.noRoute}</p>;
  const order = orders.find((o) => o.orderId === picked) ?? orders[0]!;
  return (
    <div className="flex flex-col gap-2.5" data-testid="task-route">
      {orders.length > 1 ? (
        <Select id="task-route-order" label={W.routeOf} value={order.orderId} onValueChange={setPicked}
          options={orders.map((o) => ({ value: o.orderId, label: o.label }))} />
      ) : null}
      <RouteGuard key={order.orderId}><OrderRoute order={order} onOpen={onOpen} /></RouteGuard>
    </div>
  );
}
