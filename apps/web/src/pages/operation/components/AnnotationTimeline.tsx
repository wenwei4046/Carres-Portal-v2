import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileInput,
} from "lucide-react";
import type { OrderEventCategory } from "@carres/shared";
import {
  useOrderTimeline,
  useOperationOrder,
  useAddAnnotation,
  type TimelineEntry,
  type AnnotationTag,
} from "@/lib/queries";
import { useActiveOrder } from "@/lib/active-order";
import { fmtDate } from "@/lib/fmt-date";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  IconChip,
  describeActivity,
  isImport,
  isToday,
} from "./activity-display";

// ─── Lifecycle tracker — "where is this order?" at a glance ────────────────────

const STEPS = ["Placed", "Confirmed", "Production", "Delivery", "Delivered"] as const;

function stepIndexOf(
  order: { status?: string | null; operation_stage?: string | null } | undefined,
): { index: number; cancelled: boolean } {
  if (!order) return { index: 0, cancelled: false };
  if (order.status === "cancelled") return { index: 0, cancelled: true };
  switch (order.operation_stage) {
    case "placed":
      return { index: 0, cancelled: false };
    case "confirmed":
      return { index: 1, cancelled: false };
    case "in_production":
      return { index: 2, cancelled: false };
    case "ready_to_dispatch":
    case "dispatched":
      return { index: 3, cancelled: false };
    case "delivered":
      return { index: 4, cancelled: false };
  }
  if (order.status === "delivered") return { index: 4, cancelled: false };
  if (order.status === "proceed_order") return { index: 1, cancelled: false };
  return { index: 0, cancelled: false };
}

function LifecycleStepper({ index, cancelled }: { index: number; cancelled: boolean }) {
  if (cancelled) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5 text-meta text-red-700">
        <AlertTriangle size={14} /> Order cancelled
      </div>
    );
  }
  return (
    <div className="flex items-start">
      {STEPS.map((label, i) => {
        const done = i < index;
        const current = i === index;
        {/* v4 sweep — cream/warm greys out: pending dots + lines read as the
            neutral hairline grey; done/current keep their status colours. */}
        const dot = done ? "#3B6D11" : current ? "#185FA5" : "#E5E7EB";
        const line = i <= index ? "#97C459" : "#E5E7EB";
        return (
          <div key={label} className="flex-1 text-center relative">
            {i > 0 && (
              <div
                className="absolute top-[9px] left-[-50%] w-full h-[2px]"
                style={{ background: line }}
              />
            )}
            <div
              className="relative w-5 h-5 rounded-full grid place-items-center mx-auto"
              style={{
                background: dot,
                color: done || current ? "#fff" : "#B4B2A9",
                border: !done && !current ? "1px solid #E5E7EB" : undefined,
              }}
            >
              {done && <Check size={11} strokeWidth={3} />}
            </div>
            <div
              className="text-label mt-1"
              style={{ color: current ? "#185FA5" : "#8A8378", fontWeight: current ? 500 : 400 }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Note tag badge ───────────────────────────────────────────────────────────

const TAG_LABEL: Record<AnnotationTag, string> = {
  follow_up: "Follow up",
  escalate: "Escalate to Jess",
  resolved: "Resolved",
};
const TAG_CLASS: Record<AnnotationTag, string> = {
  follow_up: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  escalate: "bg-red-50 text-red-700 border border-red-200",
  resolved: "bg-green-50 text-green-700 border border-green-200",
};

function TagBadge({ tag }: { tag: AnnotationTag }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-label font-medium px-1.5 py-0.5 rounded ${TAG_CLASS[tag]}`}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const time = fmtDate(entry.occurred_at, { time: true });
  const { category, title, body } = describeActivity(entry);
  const isNote = entry.kind === "annotation";
  return (
    <div
      className={`flex gap-2.5 py-2 border-t border-dashed border-base-100 first:border-t-0 ${
        category === "exception" ? "-mx-4 px-4 bg-red-50/60" : ""
      }`}
    >
      <div className="pt-0.5">
        <IconChip category={category} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-meta font-medium text-base-800 leading-snug">
            {title}
            {isNote && entry.tag && (
              <span className="ml-1.5 align-middle">
                <TagBadge tag={entry.tag} />
              </span>
            )}
          </span>
          <span className="font-mono text-label text-base-400 whitespace-nowrap mt-0.5">
            {time}
          </span>
        </div>
        {body ? (
          <p className="text-meta text-base-700 leading-relaxed whitespace-pre-wrap break-words mt-0.5">
            {body}
          </p>
        ) : (
          <div className="text-label text-base-500 mt-0.5">{entry.actor_name ?? "System"}</div>
        )}
      </div>
    </div>
  );
}

function ImportGroupRow({ run }: { run: TimelineEntry[] }) {
  const [open, setOpen] = useState(false);
  const latest = run[0];
  const earliest = run[run.length - 1];
  const range =
    run.length > 1
      ? `${fmtDate(earliest.occurred_at)} – ${fmtDate(latest.occurred_at)}`
      : fmtDate(latest.occurred_at);
  return (
    <div className="border-t border-dashed border-base-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-base-50 rounded"
      >
        <div
          className="flex-none w-7 h-7 rounded-full grid place-items-center"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
          aria-hidden
        >
          <FileInput size={15} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-meta text-base-600">
            Imported from AutoCount <span className="text-base-400">· {run.length} times</span>
          </div>
          <div className="text-label text-base-400">{range}</div>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-base-400" />
        ) : (
          <ChevronRight size={14} className="text-base-400" />
        )}
      </button>
      {open && (
        <div className="pl-9 pb-1">
          {run.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between py-1 text-label text-base-500"
            >
              <span>{e.actor_name ?? "System"}</span>
              <span className="font-mono text-label text-base-400">
                {fmtDate(e.occurred_at, { time: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add annotation form ──────────────────────────────────────────────────────

function AddAnnotationForm({ orderId }: { orderId: string }) {
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<AnnotationTag | "">("");
  const mutation = useAddAnnotation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    mutation.mutate(
      { orderId, content: content.trim(), tag: tag || null },
      {
        onSuccess: () => {
          setContent("");
          setTag("");
          toast.success("Note saved");
        },
        onError: () => toast.error("Save failed, please retry"),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a note…"
        rows={2}
        className="w-full text-meta px-2.5 py-2 border border-base-200 rounded-[8px] resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder-base-400 font-body"
      />
      <div className="flex items-center gap-2">
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value as AnnotationTag | "")}
          className="text-label border border-base-200 rounded-[8px] px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">General note · no action</option>
          <option value="follow_up">Follow up</option>
          <option value="escalate">Escalate to Jess</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          type="submit"
          disabled={!content.trim() || mutation.isPending}
          className="ml-auto text-label font-medium px-3 py-1 rounded-[8px] bg-base-900 text-white disabled:opacity-40 hover:bg-base-800 transition-colors"
        >
          {mutation.isPending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

type RenderItem =
  | { kind: "row"; entry: TimelineEntry; category: OrderEventCategory }
  | { kind: "group"; run: TimelineEntry[] };

function itemTime(it: RenderItem): string {
  return it.kind === "row" ? it.entry.occurred_at : it.run[0].occurred_at;
}

interface Props {
  orderId: string;
}

export default function AnnotationTimeline({ orderId }: Props) {
  const { data, isLoading } = useOrderTimeline(orderId);
  const { data: orderData } = useOperationOrder(orderId);
  const setActiveOrder = useActiveOrder((s) => s.set);
  const entries = useMemo(() => data ?? [], [data]);
  const [filter, setFilter] = useState<OrderEventCategory | "all">("all");

  const described = useMemo(
    () => entries.map((e) => ({ entry: e, category: describeActivity(e).category })),
    [entries],
  );
  const counts = useMemo(() => {
    const m = {} as Record<OrderEventCategory, number>;
    for (const d of described) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [described]);
  const presentCategories = CATEGORY_ORDER.filter((c) => counts[c] > 0);

  const items = useMemo<RenderItem[]>(() => {
    const filtered =
      filter === "all" ? described : described.filter((d) => d.category === filter);
    const out: RenderItem[] = [];
    let i = 0;
    while (i < filtered.length) {
      if (isImport(filtered[i].entry)) {
        let j = i;
        while (j < filtered.length && isImport(filtered[j].entry)) j++;
        const run = filtered.slice(i, j).map((d) => d.entry);
        out.push(
          run.length > 1
            ? { kind: "group", run }
            : { kind: "row", entry: run[0], category: "system" },
        );
        i = j;
      } else {
        out.push({ kind: "row", entry: filtered[i].entry, category: filtered[i].category });
        i++;
      }
    }
    return out;
  }, [described, filter]);

  const today = items.filter((it) => isToday(itemTime(it)));
  const earlier = items.filter((it) => !isToday(itemTime(it)));
  const step = stepIndexOf(orderData?.order);

  const renderItem = (it: RenderItem) =>
    it.kind === "group" ? (
      <ImportGroupRow key={it.run[0].id} run={it.run} />
    ) : (
      <TimelineRow key={it.entry.id} entry={it.entry} />
    );

  return (
    <div>
      {/* Back to the global feed — this panel is scoped to one order. */}
      <button
        type="button"
        onClick={() => setActiveOrder(null)}
        className="inline-flex items-center gap-1 text-label text-base-500 hover:text-base-900 mb-2"
      >
        <ChevronLeft size={13} /> All activity
      </button>

      {orderData?.order && (
        <div className="mb-3 px-1">
          <LifecycleStepper index={step.index} cancelled={step.cancelled} />
        </div>
      )}

      {isLoading ? (
        <div className="text-meta text-base-400 py-2">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-meta text-base-500 py-2">No notes or activity yet.</div>
      ) : (
        <>
          {presentCategories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              <FilterChip
                label="All"
                count={described.length}
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              {presentCategories.map((c) => (
                <FilterChip
                  key={c}
                  label={CATEGORY_LABEL[c]}
                  count={counts[c]}
                  active={filter === c}
                  onClick={() => setFilter(c)}
                />
              ))}
            </div>
          )}

          <div className="bg-white border border-base-200 rounded-[8px] px-4 py-2 mb-3">
            {today.length > 0 && (
              <>
                <div className="text-label uppercase tracking-[0.05em] text-base-400 pb-1">
                  Today
                </div>
                {today.map(renderItem)}
              </>
            )}
            {earlier.length > 0 && (
              <>
                <div
                  className={`text-label uppercase tracking-[0.05em] text-base-400 pb-1 ${
                    today.length > 0 ? "pt-3" : ""
                  }`}
                >
                  Earlier
                </div>
                {earlier.map(renderItem)}
              </>
            )}
            {items.length === 0 && (
              <div className="text-meta text-base-400 py-2">Nothing in this filter.</div>
            )}
          </div>
        </>
      )}
      <AddAnnotationForm orderId={orderId} />
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded-full border transition-colors"
      style={{
        color: active ? "#FFFFFF" : "#4B5563",
        background: active ? "#221F20" : "#FFFFFF",
        borderColor: active ? "#221F20" : "#DDD8CE",
      }}
    >
      {label}
      <span className="tabular-nums" style={{ color: active ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>
        {count}
      </span>
    </button>
  );
}
