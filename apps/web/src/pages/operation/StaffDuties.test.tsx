import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_DUTIES } from "@carres/shared";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import type { WorkspaceDutiesResponse } from "@/lib/queries";

/**
 * `Workspace → Staff & Duties` — the ONE duty assignment surface
 * (workspace/MASTER.md §§4.1–4.7).
 *
 * The page answers three questions and no more: who normally holds each
 * governed duty, who acts during a dated absence, and what history proves it.
 * It is one CATALOGUE and one SELECTED duty — not the 720px document that
 * stacked two forms and a full history under all twelve duties.
 *
 * What these tests hold:
 *   · every catalogue duty appears exactly once, in the shared order, and the
 *     count comes from the CATALOGUE rather than a number typed here;
 *   · today's facts are the resolver's answer, printed under the governed
 *     labels, with the acting line absent when nobody covers;
 *   · search and `State` narrow the catalogue only — they never change who
 *     holds a duty;
 *   · the selected duty lives in the URL, so a Work configuration failure can
 *     deep-link to the duty it needs.
 */

// ── hook mocks ───────────────────────────────────────────────────────────────

const assignMutate = vi.fn();
const coverMutate = vi.fn();

const state: {
  duties?: WorkspaceDutiesResponse;
  loading: boolean;
  error: boolean;
  assignError: Error | null;
  coverError: Error | null;
  assignPending: boolean;
  coverPending: boolean;
} = {
  loading: false,
  error: false,
  assignError: null,
  coverError: null,
  assignPending: false,
  coverPending: false,
};

const refetch = vi.fn();

vi.mock("@/lib/queries", () => ({
  useWorkspaceDuties: () => ({
    data: state.duties,
    isLoading: state.loading,
    isError: state.error,
    refetch,
  }),
  useWorkspaceAssignDutyMutation: () => ({
    mutate: assignMutate,
    isPending: state.assignPending,
    error: state.assignError,
  }),
  useWorkspaceCoverDutyMutation: () => ({
    mutate: coverMutate,
    isPending: state.coverPending,
    error: state.coverError,
  }),
  qk: { operation: { staff: ["operation", "staff"] } },
  useOperationStaff: (opts?: { queryKey?: readonly unknown[] }) => ({
    data: {
      staff: opts?.queryKey?.includes("finance_approver")
        ? [{ user_id: "u-fiona", email: "fiona@x", name: "Fiona", pooled: false, available: false, note: null, last_seen_at: null, duties: [] }]
        : [
            { user_id: "u-yu-jun", email: "yujun@x", name: "Yu Jun", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
            { user_id: "u-shasha", email: "shasha@x", name: "Shasha", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
          ],
      myDuties: [],
    },
  }),
}));

// The shell header pulls the whole GlobalTopBar (orders query, router) — not
// this page's subject. A stub keeps the word visible and the page isolated.
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word }: { word: string }) => (
    <h1 data-testid="module-header">{word}</h1>
  ),
}));

import StaffDuties from "./StaffDuties";

// ── fixtures ─────────────────────────────────────────────────────────────────

type Duty = WorkspaceDutiesResponse["duties"][number];

/* The company date the page itself reads. Fixtures are built RELATIVE to it,
   so no test passes only because it was written on a convenient day. */
const TODAY = appTodayIso();

function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(y!, m! - 1, d! + days);
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const dd = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${mm}-${dd}`;
}

const COVER_FROM = plusDays(TODAY, -1);
const COVER_UNTIL = plusDays(TODAY, 1);
const HELD_FROM = plusDays(TODAY, -15);

function heldBy(key: string, label: string, name: string, id: string): Duty {
  return {
    key,
    label,
    resolution: {
      duty_key: key,
      normal_user_id: id,
      normal_user_name: name,
      acting_user_id: id,
      acting_user_name: name,
      actor_user_id: id,
      is_cover: false,
      is_superuser: false,
      allowed: true,
      source: "assignment",
    },
    assignments: [
      {
        id: `as-${key}`,
        duty_key: key,
        holder_id: id,
        holder_name: name,
        effective_from: HELD_FROM,
        effective_until: null,
        assigned_by_name: "Jess",
        note: null,
        created_at: "2026-09-01T02:00:00Z",
      },
    ],
    covers: [],
  };
}

function notAssigned(key: string, label: string): Duty {
  return {
    key,
    label,
    resolution: {
      duty_key: key,
      normal_user_id: null,
      normal_user_name: null,
      acting_user_id: null,
      acting_user_name: null,
      actor_user_id: null,
      is_cover: false,
      is_superuser: false,
      allowed: false,
      source: "not_assigned",
    },
    assignments: [],
    covers: [],
  };
}

/** GRN Duty: Yu Jun normally holds it, Shasha is acting today on annual
 *  leave cover — the §4.2 picture, so the detail must separate the two. */
function coveredGrn(): Duty {
  const base = heldBy("grn_duty", "GRN Duty", "Yu Jun", "u-yu-jun");
  return {
    ...base,
    resolution: {
      ...base.resolution,
      acting_user_id: "u-shasha",
      acting_user_name: "Shasha",
      actor_user_id: "u-shasha",
      is_cover: true,
    },
    covers: [
      {
        id: "cv-grn",
        duty_key: "grn_duty",
        normal_user_id: "u-yu-jun",
        normal_user_name: "Yu Jun",
        acting_user_id: "u-shasha",
        acting_user_name: "Shasha",
        starts_on: COVER_FROM,
        ends_on: COVER_UNTIL,
        reason: "Annual leave",
        assigned_by_name: "Jess",
        created_at: `${COVER_FROM}T02:00:00Z`,
      },
    ],
  };
}

/** The whole shared catalogue, so a row count is the CATALOGUE's truth. */
function wholeCatalogue(canAssign = true): WorkspaceDutiesResponse {
  return {
    can_assign: canAssign,
    duties: WORKSPACE_DUTIES.map((d) => {
      if (d.key === "grn_duty") return coveredGrn();
      if (d.key === "delivery_duty") return notAssigned(d.key, d.label);
      if (d.key === "po_duty") return heldBy(d.key, d.label, "Yu Jun", "u-yu-jun");
      return heldBy(d.key, d.label, "Shasha", "u-shasha");
    }),
  };
}

// ── render ───────────────────────────────────────────────────────────────────

let lastSearch = "";

function Probe() {
  lastSearch = useLocation().search;
  return null;
}

function draw(url = "/operation?tab=staff-duties") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/operation"
          element={
            <>
              <StaffDuties />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.error = false;
  state.assignError = null;
  state.coverError = null;
  state.assignPending = false;
  state.coverPending = false;
  state.duties = wholeCatalogue();
  lastSearch = "";
});

// ── the page ─────────────────────────────────────────────────────────────────

describe("the destination", () => {
  it("wears the destination word and its one purpose sentence", () => {
    draw();
    expect(screen.getByTestId("module-header")).toHaveTextContent("Staff & Duties");
    expect(
      screen.getByText(
        "Who holds each company duty today and who covers an absence.",
      ),
    ).toBeVisible();
  });

  it("is a catalogue beside a selected duty, not a stacked document", () => {
    draw();
    expect(screen.getByTestId("duty-catalogue")).toBeVisible();
    expect(screen.getByTestId("duty-detail")).toBeVisible();
    // The old page drew every duty's forms and history at once. One selected
    // duty means exactly one history block on the page.
    expect(screen.getAllByTestId(/^duty-history-/)).toHaveLength(1);
  });
});

describe("the catalogue", () => {
  it("prints every shared catalogue duty exactly once, in catalogue order", () => {
    draw();
    const rows = screen.getAllByTestId(/^duty-catalogue-/);
    // The count is the CATALOGUE's, never a number typed into a test — a duty
    // added to the shared list must show up here without editing this file.
    expect(rows).toHaveLength(WORKSPACE_DUTIES.length);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(
      WORKSPACE_DUTIES.map((d) => `duty-catalogue-${d.key}`),
    );
  });

  it("shows each duty's word and the person who holds it", () => {
    draw();
    const row = screen.getByTestId("duty-catalogue-po_duty");
    expect(within(row).getByText("PO Duty")).toBeVisible();
    expect(within(row).getByText("Yu Jun")).toBeVisible();
  });

  it("carries the exceptional state word beside the holder", () => {
    draw();
    expect(
      within(screen.getByTestId("duty-catalogue-grn_duty")).getByText(
        "Covered today",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("duty-catalogue-delivery_duty")).getByText(
        "Not assigned",
      ),
    ).toBeVisible();
  });

  it("says nothing exceptional about an ordinary held duty", () => {
    draw();
    const row = screen.getByTestId("duty-catalogue-po_duty");
    expect(within(row).queryByText("Covered today")).toBeNull();
    expect(within(row).queryByText("Not assigned")).toBeNull();
  });

  it("never shows workload, performance or a recommended person", () => {
    draw();
    for (const banned of [/workload/i, /recommend/i, /performance/i, /suggest/i]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });
});

describe("the selected duty", () => {
  it("opens the first catalogue duty when the URL names none", () => {
    draw();
    expect(
      screen.getByTestId(`selected-duty-${WORKSPACE_DUTIES[0].key}`),
    ).toBeVisible();
  });

  it("opens the duty a deep link names", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    expect(screen.getByTestId("selected-duty-grn_duty")).toBeVisible();
  });

  it("separates the normal owner from the person acting today", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    const detail = screen.getByTestId("selected-duty-grn_duty");
    expect(within(detail).getByText("Normal owner")).toBeVisible();
    expect(within(detail).getByText("Yu Jun")).toBeVisible();
    expect(within(detail).getByText("Acting today")).toBeVisible();
    expect(within(detail).getByText("Shasha")).toBeVisible();
    expect(within(detail).getByText("Cover")).toBeVisible();
    expect(within(detail).getByText("Reason")).toBeVisible();
    expect(within(detail).getByText("Annual leave")).toBeVisible();
    expect(
      within(detail).getByText(
        `${fmtDate(COVER_FROM)} – ${fmtDate(COVER_UNTIL)}`,
      ),
    ).toBeVisible();
  });

  it("does not print the same person twice when nobody covers", () => {
    draw("/operation?tab=staff-duties&duty=po_duty");
    const detail = screen.getByTestId("selected-duty-po_duty");
    expect(within(detail).getByText("Normal owner")).toBeVisible();
    // §4.2: the same person is NOT repeated as acting when no cover exists.
    expect(within(detail).queryByText("Acting today")).toBeNull();
    expect(within(detail).getAllByText("Yu Jun")).toHaveLength(1);
    expect(within(detail).getByText("Effective")).toBeVisible();
  });

  it("gives an unassigned duty the honest sentence and the manager's door", () => {
    draw("/operation?tab=staff-duties&duty=delivery_duty");
    const detail = screen.getByTestId("selected-duty-delivery_duty");
    expect(within(detail).getByText("Not assigned")).toBeVisible();
    expect(within(detail).getByText("Nobody holds Delivery Duty.")).toBeVisible();
  });

  it("gives a reader the quiet sentence and no write control at all", () => {
    state.duties = wholeCatalogue(false);
    draw("/operation?tab=staff-duties&duty=delivery_duty");
    expect(
      screen.getByText("Duty assignments are set by the manager."),
    ).toBeVisible();
    // Not a disabled button, not a hidden-but-present form: absent.
    expect(screen.queryByRole("button", { name: "Assign holder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add cover" })).toBeNull();
  });

  it("carries an avatar whose accessible name is the full person", () => {
    draw("/operation?tab=staff-duties&duty=po_duty");
    const avatar = screen.getByTestId("duty-avatar-normal");
    expect(avatar).toHaveTextContent("YJ");
    // Initials never REPLACE the printed name — they carry it for a reader.
    expect(avatar).toHaveAccessibleName("Yu Jun");
  });
});

describe("selecting a duty", () => {
  it("writes the choice into the URL so the page can be shared", () => {
    draw();
    fireEvent.click(screen.getByTestId("duty-catalogue-grn_duty"));
    expect(screen.getByTestId("selected-duty-grn_duty")).toBeVisible();
    expect(new URLSearchParams(lastSearch).get("duty")).toBe("grn_duty");
  });

  it("keeps the tab it was opened on", () => {
    draw();
    fireEvent.click(screen.getByTestId("duty-catalogue-grn_duty"));
    expect(new URLSearchParams(lastSearch).get("tab")).toBe("staff-duties");
  });

  it("is reachable by keyboard, because every row is a real button", () => {
    draw();
    const row = screen.getByTestId("duty-catalogue-grn_duty");
    expect(row.tagName).toBe("BUTTON");
    row.focus();
    expect(document.activeElement).toBe(row);
  });

  it("marks exactly one row as the current one", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    const pressed = screen
      .getAllByTestId(/^duty-catalogue-/)
      .filter((r) => r.getAttribute("aria-current") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAttribute("data-testid", "duty-catalogue-grn_duty");
  });

  it("corrects an unknown duty key to the first duty without a history entry", () => {
    draw("/operation?tab=staff-duties&duty=not_a_duty");
    expect(
      screen.getByTestId(`selected-duty-${WORKSPACE_DUTIES[0].key}`),
    ).toBeVisible();
    // A correction REPLACES: Back must not walk the reader through a key that
    // never existed.
    expect(new URLSearchParams(lastSearch).get("duty")).toBe(
      WORKSPACE_DUTIES[0].key,
    );
  });
});

describe("search and State", () => {
  it("narrows the catalogue by duty word", () => {
    draw();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search duties" }), {
      target: { value: "grn" },
    });
    expect(screen.getAllByTestId(/^duty-catalogue-/)).toHaveLength(1);
    expect(screen.getByTestId("duty-catalogue-grn_duty")).toBeVisible();
  });

  it("finds a duty by the person who holds it", () => {
    draw();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search duties" }), {
      target: { value: "yu jun" },
    });
    const keys = screen
      .getAllByTestId(/^duty-catalogue-/)
      .map((r) => r.getAttribute("data-testid"));
    expect(keys).toContain("duty-catalogue-po_duty");
    expect(keys).toContain("duty-catalogue-grn_duty"); // normal owner under cover
    expect(keys).not.toContain("duty-catalogue-delivery_duty");
  });

  it("offers exactly the four governed State words", () => {
    draw();
    expect(
      screen.getAllByTestId(/^duty-state-/).map((b) => b.textContent),
    ).toEqual(["All duties", "Covered today", "Cover scheduled", "Not assigned"]);
  });

  it("narrows to the duties a State word names", () => {
    draw();
    fireEvent.click(screen.getByTestId("duty-state-not_assigned"));
    const rows = screen.getAllByTestId(/^duty-catalogue-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-testid", "duty-catalogue-delivery_duty");
  });

  it("narrows to today's cover without counting a scheduled one", () => {
    draw();
    fireEvent.click(screen.getByTestId("duty-state-covered_today"));
    const rows = screen.getAllByTestId(/^duty-catalogue-/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-testid", "duty-catalogue-grn_duty");
  });

  it("says no duties match and offers the way back", () => {
    draw();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search duties" }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText("No duties match this search")).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeVisible();
    expect(screen.queryAllByTestId(/^duty-catalogue-/)).toHaveLength(0);
  });

  it("brings every duty back when the search is cleared", () => {
    draw();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search duties" }), {
      target: { value: "zzzz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getAllByTestId(/^duty-catalogue-/)).toHaveLength(
      WORKSPACE_DUTIES.length,
    );
  });

  it("keeps the selected duty open while the catalogue is narrowed away", () => {
    draw("/operation?tab=staff-duties&duty=delivery_duty");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search duties" }), {
      target: { value: "grn" },
    });
    // Narrowing the LIST must not silently change WHICH duty is being read.
    expect(screen.getByTestId("selected-duty-delivery_duty")).toBeVisible();
  });
});

describe("the narrow screen", () => {
  it("keeps catalogue and detail side by side from 1024px up", () => {
    draw();
    expect(screen.getByTestId("staff-duties-split").className).toContain(
      "lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]",
    );
  });

  it("hides the detail below 1024px until a duty is chosen", () => {
    draw();
    expect(screen.getByTestId("duty-detail").className).toContain("hidden");
    expect(screen.getByTestId("duty-detail").className).toContain("lg:block");
    expect(screen.queryByRole("button", { name: "Back to duties" })).toBeNull();
  });

  it("gives a chosen duty the full width and an explicit Back door", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    expect(screen.getByTestId("duty-detail").className).not.toContain("hidden");
    expect(screen.getByTestId("duty-catalogue").className).toContain("lg:block");
    const back = screen.getByRole("button", { name: "Back to duties" });
    expect(back).toBeVisible();
    // The door belongs to the narrow screen only.
    expect(back.className).toContain("lg:hidden");
  });

  it("returns to the catalogue and drops the duty from the URL", () => {
    draw("/operation?tab=staff-duties&duty=grn_duty");
    fireEvent.click(screen.getByRole("button", { name: "Back to duties" }));
    expect(new URLSearchParams(lastSearch).get("duty")).toBeNull();
    expect(new URLSearchParams(lastSearch).get("tab")).toBe("staff-duties");
  });
});

// ── Task 3 · one focused assignment ──────────────────────────────────────────

/** The kit's DatePicker is a popover calendar with no text box, so a date is
 *  chosen by opening it and clicking a day. The calendar opens on the current
 *  month when nothing is picked, so the day is taken from THIS month and the
 *  expected ISO is derived from the same clock. */
function pickDay(triggerId: string, dayOfMonth: number): string {
  fireEvent.click(document.getElementById(triggerId)!);
  const cell = screen
    .getAllByRole("gridcell")
    .find((c) => c.textContent?.trim() === String(dayOfMonth));
  if (!cell) throw new Error(`no day cell for ${dayOfMonth}`);
  fireEvent.click(cell.querySelector("button") ?? cell);
  const [y, m] = TODAY.split("-");
  return `${y}-${m}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** The kit's Select is a Radix listbox, opened then chosen by its option name. */
function choose(triggerId: string, optionName: string) {
  fireEvent.click(document.getElementById(triggerId)!);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function openAssign(url = "/operation?tab=staff-duties&duty=po_duty") {
  draw(url);
  const door = screen.getByRole("button", { name: "Assign holder" });
  /* A real click focuses the button; jsdom's `click` event does not. The
     dialog frame returns focus to whatever HAD it, so the test must put focus
     where a browser would. */
  door.focus();
  fireEvent.click(door);
  return door;
}

describe("assigning a holder", () => {
  it("gives an unassigned duty the manager's door", () => {
    draw("/operation?tab=staff-duties&duty=delivery_duty");
    expect(
      within(screen.getByTestId("selected-duty-delivery_duty")).getByRole(
        "button",
        { name: "Assign holder" },
      ),
    ).toBeVisible();
  });

  it("opens ONE focused surface instead of a permanently expanded form", () => {
    draw("/operation?tab=staff-duties&duty=po_duty");
    // Before the door is used there is no form on the page at all.
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assign holder" }));
    expect(screen.getByRole("dialog", { name: "Assign holder" })).toBeVisible();
  });

  it("prints the duty it is about and does not let it be retargeted", () => {
    openAssign();
    const dialog = screen.getByRole("dialog", { name: "Assign holder" });
    expect(within(dialog).getByText("Duty")).toBeVisible();
    expect(within(dialog).getByText("PO Duty")).toBeVisible();
    // The duty is a FACT of this dialog, never a field: a picker here would be
    // a second way to choose a duty, competing with the catalogue.
    expect(within(dialog).queryByRole("combobox", { name: "Duty" })).toBeNull();
  });

  it("offers the active staff the SERVER returned, never a name typed here", () => {
    openAssign();
    fireEvent.click(document.getElementById("assign-holder")!);
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Yu Jun", "Shasha"]);
  });

  it("offers a role-scoped duty its own list", () => {
    openAssign("/operation?tab=staff-duties&duty=finance_approver");
    fireEvent.click(document.getElementById("assign-holder")!);
    // Finance Approver takes Finance users; the API, not the browser, decides.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Fiona",
    ]);
  });

  it("refuses an empty holder with the governed sentence", () => {
    openAssign();
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Choose a holder.")).toBeVisible();
    expect(assignMutate).not.toHaveBeenCalled();
  });

  it("refuses a missing start with the governed sentence", () => {
    openAssign();
    choose("assign-holder", "Shasha");
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(screen.getByText("Choose when this holder starts.")).toBeVisible();
    expect(assignMutate).not.toHaveBeenCalled();
  });

  it("refuses an end before the start", () => {
    openAssign();
    choose("assign-holder", "Shasha");
    pickDay("assign-effective-from", 20);
    pickDay("assign-effective-until", 15);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(
      screen.getByText("Until must be on or after Effective from."),
    ).toBeVisible();
    expect(assignMutate).not.toHaveBeenCalled();
  });

  it("sends the exact camelCase contract the API validates", () => {
    openAssign();
    choose("assign-holder", "Shasha");
    const from = pickDay("assign-effective-from", 10);
    fireEvent.click(screen.getByTestId("assign-submit"));
    expect(assignMutate).toHaveBeenCalledTimes(1);
    expect(assignMutate.mock.calls[0]![0]).toEqual({
      dutyKey: "po_duty",
      holderId: "u-shasha",
      effectiveFrom: from,
    });
  });

  it("prints the server's own refusal and keeps every entered fact", () => {
    state.assignError = new Error(
      "Shasha cannot hold PO Duty. Choose an eligible active staff member.",
    );
    openAssign();
    choose("assign-holder", "Shasha");
    pickDay("assign-effective-from", 10);
    expect(
      screen.getByText(
        "Shasha cannot hold PO Duty. Choose an eligible active staff member.",
      ),
    ).toBeVisible();
    // The refusal is authoritative and visible BESIDE the action; nothing the
    // manager typed is thrown away, and the dialog stays open to be corrected.
    expect(screen.getByRole("dialog", { name: "Assign holder" })).toBeVisible();
    expect(document.getElementById("assign-holder")).toHaveTextContent("Shasha");
  });

  it("does not close or touch the shown resolution while the write is pending", () => {
    state.assignPending = true;
    openAssign();
    expect(screen.getByRole("dialog", { name: "Assign holder" })).toBeVisible();
    expect(screen.getByTestId("assign-submit")).toBeDisabled();
    // The catalogue still prints the CURRENT holder — no optimistic owner.
    expect(
      within(screen.getByTestId("duty-catalogue-po_duty")).getByText("Yu Jun"),
    ).toBeVisible();
  });

  it("announces the governed success sentence and keeps the duty selected", async () => {
    openAssign();
    choose("assign-holder", "Shasha");
    const from = pickDay("assign-effective-from", 10);
    fireEvent.click(screen.getByTestId("assign-submit"));
    // react-query runs the mutation-level callback only after the hook's own
    // onSuccess has awaited invalidation, so the refreshed read is already in.
    act(() => assignMutate.mock.calls[0]![1].onSuccess());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText(`Shasha holds PO Duty from ${fmtDate(from)}`),
    ).toBeVisible();
    expect(screen.getByTestId("selected-duty-po_duty")).toBeVisible();
  });

  it("returns focus to the door it came from", async () => {
    const door = openAssign();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Radix returns focus to the trigger — the reader lands back on the door
    // they used, not at the top of the page (§4.5 keyboard order).
    await waitFor(() => expect(document.activeElement).toBe(door));
  });
});

// ── Task 4 · one focused, dated cover ────────────────────────────────────────

function openCover(url = "/operation?tab=staff-duties&duty=po_duty") {
  draw(url);
  const door = screen.getByRole("button", { name: "Add cover" });
  door.focus();
  fireEvent.click(door);
  return door;
}

describe("adding cover", () => {
  it("offers no cover door at all while nobody holds the duty", () => {
    draw("/operation?tab=staff-duties&duty=delivery_duty");
    const detail = screen.getByTestId("selected-duty-delivery_duty");
    // §4.4: cover is available only when the duty HAS a normal holder. There
    // is nobody to cover FOR, so the act does not exist here - an offer the
    // server would refuse is not an offer.
    expect(within(detail).queryByRole("button", { name: "Add cover" })).toBeNull();
    expect(
      within(detail).getByRole("button", { name: "Assign holder" }),
    ).toBeVisible();
  });

  it("opens one focused surface on the duty already chosen", () => {
    openCover();
    const dialog = screen.getByRole("dialog", { name: "Add cover" });
    expect(within(dialog).getByText("PO Duty")).toBeVisible();
  });

  it("shows who is being covered for before anything is confirmed", () => {
    openCover();
    const dialog = screen.getByRole("dialog", { name: "Add cover" });
    expect(within(dialog).getByText("Normal owner")).toBeVisible();
    expect(within(dialog).getByText("Yu Jun")).toBeVisible();
  });

  it("shows the resulting period before anything is confirmed", () => {
    openCover();
    const from = pickDay("cover-from", 10);
    const until = pickDay("cover-until", 12);
    expect(
      screen.getByText(`${fmtDate(from)} – ${fmtDate(until)}`),
    ).toBeVisible();
  });

  it("never offers the normal owner as their own cover", () => {
    openCover();
    fireEvent.click(document.getElementById("cover-acting")!);
    // Yu Jun holds PO Duty; a person cannot cover for themselves, and the
    // write door refuses it again.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Shasha",
    ]);
  });

  it("refuses a missing acting person with the governed sentence", () => {
    openCover();
    fireEvent.click(screen.getByTestId("cover-submit"));
    expect(screen.getByText("Choose who will cover this duty.")).toBeVisible();
    expect(coverMutate).not.toHaveBeenCalled();
  });

  it("refuses missing cover dates with the governed sentence", () => {
    openCover();
    choose("cover-acting", "Shasha");
    fireEvent.click(screen.getByTestId("cover-submit"));
    expect(screen.getByText("Choose valid cover dates.")).toBeVisible();
    expect(coverMutate).not.toHaveBeenCalled();
  });

  it("refuses reversed cover dates with the same sentence", () => {
    openCover();
    choose("cover-acting", "Shasha");
    pickDay("cover-from", 20);
    pickDay("cover-until", 15);
    fireEvent.click(screen.getByTestId("cover-submit"));
    expect(screen.getByText("Choose valid cover dates.")).toBeVisible();
    expect(coverMutate).not.toHaveBeenCalled();
  });

  it("sends the exact camelCase contract the API validates", () => {
    openCover();
    choose("cover-acting", "Shasha");
    const from = pickDay("cover-from", 10);
    const until = pickDay("cover-until", 12);
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Annual leave" },
    });
    fireEvent.click(screen.getByTestId("cover-submit"));
    expect(coverMutate).toHaveBeenCalledTimes(1);
    expect(coverMutate.mock.calls[0]![0]).toEqual({
      dutyKey: "po_duty",
      actingUserId: "u-shasha",
      startsOn: from,
      endsOn: until,
      reason: "Annual leave",
    });
  });

  it("prints the server's own refusal and keeps every entered fact", () => {
    state.coverError = new Error(
      "PO Duty already has cover for these dates. Choose different dates.",
    );
    openCover();
    choose("cover-acting", "Shasha");
    expect(
      screen.getByText(
        "PO Duty already has cover for these dates. Choose different dates.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Add cover" })).toBeVisible();
    expect(document.getElementById("cover-acting")).toHaveTextContent("Shasha");
  });

  it("cannot be sent twice while the first write is still in flight", () => {
    state.coverPending = true;
    openCover();
    expect(screen.getByTestId("cover-submit")).toBeDisabled();
  });

  it("does not activate cover or move the owner while the write is pending", () => {
    state.coverPending = true;
    openCover();
    // The catalogue still resolves to the NORMAL owner: only the server's
    // refreshed answer may change who acts.
    expect(
      within(screen.getByTestId("duty-catalogue-po_duty")).getByText("Yu Jun"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("duty-catalogue-po_duty")).queryByText(
        "Covered today",
      ),
    ).toBeNull();
  });

  it("announces the governed success sentence", async () => {
    openCover();
    choose("cover-acting", "Shasha");
    const from = pickDay("cover-from", 10);
    const until = pickDay("cover-until", 12);
    fireEvent.click(screen.getByTestId("cover-submit"));
    act(() => coverMutate.mock.calls[0]![1].onSuccess());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText(
        `Shasha covers Yu Jun for PO Duty, ${fmtDate(from)}–${fmtDate(until)}`,
      ),
    ).toBeVisible();
  });
});
