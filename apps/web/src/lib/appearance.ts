/**
 * Personal theme, saved only to the signed-in person's own profile (01 §9).
 * A theme changes selection colours only. Keyboard focus is the fixed shared
 * rule in 01 §3; legacy profile focus fields are ignored. Save failure retains
 * the draft, and a late answer after an account switch applies nothing.
 */
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export const THEME_KEYS = ["carres", "slate", "blue", "teal", "violet", "honey", "olive", "rose", "latte"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type Appearance = { theme: ThemeKey };

export const DEFAULT_APPEARANCE: Appearance = { theme: "blue" };

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
/** Anything unrecognised falls back to the default, never to a guess. */
export function readAppearance(raw: unknown): Appearance {
  const v = (raw ?? {}) as { theme?: unknown };
  return {
    theme: (THEME_KEYS as readonly unknown[]).includes(v.theme) ? (v.theme as ThemeKey) : DEFAULT_APPEARANCE.theme,
  };
}

/** Put the choice on `<html>`. Nothing is stored here. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  delete root.dataset.focus; // remove an old preference left on this document
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
  useEffect(() => {
    if (!hydrated) return; // the first frame already shows the persisted profile
    if (!userId) {
      applyAppearance(DEFAULT_APPEARANCE);
      return;
    }
    applyAppearance({ theme });
  }, [hydrated, userId, theme]);
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
