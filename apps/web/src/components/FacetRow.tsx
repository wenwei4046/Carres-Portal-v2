/**
 * FacetRow — one clickable row inside a facet rail (`docs/UI-KIT.md` §8.2 /
 * §8.4).
 *
 * It was written inline on Purchasing → To Order. P2's Receiving half needs the
 * SAME row, and UI-KIT §6.1 is explicit about what happens then: "If a UI
 * element appears a second time, it stops being inline and becomes a Foundation
 * Component. The first occurrence may be written in place. The second
 * occurrence is a full stop: extract it first, then use it twice."
 *
 * **This is not the extraction card P2 forbids.** That one is `PageShell` /
 * `DataTable` (D0.5c on line ⑧), which owns the BEHAVIOUR — the filtering, the
 * clearing, the scroll restore. This is one button's appearance, moved verbatim
 * out of `OperationPurchase.tsx` so the two Purchasing tabs cannot drift into
 * two looks for one control.
 */
import type { ReactNode } from "react";

export default function FacetRow({
  label,
  count,
  tone = "default",
  leadingChip,
  unit,
  suffix,
  active,
  title,
  onClick,
  testId,
}: {
  label: string;
  count: number;
  tone?: "default" | "danger" | "muted";
  /** Stable hook for the §8.2 click-again-clears tests. */
  testId?: string;
  /** Optional avatar/status chip rendered BEFORE the label (Jess 2026-07-23:
   *  duty owner chip on the Today's work stages — chip left, label right). */
  leadingChip?: ReactNode;
  unit?: string;
  /** Optional inline suffix (e.g. "⚠ N late") shown between label and count. */
  suffix?: ReactNode;
  active?: boolean;
  /** Tooltip — says WHY this row exists, never a re-statement of the label
   *  (COPY-STANDARD, tooltip pattern). */
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-hovertint" : "hover:bg-hovertint"
      }`}
    >
      {leadingChip}
      <span
        className={`min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-semibold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      {suffix && <span className="text-[11px] shrink-0">{suffix}</span>}
      <span
        className={`ml-auto text-[12px] tabular-nums shrink-0 ${
          tone === "danger"
            ? "text-danger font-bold"
            : tone === "muted"
              ? "text-base-400"
              : "text-base-500 font-semibold"
        }`}
      >
        {count}
        {unit ? <span className="text-base-400 font-normal"> {unit}</span> : null}
      </span>
    </button>
  );
}

export function EmptyFacetHint({ text }: { text: string }) {
  return <div className="px-2.5 py-1.5 text-[12px] text-base-400">{text}</div>;
}
