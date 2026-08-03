# CHECKPOINT — Receiving · Slice B starts here

> Handover written 2026-08-02, after Slice A closed. Self-contained: a new
> chat reads this top to bottom, quotes Jess's 8 rules back in ONE line, then
> WAITS for her. The deeper truth when the repo is available:
> `docs/RECEIVING-INFORMATION-MODEL.md` (the frozen model) and
> `supabase/migrations/0314_receiving_session_upgrade.sql` (the applied store).

---

## 0 · JESS'S 8 RULES (same as CHECKPOINT-grn.md §0 — non-negotiable)

1. Her word is the top law; docs are records, not bosses. Remind ONCE with the
   cost, then do it and record the override.
2. NEVER make her ask twice. After every change AND every answer, run your own
   top-to-toe critical pass and serve every flaw WITH its fix. **Verification is
   YOUR job, never hers — push, link, prove; don't hand her homework.**
3. Plain beginner Chinese, step by step; English only for tech nouns
   (PO · SO · GRN · DO). Deliverables (ASCII, UI copy, PR bodies, docs) = English.
4. Rhythm: ASCII sketch → her yes → build → localhost → her yes → merge + deploy
   (web + Worker together when `packages/shared` changed).
5. One recommendation with its why — never a bare menu.
6. Paste PR links and live links BARE, each on its own line.
7. Copy the world's best (SAP / Linear / GitHub / Excel / 2990), never invent.
   Review asks only: WHO is the master, HOW FAITHFUL is the copy.
8. Only answer her. Out-of-scope findings = one line at the end, never in code.

---

## 0.5 · PROOF OF HOMEWORK — no evidence = no work (Jess, 2026-08-02)

Jess cannot and will not check whether you studied. So the transcript must
PROVE it, the same way CLAUDE.md §0 proves a doc was read. Before proposing
ANYTHING (a layout, a flow, a field, a word), in order:

1. **Read the sources with the `Read` tool — the calls must be visible in the
   transcript**: `docs/RECEIVING-INFORMATION-MODEL.md` · the master pages
   (`OperationPurchaseOrders.tsx` is the Workspace master copy — read, never
   edit) · the relevant 2990 files (`/Users/chaichiewlim/Desktop/2990s/apps/
   backend/src/pages/GrnNew.tsx` · `GrnFromPo.tsx` · `GoodsReceivedList.tsx`).
2. **Quote 2-3 VERBATIM lines** from what you read, in a blockquote. No
   paraphrase. No quote = you did not read it = no work.
3. **Name the master for every design move** (SAP / 2990 / Excel / Linear /
   the PO page) and judge Keep / Adapt / Replace. "I think it would be nice"
   is not a source. Inventing when a master exists is the failure mode.
4. **Every critique arrives WITH its solution attached** — top-to-toe, ranked,
   before she asks. A wall of text with no homework behind it is worse than
   silence; if you have not studied, say "I have not studied X yet" and go study.

Jess's check is mechanical: are the `Read` calls in the transcript, and are
the quotes verbatim? Either both are present or the chat skipped the homework,
regardless of what it claims.

## 1 · WHAT IS FROZEN (Slice A — closed 2026-08-02, do not reopen)

The full model: `docs/RECEIVING-INFORMATION-MODEL.md`. Headlines:

- **One physical delivery = one Receiving Session** (`warehouse_receipts`).
  Missed lines on the same truck → Amend (add-only). Real second truck → new
  Session. Wrong record → Void → recreate. Never overwrite history.
- **Five statuses**: Draft (default) · Submitted · Returned · Posted · Voided.
  Returned is a REAL state (UI may edit it like a draft; status never lies).
- **Three times**: Goods Received At (human, editable, not future, not before
  PO Date — RPC-enforced) · Submitted At · Posted At (system, immutable).
- **`receiving_events` = the ONE history** (append-only, RESTRICT FK, no write
  policy). Events: submitted · returned · resubmitted · posted · voided ·
  amended. Payload keys ONLY from the Event Payload Dictionary (model §6.1).
- **submit / resubmit are separate RPC doors** sharing ONE validation helper
  (`warehouse_receipt_validate_lines`, granted to nobody).
- **Duplicate guard**: same Supplier+PO+DO = one live session (partial unique
  index `wr_one_live_session_per_po_do`; voided steps aside; Draft may have no DO).
- **reviewed_\*** kept + compat-written; every NEW reader uses `posted_*`; the
  drop of `reviewed_*` is its own later migration after api/shared/web/tests
  all switch.
- **PO status is engine-derived from quantities** — no human ever picks it.
- `po_receipts` (0001): not written, not deleted. `purchase_orders.do_file_path`:
  retire later, not yet.

Migration **0314_receiving_session_upgrade** is APPLIED to prod (tracker tail
2026-08-02) and reconciled md5-byte-identical to the repo file. 24-assertion
dry-run + negative control passed; all row counts unchanged (receipts 0 · POs
19 · lines 33 · received 0).

## 2 · SLICE B — the ONLY scope (Jess, 2026-08-02)

```
Office Receiving Workspace
  Read Mode → [ Start Receiving ] → Receiving Mode → Save → Posted
```

Office ONLY. **Not in Slice B** (later slices, do not touch):
Warehouse Review · Amend · Void · Claims integration · Receiving Photos table ·
Inventory correction workflow · dropping `reviewed_*`.

What Slice B therefore needs that does not exist yet:
- **The Office door RPC** (create+post in one act, `submitted_from='office'`,
  Draft→Posted allowed by permission — its dry-run must cover Draft→Posted,
  which Slice A could not test). Same validation helper, same event writes.
- The Workspace UI on the Receiving tab (Phase 3-6 already approved, see §3).

## 3 · THE APPROVED INTERACTION (Phase 6, frozen with 5 corrections)

- Workspace sections: **Receiving Summary** (read-only; `Received 6 / 10`,
  never "Progress") → **Items** → **Exceptions** (only when they exist;
  display + door to Claims, never an input section) → **Activity** (reads the
  Event Ledger; each entry gets a `⋯` menu: View / Amend / Void — entries only,
  actions themselves are later slices).
- `Start Receiving` is a PRIMARY ACTION, not a section. Receiving Mode adds a
  **Receiving Details** strip (Goods Received At [default today] · Supplier DO
  No. · photos · note) + per-row inputs.
- Every row: `Ordered · Received · Receive now [prefilled = remaining]` and
  fixed `Damaged [0]` / `Wrong [0]` inputs (no "+ Problem?" disclosure;
  Damage photos appear only when Damaged > 0).
- Input ORDER is free; only completeness is frozen (qty + DO + photo to Save).
- Save: incomplete → button disabled naming what's missing; short receipt →
  quiet `Remaining after save: N (stays on this PO)`, never a popup; only real
  risk blocks (over-order, duplicate PO+DO — name the earlier session).
- Words `Receiving Details` · `Post` · `Returned` · `Start Receiving` still owe
  COPY-STANDARD rows — write them when they first hit a screen.

## 4 · ENVIRONMENT

- One worktree per workstream. Slice A lives on branch
  `claude/jess-workflow-setup-2ec0bb` (worktree service-case-execution-queue-s4).
  Slice B: fresh worktree/branch from main AFTER the Slice A PR merges.
- Migrations: draft in chat/docs only · read the tracker tail immediately
  before numbering AND before applying (0311-0313 were taken by the PO chat
  mid-flight — the renumber to 0314 is why the rule exists) · dry-run in a
  rolled-back transaction with a negative control · md5-reconcile file vs live
  after apply.
- Dev servers: `api-planning` (:8899) then `web-planning` (:5221) — but those
  belong to the PO chat's worktree; Slice B adds its own launch entries
  pointing at its own worktree.
- Do NOT touch `OperationPurchaseOrders.tsx` (PO chat owns it) or
  `docs/CHECKPOINT-grn.md`'s worktree.
