import { describe, expect, it } from "vitest";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import {
  dutyDisplayState,
  matchesDutySearch,
  matchesDutyState,
  type DutyStateFilter,
} from "./staff-duties-model";

/**
 * The Staff & Duties PRESENTATION model (workspace/MASTER.md §§4.2, 4.5).
 *
 * These helpers may search, narrow and word what the ONE resolver already
 * answered. They may never choose an owner: today's actor is read from
 * `resolution` alone, so a dated cover row that has not started cannot move
 * the person the catalogue prints. Each helper takes `today` so the company
 * date is supplied by the caller (`appTodayIso()`), never read from the
 * browser clock inside a pure function.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

const TODAY = "2026-09-16";

function resolution(
  over: Partial<Duty["resolution"]> = {},
): Duty["resolution"] {
  return {
    duty_key: "po_duty",
    normal_user_id: "u-yu-jun",
    normal_user_name: "Yu Jun",
    acting_user_id: "u-yu-jun",
    acting_user_name: "Yu Jun",
    actor_user_id: "u-yu-jun",
    is_cover: false,
    is_superuser: false,
    allowed: true,
    source: "assignment",
    ...over,
  };
}

function duty(over: Partial<Duty> = {}): Duty {
  return {
    key: "po_duty",
    label: "PO Duty",
    resolution: resolution(),
    assignments: [],
    covers: [],
    ...over,
  };
}

function cover(over: Partial<Duty["covers"][number]> = {}): Duty["covers"][number] {
  return {
    id: "cv-1",
    duty_key: "po_duty",
    normal_user_id: "u-yu-jun",
    normal_user_name: "Yu Jun",
    acting_user_id: "u-shasha",
    acting_user_name: "Shasha",
    starts_on: "2026-09-15",
    ends_on: "2026-09-17",
    reason: "Annual leave",
    assigned_by_name: "Jess",
    created_at: "2026-09-14T02:00:00Z",
    ...over,
  };
}

function assignment(
  over: Partial<Duty["assignments"][number]> = {},
): Duty["assignments"][number] {
  return {
    id: "as-1",
    duty_key: "po_duty",
    holder_id: "u-yu-jun",
    holder_name: "Yu Jun",
    effective_from: "2026-09-01",
    effective_until: null,
    assigned_by_name: "Jess",
    note: null,
    created_at: "2026-09-01T02:00:00Z",
    ...over,
  };
}

// ── fixtures the spec names ──────────────────────────────────────────────────

const held = duty({ assignments: [assignment()] });

const unassigned = duty({
  key: "delivery_duty",
  label: "Delivery Duty",
  resolution: resolution({
    duty_key: "delivery_duty",
    normal_user_id: null,
    normal_user_name: null,
    acting_user_id: null,
    acting_user_name: null,
    actor_user_id: null,
    allowed: false,
    source: "not_assigned",
  }),
});

const coveredToday = duty({
  resolution: resolution({
    acting_user_id: "u-shasha",
    acting_user_name: "Shasha",
    actor_user_id: "u-shasha",
    is_cover: true,
  }),
  assignments: [assignment()],
  covers: [cover()],
});

const futureCover = duty({
  assignments: [assignment()],
  covers: [cover({ id: "cv-2", starts_on: "2026-09-20", ends_on: "2026-09-22" })],
});

const endingAssignment = duty({
  assignments: [assignment({ effective_until: "2026-09-30" })],
});

describe("matchesDutySearch", () => {
  it("keeps every duty when the query is blank or only spaces", () => {
    expect(matchesDutySearch(held, "")).toBe(true);
    expect(matchesDutySearch(held, "   ")).toBe(true);
  });

  it("matches the duty label regardless of case", () => {
    expect(matchesDutySearch(held, "po duty")).toBe(true);
    expect(matchesDutySearch(held, "PO DUTY")).toBe(true);
  });

  it("matches the current normal owner", () => {
    expect(matchesDutySearch(held, "yu jun")).toBe(true);
  });

  it("matches a historical or cover person the duty carries", () => {
    // Shasha appears only in the cover row — a person who ACTED must still be
    // findable (§4.2 "authorised current/historical person names").
    expect(matchesDutySearch(coveredToday, "shasha")).toBe(true);
    expect(
      matchesDutySearch(
        duty({ assignments: [assignment({ holder_name: "Khor Yee" })] }),
        "khor",
      ),
    ).toBe(true);
  });

  it("matches the person who recorded the act", () => {
    expect(matchesDutySearch(held, "jess")).toBe(true);
  });

  it("refuses a duty that carries neither the word nor the person", () => {
    expect(matchesDutySearch(held, "grn")).toBe(false);
    expect(matchesDutySearch(held, "shasha")).toBe(false);
  });

  it("survives a duty whose names are all absent", () => {
    expect(matchesDutySearch(unassigned, "yu jun")).toBe(false);
    expect(matchesDutySearch(unassigned, "delivery")).toBe(true);
  });
});

describe("dutyDisplayState", () => {
  it("calls a duty with no holder Not assigned", () => {
    expect(dutyDisplayState(unassigned, TODAY)).toEqual({
      kind: "not_assigned",
      word: "Not assigned",
    });
  });

  it("reads Covered today from the RESOLVER, not from a cover row", () => {
    expect(dutyDisplayState(coveredToday, TODAY)).toEqual({
      kind: "covered_today",
      word: "Covered today",
      date: "2026-09-17",
    });
  });

  it("words a cover that has not started as its start date", () => {
    // The date is spelled by the ONE governed formatter — a second date
    // spelling on this page would be the COPY-STANDARD defect itself.
    expect(dutyDisplayState(futureCover, TODAY)).toEqual({
      kind: "cover_scheduled",
      word: `Starts ${fmtDate("2026-09-20")}`,
      date: "2026-09-20",
    });
    expect(dutyDisplayState(futureCover, TODAY).word).toContain("20 Sep");
  });

  it("words a holder whose term ends as its end date", () => {
    expect(dutyDisplayState(endingAssignment, TODAY)).toEqual({
      kind: "ends",
      word: `Ends ${fmtDate("2026-09-30")}`,
      date: "2026-09-30",
    });
    expect(dutyDisplayState(endingAssignment, TODAY).word).toContain("30 Sep");
  });

  it("says nothing exceptional about an ordinary held duty", () => {
    expect(dutyDisplayState(held, TODAY)).toEqual({ kind: "held", word: null });
  });

  it("ignores a cover that has already ended", () => {
    const past = duty({
      assignments: [assignment()],
      covers: [cover({ starts_on: "2026-09-01", ends_on: "2026-09-05" })],
    });
    expect(dutyDisplayState(past, TODAY)).toEqual({ kind: "held", word: null });
  });

  it("names the SOONEST future cover when several are scheduled", () => {
    const many = duty({
      assignments: [assignment()],
      covers: [
        cover({ id: "cv-3", starts_on: "2026-10-05", ends_on: "2026-10-06" }),
        cover({ id: "cv-2", starts_on: "2026-09-20", ends_on: "2026-09-22" }),
      ],
    });
    const state = dutyDisplayState(many, TODAY);
    expect(state.kind).toBe("cover_scheduled");
    expect(state).toHaveProperty("date", "2026-09-20");
  });

  it("never lets a future cover replace today's holder facts", () => {
    // The whole point: the resolver says Yu Jun acts today, and a cover that
    // starts on the 20th must not make the row read as covered.
    expect(dutyDisplayState(futureCover, TODAY).kind).not.toBe("covered_today");
    expect(futureCover.resolution.actor_user_id).toBe("u-yu-jun");
  });

  it("puts Not assigned above every other note", () => {
    const noHolderButHistory = duty({
      resolution: resolution({
        normal_user_id: null,
        normal_user_name: null,
        acting_user_id: null,
        acting_user_name: null,
        actor_user_id: null,
        source: "not_assigned",
      }),
      assignments: [assignment({ effective_until: "2026-09-30" })],
      covers: [cover({ starts_on: "2026-09-20", ends_on: "2026-09-22" })],
    });
    expect(dutyDisplayState(noHolderButHistory, TODAY).kind).toBe("not_assigned");
  });
});

describe("matchesDutyState", () => {
  const cases: Array<[string, Duty, DutyStateFilter, boolean]> = [
    ["all keeps a held duty", held, "all", true],
    ["all keeps an unassigned duty", unassigned, "all", true],
    ["covered_today keeps a covered duty", coveredToday, "covered_today", true],
    ["covered_today drops a held duty", held, "covered_today", false],
    ["covered_today drops a future cover", futureCover, "covered_today", false],
    ["cover_scheduled keeps a future cover", futureCover, "cover_scheduled", true],
    ["cover_scheduled drops today's cover", coveredToday, "cover_scheduled", false],
    ["not_assigned keeps an unassigned duty", unassigned, "not_assigned", true],
    ["not_assigned drops a held duty", held, "not_assigned", false],
  ];

  for (const [name, subject, filter, expected] of cases) {
    it(name, () => {
      expect(matchesDutyState(subject, filter, TODAY)).toBe(expected);
    });
  }
});
