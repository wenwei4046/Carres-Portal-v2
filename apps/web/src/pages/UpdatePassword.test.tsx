/**
 * UpdatePassword — step 02 of recovery.
 *
 * The defect these tests exist for: `/update-password` was the destination of
 * every reset email and had no route. Because `detectSessionInUrl` is on,
 * following the link SIGNED THE USER IN and the catch-all dropped them on their
 * home page — no password field, no explanation, password unchanged. So the
 * first test here is the route itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import UpdatePassword from "./UpdatePassword";

const h = vi.hoisted(() => ({
  session: null as unknown,
  hydrated: true,
  signOut: vi.fn(async () => {}),
  setPassword: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; error: string }),
  navigate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ session: h.session, hydrated: h.hydrated, signOut: h.signOut }),
}));

vi.mock("@/lib/password", () => ({
  MIN_PASSWORD_LENGTH: 8,
  setPasswordFromRecovery: (...a: unknown[]) => h.setPassword(...(a as [])),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => h.navigate };
});

const SESSION = { user: { email: "aisyah@carres.com" } };

beforeEach(() => {
  h.session = SESSION;
  h.hydrated = true;
  h.signOut.mockClear();
  h.setPassword.mockClear();
  h.navigate.mockClear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <UpdatePassword />
    </MemoryRouter>,
  );
}

describe("the route exists — the defect itself", () => {
  it("/update-password resolves to this page and NOT to a catch-all", () => {
    render(
      <MemoryRouter initialEntries={["/update-password"]}>
        <Routes>
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="*" element={<div data-testid="catch-all" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.queryByTestId("catch-all")).toBeNull();
  });
});

describe("with a live recovery session", () => {
  it("asks for a new password and NEVER for the current one", () => {
    renderPage();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    // The person here is precisely the one who does not know the old password.
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
  });

  it("names the account the link belongs to", () => {
    renderPage();
    expect(screen.getByText(/aisyah@carres\.com/)).toBeTruthy();
  });

  it("states the length rule before anything is typed", () => {
    renderPage();
    expect(screen.getByText(/at least 8 characters/i)).toBeTruthy();
  });

  // These assert on role="alert", not on the text — the intro line carries the
  // same wording, so a plain text query cannot tell a refusal from a hint.
  it("refuses a short password without calling Supabase", async () => {
    renderPage();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/at least 8 characters/i),
    );
    expect(h.setPassword).not.toHaveBeenCalled();
  });

  it("refuses a mismatched confirmation without calling Supabase", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/doesn't match/i));
    expect(h.setPassword).not.toHaveBeenCalled();
  });

  it("saves a valid password, then signs out so the new one must be typed", async () => {
    vi.useFakeTimers();
    try {
      renderPage();
      fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
      fireEvent.change(screen.getByLabelText("Confirm new password"), {
        target: { value: "longenough1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save password" }));
      await vi.waitFor(() => expect(h.setPassword).toHaveBeenCalledWith("longenough1"));
      await vi.waitFor(() => expect(screen.getByText(/Password/)).toBeTruthy());
      // Staying signed in would land them in the portal without ever typing the
      // new password — which is how a forgotten password stays forgotten.
      await vi.advanceTimersByTimeAsync(3000);
      expect(h.signOut).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the reason when Supabase refuses", async () => {
    h.setPassword.mockResolvedValueOnce({ ok: false, error: "Password is too weak" });
    renderPage();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Password is too weak"));
  });
});

describe("without a session — the expired-link case", () => {
  it("says the link expired and offers the way back, instead of a dead form", () => {
    h.session = null;
    renderPage();
    expect(screen.getByText(/expired/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeTruthy();
    // A form here would be a trap: nothing could save.
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("Back to sign in goes to /login", () => {
    h.session = null;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(h.navigate).toHaveBeenCalledWith("/login");
  });
});

describe("before the auth store has hydrated", () => {
  it("shows neither the form nor the expired message — it cannot yet tell them apart", () => {
    h.hydrated = false;
    h.session = null;
    renderPage();
    expect(screen.getByText(/checking your link/i)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.queryByText(/expired/i)).toBeNull();
  });
});
