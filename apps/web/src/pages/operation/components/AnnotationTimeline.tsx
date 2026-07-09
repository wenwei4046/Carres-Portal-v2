import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CircleCheck,
  Banknote,
  Pencil,
  AlertTriangle,
  MessageSquare,
  Package,
  FileText,
  type LucideIcon,
} from "lucide-react";
import {
  eventTypeForLegacyAction,
  orderEventMeta,
  type OrderEventCategory,
} from "@carres/shared";
import {
  useOrderTimeline,
  useAddAnnotation,
  type TimelineEntry,
  type AnnotationTag,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

// ─── Category → icon + colour (the mockup's language: milestone blue · money
//     green · edit amber · exception red · note grey · stock/system neutral) ────

const CATEGORY_STYLE: Record<
  OrderEventCategory,
  { icon: LucideIcon; bg: string; fg: string }
> = {
  milestone: { icon: CircleCheck, bg: "#E6F1FB", fg: "#185FA5" },
  money: { icon: Banknote, bg: "#E7F3DC", fg: "#3B6D11" },
  edit: { icon: Pencil, bg: "#FAEEDA", fg: "#854F0B" },
  exception: { icon: AlertTriangle, bg: "#FCECEA", fg: "#A32D2D" },
  note: { icon: MessageSquare, bg: "#F1EFE8", fg: "#5F5E5A" },
  stock: { icon: Package, bg: "#E6F1FB", fg: "#185FA5" },
  system: { icon: FileText, bg: "#F1EFE8", fg: "#5F5E5A" },
};

// Friendly chip labels + the order categories appear in the filter row.
const CATEGORY_LABEL: Record<OrderEventCategory, string> = {
  milestone: "Milestones",
  money: "Money",
  edit: "Changes",
  exception: "Alerts",
  note: "Notes",
  stock: "Stock",
  system: "System",
};
const CATEGORY_ORDER: OrderEventCategory[] = [
  "exception",
  "note",
  "milestone",
  "money",
  "edit",
  "stock",
  "system",
];

// ─── Tag helpers (human note tags keep their semantic colour) ─────────────────

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
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TAG_CLASS[tag]}`}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

// ─── Map any timeline entry → a display descriptor ────────────────────────────
// Human title + category come from the shared taxonomy; unmapped actions fall
// back to a de-underscored label so nothing ever shows raw jsonb.

function describe(entry: TimelineEntry): {
  category: OrderEventCategory;
  title: string;
  body: string | null;
} {
  if (entry.kind === "annotation") {
    return {
      category: entry.tag === "escalate" ? "exception" : "note",
      title: entry.actor_name ?? "Note",
      body: entry.content ?? null,
    };
  }
  const type = eventTypeForLegacyAction(entry.action);
  if (type) {
    const meta = orderEventMeta(type);
    return { category: meta.category, title: meta.defaultTitle, body: null };
  }
  return {
    category: "system",
    title: (entry.action ?? "Activity").replace(/_/g, " "),
    body: null,
  };
}

// ─── Single timeline entry ────────────────────────────────────────────────────

function TimelineRow({ entry, first }: { entry: TimelineEntry; first: boolean }) {
  const time = fmtDate(entry.occurred_at, { time: true });
  const { category, title, body } = describe(entry);
  const style = CATEGORY_STYLE[category];
  const Icon = style.icon;
  const isNote = entry.kind === "annotation";

  return (
    <div
      className={`flex gap-2.5 py-2 ${first ? "" : "border-t border-dashed border-base-100"} ${
        category === "exception" ? "-mx-4 px-4 bg-red-50/60" : ""
      }`}
    >
      <div
        className="flex-none w-7 h-7 rounded-full grid place-items-center mt-0.5"
        style={{ backgroundColor: style.bg, color: style.fg }}
        aria-hidden
      >
        <Icon size={15} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[12px] font-medium text-base-800 leading-snug">
            {title}
            {isNote && entry.tag && (
              <span className="ml-1.5 align-middle">
                <TagBadge tag={entry.tag} />
              </span>
            )}
          </span>
          <span className="font-mono text-[10px] text-base-400 whitespace-nowrap mt-0.5">
            {time}
          </span>
        </div>
        {body ? (
          <p className="text-[12px] text-base-700 leading-relaxed whitespace-pre-wrap break-words mt-0.5">
            {body}
          </p>
        ) : (
          <div className="text-[11px] text-base-500 mt-0.5">
            {entry.actor_name ?? "System"}
          </div>
        )}
      </div>
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
        className="w-full text-[12px] px-2.5 py-2 border border-base-200 rounded-[4px] resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder-base-400 font-body"
      />
      <div className="flex items-center gap-2">
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value as AnnotationTag | "")}
          className="text-[11px] border border-base-200 rounded-[4px] px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">General note · no action</option>
          <option value="follow_up">Follow up</option>
          <option value="escalate">Escalate to Jess</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          type="submit"
          disabled={!content.trim() || mutation.isPending}
          className="ml-auto text-[11px] font-medium px-3 py-1 rounded-[4px] bg-base-900 text-white disabled:opacity-40 hover:bg-base-800 transition-colors"
        >
          {mutation.isPending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  orderId: string;
}

export default function AnnotationTimeline({ orderId }: Props) {
  const { data, isLoading } = useOrderTimeline(orderId);
  const entries = data ?? [];
  const [filter, setFilter] = useState<OrderEventCategory | "all">("all");

  // Tag each entry with its category once, then tally what's present so the
  // filter row only offers categories that actually appear (with counts).
  const described = useMemo(
    () => entries.map((e) => ({ entry: e, category: describe(e).category })),
    [entries],
  );
  const counts = useMemo(() => {
    const m = {} as Record<OrderEventCategory, number>;
    for (const d of described) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [described]);
  const presentCategories = CATEGORY_ORDER.filter((c) => counts[c] > 0);
  const shown =
    filter === "all" ? described : described.filter((d) => d.category === filter);

  return (
    <div>
      {isLoading ? (
        <div className="text-[12px] text-base-400 py-2">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-[12px] text-base-500 py-2">No notes or activity yet.</div>
      ) : (
        <>
          {/* Filter chips — only worth showing when the order spans 2+ kinds. */}
          {presentCategories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 mb-1.5">
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
          <div className="bg-white border border-base-200 rounded-[8px] px-4 py-1 mb-3">
            {shown.map((d, i) => (
              <TimelineRow key={d.entry.id} entry={d.entry} first={i === 0} />
            ))}
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
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors"
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
