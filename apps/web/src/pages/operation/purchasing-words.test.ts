/**
 * A SOURCE SCAN over the Purchasing lane (card **R8**, 2026-07-28).
 *
 * R8 is a rename card, and a rename card's real risk is not that the new word
 * fails to appear — it is that the OLD word survives somewhere the fixture
 * never reached. A render test only sees the branches its fixture reaches; the
 * banned-word rules below are true of the whole lane or they are not true at
 * all, so they are asserted against the TEXT of every file in it.
 *
 * `docs/COPY-STANDARD.md` is the law being enforced:
 *   · `Chase` is BANNED outright — it names a mood, not an outcome.
 *   · `Receive` as a VERB is banned; the act of logging goods in is `Check in`.
 *   · `GRN` survives as the name of the DOCUMENT and may never be the act.
 *   · `Send` is pinned to raising a PO to a factory; `Send back` is retired in
 *     favour of the sixth verb, `Return`.
 *
 * **Scoped deliberately, and the exclusions are the interesting part.** Two
 * live strings this card does NOT touch are named here rather than hidden:
 * Ready Stock's own `Send back` (Loo ruled 2026-07-28 that Ready Stock defines
 * its flow and its dictionary rows first — `docs/carry-forwards.md`), and
 * `ReceivePOModal`'s form-internal `Receive now` / `Receive all pending` /
 * `Receive partial`, none of which has a dictionary row to rename them to.
 * Neither file is in `LANE` below, and that is a decision, not an oversight.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "..", "..");

/** The screens R8 owns. A file added here must pass every rule below.
 *  `OperationToOrder.tsx` replaced `OperationPurchase.tsx` on 2026-07-31 —
 *  the To Order page was rebuilt from the Golden Template and the old file
 *  deleted whole; the lane rules bind the replacement the same way. */
const LANE = [
  "pages/operation/OperationToOrder.tsx",
  "pages/operation/OperationReceiving.tsx",
  "pages/operation/OperationSupplierClaims.tsx",
  "pages/operation/components/WarehouseReceiptsPanel.tsx",
  "pages/operation/procurement/ProcurementTabContent.tsx",
  "pages/warehouse/WarehouseCountModal.tsx",
  // Added AFTER the first deploy, by the deploy grep itself: the ops right-rail
  // calendar renders the same three purchasing lenses, and C1 had re-pointed
  // only `chase`. The rail beside the To Order tab was still saying `Receive`.
  "pages/operation/components/rail/CalendarPanel.tsx",
  // Added by the Communication Truthfulness card (2026-08-03). The Purchase
  // Orders workspace was built AFTER R8 and was never added here, which is
  // exactly why this suite could not see it: it shipped `sent via whatsapp`
  // to production, and to the SUPPLIER's own dashboard, while every rule below
  // was green. A lane list that does not grow with the lane is a lane list
  // that quietly stops being one.
  "pages/operation/OperationPurchaseOrders.tsx",
  // Added by P14 (2026-08-04), the day `CreatePurchaseDialog` moved out of
  // `OperationToOrder.tsx` into its own file. Its words were scanned by every
  // rule below while it lived inside the page; leaving it off this list would
  // have let a PURE MOVE quietly retire five of them, and every rule here is a
  // NEGATIVE assertion — the suite would have gone on passing, more easily.
  // That is the failure the note above records having already been paid for.
  "pages/operation/CreatePurchaseDialog.tsx",
];

const read = (rel: string) => readFileSync(join(WEB_SRC, rel), "utf8");

/**
 * The visible strings of a file, with comments stripped.
 *
 * Comments are excluded on purpose: every one of these files now carries a
 * paragraph EXPLAINING which word was retired and why, and a scan that counted
 * those would make the honest record of the change fail the change.
 */
function visibleSource(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("R8 · the Purchasing lane speaks the dictionary", () => {
  it("scans every lane file (a rename must not silently empty this suite)", () => {
    expect(LANE.length).toBe(9);
    for (const f of LANE) expect(read(f).length, f).toBeGreaterThan(500);
  });

  it("says `Chase` nowhere — banned outright by COPY-STANDARD", () => {
    // The To Order tab kept `Chase` in THREE places for months: the stage cell,
    // the middle-list header, and the detail pane. The cell and the header are
    // fixed by this card; the detail pane's WhatsApp button is reported, not
    // renamed, so it is excluded by name rather than by a softer regex.
    for (const f of LANE) {
      const src = visibleSource(f)
        // ChaseDetail — the WhatsApp channel button and its pane title. Its
        // replacement word is a decision (COPY-STANDARD offers `Open WhatsApp
        // group`, which is not literally true of the direct-phone branch), so
        // R8 reports it and leaves it. Remove this line to see it fail.
        .replace(/Chase \{?supplierName\}?|Chase \$\{supplierName\}|Chase on WhatsApp|Nothing to chase here|items to chase/g, " ");
      expect(src, `${f} still says Chase`).not.toMatch(/\bChase\b/);
    }
  });

  it("never uses `Receive` as a verb in a label — the act is `Check in`", () => {
    // Matches the shapes a LABEL takes: `Receive →`, `>Receive<`. Case
    // INSENSITIVE on purpose — the one survivor below is lower-cased, and a
    // case-sensitive rule would have let it through without anybody noticing.
    for (const f of LANE) {
      const src = visibleSource(f)
        // The ONE knowing exception, named rather than regexed around:
        // `Direct receive →` on the Purchase Orders tab is the escape hatch out
        // of the pickup flight, and "direct" has no dictionary row to rename it
        // with. R8 reports it; renaming it would be inventing a modifier.
        .replace(/Direct receive →/g, " ");
      expect(src, `${f} renders a Receive verb`).not.toMatch(/receive\s*→/i);
      expect(src, `${f} renders a Receive verb`).not.toMatch(/>\s*Receive[\s<]/);
      // …and as a bare STRING LITERAL, which is the shape the ops right-rail
      // calendar was hiding in: `title="Receive"` is a prop, not a child, so
      // the two rules above walked straight past it. Found by the deploy grep.
      expect(src, `${f} passes "Receive" as a label`).not.toMatch(
        /["'`]Receive["'`]/,
      );
    }
  });

  it("says `Send back` nowhere — retired for the sixth verb, `Return`", () => {
    for (const f of LANE) {
      expect(visibleSource(f), `${f} still says Send back`).not.toMatch(
        /Send back/,
      );
    }
  });

  it("says `Save count` nowhere — that button hands the count to Carres", () => {
    for (const f of LANE) {
      expect(visibleSource(f), f).not.toMatch(/Save count/);
    }
  });

  it("carries no `attn` / `selectedDay` state — R8 deleted both filters", () => {
    // Not a word rule: the proof that the dead filters are gone whole, rather
    // than left as state with the chip removed (which is the same lie one level
    // down). Their tiles were deleted 2026-07-23/24.
    const src = read("pages/operation/OperationToOrder.tsx");
    expect(src).not.toMatch(/\bsetAttn\b/);
    expect(src).not.toMatch(/\bsetSelectedDay\b/);
    expect(src).not.toMatch(/useState<Attn>/);
    // …and the clear chips that could never be reached went with them.
    expect(visibleSource("pages/operation/OperationToOrder.tsx")).not.toMatch(
      /"Late only"|"No deadline"|Day: \$\{/,
    );
  });

  it("hand-writes no second FacetRow — the shared component is one import away", () => {
    // UI-KIT §6.1: the second occurrence is a full stop. Claims shipped a THIRD
    // copy in P2; R8 deleted it.
    //
    // To Order LEFT this list on 2026-07-30 and the reason is a design ruling,
    // not an exemption: the Review Grid has no facet rail. Its 300px column
    // lists PROPOSALS — one supplier × category each, one of which is always
    // current — so there is nothing to filter and nothing to clear back to.
    // The rule below still binds the two tabs that do have rails, and the
    // negative half still binds all three.
    for (const f of [
      "pages/operation/OperationSupplierClaims.tsx",
      "pages/operation/OperationReceiving.tsx",
      "pages/operation/OperationToOrder.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/function FacetRow\(/);
    }
    for (const f of ["pages/operation/OperationSupplierClaims.tsx"]) {
      expect(read(f), f).toMatch(/from "@\/components\/FacetRow"/);
    }
    // Receiving left this list on 2026-08-03 (Slice B): it is no longer a
    // facet-rail list page, it is the Purchasing module's WORKSPACE template —
    // 200px navigation rail + kit DataTable + a 400px workspace pane, copied
    // from Purchase Orders because the module has ONE Workspace template
    // (Jess). The law the shared FacetRow protects is "one rail row, one
    // recipe"; what still binds here is that the page does not fork its own
    // copy of the shared component.
    expect(read("pages/operation/OperationReceiving.tsx")).not.toMatch(
      /function FacetRow\(/,
    );
  });

  it("Claims renders no explanatory paragraph above the list (§1.1 · §1.3)", () => {
    // Loo ruled the deletion 2026-07-28: it explained rather than worked, and
    // §1.1's third question answers YES, so the gate does not admit it.
    const src = read("pages/operation/OperationSupplierClaims.tsx");
    expect(visibleSource("pages/operation/OperationSupplierClaims.tsx")).not.toMatch(
      /What the supplier still owes us/,
    );
    // The band it lived in is gone too, not merely emptied.
    expect(src).not.toMatch(/shrink-0 px-6 pt-3 text-\[13px\]/);
  });

  it("names the supplier facet the SAME way on every Purchasing tab that has one", () => {
    // COPY-STANDARD's facet-heading table lists `Supplier` and no `Factory`.
    // `Factory` is banned on the whole lane; the positive half only binds the
    // tabs that carry a facet rail (To Order stopped having one 2026-07-30).
    for (const f of [
      "pages/operation/OperationToOrder.tsx",
      "pages/operation/OperationReceiving.tsx",
      "pages/operation/OperationSupplierClaims.tsx",
    ]) {
      expect(visibleSource(f), `${f} spells the facet chip its own way`).not.toMatch(
        /`Factory: /,
      );
    }
    // Claims still names the facet on its ✕-able chip.
    expect(
      visibleSource("pages/operation/OperationSupplierClaims.tsx"),
    ).toMatch(/Supplier: /);
    // Receiving names it as the RAIL GROUP's title instead — the Workspace
    // template has a navigation rail, not filter chips, so the word moved but
    // the law did not: it is `Supplier`, never `Factory`.
    expect(
      visibleSource("pages/operation/OperationReceiving.tsx"),
      "Receiving must still call the facet Supplier",
    ).toMatch(/RailGroup title="Supplier"/);
  });
});

/**
 * The Observation Law on the Purchase Orders workspace (Jess, 2026-08-03).
 *
 * `docs/ACTION-FLOW-STANDARD.md` Law 8: the portal records only facts it
 * directly observes, and *opening an external application, copying text, or
 * generating a file does not prove that the external outcome occurred.*
 *
 * A SOURCE scan rather than a render test, and that is the whole reason this
 * defect reached production: the page has 51 render tests and every one of them
 * passed while the timeline printed `sent via whatsapp`. A render test only
 * sees the branches its fixture reaches; these rules are true of the file or
 * they are not true at all.
 */
describe("Communication Truthfulness · the PO workspace claims only what it saw", () => {
  const PO = "pages/operation/OperationPurchaseOrders.tsx";

  it("never claims a send — no `sent via`, no `sent to`", () => {
    const src = visibleSource(PO);
    expect(src, "the timeline may not say a message was sent").not.toMatch(/sent via/i);
    expect(src, "the timeline may not name a recipient it never reached").not.toMatch(
      /sent to /i,
    );
  });

  it("says Snapshot, never Revision, to the operator", () => {
    // `purchase_orders` is never edited by this path (proved 2026-08-03: the
    // only writer of `po_revisions` is `purchasing_record_send`, and it only
    // ever SELECTs the PO). Every other tool an operator has used — Git,
    // Google Docs, Office, any ERP — means "the document changed" by
    // `Revision`, so the word would keep manufacturing a belief that is false.
    //
    // The STORE keeps its names: `po_revisions` and `rev_no` are internal, and
    // an internal name never defines UI truth (Jess, 2026-08-03). The scan
    // therefore bans the visible word, not the identifiers.
    const visibleWord = visibleSource(PO)
      .replace(/po_revisions/g, " ")
      .replace(/rev_no/g, " ");
    expect(visibleWord, "the operator must read Snapshot").not.toMatch(/Revision/);
    expect(visibleSource(PO)).toMatch(/· Snapshot \{/);
  });

  it("labels every door by what the click opens", () => {
    const src = visibleSource(PO);
    // COPY-STANDARD's WhatsApp table, verbatim — plus `Open email`, which Jess
    // ruled on 2026-08-03 into the same shape: the button says which
    // application opens, never what we hope happens afterwards.
    expect(src).toMatch(/>\s*Copy message\s*</);
    expect(src).toMatch(/Open WhatsApp group/);
    expect(src).toMatch(/Open WhatsApp"/);
    expect(src).toMatch(/>\s*Open email\s*</);
    // The bare labels are what shipped to production. They must not come back.
    expect(src, "`Copy` alone does not say what it copies").not.toMatch(
      />\s*Copy\s*</,
    );
    expect(src, "`WhatsApp` alone names no door").not.toMatch(/>\s*WhatsApp\s*</);
    expect(src, "`Email` alone reads as an outcome").not.toMatch(/>\s*Email\s*</);
  });
});

/**
 * The Observation Law reaches the WRITER, not just the screen (2026-08-03).
 *
 * The UI scan above proves no page RENDERS a claim of sending. It cannot prove
 * that the thing WRITING `po_history` and `audit_log` has stopped making one —
 * and those two rows are the ones a SUPPLIER reads (`po_history_read`, 0002,
 * admits a supplier to their own PO's rows).
 *
 * So the migration that owns the sentence is asserted directly. Comments are
 * stripped first: 0317's header QUOTES the retired wording so the next reader
 * knows what changed, and a scan that counted the quotation would fail the file
 * that fixed the problem. (Third time that trap has been paid for; it is now
 * the default in every scan this repo writes.)
 */
describe("the record's WRITER claims only what it saw", () => {
  const MIG = join(
    WEB_SRC, "..", "..", "..",
    "supabase/migrations/0317_the_record_stops_claiming_a_send.sql",
  );
  const executable = () =>
    readFileSync(MIG, "utf8")
      .replace(/--.*$/gm, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("writes what was OBSERVED — a door opening, and which snapshot", () => {
    expect(executable()).toMatch(/opened · Snapshot/);
  });

  /**
   * The SENTENCES the migration writes — the `insert into … values (…)` bodies,
   * not the whole file.
   *
   * A blunt file-wide scan is wrong here and failed on its own first run: 0317
   * carries a SANITY BLOCK that asserts the deployed function does not contain
   * `sent to` / `sent via`, so the banned phrase appears in the file precisely
   * BECAUSE the file bans it. What must be clean is what gets written.
   */
  const writtenSentences = () => {
    const sql = executable();
    return [...sql.matchAll(/insert\s+into\s+(po_history|audit_log)\b[\s\S]*?;/gi)]
      .map((m) => m[0])
      .join("\n");
  };

  it("never writes a send into po_history or audit_log", () => {
    const written = writtenSentences();
    expect(written.length, "the inserts must be findable at all").toBeGreaterThan(80);
    expect(written, "the writer may not claim a message was sent").not.toMatch(
      /sent\s+(via|to)\b/i,
    );
    // `Revision` is the STORE's word (`po_revisions`, `rev_no`) and stays;
    // what may never reach a written sentence is the operator-facing one.
    expect(written, "a written sentence may not say Revision").not.toMatch(
      /Revision/i,
    );
  });

  it("names both tables it writes, so neither can be quietly reintroduced", () => {
    const sql = executable();
    expect(sql).toMatch(/insert into po_history/i);
    expect(sql).toMatch(/insert into audit_log/i);
  });
});
