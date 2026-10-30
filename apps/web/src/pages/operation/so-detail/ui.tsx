/**
 * The Sales Order detail's small parts, drawn to the owner-confirmed handoff
 * of 2026-10-08 (current kit: docs/01-design-tokens.md, v12). Every colour is a
 * `c-*` token from `carres-tokens.css`; nothing here borrows a kit colour.
 *
 *   Card      white · 1px card border · radius 8 · pad 14 16 · no shadow
 *   KvRow     label 150 left grey 12 · value ink 13 / 500 · rows ≥36px (01 §5.1) · thin line
 *   Buttons   main h34 charcoal · normal h34 white · toolbar h32 · icon 36 round
 *   Drawer    right · top/bottom 12 · w400 · shadow-drawer · backdrop
 *   Menu      white · radius 8 · shadow-menu · pad 6 · item pad 7 10 · 13/500
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import MIcon from "@/components/carres/MIcon";
import KitSelect from "@/components/kit/Select";
import KitButton from "@/components/kit/Button";
import KitDatePicker from "@/components/kit/DatePicker";
import { controlClass } from "@/components/kit/field-recipe";
import { DialogContainerProvider } from "@/components/kit/dialog-container";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";
import { avatarColor, personInitials, personLabel } from "@/lib/staff-avatar";

export const NOT_RECORDED = "";

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({
  children,
  className = "",
  testId,
  label,
  tone = "card",
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  label?: string;
  tone?: "card" | "warn";
}) {
  return (
    <section
      aria-label={label}
      data-testid={testId}
      className={`flex min-w-0 flex-col rounded-lg border px-4 py-3.5 ${
        tone === "warn" ? "border-c-btn-border bg-c-warn-bg" : "border-c-card-border bg-c-card"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/** Card title — 15/500 ink (01 §2), with an optional quiet note on the right. */
export function CardTitle({ children, note, right }: { children: ReactNode; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-1.5">
      <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[.08em] leading-4 text-c-body">{children}</h2>
      {note && <span className="text-[12px] text-c-secondary">{note}</span>}
      {right}
    </div>
  );
}

/** One label · value row, 36 minimum (01 §5.1 field row), separated from the one above by a thin line. */
export function KvRow({
  label,
  value,
  muted,
  testId,
  editing = false,
  editor,
  open = false,
  onOpen,
  changed = false,
  was,
}: {
  label: string;
  value: ReactNode;
  /** The value is an absence (`Not recorded`) — grey, never ink. */
  muted?: boolean;
  testId?: string;
  /** Amendment mode is on and this fact can be changed. */
  editing?: boolean;
  editor?: ReactNode;
  /** The pencil was pressed (or the value already changed). */
  open?: boolean;
  onOpen?: () => void;
  changed?: boolean;
  /** The value before this amendment, shown under the input once changed. */
  was?: string;
}) {
  const showEditor = editing && Boolean(editor) && (open || changed);
  return (
    <div
      className="grid min-h-9 grid-cols-[150px_minmax(0,1fr)] items-center gap-4 border-t border-c-section-line py-[7px] text-[13px] leading-[18px]"
      data-testid={testId}
    >
      <span className="text-[12px] leading-4 text-c-secondary">{label}</span>
      {showEditor ? (
        <span className="flex min-w-0 flex-col gap-0.5">
          {editor}
          {changed && was != null && <span className="text-[12px] text-c-secondary">Was: {was || NOT_RECORDED}</span>}
        </span>
      ) : (
        <span className="flex min-w-0 items-start gap-1.5">
          <span className={`min-w-0 flex-1 break-words font-medium ${muted ? "text-c-muted" : "text-c-ink"}`}>{value}</span>
          {editing && editor && (
            <KitButton variant="ghost" iconOnly icon="edit" onClick={onOpen}
              aria-label={`Edit ${label}`} title="Edit" />
          )}
        </span>
      )}
    </div>
  );
}

/** A value, or the grey absence word. */
export function factOf(v: string | null | undefined, absent = NOT_RECORDED): { value: string; muted: boolean } {
  const s = (v ?? "").trim();
  return s ? { value: s, muted: false } : { value: absent, muted: true };
}

/* ── Buttons ────────────────────────────────────────────────────────────── */
type BtnKind = "main" | "header" | "normal" | "quiet";
const BTN: Record<BtnKind, string> = {
  main: "h-[34px] px-3.5 font-semibold bg-c-main text-white enabled:hover:opacity-90",
  header: "h-[34px] px-3.5 font-medium bg-c-card text-c-ink border border-c-btn-border enabled:hover:bg-c-btn-hover",
  normal: "h-8 px-3 font-medium bg-c-card text-c-ink border border-c-btn-border enabled:hover:bg-c-btn-hover",
  quiet: "h-8 px-2.5 font-medium bg-transparent text-c-secondary enabled:hover:bg-c-btn-hover",
};

export function CBtn({
  kind = "normal",
  icon,
  children,
  className = "",
  ...rest
}: {
  kind?: BtnKind;
  icon?: string;
  children?: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] whitespace-nowrap rounded-lg text-[13px] leading-none disabled:cursor-not-allowed disabled:opacity-[.45] ${BTN[kind]} ${className}`}
    >
      {icon && <MIcon name={icon} size={18} />}
      {children}
    </button>
  );
}

/** Round icon button — 36×36, no border, icon in body grey. */
export function CIconBtn({
  icon,
  label,
  size = 36,
  className = "",
  ...rest
}: {
  icon: string;
  label: string;
  size?: 32 | 34 | 36;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid shrink-0 place-items-center rounded-full text-c-body enabled:hover:bg-[var(--c-icon-hover)] enabled:active:bg-[var(--c-icon-press)] focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] disabled:opacity-[.45] ${size === 32 ? "h-8 w-8" : size === 34 ? "h-[34px] w-[34px]" : "h-9 w-9"} ${className}`}
    >
      <MIcon name={icon} size={20} />
    </button>
  );
}

/* Existing SO caller APIs adapt to the one Kit; no independent field skin. */
const FIELD = controlClass(false, "single");

export function CInput({
  label,
  className = "",
  ...rest
}: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <input aria-label={label} {...rest} className={`${FIELD} ${className}`} />;
}

export function CSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
  disabled,
  id,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  return (
    <div className="[&>div>label]:sr-only">
      <KitSelect id={id ?? generatedId} label={label} value={value} disabled={disabled}
        onValueChange={onChange} placeholder={placeholder} options={options} />
    </div>
  );
}

/** Existing ISO API, backed by the shared calendar and its keyboard/focus contract. */
export function CDate({
  label,
  value,
  onChange,
  min,
  id,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  min?: string;
  id?: string;
}) {
  const generatedId = useId();
  return (
    <div className="[&>div>label]:sr-only">
      <KitDatePicker id={id ?? generatedId} label={label} value={value} minDate={min} onChange={onChange} />
    </div>
  );
}

/* ── Avatars ────────────────────────────────────────────────────────────── */
export interface Person {
  userId: string;
  name: string | null;
  email?: string;
  /** Tooltip roles, e.g. `PIC · Delivery`. */
  roles?: string[];
}

export function Avatar({ person, size = 24, ring = true }: { person: Person; size?: 22 | 24 | 26; ring?: boolean }) {
  const colors = avatarColor(person.userId);
  const label = personLabel(person.name, person.email ?? "");
  const tip = [label, ...(person.roles ?? [])].join(" · ");
  return (
    <span
      title={tip}
      aria-label={tip}
      className={`grid shrink-0 place-items-center rounded-full text-[11px] font-bold leading-none ${ring ? "border-2 border-white" : ""}`}
      style={{ width: size, height: size, background: colors.bg, color: colors.fg }}
    >
      {personInitials(person.name, person.email ?? "")}
    </span>
  );
}

/* ── Drawer (right) ─────────────────────────────────────────────────────── */
export function Drawer({
  open,
  title,
  onClose,
  children,
  width = 560,
  testId,
  actions,
  right = 12,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  testId?: string;
  actions?: ReactNode;
  /** Distance from the right edge — a drawer opens LEFT of the Tasks panel
   *  and never covers it (Layout Standard §1). */
  right?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70]" style={{ background: "var(--backdrop)" }} onClick={onClose} aria-hidden="true" />
      <DialogContainerProvider>{(setContainer) => (
      <aside ref={setContainer}
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        data-testid={testId}
        className="fixed bottom-3 top-3 z-[71] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-c-btn-border bg-c-card"
        style={{ width, right, boxShadow: "var(--shadow-drawer)" }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-c-section-line px-4 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-c-ink">{title}</h2>
          {actions}
          <CIconBtn icon="close" label="Close" size={34} onClick={onClose} />
        </div>
        {/* A stable gutter: a document that grows a scrollbar must not change
            its own width, or the paper is re-cut forever. */}
        <div className="min-h-0 flex-1 overflow-y-scroll px-4 py-3.5 [scrollbar-gutter:stable]">{children}</div>
      </aside>
      )}</DialogContainerProvider>
    </>
  );
}

/* ── Dialog (centred) ───────────────────────────────────────────────────── */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 640,
  testId,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" style={{ background: "var(--backdrop)" }}>
      <DialogContainerProvider>{(setContainer) => (
      <div ref={setContainer}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        data-testid={testId}
        className="flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden rounded-lg border border-c-btn-border bg-c-card"
        style={{ maxWidth: width, boxShadow: "var(--shadow-drawer)" }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-c-section-line px-4 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-medium text-c-ink">{title}</h2>
          <CIconBtn icon="close" label="Close" size={34} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3.5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-c-section-line px-4 py-3">{footer}</div>}
      </div>
      )}</DialogContainerProvider>
    </div>
  );
}

/* ── Pop-up menu ────────────────────────────────────────────────────────── */
export interface MenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  hint?: string;
  testId?: string;
  disabled?: boolean;
}

export function PopMenu({
  open,
  onClose,
  groups,
  label,
  width = 250,
}: {
  open: boolean;
  onClose: () => void;
  groups: ReadonlyArray<{ heading: string; items: MenuItem[] }>;
  label: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const shown = groups.filter((g) => g.items.length > 0);
  return (
    <>
      <div className="fixed inset-0 z-[59]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        className="absolute right-0 top-10 z-[60] rounded-lg bg-c-card p-1.5"
        style={{ width, boxShadow: "var(--shadow-menu)" }}
      >
        {shown.map((g, gi) => (
          <div key={g.heading} className={gi > 0 ? "border-t border-c-section-line" : ""}>
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[.06em] text-c-secondary">{g.heading}</div>
            {g.items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                data-testid={it.testId}
                onClick={() => {
                  onClose();
                  it.onSelect();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-c-ink enabled:hover:bg-c-hover focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] disabled:cursor-not-allowed disabled:opacity-[.45]"
              >
                <MIcon name={it.icon} size={18} className="text-c-secondary" />
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[12px] text-c-secondary">{it.hint}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Tabs (pill) ────────────────────────────────────────────────────────── */
export function PillTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={SEGMENTED_TRACK}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            data-testid={`so-tab-${t.key}`}
            className={`${SEGMENT} focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] ${on ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** The view switch inside a card: the same segmented control (01 §3). */
export function ViewSwitch<K extends string>({
  views,
  value,
  onChange,
  label,
}: {
  views: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={SEGMENTED_TRACK}>
      {views.map((v) => {
        const on = v.key === value;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v.key)}
            data-testid={`route-view-${v.key}`}
            className={`${SEGMENT} focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] ${on ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** 24h `14:30` → `2:30 PM` (Layout Standard 4.7: times are 12-hour). */
export function twelveHour(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}
