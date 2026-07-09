import { useState } from "react";
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

  return (
    <div>
      {isLoading ? (
        <div className="text-[12px] text-base-400 py-2">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-[12px] text-base-500 py-2">No notes or activity yet.</div>
      ) : (
        <div className="bg-white border border-base-200 rounded-[8px] px-4 py-1 mb-3">
          {entries.map((e, i) => (
            <TimelineRow key={e.id} entry={e} first={i === 0} />
          ))}
        </div>
      )}
      <AddAnnotationForm orderId={orderId} />
    </div>
  );
}
