/**
 * Settings → Personal → Lunch time — each person sets when their own one
 * hour lunch starts (owner order 9 Oct 2026: "each person's personal lunch
 * setting; no work is transferred during lunch"; migration 0676). Same grammar
 * as its sibling Personal → Appearance: pick, then one header `Save changes`.
 *
 *   Lunch time                                              [Save changes]
 *   Choose when your one hour lunch starts. This changes only your profile.
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Lunch starts     (12:00 PM) (12:15 PM) … (1:00 PM · Office lunch) … │
 *   │                  You can start lunch from 12:00 PM to 2:00 PM.      │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Your lunch       1:00 PM to 2:00 PM                                 │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Afternoon check  2:01 PM                                            │
 *   └──────────────────────────────────────────────────────────────────┘
 *   Your work stays with you during lunch. The afternoon check waits until after your lunch.
 *
 * Every time is the database's answer (the one lunch and window arithmetic);
 * the screen only lists the choices between the earliest and latest start it
 * was given. Choosing the Office lunch saves "follow the Office lunch", so a
 * later Office change carries the person with it. Words: COPY-STANDARD
 * "Settings → Personal → Lunch time".
 */
import { useEffect, useState } from "react";
import type { WorkspaceStaffLunch } from "@carres/shared";
import Button from "@/components/kit/Button";
import Loading from "@/components/kit/Loading";
import { useAuth } from "@/lib/auth";
import { useSaveStaffLunch, useStaffLunch } from "@/lib/staff-lunch-queries";
import { clock12 } from "./settings-core/parts";

/** Choices are offered every quarter hour; the database accepts any whole minute. */
const STEP_MINUTES = 15;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmmOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The starts offered: every quarter hour in the allowed range, the Office lunch, and the saved start. */
export function lunchChoices(view: WorkspaceStaffLunch): string[] {
  const out = new Set<string>();
  const lo = minutesOf(view.earliest);
  const hi = minutesOf(view.latest);
  for (let m = lo; m <= hi; m += STEP_MINUTES) out.add(hhmmOf(m));
  out.add(view.officeLunchStart);
  if (view.saved && view.savedFits) out.add(view.saved);
  return [...out].sort();
}

function LunchForm({ view }: { view: WorkspaceStaffLunch }) {
  const save = useSaveStaffLunch();
  /* null = follow the Office lunch. A saved start the Office no longer allows
     is shown as the Office lunch, which is what applies. */
  const norm = (start: string | null) => (start === null || start === view.officeLunchStart ? null : start);
  const savedKey = view.savedFits ? norm(view.saved) : null;
  /* An unsaved pick; undefined = the saved choice, live. */
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState<{ kind: "saved" | "failed"; text: string } | null>(null);
  const current = draft === undefined ? savedKey : draft;
  const changed = draft !== undefined && norm(draft) !== savedKey;
  const busy = save.isPending;

  const submit = () => {
    if (!view.canEdit || !changed || busy) return;
    setMessage(null);
    save.mutate({ lunchStart: norm(current) }, {
      onSuccess: () => { setDraft(undefined); setMessage({ kind: "saved", text: "Saved" }); },
      onError: (error) => {
        const code = (error as { body?: { code?: string } }).body?.code;
        setMessage({ kind: "failed", text: code === "lunch_outside_range"
          ? `Choose a time from ${clock12(view.earliest)} to ${clock12(view.latest)}.`
          : "Could not save. Try again." });
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-6 py-5" data-testid="lunch-time-settings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[20px] font-medium tracking-[-0.02em] text-c-ink">Lunch time</h2>
          <p className="text-[13px] text-c-secondary">Choose when your one hour lunch starts. This changes only your profile.</p>
        </div>
        {view.canEdit ? (
          <Button variant="primary" disabled={!changed || busy} loading={busy} onClick={submit}>
            Save changes
          </Button>
        ) : null}
      </div>
      {!view.savedFits ? (
        <p role="status" className="text-[13px] text-c-warn-fg" data-testid="lunch-saved-outside">
          Your saved lunch time no longer fits the Office lunch. The Office lunch applies until you choose again.
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-c-card-border bg-c-card" aria-busy={busy || undefined}>
        <div className="grid grid-cols-1 gap-2 border-b border-c-section-line px-4 py-3.5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4">
          <span className="text-[13px] font-medium text-c-ink">Lunch starts</span>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lunch starts">
              {lunchChoices(view).map((start) => {
                const on = norm(start) === current;
                const office = start === view.officeLunchStart;
                return (
                  <button
                    key={start}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy || !view.canEdit}
                    data-testid={`lunch-${start}`}
                    onClick={() => { setDraft(norm(start)); setMessage(null); }}
                    className={`flex h-8 items-center rounded-full border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover disabled:opacity-60 ${
                      on ? "border-c-ink ring-1 ring-c-ink" : "border-c-input-border"
                    }`}
                  >
                    {office ? `${clock12(start)} · Office lunch` : clock12(start)}
                  </button>
                );
              })}
            </div>
            <span className="text-[12px] text-c-secondary">
              You can start lunch from {clock12(view.earliest)} to {clock12(view.latest)}.
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1 border-b border-c-section-line px-4 py-3.5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4">
          <span className="text-[13px] font-medium text-c-ink">Your lunch</span>
          <span className="text-[13px] text-c-ink" data-testid="lunch-effective">
            {clock12(view.lunchStart)} to {clock12(view.lunchEnd)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-1 px-4 py-3.5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-4">
          <span className="text-[13px] font-medium text-c-ink">Afternoon check</span>
          <span className="text-[13px] text-c-ink" data-testid="lunch-afternoon-check">{clock12(view.afternoonCheck)}</span>
        </div>
      </div>
      <p className="text-[12px] text-c-secondary">
        Your work stays with you during lunch. The afternoon check waits until after your lunch.
      </p>
      {!view.canEdit ? (
        <p className="text-[12px] text-c-secondary">Only a staff member can set a lunch time.</p>
      ) : null}
      {message ? (
        <p role={message.kind === "failed" ? "alert" : "status"}
          className={`text-[13px] ${message.kind === "failed" ? "text-c-warn-fg" : "text-c-ok-fg"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

export default function LunchTimeSettings() {
  const userId = useAuth((s) => s.session?.user?.id ?? null);
  const query = useStaffLunch();
  const [key, setKey] = useState(userId);
  // A different person signed in: their lunch, no leftover pick.
  useEffect(() => { setKey(userId); }, [userId]);
  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-6 py-5">
        <Loading variant="skeleton" lines={3} label="Opening Lunch time…" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-start gap-3 px-6 py-5">
        <p role="alert" className="text-[13px] text-c-warn-fg">Lunch time could not be loaded.</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }
  return <LunchForm key={`${key ?? ""}:${query.data.userId}`} view={query.data} />;
}
