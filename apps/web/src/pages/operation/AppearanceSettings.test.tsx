import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { updateUser } } }));

import { useAuth } from "@/lib/auth";
import { applyAppearance, applyStoredAppearance, readAppearance, useProfileAppearance } from "@/lib/appearance";
import AppearanceSettings from "./AppearanceSettings";

const user = (id: string, appearance?: unknown) => ({ id, user_metadata: { name: id, appearance } }) as unknown as User;
const signIn = (u: User | null) =>
  useAuth.setState({ hydrated: true, user: u, session: u ? ({ access_token: "t", user: u } as unknown as Session) : null });
const html = () => document.documentElement.dataset;
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

function Sync() {
  useProfileAppearance();
  return null;
}

beforeEach(() => {
  updateUser.mockReset();
  applyAppearance({ theme: "carres", focus: "soft" });
  signIn(user("a"));
});

describe("Settings → Personal → Appearance — one choice, on the person's own profile", () => {
  it("unknown profile values fall back to Carres / Soft grey", () => {
    expect(readAppearance({ theme: "unknown", focus: "bad" })).toEqual({ theme: "carres", focus: "soft" });
  });

  it("applies the signed-in person's profile, the next person's on a switch, and Carres on sign-out", () => {
    render(<Sync />);
    act(() => signIn(user("a", { theme: "teal", focus: "strong" })));
    expect(html()).toMatchObject({ theme: "teal", focus: "strong" });
    act(() => signIn(user("b")));
    expect(html().theme).toBe("carres");
    act(() => signIn(user("c", { theme: "rose", focus: "theme" })));
    expect(html().theme).toBe("rose");
    act(() => signIn(null));
    expect(html()).toMatchObject({ theme: "carres", focus: "soft" });
  });

  it("Save changes writes both choices to the person's own profile, then the page changes", async () => {
    updateUser.mockResolvedValue({ data: { user: user("a", { theme: "violet", focus: "theme" }) }, error: null });
    const view = render(<AppearanceSettings />);
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId("theme-violet"));
    fireEvent.click(screen.getByTestId("focus-theme"));
    expect(html().theme).toBe("carres"); // a choice is not applied until it is saved
    fireEvent.click(saveButton());
    await screen.findByText("Saved");
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ data: { appearance: { theme: "violet", focus: "theme" } } });
    expect(html()).toMatchObject({ theme: "violet", focus: "theme" });
    view.unmount();
    render(<AppearanceSettings />);
    expect(screen.getByTestId("theme-violet")).toHaveAttribute("aria-checked", "true");
  });

  it("a failed save keeps the choice for retry, applies nothing and sends nothing else", async () => {
    updateUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("network") });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("theme-rose"));
    fireEvent.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(html().theme).toBe("carres");
    expect(screen.getByTestId("theme-rose")).toHaveAttribute("aria-checked", "true");
    // Retry is the same button, with the same choice.
    updateUser.mockResolvedValueOnce({ data: { user: user("a", { theme: "rose", focus: "soft" }) }, error: null });
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());
    await screen.findByText("Saved");
    expect(updateUser).toHaveBeenLastCalledWith({ data: { appearance: { theme: "rose", focus: "soft" } } });
    expect(html().theme).toBe("rose");
  });

  it("an answer for a person who has since switched account never recolours the next person", async () => {
    let answer!: (v: unknown) => void;
    updateUser.mockImplementation(() => new Promise((r) => { answer = r; }));
    render(<><Sync /><AppearanceSettings /></>);
    fireEvent.click(screen.getByTestId("theme-blue"));
    fireEvent.click(saveButton());
    act(() => signIn(user("b", { theme: "latte", focus: "strong" })));
    await act(async () => answer({ data: { user: user("a", { theme: "blue", focus: "soft" }) }, error: null }));
    await waitFor(() => expect(html().theme).toBe("latte"));
    expect(useAuth.getState().session?.user.id).toBe("b");
    expect(screen.getByTestId("theme-latte")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Saved")).toBeNull();
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
