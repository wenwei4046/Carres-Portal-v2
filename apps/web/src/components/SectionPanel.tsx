/**
 * SectionPanel — THE shared section chrome (Jess 2026-07-13): one white card +
 * one cream title band, used 1:1 by BOTH the Orders list facet groups
 * (SUMMARY / CHASE NOW / …) and every order-drawer panel (Customer / Balance /
 * Items ordered / Warehouse stock / …). No page may hand-roll this card or
 * band again — bespoke panel styling in the drawer is banned.
 *
 * Tokens (docs/DESIGN-STANDARD.md §2 · lib/design-standard.ts COLOR):
 *   card    = white surface `bg-white` + 1px `border-base-200` frame,
 *             12px radius, floating on the cream page (`bg-background`).
 *   band    = `.section-band` cream (index.css; hex recorded in
 *             design-standard.ts COLOR.sectionBand) + `.section-band-title`
 *             ink (11px bold uppercase; danger variant for CHASE-NOW-style
 *             alarm sections) + `.section-band-total` count ink.
 */
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** The white surface card. `grow` fills leftover column height (list facet /
 *  drawer Activity card). Children sit inside the 6px inset, so the band reads
 *  as an inset bar exactly like the list facet. */
export function SectionCard({
  grow,
  className = "",
  children,
}: {
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`bg-white border border-base-200 rounded-[12px] p-1.5 flex flex-col min-h-0 ${
        grow ? "flex-1" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

/** The cream title band: chevron + uppercase title (the collapse toggle) on the
 *  left; an optional count + a free `right` slot (status chip / ⋮ menu / the
 *  facet's « collapse) pinned to the right — rendered as SIBLINGS of the toggle
 *  so it is never a button-in-button. */
export function SectionBand({
  title,
  danger,
  collapsed,
  onToggle,
  total,
  right,
  toggleTestId,
}: {
  title: string;
  /** Alarm section (list CHASE NOW) — title ink reads dark red. */
  danger?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Right-aligned group total; omit to hide (overlapping counts mislead). */
  total?: number;
  /** Status chip / ⋮ menu / extra control at the band's right edge. */
  right?: ReactNode;
  toggleTestId?: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md pl-2 pr-1.5 py-1.5 shrink-0 section-band">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand" : "Hide"}
        data-testid={toggleTestId}
        className="flex-1 min-w-0 flex items-center gap-1 text-left hover:brightness-[0.97]"
      >
        {collapsed ? (
          <ChevronRight size={14} className="shrink-0 text-base-500" aria-hidden="true" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-base-500" aria-hidden="true" />
        )}
        <span
          /* v4 §11c — panel header is DARK 12/600 (muted headers were
             unreadable; muted is for meta only). */
          className={`uppercase flex-1 truncate text-[12px] font-semibold tracking-[0.04em] ${
            danger ? "section-band-title-danger" : "section-band-title"
          }`}
        >
          {title}
        </span>
      </button>
      {total !== undefined && (
        <span className="tabular-nums shrink-0 text-[12px] font-semibold section-band-total">
          {total}
        </span>
      )}
      {right}
    </div>
  );
}
