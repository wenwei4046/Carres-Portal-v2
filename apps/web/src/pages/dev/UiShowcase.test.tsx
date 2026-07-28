/**
 * `/ui` — the showcase's ONE job is that it cannot go stale (card D0.5a).
 *
 * So these tests do not check that it looks right; they check that it still
 * shows everything the law says it must:
 *   · the FROZEN answers, because D0.5a's three questions are settled and a
 *     page still ASKING one is how a settled question gets re-opened;
 *   · every icon meaning, every tone, every spacing step and every z-layer, read
 *     from the same records the components read — adding one without showing it
 *     fails here;
 *   · the two forced hover/focus states, pinned to the components' own
 *     declarations, so a screenshot of a state is a screenshot of the REAL
 *     state and not a hand-painted lookalike;
 *   · every D0.5b box, since a Radix component that renders nowhere is a
 *     component the screenshot gate cannot see.
 *
 * NEGATIVE CONTROL: change `hover:brightness-95` in Button.tsx to
 * `hover:brightness-90` — only the mirror test goes red.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ICON_NAMES } from "@/components/kit/Icon";
import { Z_LADDER } from "@/components/kit/overlay-layer";
import { SPACING_SCALE, TONES } from "@/components/kit/tokens";
import UiShowcase from "./UiShowcase";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const SHOWCASE = src("./UiShowcase.tsx");
const BUTTON = src("../../components/kit/Button.tsx");
const FIELD = src("../../components/kit/field-recipe.ts");

describe("/ui showcase", () => {
  it("records all four frozen answers and asks nothing", () => {
    render(<UiShowcase />);
    expect(screen.getByRole("heading", { name: "Frozen decisions" })).toBeInTheDocument();
    expect(screen.getByText(/Candidate A — 8 steps/)).toBeInTheDocument();
    expect(screen.getByText("Radix slate-3")).toBeInTheDocument();
    expect(screen.getByText("Deleted into 600")).toBeInTheDocument();
    expect(screen.getByText(/Lucide default — 2/)).toBeInTheDocument();
    // The register is empty, so the page no longer poses a choice.
    expect(screen.queryByRole("heading", { name: "Pending decisions" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Candidate B/)).not.toBeInTheDocument();
    expect(screen.queryByText("stroke 1.5")).not.toBeInTheDocument();
  });

  it("shows every step of the frozen spacing scale", () => {
    render(<UiShowcase />);
    for (const s of SPACING_SCALE) expect(screen.getByText(`${s.px}px`), `${s.px}`).toBeInTheDocument();
  });

  it("shows the whole z-index ladder — five layers, and the page names no sixth", () => {
    render(<UiShowcase />);
    for (const l of Z_LADDER) expect(screen.getByText(`z-${l.z}`), `${l.z}`).toBeInTheDocument();
  });

  it("renders every D0.5b box, including the ones that only exist when opened", () => {
    render(<UiShowcase />);
    // Closed by default — a modal that renders itself open would be a bug.
    expect(document.querySelector('[data-kit="modal"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open a modal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open a drawer" })).toBeInTheDocument();
    // On the page without a click.
    expect(document.querySelectorAll('[data-kit="select"]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll('[data-kit="checkbox"]').length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll('[data-kit="date-picker"]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll('[data-kit="tab"]').length).toBeGreaterThanOrEqual(5);
    expect(document.querySelectorAll('[data-kit="toast"]').length).toBe(3);
  });

  it("renders the three shells, and the calm record shows NO issues block", () => {
    render(<UiShowcase />);
    expect(document.querySelector('[data-kit="page-shell"]')).toBeInTheDocument();
    expect(document.querySelector('[data-kit="data-table"]')).toBeInTheDocument();
    // Two DetailShells side by side: one calm, one blocked.
    expect(document.querySelectorAll('[data-kit="detail-shell"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-kit="detail-current-action"]')).toHaveLength(2);
    // …and exactly ONE issues container between them — the calm one draws none.
    expect(document.querySelectorAll('[data-kit="detail-current-issues"]')).toHaveLength(1);
  });

  it("opens the modal it offers, and closes it again", () => {
    render(<UiShowcase />);
    fireEvent.click(screen.getByRole("button", { name: "Open a modal" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Record the delay decision");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
