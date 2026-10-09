/**
 * Settings → Personal → Appearance — each person picks their own (owner v4
 * instruction, 01 §9; Settings pattern: plain grouped rows, one header
 * `Save changes`, UI MASTER §4).
 *
 *   Appearance                                              [Save changes]
 *   Choose how your portal looks. This changes only your profile.
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Theme            BRAND · Recommended    ● Carres                  │
 *   │                  COOL · Calm and crisp  ● Cool Slate ● Blue …     │
 *   │                  WARM · Soft and homely ● Warm Honey ● Olive …    │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Focus outline    [Soft grey] [Theme colour] [Strong]               │
 *   └──────────────────────────────────────────────────────────────────┘
 *   Theme changes the page background and selection. Status colours stay the same.
 *
 * The picker starts from the person's saved profile and follows it while
 * nothing is changed. Only a saved choice reaches the screen; a failed save
 * keeps the choice here so `Save changes` retries it.
 */
import { useEffect, useState } from "react";
import Button from "@/components/kit/Button";
import {
  FOCUS_CHOICES,
  THEMES,
  THEME_GROUPS,
  readAppearance,
  saveAppearance,
  type Appearance,
} from "@/lib/appearance";
import { useAuth } from "@/lib/auth";

export default function AppearanceSettings() {
  const userId = useAuth((s) => s.session?.user?.id ?? null);
  const meta = useAuth((s) => (s.session?.user?.user_metadata as { appearance?: unknown } | undefined)?.appearance);
  const saved = readAppearance(meta);
  /* An unsaved choice; null = the picker shows the saved profile, live. */
  const [draft, setDraft] = useState<Appearance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "saved" | "failed"; text: string } | null>(null);
  const current = draft ?? saved;
  const changed = current.theme !== saved.theme || current.focus !== saved.focus;

  // A different person signed in: their profile, no leftover draft or message.
  useEffect(() => {
    setDraft(null);
    setMessage(null);
  }, [userId]);

  const pick = (next: Appearance) => {
    setDraft(next);
    setMessage(null);
  };

  const save = async () => {
    if (!userId || busy || !changed) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveAppearance(current);
      if (result === "superseded") return;
      setDraft(null);
      setMessage({ kind: "saved", text: "Saved" });
    } catch {
      setMessage({ kind: "failed", text: "Could not save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-6 py-5" data-testid="appearance-settings">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-medium tracking-[-0.02em] text-c-ink">Appearance</h2>
          <p className="text-[13px] text-c-secondary">Choose how your portal looks. This changes only your profile.</p>
        </div>
        <Button variant="primary" disabled={!userId || !changed || busy} loading={busy} onClick={() => void save()}>
          Save changes
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-c-card-border bg-c-card" aria-busy={busy || undefined}>
        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 border-b border-c-section-line px-4 py-3.5">
          <span className="text-[13px] font-medium text-c-ink">Theme</span>
          <div className="flex flex-col gap-3" role="radiogroup" aria-label="Theme">
            {THEME_GROUPS.map((g) => (
              <div key={g.group} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-c-muted">
                  {g.group} · <span className="normal-case tracking-normal">{g.sub}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {THEMES.filter((t) => t.group === g.group).map((t) => {
                    const on = current.theme === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={busy}
                        data-testid={`theme-${t.key}`}
                        onClick={() => pick({ ...current, theme: t.key })}
                        className={`flex h-8 items-center gap-2 rounded-full border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover disabled:opacity-60 ${
                          on ? "border-c-ink ring-1 ring-c-ink" : "border-c-input-border"
                        }`}
                      >
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `var(--theme-dot-${t.key})` }} aria-hidden />
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 px-4 py-3.5">
          <span className="text-[13px] font-medium text-c-ink">Focus outline</span>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Focus outline">
            {FOCUS_CHOICES.map((f) => {
              const on = current.focus === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  data-testid={`focus-${f.key}`}
                  /* The sample IS the token rule: this card carries the choice's
                     own data-focus, so its outline is that choice's --c-focus. */
                  data-focus={f.key}
                  onClick={() => pick({ ...current, focus: f.key })}
                  /* The outline is the sample; the chosen card is the select wash. */
                  className={`flex min-w-[150px] flex-col gap-0.5 rounded-lg border px-3 py-2 text-left disabled:opacity-60 ${
                    on ? "border-c-select-fg bg-c-select-bg" : "border-c-footer-line bg-white"
                  }`}
                  style={{ outline: "var(--c-focus)", outlineOffset: -2 }}
                >
                  <span className="text-[12px] font-semibold text-c-ink">{f.name}</span>
                  <span className="text-[12px] text-c-secondary">{f.note}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-[12px] text-c-secondary">Theme changes the page background and selection. Status colours stay the same.</p>
      {message && (
        <p
          role={message.kind === "failed" ? "alert" : "status"}
          className={`text-[13px] ${message.kind === "failed" ? "text-c-warn-fg" : "text-c-ok-fg"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
