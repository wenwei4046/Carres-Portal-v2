/**
 * Appearance — each person's own theme and focus outline (owner-confirmed
 * handoff v4, UI Kit "Settings → Appearance", Jess 2026-10-08: "每人自己选
 * theme，存在个人资料").
 *
 * A theme changes only three things — page ground, selected background,
 * selected text (and the checkbox accent, which reads the selected text). Ink,
 * charcoal buttons, status colours and borders never change. The values live
 * in `styles/carres-tokens.css` under `[data-theme]` / `[data-focus]`; this
 * file only chooses which attribute `<html>` carries.
 *
 * ONE home for the choice: the signed-in person's own login profile
 * (`user_metadata.appearance`, written by `auth.updateUser` for that person
 * only). There is no second browser copy, so a shared computer never paints
 * one person's colours for the next (01 §9 · UI MASTER Settings pattern):
 *
 *   first frame   the profile inside the login session this browser keeps for
 *                 the person (Supabase's own persisted session) — else Carres
 *   signed in     the session's profile, re-applied whenever it changes
 *   signed out    Carres (default), at once
 *   Save changes  the page changes only once the profile holds the choice
 *   a save fails  nothing changes on screen and nothing else is sent; the
 *                 picker keeps the choice so `Save changes` retries it
 *   a switch      an answer for a person who has since signed out is ignored
 */
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export const THEME_KEYS = ["carres", "slate", "blue", "teal", "violet", "honey", "olive", "rose", "latte"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const FOCUS_KEYS = ["soft", "theme", "strong"] as const;
export type FocusKey = (typeof FOCUS_KEYS)[number];
export type Appearance = { theme: ThemeKey; focus: FocusKey };

export const DEFAULT_APPEARANCE: Appearance = { theme: "carres", focus: "soft" };

/** The picker's words. Each theme's identity dot is the CSS variable
 *  `--theme-dot-{key}` in `index.css` (UI Kit theme table). */
export const THEMES: { key: ThemeKey; name: string; group: "Brand" | "Cool" | "Warm" }[] = [
  { key: "carres", name: "Carres", group: "Brand" },
  { key: "slate", name: "Cool Slate", group: "Cool" },
  { key: "blue", name: "Blue", group: "Cool" },
  { key: "teal", name: "Teal", group: "Cool" },
  { key: "violet", name: "Violet", group: "Cool" },
  { key: "honey", name: "Warm Honey", group: "Warm" },
  { key: "olive", name: "Olive", group: "Warm" },
  { key: "rose", name: "Rose", group: "Warm" },
  { key: "latte", name: "Latte", group: "Warm" },
];
export const THEME_GROUPS: { group: "Brand" | "Cool" | "Warm"; sub: string }[] = [
  { group: "Brand", sub: "Recommended" },
  { group: "Cool", sub: "Calm and crisp" },
  { group: "Warm", sub: "Soft and homely" },
];
export const FOCUS_CHOICES: { key: FocusKey; name: string; note: string }[] = [
  { key: "soft", name: "Soft grey", note: "Quiet. Default." },
  { key: "theme", name: "Theme colour", note: "Thin line in your theme" },
  { key: "strong", name: "Strong", note: "Easy to see" },
];

/** Anything unrecognised falls back to the default, never to a guess. */
export function readAppearance(raw: unknown): Appearance {
  const v = (raw ?? {}) as { theme?: unknown; focus?: unknown };
  return {
    theme: (THEME_KEYS as readonly unknown[]).includes(v.theme) ? (v.theme as ThemeKey) : DEFAULT_APPEARANCE.theme,
    focus: (FOCUS_KEYS as readonly unknown[]).includes(v.focus) ? (v.focus as FocusKey) : DEFAULT_APPEARANCE.focus,
  };
}

/** Put the choice on `<html>`. Nothing is stored here. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.focus = a.focus;
}

/** The persisted login session's key — Supabase's own default
 *  (`sb-{first host label}-auth-token`, supabase-js `SupabaseClient`). */
function sessionStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** The appearance inside the login session this browser keeps — the
 *  signed-in person's own profile, or null when nobody is signed in. */
export function persistedProfileAppearance(): unknown {
  const key = sessionStorageKey();
  if (!key) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as
      | { user?: { user_metadata?: { appearance?: unknown } } }
      | null;
    return raw?.user?.user_metadata?.appearance ?? null;
  } catch {
    return null;
  }
}

/** The first frame, before the session is read: the person's own profile. */
export function applyStoredAppearance() {
  // The 2026-10-08 build kept one shared browser copy; it is not read again.
  try {
    localStorage.removeItem("carres-appearance");
  } catch {
    /* blocked storage: nothing to remove */
  }
  applyAppearance(readAppearance(persistedProfileAppearance()));
}

/** The signed-in person's saved choice, applied whenever the session changes;
 *  the default the moment nobody is signed in. */
export function useProfileAppearance() {
  const hydrated = useAuth((s) => s.hydrated);
  const userId = useAuth((s) => s.session?.user?.id ?? null);
  const meta = useAuth((s) => (s.session?.user?.user_metadata as { appearance?: unknown } | undefined)?.appearance);
  const theme = readAppearance(meta).theme;
  const focus = readAppearance(meta).focus;
  useEffect(() => {
    if (!hydrated) return; // the first frame already shows the persisted profile
    if (!userId) {
      applyAppearance(DEFAULT_APPEARANCE);
      return;
    }
    applyAppearance({ theme, focus });
  }, [hydrated, userId, theme, focus]);
}

export type SaveResult = "saved" | "superseded";

/**
 * Save to the signed-in person's own profile. Only a saved choice reaches the
 * screen. A failure throws and changes nothing — no second request is sent. An
 * answer that arrives after a different person (or nobody) signed in is
 * `superseded`: it changes nothing for the person now at the computer.
 */
export async function saveAppearance(a: Appearance): Promise<SaveResult> {
  const userId = useAuth.getState().session?.user?.id ?? null;
  if (!userId) throw new Error("Sign in to save your appearance.");
  const res = await supabase.auth.updateUser({ data: { appearance: readAppearance(a) } });
  if ((useAuth.getState().session?.user?.id ?? null) !== userId) return "superseded";
  if (res.error) throw res.error;
  const saved: User | null = res.data?.user ?? null;
  if (!saved) throw new Error("Your appearance could not be saved.");
  // The profile now holds the choice; the session the screen reads says so too.
  useAuth.setState((s) => (s.session ? { session: { ...s.session, user: saved }, user: saved } : {}));
  applyAppearance(readAppearance((saved.user_metadata as { appearance?: unknown } | undefined)?.appearance));
  return "saved";
}
