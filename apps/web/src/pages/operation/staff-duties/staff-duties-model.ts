import { fmtDate } from "@/lib/fmt-date";
import type { WorkspaceDutiesResponse } from "@/lib/queries";

/**
 * Staff & Duties — the PRESENTATION model (workspace/MASTER.md §§4.2, 4.5).
 *
 * These helpers search, narrow and word what the ONE Shared Duty Resolver has
 * already answered. They hold no business rule of their own:
 *
 *   · today's actor is read from `resolution` and from nowhere else, so a
 *     dated cover row that has not started cannot move the person a row
 *     prints — the browser never re-decides ownership (§4.1, Law A);
 *   · eligibility, overlap and the effect of an act belong to the SQL doors;
 *   · `today` is a PARAMETER. The company date comes from `appTodayIso()` at
 *     the caller, so the browser's own clock and timezone never leak into a
 *     comparison (§4.4, "the company's timezone, never the browser's").
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

/** The `State` narrowing offered beside search — COPY-STANDARD's four words. */
export type DutyStateFilter =
  | "all"
  | "covered_today"
  | "cover_scheduled"
  | "not_assigned";

/** The exceptional note a catalogue row carries beside its holder (§4.2).
 *  `held` is the ordinary duty: it says nothing, because a note that fires on
 *  every row is not an exception. */
export type DutyDisplayState =
  | { kind: "not_assigned"; word: string }
  | { kind: "covered_today"; word: string; date: string }
  | { kind: "cover_scheduled"; word: string; date: string }
  | { kind: "ends"; word: string; date: string }
  | { kind: "held"; word: null };

/** Every person this duty carries — current, acting and historical. §4.2 asks
 *  search to find a name that ACTED, not only the name holding it today. */
function peopleOf(duty: Duty): Array<string | null | undefined> {
  return [
    duty.resolution.normal_user_name,
    duty.resolution.acting_user_name,
    ...duty.assignments.flatMap((a) => [a.holder_name, a.assigned_by_name]),
    ...duty.covers.flatMap((c) => [
      c.normal_user_name,
      c.acting_user_name,
      c.assigned_by_name,
    ]),
  ];
}

/** Duty label + authorised current/historical person names (§4.2). A blank
 *  query keeps everything: an empty box is not a filter. */
export function matchesDutySearch(duty: Duty, raw: string): boolean {
  const query = raw.trim().toLocaleLowerCase();
  if (!query) return true;
  return [duty.label, ...peopleOf(duty)].some((value) =>
    value?.toLocaleLowerCase().includes(query),
  );
}

/** The soonest cover starting after `today`, or null. Covers arrive newest
 *  first, so the soonest FUTURE one is the minimum, not the first row. */
function nextScheduledCover(duty: Duty, today: string) {
  /* When the API asked the resolver (S2-A), its answer is the only one: a
     future cover it will not act through (a departed person's) is no news. */
  if (duty.scheduled_cover_id !== undefined) {
    return duty.covers.find((c) => c.id === duty.scheduled_cover_id) ?? null;
  }
  return duty.covers
    .filter((c) => c.starts_on > today)
    .reduce<Duty["covers"][number] | null>(
      (soonest, c) => (!soonest || c.starts_on < soonest.starts_on ? c : soonest),
      null,
    );
}

/** The cover the resolver is ACTING through today — found only to print its
 *  end date. The resolver, not this row, decided that a cover is in force. */
function coverInForce(duty: Duty, today: string) {
  const byId = duty.resolution.cover_id
    ? duty.covers.find((c) => c.id === duty.resolution.cover_id)
    : undefined;
  return (
    byId ??
    duty.covers.find(
      (c) =>
        c.acting_user_id === duty.resolution.acting_user_id &&
        c.starts_on <= today &&
        c.ends_on >= today,
    ) ?? null
  );
}

/** The soonest date on which a current holder's term ends, or null. */
function assignmentEnd(duty: Duty, today: string) {
  return duty.assignments
    .map((a) => a.effective_until)
    .filter((d): d is string => typeof d === "string" && d >= today)
    .sort()[0];
}

/**
 * The one exceptional note for a catalogue row, in the order §4.2 reads them:
 * a missing holder outranks every other note, then the cover acting TODAY
 * (the resolver's word), then a cover that has not started, then a term that
 * ends. Anything else is an ordinary held duty and says nothing.
 */
export function dutyDisplayState(duty: Duty, today: string): DutyDisplayState {
  if (!duty.resolution.normal_user_id) {
    return { kind: "not_assigned", word: "Not assigned" };
  }
  if (duty.resolution.is_cover) {
    const active = coverInForce(duty, today);
    return {
      kind: "covered_today",
      word: "Covered today",
      date: active?.ends_on ?? today,
    };
  }
  const scheduled = nextScheduledCover(duty, today);
  if (scheduled) {
    return {
      kind: "cover_scheduled",
      word: `Starts ${fmtDate(scheduled.starts_on)}`,
      date: scheduled.starts_on,
    };
  }
  const ends = assignmentEnd(duty, today);
  if (ends) {
    return { kind: "ends", word: `Ends ${fmtDate(ends)}`, date: ends };
  }
  return { kind: "held", word: null };
}

/** `All duties` keeps everything; each other word keeps exactly the rows whose
 *  display state it names. The filter never invents a state of its own. */
export function matchesDutyState(
  duty: Duty,
  filter: DutyStateFilter,
  today: string,
): boolean {
  if (filter === "all") return true;
  return dutyDisplayState(duty, today).kind === filter;
}

/**
 * The cover the selected detail describes (S2-A): the row the RESOLVER acts
 * through today (`resolution.cover_id`), else the one it will act through when
 * the next cover begins (`scheduled_cover_id`, asked of the resolver by the
 * API). Never the first row whose dates happen to match.
 */
export function shownCoverOf(duty: Duty): Duty["covers"][number] | null {
  const id = duty.resolution.cover_id ?? duty.scheduled_cover_id ?? null;
  if (!id) return null;
  return duty.covers.find((c) => c.id === id) ?? null;
}

/** The write-door refusal code the API returned (`body.code`), or `unknown`
 *  for anything else — a network failure included. The error's own message
 *  is never read: it may carry the database's English. */
export function refusalCodeOf(error: unknown): string {
  const body = (error as { body?: unknown } | null)?.body;
  const code =
    body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  return typeof code === "string" ? code : "unknown";
}

/**
 * The governed §4.4.1 sentence for a refusal (workspace/MASTER.md). `name` is
 * the person the manager chose in the open form. Every code the doors raise
 * has a sentence; anything unrecognised is the unknown-failure sentence.
 */
export function dutyRefusalSentence(
  act: "assign" | "cover",
  error: unknown,
  facts: { duty: string; name: string },
): string {
  const { duty, name } = facts;
  switch (refusalCodeOf(error)) {
    case "no_duty_holder":
      return `${duty} has no normal holder for all these dates. Assign the holder first.`;
    case "cover_overlap":
      return `${duty} already has cover for these dates. Choose different dates.`;
    case "cover_is_holder":
      return `Choose another person to cover ${duty}.`;
    case "invalid_cover":
      return `${name} can no longer cover ${duty}. Choose another eligible staff member.`;
    case "invalid_holder":
    case "self_assignment_refused":
      return `${name} cannot hold ${duty}. Choose an eligible active staff member.`;
    case "invalid_dates":
      return act === "assign" ? "Choose when this holder starts." : "Choose valid cover dates.";
    case "not_duty_manager":
      return "Duty assignments are set by the manager.";
    default:
      return `${duty} could not be updated. Try again.`;
  }
}
