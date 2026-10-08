import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { updateUser } } }));

import { useAuth } from "@/lib/auth";
import { applyAppearance, applyStoredAppearance, useProfileAppearance } from "@/lib/appearance";
import AppearanceSettings from "./AppearanceSettings";

const user = (id: string, appearance?: unknown) => ({ id, user_metadata: { name: id, appearance } }) as unknown as User;
const signIn = (u: User | null) =>
  useAuth.setState({ hydrated: true, user: u, session: u ? ({ access_token: "t", user: u } as unknown as Session) : null });
const html = () => document.documentElement.dataset;

function Sync() {
  useProfileAppearance();
  return null;
}

beforeEach(() => {
  updateUser.mockReset();
  applyAppearance({ theme: "carres", focus: "soft" });
  signIn(user("a"));
});

describe("Settings → Appearance — one choice, on the person's own profile", () => {
  it("applies the signed-in person's profile, the next person's on a switch, and Carres on sign-out", () => {
    render(<Sync />);
    act(() => signIn(user("a", { theme: "teal", focus: "strong" })));
    expect(html().theme).toBe("teal");
    expect(html().focus).toBe("strong");
    act(() => signIn(user("b")));
    expect(html().theme).toBe("carres");
    act(() => signIn(user("c", { theme: "rose", focus: "theme" })));
    expect(html().theme).toBe("rose");
    act(() => signIn(null));
    expect(html()).toMatchObject({ theme: "carres", focus: "soft" });
  });

  it("saves the click to the person's own profile and the picker reads the profile", async () => {
    updateUser.mockResolvedValue({ data: { user: user("a", { theme: "violet", focus: "soft" }) }, error: null });
    const view = render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("theme-violet"));
    expect(html().theme).toBe("violet"); // at once
    await screen.findByText("Saved to your profile.");
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ data: { appearance: { theme: "violet", focus: "soft" } } });
    view.unmount();
    render(<AppearanceSettings />);
    expect(screen.getByTestId("theme-violet")).toHaveAttribute("aria-checked", "true");
  });

  it("a failed save brings the saved colours back and sends nothing else", async () => {
    signIn(user("a", { theme: "olive", focus: "soft" }));
    applyAppearance({ theme: "olive", focus: "soft" });
    updateUser.mockResolvedValue({ data: { user: null }, error: new Error("network") });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("theme-rose"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Your saved colours are back. Try again.");
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(html().theme).toBe("olive");
    expect(screen.getByTestId("theme-olive")).toHaveAttribute("aria-checked", "true");
  });

  it("two quick clicks: only the newest answer changes the screen", async () => {
    const answers: Array<(v: unknown) => void> = [];
    updateUser.mockImplementation(() => new Promise((r) => answers.push(r)));
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("theme-blue"));
    fireEvent.click(screen.getByTestId("theme-latte"));
    expect(html().theme).toBe("latte");
    await act(async () => answers[1]!({ data: { user: user("a", { theme: "latte", focus: "soft" }) }, error: null }));
    // The older click's failure arrives last; it may not undo the newer choice.
    await act(async () => answers[0]!({ data: { user: null }, error: new Error("late") }));
    expect(html().theme).toBe("latte");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an answer for a person who has since switched account never recolours the next person", async () => {
    let answer!: (v: unknown) => void;
    updateUser.mockImplementation(() => new Promise((r) => { answer = r; }));
    render(<><Sync /><AppearanceSettings /></>);
    fireEvent.click(screen.getByTestId("theme-blue"));
    act(() => signIn(user("b", { theme: "latte", focus: "strong" })));
    await act(async () => answer({ data: { user: user("a", { theme: "blue", focus: "soft" }) }, error: null }));
    await waitFor(() => expect(html().theme).toBe("latte"));
    expect(useAuth.getState().session?.user.id).toBe("b");
    expect(screen.getByTestId("theme-latte")).toHaveAttribute("aria-checked", "true");
  });

  it("the first frame reads the person's own login session, not a shared browser copy", () => {
    const key = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co").hostname.split(".")[0]}-auth-token`;
    localStorage.setItem("carres-appearance", JSON.stringify({ theme: "rose", focus: "strong" }));
    localStorage.setItem(key, JSON.stringify({ user: { id: "a", user_metadata: { appearance: { theme: "teal", focus: "theme" } } } }));
    applyStoredAppearance();
    expect(html()).toMatchObject({ theme: "teal", focus: "theme" });
    expect(localStorage.getItem("carres-appearance")).toBeNull();
    localStorage.removeItem(key);
    applyStoredAppearance(); // nobody signed in
    expect(html()).toMatchObject({ theme: "carres", focus: "soft" });
  });
});
