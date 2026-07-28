/**
 * `/ui` — the showcase's ONE job is that it cannot go stale (card D0.5a).
 *
 * So these tests do not check that it looks right; they check that it still
 * shows everything the law says it must:
 *   · every token record — type, weight, spacing, radius — read from the SAME
 *     constants the components read, so a scale cannot change without the page
 *     changing with it;
 *   · every icon meaning and every tone — adding a meaning without showing it
 *     fails here;
 *   · the two forced hover/focus states, pinned to the components' own
 *     declarations, so a screenshot of a state is a screenshot of the REAL
 *     state and not a hand-painted lookalike;
 *   · **that the three frozen questions are GONE.** Q1 · Q3 · Q4 were decided
 *     on 2026-07-28; a page still offering the choice would tell a new hire a
 *     settled thing is open.
 *
 * NEGATIVE CONTROL: change `hover:brightness-95` in Button.tsx to
 * `hover:brightness-90` — only the mirror test goes red.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ICON_NAMES } from "@/components/kit/Icon";
import { SPACING_SCALE, TONES, WEIGHTS } from "@/components/kit/tokens";
import UiShowcase from "./UiShowcase";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SHOWCASE = src("./UiShowcase.tsx");
const BUTTON = src("../../components/kit/Button.tsx");
const FIELD = src("../../components/kit/field-recipe.ts");

describe("/ui showcase", () => {
  it("no longer offers the three frozen questions — the decision surface came out with the decision", () => {
    render(<UiShowcase />);
    expect(screen.queryByText(/Pending decisions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Candidate A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Candidate B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stroke 1\.5/)).not.toBeInTheDocument();
    expect(SHOWCASE).not.toContain("ICON_STROKE_CANDIDATES");
  });

  it("shows the frozen spacing scale, every step of it", () => {
    render(<UiShowcase />);
    for (const s of SPACING_SCALE) {
      expect(screen.getByText(`${s.px}px`), `${s.px}px`).toBeInTheDocument();
    }
  });

  it("shows the three surviving weights and never renders 700", () => {
    render(<UiShowcase />);
    for (const w of WEIGHTS) expect(screen.getByText(String(w.weight))).toBeInTheDocument();
    expect(SHOWCASE).not.toContain("font-bold");
    expect(document.querySelectorAll(".font-bold")).toHaveLength(0);
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
