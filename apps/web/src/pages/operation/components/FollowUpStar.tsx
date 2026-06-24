import { Star } from "lucide-react";
import { toast } from "sonner";
import { useOrderTimeline, useAddAnnotation } from "@/lib/queries";
import { isFollowUpFlagged } from "@/lib/follow-up";

/**
 * ⭐ One-click follow-up flag in the order-drawer header (Jess: operation is run
 * by multiple people with mid-order handoffs — flag it so the next person sees it
 * without opening every drawer). Starring adds a `follow_up` note; un-starring
 * adds a `resolved` note — the SAME timeline tags the note box uses, so the star
 * and the 🔔/✅ tags stay one concept. The list star icon + "Follow-up" filter
 * derive from the same annotations. The "why / what's left" goes in the note box.
 */
export default function FollowUpStar({ orderId }: { orderId: string }) {
  const { data: timeline } = useOrderTimeline(orderId);
  const addNote = useAddAnnotation();

  const flagged = isFollowUpFlagged(
    (timeline ?? [])
      .filter((e) => e.kind === "annotation")
      .map((e) => ({ tag: e.tag ?? null, at: e.occurred_at })),
  );

  function toggle() {
    if (addNote.isPending) return;
    addNote.mutate(
      flagged
        ? { orderId, content: "✅ Follow-up cleared", tag: "resolved" }
        : { orderId, content: "⭐ Flagged for follow-up", tag: "follow_up" },
      {
        onSuccess: () =>
          toast.success(flagged ? "Follow-up cleared" : "Flagged for follow-up"),
        onError: () => toast.error("Couldn't update — retry"),
      },
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={addNote.isPending}
      aria-pressed={flagged}
      aria-label={flagged ? "Clear follow-up flag" : "Flag for follow-up"}
      title={
        flagged
          ? "Flagged for follow-up — click to clear"
          : "Flag for follow-up (everyone sees it in the Orders list)"
      }
      className="p-1 rounded hover:bg-base-100 disabled:opacity-50 shrink-0"
    >
      <Star
        className={`w-[18px] h-[18px] ${flagged ? "fill-current text-warning" : "text-base-400"}`}
        strokeWidth={2}
      />
    </button>
  );
}
