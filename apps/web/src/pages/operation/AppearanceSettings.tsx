/**
 * Settings → Appearance — each person picks their own (owner-confirmed handoff
 * v4, UI Kit §9; Settings row pattern, Layout Standard §4.10).
 *
 *   Appearance
 *   Your own colours. Other people keep theirs.
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Theme            BRAND · Recommended    ● Carres                  │
 *   │ Page ground and  COOL · Calm and crisp  ● Cool Slate ● Blue …     │
 *   │ selected colour  WARM · Soft and homely ● Warm Honey ● Olive …    │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Focus outline    [Soft grey] [Theme colour] [Strong]               │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * A choice applies at once and is saved to the person's own profile.
 */
import { useState } from "react";
import { toast } from "sonner";
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
  const meta = useAuth((s) => (s.session?.user?.user_metadata as { appearance?: unknown } | undefined)?.appearance);
  const [current, setCurrent] = useState<Appearance>(() => readAppearance(meta));
  const [saving, setSaving] = useState(false);

  const choose = async (next: Appearance) => {
    const before = current;
    setCurrent(next);
    setSaving(true);
    try {
      await saveAppearance(next);
    } catch {
      setCurrent(before);
      await saveAppearance(before).catch(() => undefined);
      toast.error("Your appearance could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-6 py-5" data-testid="appearance-settings">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-medium tracking-[-0.02em] text-c-ink">Appearance</h2>
        <p className="text-[13px] text-c-secondary">Your own colours. Other people keep theirs.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-c-card-border bg-c-card" aria-busy={saving || undefined}>
        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 border-b border-c-section-line px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-c-ink">Theme</span>
            <span className="text-[12px] text-c-secondary">Changes the page ground and the selected colour only.</span>
          </div>
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
                        data-testid={`theme-${t.key}`}
                        onClick={() => void choose({ ...current, theme: t.key })}
                        className={`flex h-8 items-center gap-2 rounded-full border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover ${
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
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-c-ink">Focus outline</span>
            <span className="text-[12px] text-c-secondary">The line around the row under your pointer and the control you reach with the keyboard.</span>
          </div>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Focus outline">
            {FOCUS_CHOICES.map((f) => {
              const on = current.focus === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`focus-${f.key}`}
                  /* The sample IS the token rule: this card carries the choice's
                     own data-focus, so its outline is that choice's --c-focus. */
                  data-focus={f.key}
                  onClick={() => void choose({ ...current, focus: f.key })}
                  className={`flex min-w-[150px] flex-col gap-0.5 rounded-lg border bg-white px-3 py-2 text-left ${
                    on ? "border-c-ink" : "border-c-footer-line"
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
    </div>
  );
}
