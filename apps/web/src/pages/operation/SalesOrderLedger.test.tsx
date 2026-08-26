import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import SalesOrderLedger, {
  groupHistoryByDay,
  historyActorWords,
  historyDetailLines,
  historyWords,
} from "./SalesOrderLedger";

const revisions = [{
  revision: 1,
  snapshot: { header: { customer_name: "Kimmy" }, lines: [], addons: [] },
  created_at: "2026-08-10T01:00:00Z",
  created_by: null,
  change_type: null,
  note: null,
}];
const history = [{ text: "Amendment rejected - price not agreed", occurred_at: "2026-08-10T02:00:00Z" }];

describe("Sales Order Revisions and History are different records", () => {
  it("shows complete versions without mixing in event history", () => {
    render(<SalesOrderLedger revisions={revisions} history={history} currentRevision={1} viewedRevision={null} onViewRevision={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Revisions" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Original — the agreement/)).toBeTruthy();
    expect(screen.queryByText(/Amendment rejected/)).toBeNull();
  });

  it("shows the append-only event ledger separately", () => {
    render(<SalesOrderLedger revisions={revisions} history={history} currentRevision={1} viewedRevision={null} onViewRevision={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Amendment rejected/)).toBeTruthy();
    expect(screen.queryByText(/Original — the agreement/)).toBeNull();
  });

  it("turns rollback into a new governed proposal instead of rewriting history", () => {
    const onProposeRevision = vi.fn();
    const rows = [...revisions, { ...revisions[0], revision: 2, created_at: "2026-08-11T01:00:00Z" }];
    render(<SalesOrderLedger revisions={rows} history={history} currentRevision={2} viewedRevision={null} onViewRevision={vi.fn()} onProposeRevision={onProposeRevision} />);
    fireEvent.click(screen.getByRole("button", { name: "Propose this version again" }));
    expect(onProposeRevision).toHaveBeenCalledWith(rows[0]);
  });

  it("translates stored field keys into the same plain words as the object page", () => {
    expect(historyWords("Staff correction - Rev 2 - customer_name")).toBe(
      "Staff correction · Rev 2 · Customer name",
    );
    expect(historyWords("Changed delivery_date and delivery_has_lift")).toBe(
      "Changed Customer Delivery and Lift available",
    );
  });
});

/**
 * ⭐ AN EVENT NAMES ITS ACTOR (2026-08-24).
 *
 * Until this landed the ledger could say "Salesperson changed the delivery
 * date" and never WHICH salesperson — MASTER.md:146 calls History "the
 * append-only event ledger", and a ledger that cannot name its actor is an
 * audit trail with the audit taken out.
 *
 * The law these cases pin down is NEVER INVENT A PERSON. Names arrive from two
 * tables and either read can come back empty — an operation JWT cannot see a
 * dealer-role account, a cron has no account at all, an old row predates the
 * column. Every one of those says so out loud instead of guessing.
 */
describe("History names the person, and never invents one", () => {
  it("prints the person and the hat they wore", () => {
    expect(
      historyActorWords({ text: "", occurred_at: "", actor: "Kimmy Lee", by_role: "salesperson" }),
    ).toBe("Kimmy Lee · Salesperson");
  });

  it("prints the person alone when the event carried no role", () => {
    expect(historyActorWords({ text: "", occurred_at: "", actor: "Kimmy Lee" })).toBe("Kimmy Lee");
  });

  it("says Unknown user rather than wearing the role as if it were a name", () => {
    /* The failure this guards: printing "Salesperson" in the person's column,
       which reads as an actor whose name is Salesperson. The role still rides
       alongside, so the reader keeps the one fact the row really has. */
    expect(historyActorWords({ text: "", occurred_at: "", by_role: "operation" })).toBe(
      "Unknown user · Operation",
    );
    expect(historyActorWords({ text: "", occurred_at: "", actor: null, by_role: "principal" })).toBe(
      "Unknown user · Principal",
    );
  });

  it("says Unknown user plainly for an event older than the column", () => {
    expect(historyActorWords({ text: "", occurred_at: "" })).toBe("Unknown user");
  });

  it("treats a blank name as no name, never as a name made of spaces", () => {
    expect(historyActorWords({ text: "", occurred_at: "", actor: "   ", by_role: "   " })).toBe(
      "Unknown user",
    );
  });

  it("puts the actor on the rendered event, beside its time", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[{
          text: "Amendment rejected - price not agreed",
          occurred_at: "2026-08-10T02:00:00Z",
          actor: "Jess",
          by_role: "principal",
        }]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByTestId("history-actor-0").textContent).toBe("Jess · Principal");
    /* The event text is still there — naming the actor adds a column, it does
       not replace what happened. */
    expect(screen.getByText(/Amendment rejected/)).toBeTruthy();
  });
});

/**
 * ⭐ WHO CHANGED **WHAT** — the blueprint gap (2026-08-25).
 *
 * `docs/orders/MASTER.md:1142` asks History for `actor/time/reason/Before/After`
 * and records the coverage as "partial". It was partial in one specific way: the
 * event named WHICH FIELDS moved and never what they moved FROM and TO, so a
 * reader could see that a promise had changed and had to open two revisions to
 * learn what it changed to.
 *
 * Every governed writer had been STORING the missing half all along — `reason`,
 * `note`, `revision` — and the read selected four scalar columns and left it in
 * the database.
 */
describe("History says what changed, not only which field", () => {
  const REVS = [
    {
      revision: 1,
      snapshot: { header: { customer_name: "Kimmy", delivery_date: "2026-09-01" }, lines: [], addons: [] },
      created_at: "2026-08-10T01:00:00Z",
      created_by: null,
      change_type: null,
      note: null,
    },
    {
      revision: 2,
      snapshot: { header: { customer_name: "Kimmy Lee", delivery_date: "2026-09-01" }, lines: [], addons: [] },
      created_at: "2026-08-11T01:00:00Z",
      created_by: null,
      change_type: null,
      note: null,
    },
  ] as unknown as SalesOrderRevisionRow[];

  const event = (metadata: unknown) => ({
    text: "Staff correction - Rev 2 - customer_name",
    occurred_at: "2026-08-11T01:00:00Z",
    metadata,
  });

  it("⭐ derives Before → After from the revision the edit minted", () => {
    const lines = historyDetailLines(event({ kind: "edit", revision: 2 }), REVS);
    /* NOT computed here — `describeRevisionChanges` already derives this for the
       Revisions tab, and Law D says a derived fact has ONE arithmetic. Two
       implementations of "what changed" would drift the first time one of them
       learned a new field. */
    expect(lines).toContain("Customer: Kimmy → Kimmy Lee");
  });

  it("prints the operator's own sentence, however the lane spelled the key", () => {
    // `reason` is the cancel/amend word, `note` the correction lane's. Both are
    // the same fact about WHY and print the same.
    expect(historyDetailLines(event({ reason: "  price not agreed  " }), REVS)).toEqual([
      "“price not agreed”",
    ]);
    expect(historyDetailLines(event({ note: "customer called" }), REVS)).toEqual([
      "“customer called”",
    ]);
  });

  it("⭐ guesses NOTHING for a revision this page did not load", () => {
    /* An event may name a version an older or filtered fetch never returned.
       Inventing a diff for it would be worse than the silence it replaces. */
    expect(historyDetailLines(event({ kind: "edit", revision: 99 }), REVS)).toEqual([]);
  });

  it("adds no lines to an event that carries no structured half", () => {
    expect(historyDetailLines(event(null), REVS)).toEqual([]);
    expect(historyDetailLines(event(undefined), REVS)).toEqual([]);
    expect(historyDetailLines({ text: "x", occurred_at: "x" }, REVS)).toEqual([]);
  });

  it("groups consecutive events by the day they happened", () => {
    const groups = groupHistoryByDay([
      { occurred_at: "2026-08-10T01:00:00Z" },
      { occurred_at: "2026-08-10T09:00:00Z" },
      { occurred_at: "2026-08-11T01:00:00Z" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].events).toHaveLength(2);
    expect(groups[1].events).toHaveLength(1);
  });

  it("keys the grouping on the ISO date, never the formatted words", () => {
    /* Two days can format alike across a year boundary, and the key is what
       decides the grouping. */
    const groups = groupHistoryByDay([
      { occurred_at: "2025-08-10T01:00:00Z" },
      { occurred_at: "2026-08-10T01:00:00Z" },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("renders the day once, the clock per row, and the change beneath it", () => {
    render(
      <SalesOrderLedger
        revisions={REVS}
        history={[
          {
            text: "Staff correction - Rev 2 - customer_name",
            occurred_at: "2026-08-11T01:00:00Z",
            actor: "Kimmy",
            by_role: "operation",
            metadata: { kind: "edit", revision: 2, note: "typo on the name" },
          },
        ]}
        currentRevision={2}
        viewedRevision={null}
        onViewRevision={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByTestId("history-day-2026-08-11")).toBeTruthy();
    const detail = screen.getByTestId("history-detail-0").textContent ?? "";
    expect(detail).toContain("“typo on the name”");
    expect(detail).toContain("Customer: Kimmy → Kimmy Lee");
  });
});
