/**
 * The shared pieces of Settings → Company · Office · Settings editors. They
 * follow the Settings grammar of 01 §6 and 03 §7 (confirmed Settings design,
 * owner 11 Oct 2026): a group is its title and one line above ONE bordered
 * list; a row is the setting's name with one short explanation on the left and
 * its value on the right; read-only values are text; edit controls appear only
 * while editing; and the change record (who · when · old → new · reason) sits
 * in a disclosure under the page, closed until it is asked for. Words:
 * COPY-STANDARD "Settings → Company · Office · Settings editors".
 */
import { useState, type ReactNode } from "react";
import type { SettingsChange } from "@carres/shared";
import SectionHeader from "@/components/kit/SectionHeader";
import { fmtDate } from "@/lib/fmt-date";

export const W = {
  notSet: "Not set",
  edit: "Edit",
  cancel: "Cancel",
  back: "Back",
  reviewChanges: "Review changes",
  saveChanges: "Save changes",
  reason: "Reason (optional)",
  changes: "Changes",
  noChanges: "No changes recorded yet.",
  oldAndNew: "Old and new value",
  readOnly: "You can read these settings. Only the owner and the people named in Settings editors can change them.",
  notInstalled: "These settings are not saved in the system yet. The values below are the confirmed defaults.",
  loadFailed: "These settings could not be loaded. Try again.",
  tryAgain: "Try again",
  loading: "Loading",
  savedBy: (name: string | null) => name ?? "Staff identity not recorded",
  changedElsewhere: "Someone else saved these settings. Reload to see them.",
} as const;

export function Section({ title, lead, children, testId, action }: {
  title: string;
  lead?: string;
  children: ReactNode;
  testId?: string;
  action?: ReactNode;
}) {
  /* The group's name and its one line sit on the ground; the settings are one
   * bordered list under them (no box around each setting). */
  return (
    <section data-testid={testId}>
      <div className="flex items-start justify-between gap-3 px-1 pb-2">
        <div className="min-w-0">
          <h2 className="text-strong text-c-ink">{title}</h2>
          {lead ? <p className="mt-0.5 text-body text-c-secondary">{lead}</p> : null}
        </div>
        {action}
      </div>
      <div className="grid rounded-card border border-kit-slate-5 bg-white px-4 py-1.5">{children}</div>
    </section>
  );
}

/**
 * One setting: its name and, when it helps, one short explanation on the left;
 * the value (or, while editing, its control) on the right. Rows of one group
 * are parted by a hairline; the name wraps rather than being cut.
 */
export function Row({ label, hint, htmlFor, children }: {
  label: string; hint?: string; htmlFor?: string; children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-1 border-kit-slate-4 py-2.5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-4 [&:not(:first-child)]:border-t">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-body font-medium text-c-ink">{label}</label>
        ) : (
          <span className="block text-body font-medium text-c-ink">{label}</span>
        )}
        {hint ? <p className="text-meta text-c-secondary" data-settings-hint>{hint}</p> : null}
      </div>
      <div className="min-w-0 text-body text-c-ink">{children}</div>
    </div>
  );
}

/** A stored value as text; an empty value reads `Not set` in grey. */
export function Value({ value }: { value: string | null | undefined }) {
  if (value == null || value.trim() === "") return <span className="text-kit-slate-11">{W.notSet}</span>;
  return <span className="whitespace-pre-line">{value}</span>;
}

/** "13:00" → "1:00 PM". */
export function clock12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** 60 → "1 hour", 90 → "1 hour 30 minutes", 0 → "None". */
export function minutesWord(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "None";
  const h = Math.floor(n / 60);
  const m = n % 60;
  const hw = h === 0 ? "" : h === 1 ? "1 hour" : `${h} hours`;
  const mw = m === 0 ? "" : m === 1 ? "1 minute" : `${m} minutes`;
  return [hw, mw].filter(Boolean).join(" ");
}

export function Notice({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="text-meta text-kit-slate-11" data-testid={testId}>{children}</p>;
}

/**
 * The change record: who · when · reason, and each changed field old → new.
 * History belongs in a disclosure (01 §6): the header says how many changes
 * are recorded and the list opens on request, so it never pushes the settings
 * themselves down the page.
 */
export function ChangeList({ changes, labelOf, fieldLabel, valueOf, testId }: {
  changes: SettingsChange[];
  labelOf: (what: string) => string;
  fieldLabel: (field: string) => string;
  valueOf: (field: string, value: unknown) => string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white" data-testid={testId}>
      <SectionHeader
        title={W.changes}
        collapsible
        open={open}
        onToggle={() => setOpen((v) => !v)}
        meta={changes.length > 0 ? String(changes.length) : undefined}
        testId={testId ? `${testId}-header` : undefined}
      />
      {!open ? null : changes.length === 0 ? (
        <p className="border-t border-kit-slate-4 px-4 py-3 text-body text-c-secondary">{W.noChanges}</p>
      ) : (
        <ul className="divide-y divide-kit-slate-4 border-t border-kit-slate-4 px-4">
          {changes.map((c) => (
            <li key={c.id} className="py-2 text-body">
              <p className="font-medium text-kit-slate-12">{labelOf(c.what)}</p>
              <p className="text-meta text-kit-slate-11">
                {W.savedBy(c.actorName)} · {fmtDate(c.changedAt, { time: true })}
                {c.reason ? ` · ${c.reason}` : ""}
              </p>
              <ChangeLines oldValue={c.oldValue} newValue={c.newValue} fieldLabel={fieldLabel} valueOf={valueOf} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeLines({ oldValue, newValue, fieldLabel, valueOf }: {
  oldValue: unknown;
  newValue: unknown;
  fieldLabel: (field: string) => string;
  valueOf: (field: string, value: unknown) => string;
}) {
  if (oldValue && newValue && typeof oldValue === "object" && typeof newValue === "object"
      && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
    const o = oldValue as Record<string, unknown>;
    const n = newValue as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(o), ...Object.keys(n)])];
    return (
      <ul className="mt-1 grid gap-0.5">
        {fields.map((f) => (
          <li key={f} className="text-label text-kit-slate-11">
            {fieldLabel(f)}: {valueOf(f, o[f])} → {valueOf(f, n[f])}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="mt-1 text-label text-kit-slate-11">
      {valueOf("", oldValue)} → {valueOf("", newValue)}
    </p>
  );
}

/** The sentence a refused save shows, read from the API body. */
export function refusalOf(error: unknown): string {
  const e = error as { status?: number; body?: { code?: string; message?: string }; message?: string };
  if (e?.body?.code === "settings_changed" || e?.status === 409) return W.changedElsewhere;
  if (e?.status === 403) return W.readOnly;
  return e?.body?.message ?? e?.message ?? W.loadFailed;
}
