/** Personal theme picker. 01 §9 removed the old Focus chooser; focus follows
 * the shared keyboard rule. Only a successful profile save applies a theme. */
import { useEffect, useState } from "react";
import Button from "@/components/kit/Button";
import {
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
  const changed = current.theme !== saved.theme;

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

      </div>
      <p className="text-[12px] text-c-secondary">Theme changes only the selection colour.</p>
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
