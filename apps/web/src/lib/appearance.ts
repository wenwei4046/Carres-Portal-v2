/**
 * Appearance — each person's own theme and focus outline (owner-confirmed
 * handoff v4, UI Kit §9, Jess 2026-10-08: "每人自己选 theme，存在个人资料").
 *
 * A theme changes only three things — page ground, selected background,
 * selected text (and the checkbox accent, which reads the selected text). Ink,
 * charcoal buttons, status colours and borders never change. The values live
 * in `styles/carres-tokens.css` under `[data-theme]` / `[data-focus]`; this
 * file only chooses which attribute `<html>` carries.
 *
 * Saved on the person's own login profile (Supabase `user_metadata.appearance`,
 * written by `auth.updateUser` for the signed-in person only), so it follows
 * them to every computer. A copy in this browser paints the first frame before
 * the session is read.
 */
import { useEffect } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export const THEME_KEYS = ["carres", "slate", "blue", "teal", "violet", "honey", "olive", "rose", "latte"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const FOCUS_KEYS = ["soft", "theme", "strong"] as const;
export type FocusKey = (typeof FOCUS_KEYS)[number];
export type Appearance = { theme: ThemeKey; focus: FocusKey };

export const DEFAULT_APPEARANCE: Appearance = { theme: "carres", focus: "soft" };

/** The picker's words. Each theme's identity dot is the CSS variable
 *  `--theme-dot-{key}` in `index.css` (UI Kit §9 table). */
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

const LOCAL_KEY = "carres-appearance";

/** Anything unrecognised falls back to the default, never to a guess. */
export function readAppearance(raw: unknown): Appearance {
  const v = (raw ?? {}) as { theme?: unknown; focus?: unknown };
  return {
    theme: (THEME_KEYS as readonly unknown[]).includes(v.theme) ? (v.theme as ThemeKey) : DEFAULT_APPEARANCE.theme,
    focus: (FOCUS_KEYS as readonly unknown[]).includes(v.focus) ? (v.focus as FocusKey) : DEFAULT_APPEARANCE.focus,
  };
}

/** Put the choice on `<html>` and remember it in this browser. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.focus = a.focus;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(a));
  } catch {
    /* a blocked storage only loses the first-frame copy */
  }
}

/** The first frame: this browser's copy, else the default. */
export function applyStoredAppearance() {
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
  } catch {
    stored = null;
  }
  applyAppearance(readAppearance(stored));
}

/** The signed-in person's saved choice, applied whenever the session changes. */
export function useProfileAppearance() {
  const meta = useAuth((s) => (s.session?.user?.user_metadata as { appearance?: unknown } | undefined)?.appearance);
  const signedIn = useAuth((s) => Boolean(s.session));
  useEffect(() => {
    if (!signedIn) return;
    applyAppearance(readAppearance(meta));
  }, [meta, signedIn]);
}

/** Save to the person's own profile; the page changes at once. */
export async function saveAppearance(a: Appearance): Promise<void> {
  applyAppearance(a);
  const { error } = await supabase.auth.updateUser({ data: { appearance: a } });
  if (error) throw error;
}
