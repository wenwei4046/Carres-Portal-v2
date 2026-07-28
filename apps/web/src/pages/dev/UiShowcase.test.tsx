/**
 * `/ui` — the showcase's ONE job is that it cannot go stale (card D0.5a).
 *
 * So these tests do not check that it looks right; they check that it still
 * shows everything the law says it must:
 *   · all three PENDING questions, because D5 is blocked until they are frozen
 *     and `/ui` is where Jess freezes them;
 *   · every icon meaning and every tone, read from the same records the
 *     components read — adding a meaning without showing it fails here;
 *   · the two forced hover/focus states, pinned to the components' own
 *     declarations, so a screenshot of a state is a screenshot of the REAL
 *     state and not a hand-painted lookalike.
 *
 * NEGATIVE CONTROL: change `hover:brightness-95` in Button.tsx to
 * `hover:brightness-90` — only the mirror test goes red.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ICON_NAMES } from "@/components/kit/Icon";
import { TONES } from "@/components/kit/tokens";
import UiShowcase from "./UiShowcase";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SHOWCASE = src("./UiShowcase.tsx");
const BUTTON = src("../../components/kit/Button.tsx");
const FIELD = src("../../components/kit/field-recipe.ts");

describe("/ui showcase", () => {
  it("puts the three pending decisions on the page", () => {
    render(<UiShowcase />);
    expect(screen.getByRole("heading", { name: /Q1 · Spacing scale/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Q3 · font-bold/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Q4 · Icon stroke width/ })).toBeInTheDocument();
  });

  it("renders BOTH spacing candidates — a page showing one has already decided", () => {
    render(<UiShowcase />);
    expect(screen.getByText(/Candidate A — 8 steps/)).toBeInTheDocument();
    expect(screen.getByText(/Candidate B — 6 steps/)).toBeInTheDocument();
  });

  it("renders BOTH icon strokes", () => {
    render(<UiShowcase />);
    expect(screen.getByText(/stroke 2 — Lucide default/)).toBeInTheDocument();
    expect(screen.getByText("stroke 1.5")).toBeInTheDocument();
  });

  it("shows every icon meaning the kit has", () => {
    render(<UiShowcase />);
    const shown = new Set(
      Array.from(document.querySelectorAll("[data-icon]")).map((n) => n.getAttribute("data-icon")),
    );
    for (const name of ICON_NAMES) expect(shown.has(name), name).toBe(true);
  });

  it("shows every tone", () => {
    render(<UiShowcase />);
    const shown = new Set(
      Array.from(document.querySelectorAll('[data-kit="status-pill"]')).map((n) =>
        n.getAttribute("data-tone"),
      ),
    );
    for (const tone of TONES) expect(shown.has(tone), tone).toBe(true);
  });

  it("renders each component in its ugly states, not only its happy one", () => {
    render(<UiShowcase />);
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(2); // input + textarea errors
    expect(document.querySelectorAll("button[disabled]").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll('[data-testid="kit-loading-skeleton"]').length).toBe(1);
    expect(document.querySelectorAll('[data-testid="kit-loading-spinner"]').length).toBeGreaterThanOrEqual(4);
  });

  it("forces the SAME hover and focus the components declare", () => {
    // Button's own declarations…
    expect(BUTTON).toContain("hover:brightness-95");
    expect(BUTTON).toContain("hover:bg-kit-blue-3");
    expect(BUTTON).toContain("focus-visible:ring-2");
    expect(BUTTON).toContain("focus-visible:ring-kit-blue-9");
    expect(BUTTON).toContain("focus-visible:ring-offset-1");
    expect(FIELD).toContain("focus:ring-2");
    expect(FIELD).toContain("focus:ring-kit-blue-9");
    expect(FIELD).toContain("focus:border-kit-blue-9");
    // …and the showcase's forced mirrors of them.
    expect(SHOWCASE).toContain("[&>button]:brightness-95");
    expect(SHOWCASE).toContain("[&>button]:bg-kit-blue-3");
    expect(SHOWCASE).toContain("[&>button]:ring-2");
    expect(SHOWCASE).toContain("[&>button]:ring-kit-blue-9");
    expect(SHOWCASE).toContain("[&>button]:ring-offset-1");
    expect(SHOWCASE).toContain("[&_input]:ring-2");
    expect(SHOWCASE).toContain("[&_input]:ring-kit-blue-9");
    expect(SHOWCASE).toContain("[&_input]:border-kit-blue-9");
  });
});
