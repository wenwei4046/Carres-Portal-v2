/**
 * ShellHeader — the ONE page header of the Operations shell (Carres Layout
 * Standard §1, owner-confirmed template, Jess 2026-10-08).
 *
 *   Sales Order / Outright ·································· [ Search ] (Team) (Bell)
 *
 * 56px, on the canvas (no white band, no rule). The shell draws it once,
 * above the page AND the Tasks panel. A page names itself through
 * `ModuleHeader`, which renders its identity INTO this header's slot instead
 * of drawing a second header row; a page with no `ModuleHeader` shows the
 * menu item it belongs to (`crumb / title`).
 */
import type { ReactNode } from "react";
import { TopBarIcons } from "./GlobalTopBar";
import { TasksPill } from "./ShellTasks";
export { ShellHeaderContext, useShellHeader, useShellHeaderHost, type ShellHeaderSlot } from "./shell-header-context";

/** `crumb / title` — 14px grey crumb, a light slash, the 20px title. */
export function ShellTitle({ crumb, title }: { crumb?: string | null; title: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap" data-testid="shell-title">
      {crumb ? (
        <>
          <span className="text-control text-c-secondary">{crumb}</span>
          <span className="text-control text-c-line" aria-hidden>
            /
          </span>
        </>
      ) : null}
      <h1 className="min-w-0 truncate text-title font-medium tracking-[-0.02em] text-c-ink">{title}</h1>
    </div>
  );
}

export default function ShellHeader({
  slotRef,
  claimed,
  crumb,
  title,
}: {
  slotRef: (el: HTMLElement | null) => void;
  /** A page named itself through `ModuleHeader`; hide the menu-derived name. */
  claimed: boolean;
  crumb?: string | null;
  title: string;
}): ReactNode {
  return (
    <header
      className="flex h-14 min-w-0 shrink-0 items-center gap-3.5 bg-background px-[18px]"
      data-testid="shell-header"
    >
      {!claimed && <ShellTitle crumb={crumb} title={title} />}
      <div ref={slotRef} className="flex min-w-0 flex-1 items-center gap-3.5" data-testid="shell-header-slot" />
      <TasksPill fallback />
      <TopBarIcons inShell />
    </header>
  );
}
