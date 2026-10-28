// design-standard: not-a-list-page — the shared row menu surface, drawn by DataGrid and the kit DataTable.
import { useEffect } from "react";
import type { DataGridContextMenuItem } from "./DataGrid";
import styles from "./DataGrid.module.css";

/**
 * THE ROW MENU SURFACE — ONE ROW MENU (UI MASTER §6.7 rule 5).
 *
 * Moved out of DataGrid unchanged (Chew 2026-10-21, Finance row menu) so the
 * kit DataTable can open the SAME menu with the same markup and classes,
 * instead of a second drawing of it. DataGrid renders exactly what it rendered
 * before: the same element, the same classes, the same keys, the same close on
 * an outside click, a scroll or Escape.
 */
export type RowMenuAt = {
  x: number;
  y: number;
  items: DataGridContextMenuItem[];
  /** Opened from the keyboard: focus returns here when it closes. */
  returnFocus?: HTMLElement | null;
};

export default function RowContextMenu({ menu, onClose }: { menu: RowMenuAt; onClose: () => void }) {
  /* Close the row context menu on outside click, scroll, or Escape — same
     UX as the header context menu but rendered at a higher z-index so it
     clears the sticky <thead>. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        menu.returnFocus?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("click", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  return (
    <div
      className={styles.contextMenu}
      role="menu"
      aria-label="Row actions"
      style={{ top: menu.y, left: menu.x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      ref={(el) => {
        /* The menu takes focus when it opens, so the keyboard lands on
           its first act — never somewhere down the page. */
        if (el && !el.contains(document.activeElement)) {
          el.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({ preventScroll: true });
        }
      }}
      onKeyDown={(e) => {
        const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const go = (i: number) => items[(i + items.length) % items.length]?.focus({ preventScroll: true });
        if (e.key === "ArrowDown") { e.preventDefault(); go(at + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); go(at - 1); }
        else if (e.key === "Home") { e.preventDefault(); go(0); }
        else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
        else if (e.key === "Tab") {
          e.preventDefault();
          onClose();
          menu.returnFocus?.focus({ preventScroll: true });
        }
      }}
    >
      {menu.items.map((it, i) => {
        if (it.divider) return <div key={`d-${i}`} role="separator" className={styles.contextMenuDivider} />;
        return (
          <button
            key={`i-${i}-${it.label}`}
            type="button"
            role="menuitem"
            className={`${styles.contextMenuItem} ${it.danger ? styles.contextMenuDanger : ""}`}
            onClick={() => {
              // Close before firing — handlers may navigate or open
              // dialogs, and we don't want a stale menu lingering.
              onClose();
              it.onClick?.();
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
