import { useState } from "react";
import { toast } from "sonner";
import {
  useOrderTimeline,
  useAddAnnotation,
  type TimelineEntry,
  type AnnotationTag,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

// ─── Tag helpers ─────────────────────────────────────────────────────────────

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

const TAG_ICON: Record<AnnotationTag, string> = {
  follow_up: "🔔",
  escalate: "🚨",
  resolved: "✅",
};

function TagBadge({ tag }: { tag: AnnotationTag }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TAG_CLASS[tag]}`}
    >
      {TAG_ICON[tag]} {TAG_LABEL[tag]}
    </span>
  );
}

// ─── Activity action label ────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  annotation_added:  "Note",
  inbox_assign:      "Assign logistic",
  autocount_import:  "AutoCount import",
  stock_reserve:     "Stock reserve",
  stock_release:     "Stock release",
  stock_reassign:    "Reassign",
  stock_takeout:     "Takeout",
  stock_flag_repair: "Flag repair",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

// ─── Single timeline entry ────────────────────────────────────────────────────

function TimelineRow({
  entry,
  first,
}: {
  entry: TimelineEntry;
  first: boolean;
}) {
  const time = fmtDate(entry.occurred_at, { time: true });

  if (entry.kind === "annotation") {
    return (
      <div
        className={`py-2 ${first ? "" : "border-t border-dashed border-base-100"}`}
      >
        <div className="flex items-start gap-2">
          <span className="font-mono text-[10px] text-base-400 whitespace-nowrap mt-0.5">
            {time}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-[11px] font-medium text-base-600">
                {entry.actor_name ?? "—"}
              </span>
              {entry.tag && <TagBadge tag={entry.tag} />}
            </div>
            <p className="text-[12px] text-base-800 leading-relaxed whitespace-pre-wrap break-words">
              {entry.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // activity row — muted, system-generated
  const detail = entry.detail as Record<string, unknown> | null | undefined;
  const detailSnippet = detail
    ? Object.entries(detail)
        .filter(([k]) => k !== "preview")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ")
    : null;

  return (
    <div
      className={`py-1.5 ${first ? "" : "border-t border-dashed border-base-100"}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-base-400 whitespace-nowrap">
          {time}
        </span>
        <span className="text-[11px] text-base-500">
          {actionLabel(entry.action ?? "")}
          {entry.actor_name ? ` · ${entry.actor_name}` : ""}
          {detailSnippet ? (
            <span className="text-base-400"> ({detailSnippet})</span>
          ) : null}
        </span>
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
          <option value="">No tag</option>
          <option value="follow_up">🔔 Follow up</option>
          <option value="escalate">🚨 Escalate to Jess</option>
          <option value="resolved">✅ Resolved</option>
        </select>
        <button
          type="submit"
          disabled={!content.trim() || mutation.isPending}
          className="ml-auto text-[11px] font-medium px-3 py-1 rounded-[4px] bg-accent text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
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
        <div className="bg-white border border-base-200 rounded-[4px] px-4 py-1 mb-3">
          {entries.map((e, i) => (
            <TimelineRow key={e.id} entry={e} first={i === 0} />
          ))}
        </div>
      )}
      <AddAnnotationForm orderId={orderId} />
    </div>
  );
}
