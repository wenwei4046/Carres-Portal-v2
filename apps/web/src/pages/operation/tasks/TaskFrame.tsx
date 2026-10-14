/**
 * THE TASK FRAME — how a module's panel becomes the one task view (owner's
 * round 3 brief of 13 Oct 2026, point 2).
 *
 * The Tasks area knows the task (its list card); the owning module knows the
 * work. A module panel draws `<TaskFrame steps={…} />` and passes what only it
 * can say: its extra facts, the Sales Orders the task serves, what was
 * recorded and its documents. The frame places them:
 *
 *   Steps     the module's own work, through its own doors
 *   Route     the Order Route of the Sales Order behind the task
 *   History   what was recorded, newest first
 *   Files     the task's documents, staged along the route
 *
 * It reads nothing itself and writes nothing. Outside the Tasks area (a test,
 * another host) a panel passes `head`, the same facts in its own words.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import MIcon from "@/components/carres/MIcon";
import TaskView, { type TaskViewFact } from "@/components/kit/TaskView";
import type { WorkRow } from "../use-open-work";
import TaskFiles from "./TaskFiles";
import TaskRequest, { canRecordRequest } from "./TaskRequest";
import TaskRoute, { type TaskOrder } from "./TaskRoute";
import type { TaskCard } from "./task-cards";
import {
  TASK_VIEW_WORDS as W, fileCount, historyWhen, lifecycleHistory, sortHistory, taskFacts, taskHead,
  type TaskFileStage, type TaskHead, type TaskHistoryEvent,
} from "./task-view";

/** The opened task, as the Tasks area lists it. */
export const TaskOpenContext = createContext<{
  row: WorkRow;
  card: TaskCard;
  /** The desk's way to say a result and return to the list (`WorkPanelHost.result`). */
  result?: (words: string) => void;
} | null>(null);

function History({ events }: { events: readonly TaskHistoryEvent[] }) {
  if (events.length === 0) return <p className="text-body text-c-secondary" data-testid="task-history-none">{W.noHistory}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0" data-testid="task-history">
      {events.map((event) => (
        <li key={event.key} className="flex flex-col" data-testid={`task-history-${event.key}`}>
          <span className="break-words text-body text-c-ink">{event.text}</span>
          {event.detail ? <span className="break-words text-meta text-c-secondary">{event.detail}</span> : null}
          <span className="text-meta text-c-secondary">
            <time dateTime={event.at}>{historyWhen(event.at)}</time>
            {event.by ? ` · ${event.by}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function TaskFrame({ head, steps, facts = [], orders = [], salesOrders, history = [], files = [], plain = false, "data-testid": testId }: {
  /** The task in the module's own words, used only outside the Tasks area:
   *  its head, and `facts` standing for the list card's own rows. */
  head: Pick<TaskHead, "title" | "page" | "record" | "moduleIcon"> & { destination?: string; facts?: readonly TaskViewFact[] };
  steps: ReactNode;
  /** Facts only the owning module knows, after the task's own. */
  facts?: readonly TaskViewFact[];
  /** The Sales Orders the task serves, in the module's source order. */
  orders?: readonly TaskOrder[];
  /** What the `Sales Order` fact opens: the module's embedded Sales Orders. */
  salesOrders?: ReactNode;
  history?: readonly TaskHistoryEvent[];
  files?: readonly TaskFileStage[];
  /** A task about no order and no document (an internal task): `Steps` and
   *  `History` only, never an empty `Route` or `Files`. */
  plain?: boolean;
  "data-testid"?: string;
}) {
  const navigate = useNavigate();
  const opened = useContext(TaskOpenContext);
  const shown: Pick<TaskHead, "title" | "page" | "record" | "moduleIcon"> & { owner: string | null; destination: string | null } = opened
    ? taskHead(opened.row, opened.card)
    : { ...head, owner: null, destination: head.destination ?? null };
  const [ordersShown, setOrdersShown] = useState(false);

  const allFacts = useMemo<TaskViewFact[]>(() => {
    const own = opened ? taskFacts(opened.row, opened.card, facts) : [...(head.facts ?? []), ...facts];
    if (orders.length === 0) return own;
    /* The head already names the record: a task ABOUT one Sales Order does not
       repeat its number as a fact with nothing to open. */
    if (orders.length === 1 && !salesOrders && orders[0]!.label === shown.record) return own;
    const word = orders.length === 1 ? orders[0]!.label : W.salesOrders(orders.length);
    return [...own, {
      key: "sales-order", icon: "receipt_long", label: W.salesOrder,
      value: salesOrders ? (
        <button type="button" aria-expanded={ordersShown} onClick={() => setOrdersShown((on) => !on)} data-testid="task-sales-orders-toggle"
          className="inline-flex items-center gap-1 text-left text-c-ink outline-none hover:underline focus-visible:[outline:var(--c-focus)]">
          {word}
          <MIcon name={ordersShown ? "expand_less" : "expand_more"} size={16} className="text-c-muted" />
        </button>
      ) : word,
      detail: salesOrders && ordersShown ? salesOrders : undefined,
    }];
  }, [opened, head.facts, facts, orders, salesOrders, ordersShown, shown.record]);

  const events = useMemo(() => sortHistory([...(opened ? lifecycleHistory(opened.row) : []), ...history]), [opened, history]);
  const fileTotal = fileCount(files);
  const openOrder = (orderId: string) => navigate(`/operation/orders/so/${orderId}`);
  const destination = shown.destination;

  /* `Record as sent`: only for the opened open work of the Tasks area, where
     the desk can say the result and return to the list. */
  const request = opened?.result && canRecordRequest(opened.row)
    ? <TaskRequest key={opened.row.id} row={opened.row} onRecorded={opened.result} />
    : null;

  return (
    <TaskView
      data-testid={testId}
      afterFacts={request}
      title={shown.title}
      moduleIcon={shown.moduleIcon}
      page={shown.page}
      record={shown.record}
      openRecordLabel={shown.record ? W.open(shown.record) : undefined}
      onOpenRecord={shown.record && destination ? () => navigate(destination) : undefined}
      owner={shown.owner}
      facts={allFacts}
      tabsLabel={W.sections}
      tabs={[
        { key: "steps", label: W.tab.steps, content: steps },
        ...(plain ? [] : [{ key: "route", label: W.tab.route, content: <TaskRoute orders={orders} onOpen={openOrder} /> }]),
        { key: "history", label: W.tab.history, content: <History events={events} /> },
        ...(plain ? [] : [{ key: "files", label: W.filesTab(fileTotal), content: <TaskFiles stages={files} /> }]),
      ]}
    />
  );
}

/**
 * A FORM TOO WIDE FOR THE PANEL — drawn on the host's full surface
 * (`WorkPanelHost.openReview`, the door Issue PO's review already uses), never
 * squeezed into 320 to scroll sideways. The form keeps its own `Cancel` and
 * its own saving button: those are the only two ways out, so nothing typed is
 * lost to a stray click. The task stays mounted underneath.
 */
export function TaskWideSurface({ title, about, children }: { title: string; about?: string | null; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-c-ground" data-testid="task-wide-surface">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 border-b border-c-card-border bg-white px-5 py-3.5">
        <h2 className="text-strong text-c-ink">{title}</h2>
        {about ? <span className="text-body text-c-secondary">{about}</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto max-w-[1100px] rounded-lg border border-c-card-border bg-white p-4">{children}</div>
      </div>
    </div>
  );
}
