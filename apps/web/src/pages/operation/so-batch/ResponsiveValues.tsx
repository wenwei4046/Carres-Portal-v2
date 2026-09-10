import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PurchasingDestination } from "@carres/shared";

/** Same rendered-text measurement as PO No, with neutral data semantics. */
export function ResponsiveValues({ values, detail, testId }: {
  values: readonly string[];
  detail?: "Supplier" | "PO Delivery Date" | "Deliver To";
  testId?: string;
}) {
  const unique = [...new Set(values.filter(Boolean))];
  const signature = JSON.stringify(unique);
  /* The host is a DIV — sized by CSS layout (flex + `w-full`) from the
     column's actual rendered width, never from its own text. The ruler is a
     SPAN, matching the PO No cell's own measurement piece. Mixing the two
     up self-references the measurement against its own content. */
  const host = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(1);
  useLayoutEffect(() => {
    const cell = host.current;
    const measure = ruler.current;
    if (!cell || !measure) return;
    const items: string[] = JSON.parse(signature);
    const [text, suffix] = Array.from(measure.children) as HTMLElement[];
    const update = () => {
      let count = 1;
      for (let n = 1; n <= items.length; n++) {
        text.textContent = items.slice(0, n).join(", ");
        suffix.textContent = n < items.length ? ` +${items.length - n} more` : "";
        if (measure.getBoundingClientRect().width <= cell.getBoundingClientRect().width) count = n;
      }
      /* The ruler is scratch space only — leaving the last measured string
         in it would double up in `cell.textContent` (assistive tech, copy,
         and any strict-equality test all read through hidden nodes). */
      text.textContent = "";
      suffix.textContent = "";
      setVisible(count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(cell);
    let disposed = false;
    void document.fonts?.ready.then(() => { if (!disposed) update(); });
    return () => { disposed = true; observer.disconnect(); };
  }, [signature]);
  const hidden = Math.max(0, unique.length - visible);
  const suffix = ` +${hidden} more`;
  return <div ref={host} data-testid={testId} className="relative flex w-full min-w-0 items-center overflow-hidden whitespace-nowrap" title={unique.join(", ")}>
    <span className="min-w-0 truncate">{unique.slice(0, visible).join(", ")}</span>
    {hidden > 0 && (detail ? <button type="button"
      /* `pointer-events-auto` matters specifically for `Deliver To`: its
         trigger overlays a real `<select>` behind a `pointer-events-none`
         wrapper so clicks fall through to open it, and this button is the
         one part of that overlay that must NOT fall through. */
      className="pointer-events-auto shrink-0 whitespace-pre font-medium text-inherit underline-offset-2 hover:underline"
      title={
        detail === "Supplier"
          ? "View all suppliers"
          : detail === "PO Delivery Date"
            ? "View all PO delivery dates"
            : "View delivery details"
      }
      onClick={(event) => {
        event.stopPropagation();
        const row = event.currentTarget.closest("tr");
        const arrow = row?.querySelector<HTMLButtonElement>('button[aria-expanded]');
        if (arrow?.getAttribute("aria-expanded") === "false") arrow.click();
        requestAnimationFrame(() => {
          const target = Array.from(row?.nextElementSibling?.querySelectorAll("th") ?? [])
            .find((header) => header.textContent?.trim() === detail);
          if (target) {
            target.tabIndex = -1;
            target.focus({ preventScroll: true });
            target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          }
        });
      }}>{suffix}</button> : <span className="shrink-0 whitespace-pre font-medium">{suffix}</span>)}
    <span ref={ruler} aria-hidden className="pointer-events-none invisible absolute flex w-max whitespace-pre">
      <span /><span className="font-medium" />
    </span>
  </div>;
}

/** Keep the native picker and real options; its overlay describes current assignments. */
export function DestinationSummarySelect({ destinations, ids, onChange, testId }: {
  destinations: readonly PurchasingDestination[];
  ids: readonly string[];
  onChange: (id: string) => void;
  testId: string;
}) {
  const unique = [...new Set(ids)];
  const names = unique.map((id) => destinations.find((d) => d.id === id)?.name ?? "");
  return <span className="relative block min-w-0 flex-1">
    {/* The native arrow's colour follows the transparent text in some
        browsers and vanishes with it — so it is drawn ourselves, always in
        the same place, whether the summary reads one destination or a
        `+N more`. `appearance-none` stops the native one drawing under it. */}
    <select aria-label={`Deliver To: ${names.join(", ")}`} data-testid={testId}
      className="w-full min-w-0 appearance-none rounded-control border border-kit-slate-6 bg-white py-0.5 pl-1.5 pr-5 text-meta"
      style={{ color: "transparent" }} value={unique.length === 1 ? unique[0] : ""}
      onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(event.target.value)}>
      {destinations.map((d) => <option className="text-kit-slate-12" key={d.id} value={d.id} disabled={!d.active}>{d.name}</option>)}
    </select>
    <div className="pointer-events-none absolute inset-y-0 left-1.5 right-5 flex min-w-0 items-center text-meta">
      <ResponsiveValues values={names} detail="Deliver To" />
    </div>
    <ChevronDown size={14} strokeWidth={1.75} aria-hidden
      className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-kit-slate-11" />
  </span>;
}
