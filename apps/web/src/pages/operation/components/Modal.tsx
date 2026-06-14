import { useEffect, useRef } from "react";

/**
 * Shared modal primitives used by the four operation action modals
 * (Dispatch / DOAttach / IssuePOs / AbandonOrder). Centered overlay,
 * 560px default width, 4px corner radius. Matches `reference/proto/
 * operation-orders.jsx` `Modal` (lines 530-543) and `ModalActions`
 * (lines 545-552).
 *
 * Accessibility:
 *   - Esc closes
 *   - Focus traps inside the dialog (first focusable on mount, Tab/Shift+Tab
 *     cycle within)
 *   - Backdrop click closes
 */
interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Override the default 560px width. */
  size?: "default" | "lg" | "xl";
}

const SIZE_PX: Record<NonNullable<ModalProps["size"]>, number> = {
  default: 560,
  lg: 880,
  xl: 1040,
};

export function Modal({ title, onClose, children, size = "default" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Esc-to-close + simple focus trap. A single useEffect installs a `keydown`
  // listener at document level so the trap also catches keys fired from
  // inputs nested deep in `children`.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    // Focus the first focusable element on mount.
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const widthPx = SIZE_PX[size];

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[60] grid place-items-center"
      style={{ background: "rgba(34,31,32,0.6)" }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-card text-card-foreground border border-base-200 rounded-[4px] overflow-auto"
        style={{
          width: widthPx,
          maxWidth: "92vw",
          maxHeight: "85vh",
        }}
      >
        <div className="px-6 pt-4 pb-3 border-b border-base-100 flex justify-between items-center">
          <div className="t-h3 font-display">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[18px] text-base-700 hover:text-base-900 leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

interface ModalActionsProps {
  onCancel: () => void;
  onPrimary: () => void;
  primary: string;
  primaryDisabled?: boolean;
  primaryPending?: boolean;
  /** Render the primary as a destructive action — v17 `.btn-danger`
   *  (red text on white, never filled). Default false → black `.btn-primary`. */
  danger?: boolean;
}

export function ModalActions({
  onCancel,
  onPrimary,
  primary,
  primaryDisabled,
  primaryPending,
  danger,
}: ModalActionsProps) {
  return (
    <div className="flex justify-end gap-2 mt-1">
      <button type="button" onClick={onCancel} className="btn-ghost text-[12px]">
        Cancel
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryPending}
        className={`${danger ? "btn-danger" : "btn-primary"} text-[12px] disabled:opacity-40`}
      >
        {primaryPending ? "Working…" : primary}
      </button>
    </div>
  );
}

/**
 * Shared input style helper — mirrors `reference/proto/operation-orders.jsx`
 * `inputStyle()` (which is just an object literal) but as Tailwind classes for
 * v2 consistency.
 */
export const INPUT_CLS =
  "w-full px-3 py-2 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500";

/** Section heading used inside the OrderDetailDrawer body. */
export function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className="label mb-2">{children}</div>;
}
