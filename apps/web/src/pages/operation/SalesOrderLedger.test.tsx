import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SalesOrderRevisionRow } from "@/lib/queries";
import SalesOrderLedger, {
  groupHistoryChronology,
  historyActorWords,
  historyDetailLines,
  historyRecordWords,
  historyWords,
  revisionRecordWords,
} from "./SalesOrderLedger";

/**
 * ⭐ THE THREE-RANK RECORD GRAMMAR (CARD 2026-08-27, owner-approved).
 *
 * History and Revisions must answer, in five seconds: what happened · who did
 * it · when · what important result was recorded — as up to three SEPARATE
 * visual lines. These cases lock the grammar, the governed words and the
 * actor truth: `Unknown user` is deleted from employee copy, a person is
 * never invented, and raw stored values (`0% deposit`, `online`) become
 * governed employee words at the presentation boundary.
 */

const revisions = [{
  revision: 1,
  snapshot: { header: { customer_name: "Kimmy" }, lines: [], addons: [] },
  created_at: "2026-08-24T03:16:00Z",
  created_by: "00000000-0000-0000-0000-0000000000f1",
  created_by_name: "Jess",
  actor_kind: "human" as const,
  change_type: null,
  note: null,
}];

const creationEvent = {
  text: "Order created · 0% deposit · online",
  occurred_at: "2026-08-24T03:16:00Z",
  by_role: "principal",
  by_user_id: "00000000-0000-0000-0000-0000000000f1",
  actor: "Jess",
  actor_kind: "human" as const,
};

describe("History records read as three ranks, never one sentence", () => {
  it("⭐ renders a human event as exactly three separate visual lines", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[creationEvent]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    expect(screen.getByTestId("history-title-0").textContent).toBe("Order created");
    expect(screen.getByTestId("history-identity-0").textContent).toBe(
      "Jess · Principal · Mon, 24 Aug 11:16",
    );
    expect(screen.getByTestId("history-detail-0").textContent).toBe("No deposit · Online order");
  });

  it("keeps the 13/12/11 tokens with a regular-weight second line", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[creationEvent]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    const title = screen.getByTestId("history-title-0");
    const identity = screen.getByTestId("history-identity-0");
    const detail = screen.getByTestId("history-detail-0");
    expect(title.className).toContain("text-body");
    expect(title.className).toContain("font-semibold");
    expect(identity.className).toContain("text-meta");
    expect(identity.className).toContain("font-normal");
    expect(detail.querySelector("span")?.className).toContain("text-label");
    expect(detail.querySelector("span")?.className).toContain("font-normal");
  });

  it("⭐ never renders the old flattened one-line sentence", () => {
    const { container } = render(
      <SalesOrderLedger
        revisions={revisions}
        history={[creationEvent]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    /* The defect this Card kills: actor, role, event and raw values joined
       into one dot-separated database sentence. */
    expect(container.textContent).not.toContain("0% deposit");
    expect(container.textContent).not.toMatch(/online\b/);
    expect(container.textContent).not.toContain("Unknown user");
    expect(container.textContent).not.toContain("Jess · Principal · Order created");
    /* Title and identity are separate elements, not one string. */
    expect(screen.getByTestId("history-title-0").textContent).not.toContain("·");
  });

  it("renders a simple event as two ranks with no empty third line", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[{
          text: "Order placed",
          occurred_at: "2026-08-24T03:16:00Z",
          by_role: "salesperson",
          actor: "Kimmy Lee",
          actor_kind: "human" as const,
        }]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    expect(screen.getByTestId("history-title-0").textContent).toBe("Order placed");
    expect(screen.getByTestId("history-identity-0").textContent).toBe(
      "Kimmy Lee · Salesperson · Mon, 24 Aug 11:16",
    );
    expect(screen.queryByTestId("history-detail-0")).toBeNull();
  });

  it("groups by the governed chronology and hides no date", () => {
    const now = new Date().toISOString();
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[creationEvent, { ...creationEvent, text: "Warehouse set", occurred_at: now }]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    expect(screen.getByTestId("history-group-Today")).toBeTruthy();
    expect(screen.getByTestId("history-group-Earlier")).toBeTruthy();
    /* The heading never hides the date: the record's own second rank still
       carries weekday + date + time. */
    expect(screen.getByTestId("history-identity-0").textContent).toContain("Mon, 24 Aug 11:16");
  });

  it("keeps the readable empty state", () => {
    render(
      <SalesOrderLedger
        revisions={[]}
        history={[]}
        currentRevision={null}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="history"
        showViewTabs={false}
      />,
    );
    expect(screen.getByText("No history recorded")).toBeTruthy();
  });
});

describe("historyRecordWords translates stored values into governed words", () => {
  it("⭐ turns `0% deposit · online` into `No deposit · Online order`", () => {
    const words = historyRecordWords(creationEvent, revisions);
    expect(words.title).toBe("Order created");
    expect(words.detail).toEqual(["No deposit · Online order"]);
  });

  it("keeps a real deposit percentage as the fact it is", () => {
    const words = historyRecordWords(
      { ...creationEvent, text: "Order created · 30% deposit · installment 12 mo" },
      revisions,
    );
    expect(words.detail).toEqual(["30% deposit · Instalment · 12 months"]);
  });

  it("translates stored field keys into the same plain words as the object page", () => {
    expect(historyWords("Staff correction - Rev 2 - customer_name")).toBe(
      "Staff correction · Rev 2 · Customer name",
    );
    expect(historyWords("Changed delivery_date and delivery_has_lift")).toBe(
      "Changed Requested Delivery Date and Lift available",
    );
  });
});

/**
 * ⭐ THE ACTOR IS TRUTH, NEVER A GUESS. If a person acted, their real name; if
 * the portal provably acted, `System`; if neither can be established, the
 * governed audit-data defect sentence. `Unknown user` is deleted, a role is
 * never worn as a name, and the browser NEVER infers System from a null id —
 * `actor_kind` arrives resolved from the server.
 */
describe("History names the person, and never invents one", () => {
  it("prints the person, the hat they wore, and the actual time", () => {
    expect(
      historyActorWords({
        text: "", occurred_at: "2026-08-24T03:16:00Z",
        actor: "Kimmy Lee", by_role: "salesperson", actor_kind: "human",
      }),
    ).toBe("Kimmy Lee · Salesperson · Mon, 24 Aug 11:16");
  });

  it("prints the person alone when the event carried no role", () => {
    expect(
      historyActorWords({
        text: "", occurred_at: "2026-08-24T03:16:00Z", actor: "Kimmy Lee", actor_kind: "human",
      }),
    ).toBe("Kimmy Lee · Mon, 24 Aug 11:16");
  });

  it("⭐ says System only when the server proved automation", () => {
    expect(
      historyActorWords({
        text: "", occurred_at: "2026-08-24T03:16:00Z", actor_kind: "system",
      }),
    ).toBe("System · Mon, 24 Aug 11:16");
  });

  it("⭐ states the audit-data defect instead of inventing a person", () => {
    expect(
      historyActorWords({
        text: "", occurred_at: "2026-08-24T03:16:00Z", by_role: "principal", actor_kind: "missing",
      }),
    ).toBe("Actor was not recorded · Principal · Mon, 24 Aug 11:16");
    expect(
      historyActorWords({ text: "", occurred_at: "2026-08-24T03:16:00Z", actor_kind: "missing" }),
    ).toBe("Actor was not recorded · Mon, 24 Aug 11:16");
  });

  it("never promotes a null id to System when an older Worker sends no kind", () => {
    expect(
      historyActorWords({ text: "", occurred_at: "2026-08-24T03:16:00Z", by_role: "operation" }),
    ).toBe("Actor was not recorded · Operation · Mon, 24 Aug 11:16");
  });

  it("treats a blank name as no name, never as a name made of spaces", () => {
    expect(
      historyActorWords({
        text: "", occurred_at: "2026-08-24T03:16:00Z", actor: "   ", by_role: "   ",
      }),
    ).toBe("Actor was not recorded · Mon, 24 Aug 11:16");
  });
});

/**
 * ⭐ WHO CHANGED **WHAT** — the Before → After stays on the ONE arithmetic.
 * `describeRevisionChanges` derives the diff for the complete-version view;
 * an edit event names the revision it minted and the SAME function renders
 * it here (Law D). The raw `Rev n · field_key` tail is dropped when the diff
 * says it better, and kept — translated — when the revision is not loaded.
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
    expect(lines).toContain("Customer: Kimmy → Kimmy Lee");
  });

  it("drops the raw field-key tail when the diff already says it better", () => {
    const words = historyRecordWords(event({ kind: "edit", revision: 2 }), REVS);
    expect(words.title).toBe("Staff correction");
    expect(words.detail).toContain("Customer: Kimmy → Kimmy Lee");
    expect(words.detail.join(" ")).not.toContain("customer_name");
    expect(words.detail.join(" ")).not.toContain("Rev 2");
  });

  it("keeps the translated tail when the named revision is not loaded", () => {
    const words = historyRecordWords(event({ kind: "edit", revision: 99 }), []);
    expect(words.detail).toEqual(["Rev 2 · Customer name"]);
  });

  it("prints the operator's own sentence, however the lane spelled the key", () => {
    expect(historyDetailLines(event({ reason: "  price not agreed  " }), REVS)).toEqual([
      "price not agreed",
    ]);
    expect(historyDetailLines(event({ note: "customer called" }), REVS)).toEqual([
      "customer called",
    ]);
  });

  it("does not print a reason twice when the stored text repeats it", () => {
    const words = historyRecordWords(
      {
        text: "Order cancelled · Customer changed their mind",
        occurred_at: "2026-08-26T07:10:00Z",
        actor: "Wen Wei",
        by_role: "operation",
        actor_kind: "human",
        metadata: { reason: "Customer changed their mind" },
      },
      REVS,
    );
    expect(words.title).toBe("Order cancelled");
    expect(words.detail).toEqual(["Customer changed their mind"]);
  });

  it("⭐ guesses NOTHING for a revision this page did not load", () => {
    expect(historyDetailLines(event({ kind: "edit", revision: 99 }), REVS)).toEqual([]);
  });

  it("adds no lines to an event that carries no structured half", () => {
    expect(historyDetailLines(event(null), REVS)).toEqual([]);
    expect(historyDetailLines(event(undefined), REVS)).toEqual([]);
    expect(historyDetailLines({ text: "x", occurred_at: "x" }, REVS)).toEqual([]);
  });

  it("orders the chronology newest first inside the governed groups", () => {
    const groups = groupHistoryChronology([
      { occurred_at: "2026-08-10T01:00:00Z" },
      { occurred_at: "2026-08-10T09:00:00Z" },
      { occurred_at: "2026-08-11T01:00:00Z" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("Earlier");
    expect(groups[0].events.map((e) => e.occurred_at)).toEqual([
      "2026-08-11T01:00:00Z",
      "2026-08-10T09:00:00Z",
      "2026-08-10T01:00:00Z",
    ]);
  });
});

/**
 * ⭐ A REVISION IS A COMPLETE-VERSION DOOR. Rev 1 is `Original order`; a later
 * version names the governed applied change word — never the enum. `Rev n` is
 * identity, not the title; the current version says `Current` in text; the
 * recorder is the real staff name from the authoritative identity source.
 */
describe("Revisions are clear complete-version doors", () => {
  const twoRevs = [
    revisions[0],
    {
      ...revisions[0],
      revision: 2,
      created_at: "2026-08-25T01:42:00Z",
      created_by_name: "Kimmy Lee",
      actor_kind: "human" as const,
      change_type: "customer_change" as const,
    },
  ];

  it("⭐ speaks the approved three ranks for Rev 1", () => {
    expect(revisionRecordWords(revisions[0], 1)).toEqual({
      title: "Original order",
      identity: "Rev 1 · Current",
      detail: ["Recorded by Jess · Mon, 24 Aug 11:16"],
    });
  });

  it("names the governed applied change on a later version, never the enum", () => {
    const words = revisionRecordWords(twoRevs[1], 2);
    expect(words.title).toBe("Customer change");
    expect(words.identity).toBe("Rev 2 · Current");
    expect(words.detail[0]).toBe("Recorded by Kimmy Lee · Tue, 25 Aug 09:42");
    expect(JSON.stringify(words)).not.toContain("customer_change");
  });

  it("says an older version is identity alone, and keeps its note readable", () => {
    const words = revisionRecordWords({ ...twoRevs[1], note: "customer called" }, 3);
    expect(words.identity).toBe("Rev 2");
    expect(words.detail).toEqual([
      "Recorded by Kimmy Lee · Tue, 25 Aug 09:42",
      "customer called",
    ]);
  });

  it("⭐ states the audit-data defect for a recorder that was never captured", () => {
    const words = revisionRecordWords(
      { ...revisions[0], created_by: null, created_by_name: null, actor_kind: "missing" as const },
      1,
    );
    expect(words.detail).toEqual(["Actor was not recorded · Mon, 24 Aug 11:16"]);
    expect(JSON.stringify(words)).not.toContain("Unknown user");
  });

  it("renders one record per revision — the duplicate chip row is retired", () => {
    render(
      <SalesOrderLedger
        revisions={twoRevs}
        history={[]}
        currentRevision={2}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="revisions"
        showViewTabs={false}
      />,
    );
    /* One door per version: `Rev 1` appears exactly once on the surface. */
    expect(screen.getAllByText(/^Rev 1$/)).toHaveLength(1);
    expect(screen.getAllByText("Rev 2 · Current")).toHaveLength(1);
    expect(screen.getByText("Original order")).toBeTruthy();
    expect(screen.getByText("Customer change")).toBeTruthy();
  });

  it("⭐ opens the complete read-only version from the record itself", () => {
    const onViewRevision = vi.fn();
    render(
      <SalesOrderLedger
        revisions={twoRevs}
        history={[]}
        currentRevision={2}
        viewedRevision={null}
        onViewRevision={onViewRevision}
        view="revisions"
        showViewTabs={false}
      />,
    );
    fireEvent.click(screen.getByTestId("revision-record-1"));
    expect(onViewRevision).toHaveBeenCalledWith(1);
  });

  it("keeps the record a real button so the keyboard can activate it", () => {
    render(
      <SalesOrderLedger
        revisions={twoRevs}
        history={[]}
        currentRevision={2}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="revisions"
        showViewTabs={false}
      />,
    );
    const record = screen.getByTestId("revision-record-1");
    expect(record.tagName).toBe("BUTTON");
    expect(record.className).toContain("focus-visible:ring-2");
    /* Current state is stated in TEXT, and marked for assistive tech. */
    expect(screen.getByTestId("revision-record-2").getAttribute("aria-current")).toBe("true");
  });

  it("turns rollback into a new governed proposal instead of rewriting history", () => {
    const onProposeRevision = vi.fn();
    render(
      <SalesOrderLedger
        revisions={twoRevs}
        history={[]}
        currentRevision={2}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        onProposeRevision={onProposeRevision}
        view="revisions"
        showViewTabs={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Propose this version again" }));
    expect(onProposeRevision).toHaveBeenCalledWith(twoRevs[0]);
  });

  it("keeps the readable empty state", () => {
    render(
      <SalesOrderLedger
        revisions={[]}
        history={[]}
        currentRevision={null}
        viewedRevision={null}
        onViewRevision={vi.fn()}
        view="revisions"
        showViewTabs={false}
      />,
    );
    expect(screen.getByText("No revisions recorded")).toBeTruthy();
  });
});

describe("Sales Order Revisions and History are different records", () => {
  it("shows complete versions without mixing in event history", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[{ text: "Amendment rejected - price not agreed", occurred_at: "2026-08-10T02:00:00Z" }]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: "Revisions" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Original order")).toBeTruthy();
    expect(screen.queryByText(/Amendment rejected/)).toBeNull();
  });

  it("shows the append-only event ledger separately", () => {
    render(
      <SalesOrderLedger
        revisions={revisions}
        history={[{ text: "Amendment rejected - price not agreed", occurred_at: "2026-08-10T02:00:00Z" }]}
        currentRevision={1}
        viewedRevision={null}
        onViewRevision={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText(/Amendment rejected/)).toBeTruthy();
    expect(screen.queryByText("Original order")).toBeNull();
  });
});
