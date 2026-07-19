/**
 * Staff identity avatar — ONE copy shared by the Orders list (PIC chips /
 * TEAM rail) and the right-rail Team panel (DUTY & ROLES board), so the same
 * person always renders the same initials + colour everywhere.
 *
 * Rules (Jess round-3, 2026-07-18): label = calling-name as keyed in
 * app_users.name, falling back to the email local-part; initials = first
 * letter of each WORD, max 2 ("Khor Yee"→KY · "Li Ching"→LC), single-word
 * names take their first two letters ("Shasha"→SH). Colours are a fixed
 * muted palette that deliberately AVOIDS the status hues (green/amber/red),
 * flame (action) and selection blue — identity never reads as state.
 */

import { AVATAR_COLORS } from "@/lib/design-standard";

export function personLabel(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  return n || email.split("@")[0] || email;
}

export function personInitials(name: string | null | undefined, email: string): string {
  const words = personLabel(name, email).split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? email).slice(0, 2).toUpperCase();
}

/** Stable per-person colour, hashed off the user id. */
export function avatarColor(userId: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h + userId.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
