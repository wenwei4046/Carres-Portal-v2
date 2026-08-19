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
 * - `page` = the page word, printed after the nameplate as `Purchasing ·
 *   Receiving`. A module whose pages live in the SIDEBAR (Purchasing, from
 *   2026-08-18) has no tab strip, so without this the header would no longer
 *   say which page you are on. Quiet weight — the nameplate is the wall sign
 *   and the page word is the room, not a second sign.
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
  page,
  docTitle,
  right,
  children,
  destinationHeader = false,
}: {
  testId: string;
  /** The module's one face — the same Lucide icon as its sidebar item.
   *  Optional: the Destination Header drops it (owner ruling 2026-08-15) so the
   *  word alone carries the identity at 24px. Tab-strip module headers keep it. */
  icon?: LucideIcon;
  /** The module word on the nameplate (an existing sidebar word, never new). */
  word: string;
  /** The page word, printed `{word} · {page}`. For modules whose pages live in
   *  the sidebar rather than a tab strip. */
  page?: string;
  /** document.title while this module is on screen. */
  docTitle: string;
  /** Page-meta slot (freshness stamp / refresh) — before the global icons. */
  right?: ReactNode;
  /** The module's tab strip, when it has sibling pages. */
  children?: ReactNode;
  /** The Destination Header's rendered 50px includes the bottom rule — owner
      ruling 2026-08-15, grown from 44 so a 24px identity keeps 8.5px of air
      above and below. Existing tab-strip module headers keep their 44px content
      row + rule and their 13px word. */
  destinationHeader?: boolean;
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
        destinationHeader ? "box-border h-[50px]" : ""
      }`}
      data-testid={testId}
    >
      <div className={`flex items-center gap-4 ${destinationHeader ? "h-full" : "h-11"}`}>
        <span
          className={`shrink-0 flex items-center gap-1.5 font-semibold text-base-900 select-none cursor-default ${
            destinationHeader ? "text-page" : "text-body"
          }`}
          data-testid={`${testId}-module-word`}
        >
          {Icon && <Icon size={15} strokeWidth={2} className="text-base-700" />}
          {word}
          {page && (
            <span
              className="font-medium text-base-600"
              data-testid={`${testId}-page-word`}
            >
              · {page}
            </span>
          )}
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
