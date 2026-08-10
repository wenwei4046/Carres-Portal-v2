import { useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TopBarIcons } from "./GlobalTopBar";

/**
 * ModuleHeader — THE fixed header row of a module (Shell pattern,
 * `docs/03-page-patterns.md`, Loo 2026-08-02: 壳画头 — the shell draws the
 * header, pages never do).
 *
 * ONE white 44px row, never scrolls:
 *
 *   [icon] Word │ tabs… ················· page-meta │ 🔔 ❓ ⚙
 *
 * - The NAMEPLATE (icon + word) is the wall sign, not a button — semibold and
 *   dark at the SAME size as the tabs (GitHub's weighting: weight, never
 *   size), no hover, no click. The icon is the module's ONE face, shared with
 *   its sidebar item.
 * - `children` = the module's tab strip (navigation between sibling pages).
 *   Stage pickers and searches are the PAGE's — they live in the page
 *   toolbar, never here.
 * - `right` = the page-meta slot (freshness stamp / refresh).
 * - The global icons render on EVERY module page, so the Bell never
 *   disappears when the operator switches tabs.
 * - `document.title` is set while mounted (`docTitle`) so the browser tab
 *   list answers "where am I" too, and restored on unmount.
 *
 * Colour law: white, flat, quiet — the only voices above the content are the
 * blue active underline and a red count badge. Never a brand colour.
 */
export default function ModuleHeader({
  testId,
  icon: Icon,
  word,
  docTitle,
  right,
  children,
  renderedHeight44 = false,
}: {
  testId: string;
  /** The module's one face — the same Lucide icon as its sidebar item. */
  icon: LucideIcon;
  /** The module word on the nameplate (an existing sidebar word, never new). */
  word: string;
  /** document.title while this module is on screen. */
  docTitle: string;
  /** Page-meta slot (freshness stamp / refresh) — before the global icons. */
  right?: ReactNode;
  /** The module's tab strip, when it has sibling pages. */
  children?: ReactNode;
  /** DestinationHeader's measured 44px includes the bottom rule. Existing
      module headers retain their original 44px content row + rule. */
  renderedHeight44?: boolean;
}) {
  useEffect(() => {
    document.title = docTitle;
    return () => {
      document.title = "Carres Portal";
    };
  }, [docTitle]);

  return (
    <div
      className={`shrink-0 bg-white border-b border-base-200 px-6 ${
        renderedHeight44 ? "box-border h-11" : ""
      }`}
      data-testid={testId}
    >
      <div className={`flex items-center gap-4 ${renderedHeight44 ? "h-full" : "h-11"}`}>
        <span
          className="shrink-0 flex items-center gap-1.5 text-body font-semibold text-base-900 select-none cursor-default"
          data-testid={`${testId}-module-word`}
        >
          <Icon size={15} strokeWidth={2} className="text-base-700" />
          {word}
        </span>
        {children != null && (
          <>
            <div className="shrink-0 h-4 w-px bg-base-200" aria-hidden="true" />
            {children}
          </>
        )}
        <div className="flex-1" />
        {right && (
          <div
            className="shrink-0 flex items-center gap-2"
            data-testid={`${testId}-right`}
          >
            {right}
          </div>
        )}
        <TopBarIcons />
      </div>
    </div>
  );
}
