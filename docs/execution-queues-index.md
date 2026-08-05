# Execution queues — THE index (Jess's build map, 2026-07-27)

> **The whole balance of work lives in SEVEN card-queue docs.** Open a new chat, pick ONE
> card from ONE line, paste the line's kickoff sentence. When a card ships, that chat
> marks ✅ + PR number in its own doc. These docs are the memory; chats are disposable.
>
> **Parallel law (upgraded 2026-07-27, after the serial version proved too cautious):**
> - WITHIN a line: strictly one card at a time, in order (R1 before R2, never together).
> - ACROSS lines: parallel chats are FINE when the lines live on different pages —
>   **R + S + K is a safe trio** (Purchasing · Service Cases · Stock never share files).
> - **① Delivery (T), ② Journey (J) and ⑥ Core C1-C3 may NEVER run at the same time** —
>   all edit the Orders list/drawer. Any ONE of them can run alongside R/S/K/P.
>   **⑥ C4 and ⑦ P share the Purchasing pages with ④ R — only ONE of those three at a time.**
> - Migration-bearing cards: check the remote tracker tail immediately before apply
>   (guardrail #8). Two lines may take dual numbers the same day — cosmetic, the tracker
>   keys on timestamp; never renumber applied files.
> - **Business-rule documents may be edited only in a PLAN chat.** A BUILD chat implements
>   the existing standards; it never redesigns them. (It still REPORTS problems — Law 0.)
> - Deploys will occasionally collide: every chat already follows the union-tip rule
>   (fetch → `log HEAD..origin/main` empty → build from union → both Pages projects →
>   poll 4 canonicals). A "different hash" moment during polling is normal — it resolves.

## ⭐ THE AUTOCOUNT PROGRAMME — four cards, three chats at once (Loo, 2026-08-04)

> **Why it is written as one block.** Loo asked one question that this index had no single
> answer for: *"are you fixing only one page or all Purchasing tabs? don't mix the every tab
> business flow."* The answer is a SHAPE, and the shape is what stops the mixing.

**Two layers, and a card belongs to exactly one of them.**

```
LAYER 1 · GRID CAPABILITY — one component, every tab, ZERO business words
          sort · column filter ▼ · resize · reorder · layout memory ·
          row expand · footer totals · record count
          → lives in components/kit/**            → line ⑧ D-cards
          → AutoCount's real advantage: 20 modules, one grid

LAYER 2 · BUSINESS FLOW — per page, NEVER shared
          what a row means · which columns exist · what the action is ·
          what the gate is · what closes it
          → To Order ≠ Purchase Orders ≠ Receiving ≠ Claims ≠ Orders
          → one card, one page, one chat
```

**The rule that prevents the mixing Loo named:** a Layer 1 change may not compile a word or a
rule from any one tab, and a Layer 2 card may not touch a second page. `DataTable`'s own header
already says it — *"This file spells no word."*

**THE ACTIVE SET — rewritten 2026-08-05 at the end of the manager session that ran the whole
programme. Read this block, not the archaeology below it.**

> **What happened 2026-08-04 → 08-05.** Loo redirected everything onto Purchasing, unfroze
> To Order and Purchase Orders, and **about twenty-five cards shipped in two days.**
> **To Order is COMPLETE (P8–P19), the Orders list's three money/word cards are complete
> (C11 · C12 · C13 · C14), Claims joined the kit (D7-Claims), and the grid gained column
> separators portal-wide (P17).** Everything below is what is LEFT.

### Open cards — seven, and none of them collides with another

| Card | Doc | Only file(s) it may edit | Size |
|---|---|---|---|
| **R10** | `PURCHASING-NEXT.md` | **docs only** — `PURCHASING-WORKING-FLOW` §9 | tiny |
| **Q14** | `PURCHASING-NEXT.md` | Purchase Orders + api | small |
| **P5** | `PURCHASING-NEXT.md` | **writes no code** — walks the chain and reports | verification |
| **R9** | `PURCHASING-NEXT.md` | Claims + migration | medium |
| **R11** | `PURCHASING-NEXT.md` | Claims + the resolution engine | medium |
| **R12** | `PURCHASING-NEXT.md` | Claims + migration | medium |
| **P7** | `PURCHASING-NEXT.md` | To Order — a full rewrite | **large, and LAST** |

**Recommended order: R10 · Q14 · P5 in parallel now → R9 → R11 → R12 → P7 last.**
**P7 goes last on purpose:** it rewrites the page the other cards keep touching, and P5 will
tell us what actually hurts before anybody spends a day on a rewrite.

### The one thing nobody has done, and it is P5

**Twenty-five cards shipped into one chain in three days and NOT ONE PERSON HAS WALKED IT
END TO END.** Measured 2026-08-05: `warehouse_receipts` **0** · `receiving_events` **0** ·
`supplier_claims` **0**. Every stage after `Issue PO` has shipped and never run.

**That is why P5 outranks the two big rewrites.** Q14 and P7 are both guesses until somebody
has been through the chain once with a real purchase order.

### Loo's rulings from those two days — FINAL, and no chat re-asks them

Each is recorded in full where it binds; this is the index, not the home.

| Ruling | Home |
|---|---|
| Category counts print a BARE number — no unit word | P9 card |
| **The system SUGGESTS, the human TAKES** — no free-typed quantity anywhere | P10 card |
| Ready stock uses AutoCount's **inline expand**, never a third pane | P10 card |
| **Layout memory REFUSED** — a grid's shape is the company's; a reload is the reset | D0.5d card |
| **Content decides column width, not the table.** Trailing whitespace is not waste | P16 card |
| **`Expand` has exactly ONE job** — the record's line details. Never Remark, Required By or metadata | P16 card |
| **An inline second line is the ONE exception** to that | P16 card |
| `Take` → **`Reserve`**; the drawer was right and the new screen moved to it | P13 card |
| K4's reason list gains a sixth value for a To Order take | P13 card · migration 0322 |
| **多行** — Create Purchase takes many lines | P19 card |
| `Add line` / `Remove` — and the Sales Portal's divergence is a CHOSEN cost | COPY-STANDARD · carry-forward |
| Proceed date lives on the GROUP HEADER, and the day-count appears **only once the date has passed** | P18 card |
| The grid carries **column separators** — ruled from two photographs of the live page | P17 card · `01-design-tokens` §5.1 |
| **`Confirm ready date` moves to Purchase Orders** — queue and door in one place | `PURCHASING-WORKING-FLOW` head |
| Claims: **one claim, one outcome (option A)** + a split button + the scorecard counts PO LINES + `Cancel PO` becomes `Cancel Outstanding` | R9 card |
| C14: delete the six LOGISTICS zero rows, **keep `Khor Yee`** — a person is not a statistic | C14 card |

### Traps this programme paid for, in these two days alone

- **The browser measures fine — five cards wrongly reported it broken.** `preview_start` →
  `resize_window` → measure. Screenshots additionally need the pane displayed, which is a
  different thing. Full rule in `docs/HOW-TO-RUN-A-CHAT.md`.
- **A clean rebase can silently delete another lane's records.** P18 hit it; git reported no
  conflict. Always run `git diff origin/main -- docs/ | grep '^-'` afterwards.
- **Edits landing in the main checkout instead of the worktree** make `tsc` measure unchanged
  code and come back green. `git diff --name-only` returning empty is the tell.
- **Two chats built P10 at the same time.** The second detected it, compared both, found its
  own version carried a real bug, and closed its own PR. **One card, one chat, always.**
- **A card's own measurements go stale in days.** C14's numbers were 24 hours old and wrong
  in three places; C13's were a day old and the live reading had changed overnight.
  **Re-measure before building, every time.**

> *(The 2026-08-04 To Order active set that stood here is gone, not archived — it named cards that all shipped. One concern, one file.)*

**WHICH PAGES ARE OPEN — corrected 2026-08-05. Two of the three closures below have been
lifted, and a chat reading the old text would refuse work that is now wanted.**

| Page | State |
|---|---|
| **To Order** | ✅ **OPEN.** Jess's 2026-08-01 freeze was lifted by Loo on 2026-08-04. Twelve cards shipped through it since (P8–P19). The frozen LAYOUT still stands — cards add to it and redesign nothing without his approval |
| **Purchase Orders** | ✅ **OPEN.** The 2026-08-03 Phase 2 freeze was lifted the same day; Q1–Q13 shipped through it |
| **Claims** | ✅ **OPEN.** Its own plan chat wrote R9–R12 from Loo's rulings |
| **Receiving** | ⛔ **STILL CLOSED.** Carry-forward `receiving-queue-model-architecture-review` — *"no Purchasing sibling chat may edit that page."* Jess ruled the queue model is reviewed in the RECEIVING chat, after Purchase Orders is complete. **This is the only closure that survives** |

**What a freeze meant here, since it was misread twice.** Both freezes stopped
*rebuild-by-reflex* after five layout rewrites in one sitting — they never stopped completion,
and **quoting a frozen document as the reason to refuse a design is the failure CLAUDE.md's
first rule exists to stop.** Study, challenge and propose are required on every page; the one
prohibition is BUILDING a redesign before Loo approves it.

D0.5d was additive-only because live pages render through `DataTable`, and that reason stands
whether or not a page is frozen: an optional prop cannot reach a page that did not ask for it.

**Within line ⑥ the old rule still holds: one card at a time.** C11 · C13 · C14 all edit the
Orders list — never two at once, and never alongside a T-card, a J-card or D6.

**What AutoCount is being copied FOR, and what it is not.** Copy the grid (one grid, every
module), `Transfer From` / `Transfer To` / `View Flow`, the bottom info dock, `Void` vs
`Delete`, per-row `Error Message`. **Do not copy** 1,737 rows with no queue, no owner and no
due date — the Action ladder is this portal's advantage over AutoCount and no card may trade
it away for resemblance.

---

## Governance cards

> **Not a business line.** These cards fix the REPOSITORY, not a module. They carry no
> customer-visible behaviour and no queue of their own — they exist because a lane's work
> cannot be trusted while the repository cannot describe itself.

| Card | Goal | State |
|---|---|---|
| **G1 · Restore the missing migrations** | `0312` + `0313` exist in production and have **no `.sql` in any branch**. Restore them into the repository and verify repository ↔ production parity. | ✅ **CLOSED 2026-08-03** — both files committed and parity proved by REBUILD (see below). The Communication wording is unblocked and shipped in the same pass. |

### G1 · Restore missing migrations (0312 / 0313) — opened 2026-08-03 by Jess

**Why it exists.** `po_sends`, `po_revisions` and `purchasing_record_send` were applied to
production on 2026-08-02 and their migration files were never committed. Verified with
`git log --all --diff-filter=A -- "supabase/migrations/0312*" "supabase/migrations/0313*"`,
which returns nothing — the same probe DOES find 0308/0309 on other branches, so the probe
works. Full context: carry-forward `migrations-0312-0313-have-no-file-in-any-branch`.

**What it costs while open.** A database rebuilt from `supabase/migrations` would have no send
history, no revision snapshots and no `purchasing_record_send`. Nothing breaks at runtime —
this is a RECORD gap, not a behaviour gap — but no chat can change what those objects do,
because no chat can read what they do.

**THE RULE THAT CREATED THIS CARD, and it outranks the convenience of finishing a feature
(Jess, 2026-08-03):**

> *"Do not query production to reconstruct missing migrations. This is a repository governance
> issue, not a development task … Production is not the source of truth for architecture."*

A chat proposed reading the function bodies out of production to unblock a wording change. That
is forbidden: it would make the running database the authority and leave the repository
permanently downstream of it. **Restore first, then develop.**

**Done when:**

1. `0312_*.sql` and `0313_*.sql` are committed, from a source that is authoritative — the
   original authoring session's draft, or a reviewed reconstruction Jess signs off — **never a
   silent dump presented as the original.**
2. Repository ↔ production parity is verified object by object: every function's
   `md5(prosrc)` + length reconciled against the FILE, every table's columns, constraints and
   policies compared. A mismatch is reported, never quietly reconciled toward production.
3. The parity method is written down, because 0312/0313 will not be the last time.
4. Carry-forward `migrations-0312-0313-have-no-file-in-any-branch` is closed with how.

**CLOSED 2026-08-03 — how, and the one defect the closing found.**

1. **Both files are committed** (`0312_what_we_sent_the_supplier.sql` ·
   `0313_email_already_had_a_home.sql`) as a **reviewed reconstruction, labelled as one in its
   own header** — never presented as the original. Jess reviewed it in-chat and REJECTED one
   departure: an earlier draft skipped `suppliers.email` (0312 created it, 0313 dropped it)
   because the end state is identical with fewer steps. Her ruling: *"复原 migration 必须忠实
   复原历史步骤 … 否则它不是恢复原 migration，而是重新设计了一条等价终态路径."* Corrected — and
   the mechanical cost of the shortcut is the durable lesson: **a pair that never creates what
   it drops can never TEST the drop**, so 0313's guard would have shipped un-exercised forever.

2. **Parity is proved by REBUILD, not by reading — and that is the method this card was really
   about.** Reading production's catalogue and writing a file that matches it cannot see what is
   MISSING: on production `create table if not exists` is a no-op, so the create path is never
   exercised. The parity method is therefore:

   > In ONE rolled-back transaction on production: capture every catalogue fact into a temp
   > table · DROP the objects · replay the recovery files from empty · diff the two sets BOTH
   > WAYS · roll back. Anything appearing on only one side is a divergence.

   Run on 2026-08-03 it returned **"IDENTICAL — a rebuild reproduces production exactly"**
   across columns, defaults, constraints, indexes, policies, grants, RLS, comments and function
   grants. En route, the rebuilt `purchasing_record_send` came out at `md5(prosrc)`
   **262f2462…**, byte-identical to what production held before 0317 — the strongest available
   evidence that the recovered file IS the original.

3. **The defect only a rebuild could find.** The first rebuild differed in twelve rows, all of
   one shape:

   ```
   ONLY IN REBUILD →  GRANT:po_sends:authenticated:INSERT | UPDATE | DELETE
   ONLY IN REBUILD →  GRANT:po_revisions:anon:INSERT | UPDATE | DELETE
   ```

   Supabase's `alter default privileges` grants ALL on every new table in `public`; production
   holds only SELECT, so the original 0312 revoked the rest and the recovery had missed it. Now
   revoked, with a sanity assertion that fails the migration if a write grant is ever present.
   Defence in depth rather than a live hole — RLS is on and there is no write policy — but
   *"the RPC is the only door"* is a claim about TWO locks and a rebuilt database carried one.

4. **Carry-forward `migrations-0312-0313-have-no-file-in-any-branch` is closed** by this card.
   Related and still open: **0308 and 0309 are also absent from main** — their files DO exist,
   on unmerged branches, so that is a merge and not a recovery. `0309` lived on one machine
   and was pushed to `origin/claude/purchase-demands-migration-a0914c` (`dc302bda`) on Jess's
   word — push only, no merge, `0308` untouched.

**Also recorded:** main carries a SECOND `0317_*` file — `0317_po_birth_certificate.sql`,
Loo's hand-applied recovery, which holds no tracker row. The tracker names
`20260803105141 · 0317_the_record_stops_claiming_a_send`. Both are kept, matching the recorded
precedent for the three `0267_*` files: the tracker keys on the timestamp, so a duplicate
prefix is cosmetic, and renaming either one would make a filename disagree with a record.

---

## The seven lines

| Line | Doc | Cards | State |
|---|---|---|---|
| ① Delivery | `docs/delivery-execution-queue.md` | T1-T11 | ✅ **LINE COMPLETE** — T1-T11 shipped |
| ② Order Journey | `docs/order-journey-execution-queue.md` | J1-J3 | ✅ **LINE COMPLETE** — J1 #385 · J2 #389 · J3 #394 |
| ③ Service Case wizard | `docs/service-case-execution-queue.md` | S1-S6 | ✅ **LINE COMPLETE** — S1 #397 · S2 #410 · S3 #431 · S4 #449 · S5 #474 |
| ④ Receiving & Supplier Claim | `docs/PURCHASING-NEXT.md` | R1-R14 | R1 ✅ #401 · R2 ✅ #412 · R3 ✅ #428 · R4 ✅ #454 · R5 ✅ #475 · R6 ✅ #490 · **R8 ✅ #499** (the banned-verb sweep) — **R7 ✅ #515** — **RE-CUT 2026-07-29 (Loo) to the Receiving design, Phase 1** (docs + architecture, no migration). **It is no longer GRN duty auto-assign — that rotation is still REQUIRED and its home is the Administration / Work Assignment module, never R7** · **R9 ⬜ one claim, one outcome + a split BUTTON** (Loo 2026-08-05, option A — AutoCount is already A; R5 must count problem PO **LINES** not claim documents; `Cancel PO` → `Cancel Outstanding`, which **overrides §9 of the working flow**) · **R10 ✅ [#628](https://github.com/wenwei4046/Carres-Portal-v2/pull/628) — §9 rewritten against the code** (DOCS ONLY, one file, no migration: the 4-rung ladder published as an ORDER with each rung's reason · the clamp and its `Pending delivery` word · the real To Order supply test · the register's SECOND ladder documented beside it rather than merged. **Two of the card's own claims changed once the code was read, which is the point of the card**: `poReceivingProgress` returns one state per **SET of lines handed to it**, not per PO — a live caller hands it exactly ONE — and **`required_qty` is not a column and never was**, it greps to **zero** repo-wide, so the retired formula named nothing on its left-hand side) · **THE THREE CONSEQUENCES — the frame R9 · R11 · R12 sit inside, frozen by Loo 2026-08-05.** A Resolution causes **Inventory + Finance + DEMAND**, and the third had to be named because `supplier_claim_close` (0291:389-460) writes only `supplier_claims` · `po_history` · `audit_log` and touches **no `purchase_order_lines` column and no PO status** — so today whether a customer's goods return to the buying plan is an **ACCIDENT of state** (written off after receiving → returns; never arrived → does not). **`Accept As-Is` may NOT be hard-coded to no financial consequence** — the discount settlement is the commonest one in furniture. · **R11 ⬜ the Inventory consequence — WIRING, not building**: R4/0299 already ships three of the four stock outcomes under names matching Loo's table one for one (`returned_to_supplier` · `written_off` · `back_to_stock`), `Replace` is the receive engine, and `Repair`/`Refund`/`Cancel Outstanding` move no stock at all · **R12 ⬜ the money on a claim + the Finance queue** — `supplier_claims` has **28 columns and NOT ONE is money** (measured 2026-08-05); a Finance Action completes on an **EXTERNAL EVIDENCE reference** (the supplier's CN/DN number), never a tick-box, which is why §8's no-self-declaration rule does not kill the queue. **2990s is the worked example of the failure**: its `purchase_returns.credit_note_ref` has exactly two readers in that whole repo — a PDF and a detail page. Operations never sees AP; Finance never sees photos · **THE CLAIMS WORKSPACE frozen by Loo 2026-08-05 — Claims is Purchasing’s EXCEPTION WORKSPACE, and what is missing is a LAYER, not the module** (Queue · List · Expand · Data · Status all already exist; P2 #494 · R8 #499 · D7-Claims #612 already shipped on it, so **a chat that rebuilds the page has misread this**). **The reference model is SAP QM, not Zendesk**: 0288’s trigger binds a claim to `PO · Receipt · SKU · Supplier` forever, so **the workspace has NO create button and never will** — every other Purchasing tab is defined by a create verb and Claims is defined by the verb that ENDS one, which is why it read as having no protagonist. Its context header may never collapse, and its queue aggregates by supplier/PO (three claims on one supplier are ONE phone call). **Loo’s four regions are §12.7.5 applied, not a new design**: Claim Form = the EXPAND (working area), Timeline = the RIGHT PANEL (Activity). **Consequences may be STATED before they can be EXECUTED** — the three-consequence mapping is a PURE function, so the region ships in W-1 with zero migration, but only in the SAME card as the mapping, because a region rendering blank looks identical on screen to one that says `No action required`. **`Coming soon` is REFUSED** — not in COPY-STANDARD, a promise about the product rather than a fact about the claim, and it rots on screen after the feature lands. **Owner is DERIVED from `org_duties`, never a new `assigned_to` column**: §5 already designed taking-over (`action identity → claimed by → claimed at`, auto-expiring) and §3 already names the default holder, and a second ownership model is `ops_order_control.balance`’s disease in a new coat. **Build order: W-1 R13 → W-2 R9 → W-3 R11 → W-4 R12 → W-5 R14.** **R13 ⬜ Claims becomes a Workspace — ZERO MIGRATION, DO FIRST** · **R14 ⬜ Receiving sees its own Claims — `OperationReceiving.tsx` says `claim` exactly ONCE in the whole file, and it is THE RECEIVING LANE’S card: Jess 2026-08-03 forbids any Purchasing sibling touching that page** |
| ⑤ Ready Stock | `docs/ready-stock-execution-queue.md` | K0-K5 | ✅ **LINE COMPLETE** — K0 #376 · K1 #400 · K2 #409 · K3 #424 · K4 #434 · K5 #451 |
| ⑥ Portal Core | `docs/portal-core-execution-queue.md` | C1-C10 + C8b + **C11 · C12** | **C1 ✅ #461 · C2 ✅ #466 · C3 ✅ #479 · C5 ✅ #447 · C6 ✅ #486 · C7 ✅ #489 · C8 ✅ #493 (0304) · C8b ✅ #497 (0305) · C9 ✅ #472 · C10 ✅ #471** — **C4 RETIRED 2026-07-28 and re-cut as C11 + C12** (PR #484 stays open, unmerged: R8 shipped part of it, P1 deleted a file it edits, and Loo's money ruling made its own fix wrong). **C11** = a money figure is the money owed · **C12** = the last `Chase` leaves the portal |
| ⑦ Purchasing | `docs/PURCHASING-NEXT.md` | P1-P5 + **P6 · P7** | **P1 ✅ #488** (0303 — the numbers became settings) · **P2 ✅ #492 + #494 + #495** — the click law is true on all three Purchasing lists (To Order · Claims · Receiving) · **P3 ✅ #506** (0306 — the two supplier calls, and a balance date enters Delay planning too) · **P4 ✅ #513** (0307 — where the goods go; **DATABASE half only, FROZEN**; the application-code half is its own card). **The PURCHASE ORDER LIFECYCLE was redesigned and frozen 2026-07-29, then SIMPLIFIED on 2026-07-30 (the Purchasing clean restart)** — **`Draft PO` is permanently removed**, `Issue PO` is the only business action creating an official PO, there is no `Prepare PO` stage and no stored work-in-progress object, Operation Status and Supplier Status stay two axes, and the information architecture of To Order is frozen in **[`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md)** (six regions, four model rules). **P6 ✅ the terminology freeze (2026-07-29, docs only), amended 2026-07-30**: `Send PO` is RETIRED along with the verb `Send`, and so are `Prepare PO` and `Draft PO`; the five Operation Status labels are canonical in `docs/COPY-STANDARD.md`; the surviving facts are `Purchasing on Hold` / `On hold until {date}` · `Supplier not assigned` · `Set a number`. **The portal-wide verb dictionary went 6 → 7 (`Prepare`) and back to 6** when its only object was removed. **P8 ✅ #584** (migration **0320** — a demand survives being part satisfied; `issued_qty` moves only through a door and `remaining_qty` is GENERATED, so *"still to buy"* stops meaning *"has no purchase order"*. **Half the card was already shipped by #581/0319 when it was written**, so the create path was verified rather than rebuilt. **Two findings reported, not fixed: a ready-stock demand for a SOFA projects as 1** whatever quantity was typed — the frozen sofa grain, a business question — and **nobody can cancel a demand at all**: the RPC exists, there is no route and no button, and a route with no caller is what C1 deleted as a bypass). **P7 (To Order becomes the Planning Workspace, carrying the measured gaps M1 · M2) is the next card** — after P9 · P10 · D0.5d. **The two Purchasing documents are LAYERS, not versions**: the workflow file owns business rules and workflow boundaries, the information model owns regions and the facts they carry, and a rule has one canonical home and is only referenced in the other |
| ⑧ UI-KIT rebuild | `docs/ui-kit-execution-queue.md` | D0-D7 + T1-T4 + **D0.6** | D0 law ✅ · T1 hierarchy ✅ · T2 drawer ✅ `c9966ee3` · **D0.4 ✅ the old order-portal master spec is DELETED** · **D0.5a ✅ built 2026-07-28** — ten Foundation Components + a live `/ui`. **D0.5b ✅ SHIPPED 2026-07-28 (PR #502 `d77bd4f6`, deployed; `/ui` now shows the frozen record, verified in a real browser)** — the Radix half (`Modal` · `Drawer` · `Select` · `DropdownMenu` · `Tooltip` · `Popover` · `Tabs` · `Checkbox` · `DatePicker` · `Toast`), and **the PENDING REGISTER is now EMPTY: Jess froze Q1 = the 8-step scale · Q3 = `font-bold` deleted into 600 · Q4 = Lucide's stroke 2.** Each answer became a mechanism (a re-pointed source scan · a scan rule · a deleted prop), and the freeze cost **zero** component changes because D0.5a had built for both answers. §16 coverage 31.58% → 47.83%, blocked-on-a-decision 3 → 0, so **D5 is no longer blocked on a decision.** **D0.5c ✅ CLOSED as components-only and DEPLOYED** (PR #505 `929fa746`, 2026-07-29; **zero visual change proved by checksum** — the operator's main bundle is md5-identical to its predecessor once the lazy `/ui` chunk's filename is normalised) — `PageShell` (from `ListPageShell`) · `DataTable` (from the Orders table) · `DetailShell` (L4's six slots, all seven constraints as types, **no `state` prop**). §16 coverage 47.83% → 65.38% and **the Human-Review debt goes DOWN for the first time, 4 → 3**: "Progress carries no events" became a type. **No page renders through any of them, and that is the card's final shape — real-page adoption is D6.** **The drawer is NOT migrated**: L4 requires a 4-tuple of persistent facts (客户名 · Ref · promised date · outstanding), on today's drawer those four sit in four different blocks, and the header carries Jess's own rev-4 ruling *"ZERO order data here"* — so the strip would be a new layout reversing a frozen ruling. **PM, 2026-07-29: do not add it, and do NOT turn §7② into law** — Persistent Facts stays RESERVED and the first page through the shell is where the four get a home. **T3 = Jess uses the drawer for a day** (still waiting for P5). **Reference Review CLOSED 2026-07-28** — `docs/ui-reference-review.md` R1-R5 frozen (Fiori · Linear · Stripe · Vercel · GOV.UK/NNg/Polaris); five principles; that line froze **no** enforcement mechanism. **D0.6 KIT-CONSOLIDATION = planning card only, approved 2026-07-28, builds after D0.5c — it is the only card that may write the REFERENCE-REVIEW principles into `docs/UI-KIT.md`.** *(Corrected 2026-07-28: this row used to say D0.6 was the only card that may edit the kit at all, which the kit itself contradicts — §6 says each component's dictionary entry is written "when it lands on `/ui`" and §9 says "Written by D0.5a". A D-card still writes the chapter the law assigns it; D0.6 owns the review principles and the mirror's claims.)* TEMPORARY doc — delete when the line ends |

**State 2026-07-29:** ① ② ③ ⑤ **LINE COMPLETE** · ④ **LINE COMPLETE — R1-R8 ✅** (R7 re-cut to the Receiving design; **GRN duty rotation moved to Administration / Work Assignment — still required, never back into R7**) · ⑥ C1 · C2 · C3 · C5 · C6 · **C7** · C8 · C8b · C9 · C10 ✅ ·
⑦ **P1 ✅ · P2 ✅ · P3 ✅** · ⑧ D0 + T1 + T2 + **D0.5a + D0.5b + D0.5c** ✅ (**Q1/Q3/Q4 FROZEN 2026-07-28 — the PENDING REGISTER is empty**; T3 is still a Jess task, not a build card). **D0.5c ✅ CLOSED as components-only** (`PageShell` · `DataTable` · `DetailShell`; the drawer is not migrated — PM, 2026-07-29). **Next on ⑦: P4.** On ⑧: D0.6 ✅ · D1 ✅ · D2 ✅ · **D3 ✅ BUILT 2026-07-29** (Option A = Phase 1 the ruler + Phase 2 the 10 byte-equal conversions). **D3's real product is the RULER, and the number that says why: the portal has 6,385 colour sites and the guard saw 435 of them — 6.8%, with 249 of those out of scope. After D3, 5,545 of 6,129 are measured — 90.5%.** (Counting method recorded in UI-KIT §13.3 beside the figures; the planning draft's "≈6,290 / 6.9%" was hand-mixed and is corrected.) Rules O 4,661 · P 594 · Q 111 make the colour debt countable for the first time, and rule B, which exists to find the flame, could not see it: the live `--primary` is HSL and B matched the hex only.** Next on ⑧: **D3 Phase 3** (`--primary` flame → blue, 594 sites — needs its own card AND a visual approval; it cannot be proved by checksum) and **D3 Phase 4** (`base-*` → kit palette, 4,661 sites — ten steps into six, so it rolls out page by page with D6/D7, never globally).**

**What P2 changed so far (2026-07-28, PR #492) — the To Order half, web only, no
migration.** UI-KIT §8.2 is now true on that tab. Three things it asks for were missing,
and one of them was written and then defeated one hook below: **clicking the same PO again
never cleared it** — the row toggled `selection` to null and the auto-select effect put the
first row straight back, so "click again to clear" silently meant *select a different
factory's PO*; **clicking the stage you were already on threw away the supplier filter**,
the exact opposite of the law, and is a no-op now (a stage is not a filter — there are
three, one is always on, and there is nothing to clear into); and **closing a drawer now
gives the list back**, filters, selection and the facet rail's scroll, the rail being the
scroll target because the middle list was folded into the tree on 2026-07-24. No word
changed, nothing extracted (that is D0.5c), and `OperationPurchase.tsx` got the first test
file it has ever had.
P2 also reports that **two of the three filters its own card names can never be switched
on** (`attn` · `selectedDay` — their tiles were deleted in July and the state was left
behind) and that the three stage cells are worded off-dictionary (`Chase factory` uses a
banned word), which belongs in **R8**'s sweep rather than a third card. **Both were done:
R8 (#499) deleted the two dead filters and re-pointed the stage labels at the shared word
module. **Re-ruled 2026-07-30 (the Purchasing clean restart): the To Order stages are `Confirm ready date` · `Issue PO`; `Send PO`, `Prepare PO` and `Draft PO` are all retired.** The paragraph
above is P2's finding, not a live one.**

**P2 then finished on two more chats and its lasting contribution is a LAW, not a page**
(Claims #494 · Receiving #495, both web-only, no migration). The five lines of §8.2 quietly
assumed every list has an unfiltered state to clear back to; three Purchasing tabs proved
they do not, so §8.2 gained the **stage vs queue** distinction and **the test is the empty
state, not the shape on screen** — if "none selected" is a legal, useful view it is a tile
and it toggles; if it shows nothing it is a stage and re-clicking is a no-op. To Order's
three stage cells and Claims' `Open / Closed / All` are stages **(To Order's COMPOSITION
changed on 2026-07-30 — `Check in` moves to Receiving and there is no Draft PO region — so its
shape is re-decided against the frozen information model in the UI-KIT phase; the rule itself
is unchanged)**; **Receiving is a queue page**,
because its `All` tab is a real view and one table serves every filter combination. Claims
also ruled that **each facet group is counted with every filter except its own and a zero
row is not rendered**, so no reachable click can blank a table. Receiving's rail carries
`Today's work` → `Progress` → `Supplier`, and **only ONE of §7's six tiles is countable
there** (`Check in`) — counted by QUANTITY per §9, not by the `status` word its own tabs
read, which is why a PO reading `open` with nothing outstanding is correctly absent from it.
`FacetRow` was extracted under §6.1 (**not** `PageShell`/`DataTable` — that is D0.5c), and
two Purchasing pages stopped hand-rolling a header they were not entitled to under §8.3.

**The CLAIMS half shipped 2026-07-28 (PR #494), web only, no migration, and no new word.**
`OperationSupplierClaims.tsx` had **no facet rail and no filter state at all**, so nothing in
§8.2 could be true on it; it runs the Orders rail now. One queue tile —
**`Confirm what happens next`**, the dictionary row verbatim, because a tile's name IS its
action and `Claims` is the TAB — plus two fact facets (`Supplier` · `Problem`) whose words are
this table's own column headers. **Each group is counted with every filter EXCEPT its own and a
zero row is not rendered**, so no reachable click can blank the table; the one blank that IS
reachable is the queue tile at zero, which is deliberate — it renders at 0 because a quiet
screen must mean *watched and fine*, and clicking it prints the dictionary's own empty state.
The whole ROW opens the claim now, closing gives back the filters and the scroll, and
`Open / Closed / All` is a STAGE picker, so re-clicking the active one does nothing. **Only
Receiving is left of P2.** It reports six things, the two sharpest being that **the dictionary
gives Claims ONE queue word while `claimNextMove` computes THREE steps** (the two Carres-side
ones can get no tile without words Jess has not ruled — nothing was invented), and that **the
tile and the row spell one action two ways on that screen today**, which is ④ R8's rename and
not a click behaviour.

**What P1 changed (2026-07-28, PR #488, migration 0303).** Every number the ordering engine
reads is a row a manager edits on **Purchasing → Settings** — the fifth tab, gated on the
existing `ops_manager` duty: production working days per supplier × category · the supplier
work week · the order-by buffer · the PO days · the earliest date a store may sell · the
working days of notice on `Confirm delivery date`. Every row states who changed it, when,
and what it was before. **A pair nobody has set a number for says `Set a number` and gets NO
order-by date** — there is no per-category default to fall back on, and the To Order tab
names the pair rather than planning it on a guess (K1's law). **It closed all FIVE doors**:
the constants, the read-only gear drawer (which still said PO days were Mon + Thu), the two
lead-day boxes in Catalog → Delivery that were editable and read by nothing,
`suppliers.lead_time` on the Suppliers card, and **`PO_STOCK_LEAD_DAYS` — the safety net**,
which believed a sofa took 5 working days and therefore fired nine days late. It is deleted:
`poUrgentBypass` takes a window in days now, resolved from the production working days a
human set, and **a category with no number can never make an order urgent**. **One behaviour
change: sofa 10 → 14 working days**; the earliest-sell number collapses to 21, the upper of
the old 14/21, so nothing becomes sellable earlier than it is today.

**⑧ obeys the Orders lane rule** — T2 edited `OrderDetailDrawer.tsx`, so a ⑧ card that
touches the drawer may not run beside C6/C7/C8. **D0.5a and D0.5b touch NO existing page**
(new components + a new `/ui` route only) and are safe beside anything; **D0.5c and D6 touch
the Orders list and drawer** and are not.
**Orders lane: C8 is the only C-card left in it** (C4 any time a Purchasing slot is free).
**C7 SHIPPED 2026-07-28 (PR #489), with no migration** — 0098 only stamps `do_number` when
it is NULL, so minting it at customer confirmation cannot break dispatch, and the trigger
stays as the backstop. The hard gate moved with it: goods and money stop REFUSING a
confirmation and refuse the DOCUMENT instead, which is what `ORDERS-WORKING-FLOW.md` §5 has
said all along and what C9 handed over. An arranged order no longer sits in no queue at all —
there was one thing left to do and it is the paper. **An operator never types a DO again**:
the modal's random `DO-98xx` is gone and the number is the locked `DO-DDMMYY-NNNN` scheme,
seeded on the order so a reprint matches the paper the customer signed. Found on the way:
`print-do-data` refuses every live order, so the drawer's DO print button had never once
worked. **No delivery queue TILE was added** — §3 gives this action no Due, and every
delivery queue is a deadline-carrying step, so the fifth tile waits on Jess ruling one.
S / R / P run in parallel throughout; **C4 and ⑦ P share the Purchasing pages with ④ R —
only ONE of those three at a time.**

**Purchasing lane, 2026-07-29: FREE again. ⑦ P3 took it and released it (#506).** Before that:
R6 released it (#490); ⑦ P2 completed across three chats — To Order (#492) · Claims (#494) ·
Receiving (#495), each releasing the lane after itself; **④ R8 then took the whole lane for one
PR and released it (#499).** **P4 is the next thing in it.**

**What P3 changed (2026-07-29, PR #506, migration 0306).** The two supplier calls §3 names and
the portal has never had: `Confirm tomorrow's delivery` (per PO) and `Confirm balance delivery
date` (per PO line), with their tiles in the `Today's work` band P2-Receiving reserved for them.
The promise ledger is **append-only**, so §3's *"every promise is kept, not overwritten"* has no
column to overwrite; both calls close only while the answer still names the CURRENT facts, so a
factory that slips again or a second short delivery re-opens the call by itself.
**Loo made one business decision on it (2026-07-29): a new BALANCE delivery date enters Delay
planning exactly as a delayed answer does** — the date reaches `ops_order_control.line_etas`,
C8's ladder opens the decision, 0305 starts the clock, and **no second delay model exists**.
**He accepted a named limitation with it**: a PO line merges several customers' quantities and
nothing says whose units are short, so on a merged PO the date reaches customers who are not
really delayed. **That is P5's allocation gap and nobody may narrow the push to "fix" it.**
Two things the card did not predict: the balance call's Due had **nowhere to live** (0299 writes
`received_qty` and never writes `po_receipts`), so 0306 stamps it with a trigger; and the two
ANSWERS had no ruled words, so the chat stopped and asked — `It ships on {date}` ·
`It ships later than {date}`, which stay true however late the call is read.

**What R8 changed (2026-07-28, PR #499, web + shared, no migration).** Every banned word on
the Purchasing lane is gone: `Chase factory` and `Send POs` on To Order, `Receive →` on
Receiving **and on Purchase Orders** (the same button, one tab over — the card named one and
there were two), `Send back` and `Save count` on the warehouse-count pair, and `GRN` wherever
it was the ACT. The words come out of `order-action-words.ts`, which gained a **second table**
for the PURCHASING dictionary rather than four more members of `OrderActionKey` — that union
is the Orders ladder's key, and `check_in` in it would need a display rank and a due rule for
an action the Orders row can never show. **GRN is a SPLIT, not a ban: 4 sites became `Check
in`, 5 stayed `GRN`** — the column header and the tooltips name the paper and are right.
**The two dead filters are gone whole** (`attn` · `selectedDay`: state, filter branches, clear
chips and the four date helpers that served only the chip), proved unreachable by grep first.
And the Claims tab stopped spelling ONE action two ways on ONE screen — the tile read the
dictionary while the row read R3's own sentence.

**R8 leaves a banned word on screen and says so rather than sweeping it.** `Chase on WhatsApp`
+ `Chase {supplier}` on To Order's ② detail pane are a CHANNEL button, and COPY-STANDARD's
answer (`Open WhatsApp group`) is not literally true of its direct-phone branch. Same for
`ReceivePOModal`'s five `Receive` strings — it is the check-in FORM, and only its title has a
dictionary answer. **Both need a word ruled, which is not a BUILD chat's to invent.**

**The lane rule broke on the way out, and the receipt belongs here rather than nowhere: TWO
chats built the Receiving half at the same time.** #495 merged and deployed; the second build
opened **#496** and it was **closed as superseded rather than reconciled** — merging it would
have been a second rewrite of one file, and it would have overturned two decisions #495 had
already made and reported to Jess: **the §8.2 row-click rung** (#495 refused it — this tab has
no PO detail drawer and a form is not a record view; #496 made the whole row open the check-in
form) and **whether the three status tabs survive beside the new rail** (#495 kept them and
named the overlap; #496 deleted them and moved both sets onto the rail as `Check in` /
`Fully received`, with nothing picked as the old `All`).

**RULED 2026-07-28 (Loo): #495 is the final version of P2-Receiving, and NEITHER of those two
is adopted.** #496 stays closed — **not merged, not cherry-picked, and nothing continues from
that branch.** The reason is the rule, not the code: **P2 is finished, and both items are NEW
product-behaviour decisions** — they are not in P2's scope and they are not in R8's (R8 is a
rename sweep). **A page that is already live is not redesigned to make duplicated work useful.**
A chat that finds either idea attractive is looking at a closed question; if it ever reopens it
does so as its own card, with Jess naming the behaviour first.

**What let it happen, and the cheap guard.** Nothing in a chat's own view says a card is
already being worked on — the lane rule lives in THIS file, and a chat that read it once and
started building never re-reads it. So: **re-check the lane immediately before opening the PR,
not only before starting.** That is exactly the shape of the migration guard (`list_migrations`
twice — once before numbering, once before applying), and it is the only one of these two
sessions' safeguards that would have caught this.

**The lane check that found the problem, kept because it worked:** compare the migration
tracker tail to `supabase/migrations`. **If the tracker is ahead, somebody is holding the
lane** — or, as it turned out, somebody left it holding. On 2026-07-28 the tracker read
`0302` and main carried neither file nor any R6 code: **an earlier R6 session applied SQL to
prod and shipped nothing.** That is the worst state a lane can be in, because it is invisible
to `git log` and only the tracker shows it.

**R6 recovered it the right way** — it pulled both migrations back out of
`supabase_migrations.schema_migrations` and into the repo VERBATIM, md5-matched against the
stored copy, applying nothing new. **Never re-apply or re-author a migration that is already
live; recover the exact text.**

*(P1 shipped in the middle of that hold on Jess's instruction, taking `0303`. It was safe
because of the ORDER, not the timing: 0303 was applied and verified on prod FIRST, and only
then was #488 merged and deployed — so prod was never asked to serve a page whose table did
not exist, and R6's two numbers kept theirs.)*

**Line ⑦ exists because purchasing failed five times.** Seven documents (1,222 lines) each
specified a different purchasing module and none was authoritative, so every build chat
picked a different one. They are DELETED. The single owner is
`docs/PURCHASING-WORKING-FLOW.md`. **The engine itself was already built** — the P-cards
turn its hard-coded numbers into settings and add the two supplier calls nobody had built.

**What C6 changed (2026-07-28, PR #486) — web only, no migration.** Clicking an open action
in the drawer's checklist opens **the steps that close it**, and every step is one of the
portal's own actions, so it is worded by that action's BUTTON string from the dictionary —
`Assign logistics` ✓ then `Confirm booking` under `Call NETS — confirm delivery date`. The
steps are measured from the SAME signals object the ladder just read, and the last step is
the action's own outcome, never ticked while the action is open: **an open action can never
show a fully ticked list**, asserted over the whole signal matrix with a negative control.
Nothing on that screen can write — no tick, no checkbox, no button inside a step — so the
no-decorative-checkbox law is structure rather than a comment. **The Task Owner question
C2 and C3 both left open is RULED, not built: the order's PIC is the task owner of every
action of that order**, so an action carries no owner field and needs no store. Collapsed by
default, so it adds zero permanent height. **NO MIGRATION, and Jess CLOSED that question
2026-07-28 rather than deferring it**: the card made one conditional on a step needing its
own owner and the PIC ruling means the condition never opened; the frozen rulings below
already put driver · vehicle · condominium registration out of scope this phase; and four
columns nobody writes is `ops_order_control.balance`'s disease. If ever wanted, the first
half is a confirm-booking form — its own card.

**What C10 changed (2026-07-27, PR #471) — web only, no migration.** The three dots Law 6
describes finally exist: goods · delivery · money render BESIDE the stage pill in the Status
column, each as its own icon (`package` · `truck` · `wallet`) with its own tooltip — the icon
is what labels the dot, which is why the dots need no header of their own. `rowDotsOf` had
computed them for nine days and nothing rendered it; **proved both directions on the
downloaded bundles**, its strings grep 0 in the previous live bundle and 1 in this one.
Widths were measured against the app's own stylesheet (Status 11 → 14, taken from deadline
and stock, never from Actions) and **the row still stays exactly 40px**. It also found that
`rowDotsOf` was never unit tested, contrary to two docs, and wrote the first cover its truth
table has had.

**What C9 changed (2026-07-27, PR #472) — no migration.** An uncollected storage fee now
holds a delivery exactly as an unpaid balance does: the booking gate reads ONE number
(lines + add-ons + chargeable storage − `orders.paid`), and only the manager can release it,
in two outcomes they pick out loud — `Release, fee still owed` (default; `Collect RM …` stays
on the row) and `Release and waive the fee` (written off). The two ride the columns that
already exist, so `storage_waiver_status = 'approved'` means RELEASED and the write-off is
`storage_fee_override = 0`. **The enabling split is in `orderMoney`:** `holds` (what blocks a
delivery) is now a different question from `owing` (what is due), and a release is the one
thing that parts them. **It also found the storage fee being read three different ways** —
the ladder ignored the override, the dispatch gate ignored the Master-imported fee — now one
shared rule with four readers. Live it changes nothing today: no order carries a storage fee.

**What C3 changed (2026-07-27, PR #479).** The Actions cell leads with Layer 2's top
action and folds everything else into `+N` — which **replaces the secondary `Collect RM …`
pill**, so a cell has exactly one way of saying "there is more" and it covers all three
tracks instead of the one Law 4 displays last (the figure rides the `+N` tooltip and the
drawer). And `Confirm delivery with {customer}` **stops being an action**: it fired when
everything was arranged and the day had not come, which is why it was the one row in the
drawer no button could close. It is now the quiet fact `Delivering 27 Jul · 9–11 AM` — full
sentence in the drawer, the bare word `Delivering` in the row, because the Delivery cell
beside it already prints the day. The money 🔒 survives and moved onto `Collect`, the action
that clears it; PayHold behaviour is unchanged. **C7 is BLOCKED on a law conflict C3 found:
COPY-STANDARD says both that `Issue delivery order` IS an action and that it is not.**

**What C2 changed (2026-07-27, PR #466).** The ladder is TWO LAYERS now: three tracks —
goods · delivery · money — computed independently, then one pure function picks which goes
first. **The row's headline is unchanged and that is proved, not claimed**: `nextActionOf`
kept its signature, became Layer 2 over Layer 1, and its whole existing suite (Loo's freeze
gate, the T3 radar, T7's date split, C5's money hold — 103 assertions) passed across the
split. What is NEW is the drawer: it lists every open action, built from the same call that
produced the row's pill, so the two cannot disagree. **What that unhides on today's board:**
51 of 56 orders carry a logistics company and **0 have a confirmed booking**, so the
delivery call now sits beside the supplier call instead of behind it, and `Assign logistics`
no longer waits for stock it never depended on. **The one headline that changes**: money is
its own track and survives delivery, so a delivered order that still owes reads
`Collect RM … from {customer}` where it read `Done` — live there are 0 delivered orders, so
no row moved on the day. C2 also fixed the `To book` predicate PR #464 handed it (it demanded
stock be in; the tab now answers only "has the customer confirmed?").

**What C1 changed on screen (2026-07-27).** Every action label on Orders, its queues,
its drawer and the Delivery module now names the party: `Chase logistic` → the queue
`Confirm delivery date` with the row reading `Call NETS — confirm delivery date`. The
words live in ONE module (`packages/shared/order-action-words.ts`) and each action
carries TWO strings — a party-free QUEUE word for facets and counts, a party-named ROW
line for one order — so a queue and a row structurally cannot spell one action two
ways. Also renamed: the `Manage` column → `Actions`, the `Pending` / `Scheduled` tabs
→ `To book` / `Customer confirmed`, `For Jess` → `For manager review`, and `logistic` /
`carrier` / `partner` → `Logistics` everywhere. **C1 did NOT build the three-dot
column** — `rowDotsOf` is computed and rendered by nothing, so there was no header to
remove; that is a feature for Jess, and the C-card records it.

**What C5 actually changed (measured after shipping — it is NOT the disappearance this
line used to predict).** No order changes its action word today: all 55 control rows are
`booking_stage='none'`, so the ladder returns `Confirm delivery date` and never reaches the money
rung, and nothing leaves the Delivery board. What appears instead: the **Owing facet row
shows up for the first time** (`Owing · 18 · RM 56,859` — that row renders only when the
count is above zero, and the count was always zero), the `Collect RM …` pill finds those 18,
the Payments collections queue fills with real figures (it computed RM 0 owing for
everybody), and the drawer stops telling an operator that a paid-in-full order owes its
whole value. The 18 orders WILL start showing 🔒 — but only once someone confirms a
booking, which is the rung the hold sits on.


## Sidebar map — where every line lands

**Law: only ONE new menu item ever (Delivery, born at T11). Everything else upgrades an
existing door.**

```
Dashboard
Orders              ← ① T1-T6 live here · ② Order Journey button lives in its drawer
Purchasing          ← ④ R-cards + ⑦ P-cards. Tabs: To Order · Purchase Orders ·
                       Receiving · Claims · Settings (P2 adds Claims, P1 adds
                       Settings). Receiving stays a TAB, never a menu item —
                       warehouse staff land on it through their own login (R6).
                       FIVE TABS, frozen — To Order stores no work-in-progress object,
                       not as a sixth tab (Loo 2026-07-29). Which action sits on
                       which tab is the ROLE-ANCHOR rule (Loo, 2026-08-05, card
                       Q12): asking the supplier → the buyer's tabs, handling
                       the goods → Receiving. The deadline-anchor rule it
                       replaced is DELETED, not superseded
Delivery            ← ✅ LIVE (① T11, PR #425) — the 3-pane module page; reads only,
                       every write hands back to the order drawer
Stock               ← ⑤ K0 merges On Hand + Movements into ONE door with tabs
                       (On hand · Ready stock · In & out); "Inventory"/"Movements"
                       banned from UI — one warehouse, three questions
Payments            ← unchanged (reminder schedule stays parked here)
Operation Catalog   ← unchanged
Suppliers           ← ④ R5 supplier scorecard lands here
                       (④ R6 warehouse LOGIN = a new external ROLE like supplier/partner
                        portals — a portal shell, not a sidebar item here)
Service Cases       ← ③ S1-S5 (wizard rebuilds the entry, list/Service Note stay)
```

## How to start a chat

`docs/HOW-TO-RUN-A-CHAT.md` holds the TWO paste-ready prompts — a PLAN chat (integrate an
outside design conversation into cards) and a BUILD chat (do one card). Nothing else needs
to be remembered.

## Frozen rulings waiting for their line (Jess 2026-07-27)

> *(Repair 2026-07-28: a 22-line block sat here — the line table, the State
> paragraph and the "Line ⑦ exists because…" note, all verbatim copies of the
> section above, and the table had lost its header so it rendered as raw pipes.
> A merge artifact. Deleted, not annotated. The index of "never duplicate a rule
> into a second document" had duplicated itself, which is the same disease it
> was written to name.)*

- **Driver · vehicle · condominium registration: OUT OF SCOPE this phase.** Logistics owns
  the driver today, not Carres. Revisit only if Carres runs its own fleet.
- **The transfer-route master data went with the old master spec (D0.4, 2026-07-28) and is
  NOT lost by accident.** The deleted §12 held a rule set nobody had built: per-supplier
  inbound rules + per-carrier outbound rules, combined into an automatic route ("AL will not
  collect in Klang", so a Klang-bound AL order needs a leg). It was marked "its own chat" in
  that file, zero lines of code exist, and D0.4's job was to delete the file — so nothing
  regressed. **What IS true is that the rules now live nowhere in the repo.** If the AL
  transfer engine is ever built, its card starts by stating them again from Jess, not by
  digging them out of git history — a rule recovered from a deleted file is a rule nobody
  re-confirmed. Related and already ruled: moving goods we own between locations is a **stock
  transfer, not purchasing** (`PURCHASING-WORKING-FLOW.md` §8), so the card belongs to Stock.
- **THREE calendars (Loo 2026-07-28) — ruled, NOT built.** Office Mon–Fri · Warehouse Mon–Sat
  · Delivery Mon–Fri with a reduced Saturday. Full text: `docs/ACTION-FLOW-STANDARD.md`
  Law 2A. **The code still has one week.** `packages/shared/working-days.ts` is the single
  engine and takes no calendar argument, so every caller today counts on whichever week it
  was handed — which is right for purchasing by accident and unproven everywhere else. The
  card that fixes this must (a) give the engine a calendar parameter, (b) name the calendar at
  every call site, and (c) prove no due date moved except the ones meant to. **Nobody may
  "just switch the default"** — that silently re-dates every deadline on the board.
  **Measured 2026-07-28, so the card starts from facts rather than a sweep:**
  `DEFAULT_OFF_DAYS = [0]` — Sunday only, i.e. **Mon–Sat**, which is the WAREHOUSE week.
  Three groups today:
  · **Purchasing passes `[0,6]` explicitly** → Office, and Law 2A says that is right;
  · **Receiving / GRN take the default** → Warehouse, right;
  · **Delivery (`delivery-queue.ts`) and Service Cases take the default too** → they are
    counting Saturday as a full working day, and Law 2A puts both on **Office / Delivery,
    Mon–Fri**. So T7's four delivery deadlines and S4's 14-working-day service deadline are
    each ~3 calendar days TIGHTER than the business now says they should be.
  The code was correct under the old one-week rule; the ruling is what made it wrong, which is
  why this is a card and not a bug report.
- **The delivery window and Saturday's capacity — ruled, NOT built, and NOT carded.** The
  words are locked (`COPY-STANDARD.md`, "delivery window words"): Landed · Retail = full-day ·
  Condo · Apartment · Office = half-day · no building type = no booking; and Saturday carries
  `Landed = 1 · Condo = 0.5`. **Measured 2026-07-28: nothing in the portal reads the building
  type for any purpose** — it is collected by the POS, stored in
  `entry_data.fields.building_type`, and printed in two drawers. There is no branch, no map,
  no gate. Line ① Delivery is complete, so this needs its own card when Jess wants it, and
  that card owns two things nobody has settled: what `Landed = 1 · Condo = 0.5` counts
  AGAINST, and the fact that the value is free text with no CHECK (a rule may not do
  `=== "Condo"`).
- **The Event Engine: PARKED until after go-live** (Loo + Jess, 2026-07-28). The proposal —
  every business action writes ONE event, and Dashboard / Order / Purchasing / Delivery each
  read that one table through a different filter instead of keeping their own activity log —
  is sound, and the transparency principle behind it is already law ("everyone can see
  everyone's work"). It is parked for one reason: it touches the Activity block on EVERY
  page, so it cannot share a lane with Orders, Purchasing or Delivery, and go-live comes
  first. **It gets no queue doc and no line number yet** — a card file for work nobody has
  scheduled is the eighth purchasing document all over again. When it opens, the first step
  is a READ-ONLY architecture review against what already exists (`order_history`,
  `audit_log`, `AnnotationTimeline`, the 0211 auto-capture), never a build.
- ~~**UI-KIT carries retired vocabulary and more than one version of some rules.**~~
  **DONE 2026-07-28 — this became line ⑧.** The kit was rewritten top to toe as one file
  (`ba7b7798`), the three doors that still taught the old law were shut (CLAUDE.md's own UI
  paragraph, its "PROPOSE a superior redesign" instruction, and the invocable
  `carres-design` skill), and the Information Hierarchy was frozen as §1.4 (`d83ecf98`).
  What the measurement found: the problem was never the document. **274 of 285 pages
  hand-roll their own page shell, 26 hand-roll a `<table>`, 63 a modal, 134 an `<input>`** —
  a rule expressible as a CSS class survived (`.btn-*` 343 uses), a rule needing structure
  did not. So the remaining work is Foundation Components, and it is carded in ⑧.

## Every rule's home (Law 0A, restated because it is what keeps failing)

| The rule | Its ONLY home |
|---|---|
| How an action behaves | `docs/ACTION-FLOW-STANDARD.md` |
| Every visible word — **five strings per action** | `docs/COPY-STANDARD.md` (mirror: `packages/shared/order-action-words.ts`) |
| The page shell + the click behaviour | `docs/UI-KIT.md` |
| A module's flow, its queue tiles and its table columns | `docs/<MODULE>-WORKING-FLOW.md` |
| What is built and what is next | this file |

**A second file for any of these is how Delivery gets fixed and Purchasing is forgotten.**
There is no `UI-DICTIONARY.md` and there must never be one — the dictionary is a section of
COPY-STANDARD.

## Source of Truth Law

Every rule exists in ONE place only. Business rules → the module's working flow · action
engine → `docs/ACTION-FLOW-STANDARD.md` · UI wording → `docs/COPY-STANDARD.md` · execution
queue → this file. **Never duplicate a rule into a second document.** When a rule changes,
the source document is updated and nothing else — a copy elsewhere is how Delivery gets
fixed and Purchasing is forgotten.

## The module working-flow files (one per module — the only home for its actions)

**Every module owns ONE working-flow file. Every working-flow file uses the same structure.
Only the business content differs — the document structure never changes.** Orders' file
(`docs/ORDERS-WORKING-FLOW.md`) is the template; each further module gets
`docs/<MODULE>-WORKING-FLOW.md` when its line starts.

**TWO exist. Three modules are running without one** (measured 2026-07-28) — ④ Receiving &
Supplier Claim, ⑤ Ready Stock and ③ Service Cases each have a queue doc and no flow. **The
cost is visible, not theoretical:** the claim lifecycle computes three steps and only the
middle one has a name, and Ready Stock's plan review has a button (`Send back`) whose word is
wrong with nothing to rule it right. Both were ruled the same way on 2026-07-28 — **the flow
comes first, then the words** — so neither is a bug to sweep; they are lines that have not
written their own file yet. A queue doc says WHAT to build. It cannot say how the module
behaves, and a chat that treats it as the flow will name things on the business's behalf.

### ⭐ THE RUNNING ORDER (Loo, 2026-07-28) — read this before picking any card

```
✅ P2-Receiving  #495            ✅ C8b  #497 (0305)   ✅ R8  #499   ✅ D0.5b #502
✅ P3            the two supplier calls   #506   (0306)
✅ P4            where the goods go     #513 (0307) — DB half; the app half is its own card
✅ R7            the Receiving design, Phase 1   #515 — docs only, NO migration
   P5            one REAL PO, end to end
   T3            the Purchasing guided review + Jess's drawer day
   Foundation    1. RECEIVING-WORKING-FLOW.md
                 2. SERVICE-CASES-WORKING-FLOW.md
                 3. READY-STOCK-WORKING-FLOW.md

   ── carrying their own lanes, NOT in the line above ──
   C11           a money figure is the money owed        ORDERS lane
   C12           the last `Chase` leaves the portal      PURCHASING + ORDERS lanes
```

**⚠️ R7 WAS RE-CUT BY LOO ON 2026-07-29 AND IT IS NO LONGER THE GRN-DUTY CARD.** It is now
**the Receiving design, Phase 1** — documentation and architecture, no migration, no
behaviour change. The design has ONE home,
`docs/carres-portal-system-architecture.md` **§3.17**: receiving only RECORDS FACTS and never
decides delivery readiness · the result is one of exactly three (`Received` · `Received with
exception` · `Rejected`, already locked in COPY-STANDARD 2026-07-27) · Phase 1 is the current
WhatsApp workflow · Phase 2 (Warehouse Mobile Check-in → Operation Review & Confirm) is
roadmap only · no Warehouse Code · **no new Receiving photo upload, and the existing
attachment behaviour is not redesigned** · **`Received with exception` and `Rejected` are not
built by R7 — they ship with the Supplier Claim module** (Loo, 2026-07-29, final).

**GRN DUTY ROTATION IS STILL REQUIRED — it moved OUT of Receiving, it was not cancelled**
(Loo, 2026-07-29, final). **Its permanent home will be decided in the Administration / Work
Assignment module, and it does NOT come back into R7.** The rotation stays LOCKED business
(§3.16) and, until that module carries it, stays a HUMAN roster rule the system does not
enforce: the "GRN duty" chip on the Purchase panel is computed in the browser as next month's
PO-duty holder, is stored nowhere, and goes blank by itself once the seeded roster runs past
2026-09. **⑦ P5 therefore validates a real PO with the GRN owner still a human rule** — known
and accepted, and not a reason to re-open R7. R7 was originally placed between P4 and P5 for
exactly this dependency; that reason no longer applies to R7.

**Smart Cover is unchanged and still has no card.** Loo's 2026-07-28 note said P5 must include
*"the completed GRN duty assignment **and Smart Cover flow**"*; the first now belongs to
Administration / Work Assignment per above, and the second sits in ④'s LATER list and cannot
be built — it needs staff-leave data,
and **HR-P8 (roster / presence / leave) was dropped by Loo on 2026-07-26** at the design stage.
Three ways out, all still Loo's: (a) P5 proceeds without either and both are out of go-live
scope; (b) Smart Cover becomes its own card, which re-opens the leave decision he already made;
(c) a manual stand-in (a manager marks somebody unavailable) is carded — smaller than leave
tracking, and it needs its own words. **One measured fact for that choice, and it widens
nothing:** `seenTodayMYT` already exists and the Orders auto-assign sweep already skips staff
who have not opened the portal today (*"MC / no-show = never stamped = skipped automatically"*).
That is not leave data and it is not Smart Cover, but it is nearer option (c) than this note
used to assume.

**C11 and C12 replaced C4 on 2026-07-28 and neither is scheduled yet.** They sit here so the
lane cost is visible before anything is picked: **C12 touches `OperationPurchase.tsx`, so it
cannot run beside P3** — if P3 starts first, C12's Purchase half (5 strings, one file) is the
piece to split off and run in a single sitting to release the lane. C11 is the ORDERS lane and
collides with ⑧ **D0.5c**, not with P3.

**C11 is the one with a live cost.** 18 orders owe RM 56,859 today and every figure is printed
by one of its five broken call sites — the collections desk shows `Collect RM RM 1,250.00`, and
the Orders row, its drawer and the Delivery module round the sen away.

**⚠️ R8 IS A WORDS CARD. It does not mean Purchasing is finished** (Loo, 2026-07-28, in
those words). **It shipped 2026-07-28 as #499 and the guard is now live, not hypothetical:**
it renamed things and deleted two dead filters; the module still has no way to make the two
supplier calls, no destination on a PO, and **has never had a single real purchase order
through it.** A chat — or a person — reading "R8 ✅" as "line ⑦ done" would close a module
that has not yet been used once. ④'s row also still carries **R7**, so R8 does not close its
own line either.

**Foundation does not interleave.** It was considered for the gap after R8 and Loo ruled it
out: the three working-flow files come after **P5**, not between P-cards. Purchasing finishes
as one piece.

**This order is across lines and it beats any line's own "next card" pointer** — ⑦'s row
says P3 is its next card, which is true *within* ⑦ and is not a licence to start it beside
R8. The lane holds one chat at a time.

### The three missing flows — SCHEDULED, and NOT to be started yet (Loo, 2026-07-28)

Loo accepted this as a **Foundation gap, not a per-module bug** — the same hole showed up in
two unrelated lines within two days, which is what makes it foundation work rather than
tidying. **He also ruled it does not jump the queue.**

**The schedule is the running order above.** Foundation comes after **P5 and the guided
review** — Loo ruled 2026-07-28 that it does not interleave with the P-cards, so Purchasing
finishes as one piece rather than being paused twice.

```
1. docs/RECEIVING-WORKING-FLOW.md
2. docs/SERVICE-CASES-WORKING-FLOW.md
3. docs/READY-STOCK-WORKING-FLOW.md
```

**Do NOT open a card for any of the three before Purchasing closes.** The order is his and
it is not alphabetical: Receiving is first because it is the one with a live screen already
asking for words it does not have.

**And do not "just start the file" while waiting.** A working-flow file is written in a PLAN
chat with the business in the room — Orders' and Purchasing's both were — because its whole
value is that somebody with authority named the actions. A flow file drafted from the code
would be an eighth purchasing document: fluent, plausible, and nobody's.

## The engine law (read before any C-card, and before any new module)

`docs/ACTION-FLOW-STANDARD.md` — two layers (compute every track · display picks one),
the six things every action must carry, the parallel tracks, the display priority, and the
no-paper rule. Every module uses it; no module invents its own action model.

## Standing laws (apply to every line)

- **⭐ BUSINESS ARCHITECTURE IS THE SOURCE OF TRUTH. EXISTING CODE IS NOT** (Loo, 2026-07-29).
  What is already built does not define what the business is. **Existing implementation may be
  reused ONLY where it matches the approved business workflow** — and where it does not, the
  code is the thing that is wrong, not the workflow.

  **This does not weaken "measure, do not assume."** Reading the code remains the only way to
  learn what is TRUE today, and every card still proves its claims by measuring. The
  distinction is what that measurement is FOR: it tells you the current state, it never tells
  you the intended one. A chat that finds a shipped behaviour and infers the business rule
  from it has taken the reading in the wrong direction — the same error as recovering a rule
  from a deleted file and treating it as re-confirmed.

  **Two consequences worth naming, because both have already happened.** A shipped feature
  that does not match the approved workflow is **not** grandfathered by having shipped — it is
  a defect to report (Law 0), never a precedent to build on. And "we already have something
  like this" is not a reason to reuse it; the only reason is that it matches the workflow the
  business approved.
- One card = one chat = one PR = one deploy. Never two cards in one chat.
- **⭐ ONE CARD = ONE EXECUTION CHAT. A card must be CLAIMED before it is implemented**
  (PM, 2026-07-29). The old law above says one chat may not hold two cards; it never said one
  card may not be held by two chats, and **that is the failure mode that has now happened
  twice** — #495 / #496 on P2-Receiving, and #509 / #510 on **D2**, eight days apart.

  **EVERY CARD OPENS IN THIS ORDER, AND THE ORDER IS THE RULE** (frozen by the PM,
  2026-07-29). Four steps, no step skipped and none reordered:

  ```
  CLAIM  →  PUSH  →  VERIFY CLAIM  →  IMPLEMENTATION
  ```

  | Step | What it is | Why it is where it is |
  |---|---|---|
  | **1 · CLAIM** | Set the card's status cell in its own queue doc to **`🔨 CLAIMED <date> — <branch>`** | The claim lives with the CARD, not in a chat. A chat is invisible to every other chat |
  | **2 · PUSH** | Commit that one line and push it | **The claim IS the push.** An unpushed claim claims nothing — `origin` is the only thing another chat can see. This is why PUSH is its own step and not a footnote to CLAIM |
  | **3 · VERIFY CLAIM** | Re-read the claim on `origin` — **again immediately before opening the PR**, not only before starting | A chat that read the lane once and started building never looks again, and that is precisely what let both collisions through. Same shape as the migration guard reading the tracker twice: once before numbering, once before applying |
  | **4 · IMPLEMENTATION** | Only now write code | Everything before this step is cheap. Everything after it is what gets thrown away when two chats collide |

  **If you find a card already claimed, STOP and say so** before step 4. Do not build it in
  parallel "to compare", and do not assume a stale-looking claim is dead — ask.

  **What a collision costs, from the two real cases.** On P2-Receiving the two builds
  DISAGREED, and reconciling them would have overturned two decisions already reported to
  Jess, so #496 was closed unmerged and nothing continued from it. On D2 the two builds
  AGREED — `git diff` on `apps/web/src` between them was empty and both guard baselines were
  byte-identical — and it still cost a full duplicate review, a conflicted PR, and a wrong
  number in the law that only surfaced BECAUSE the two were compared (§2.1 read 3,971 against
  a measured 3,975; the source agreed and the counting did not). **Agreement is the lucky
  outcome, not the safe one.**
- **Count the exits before you gate one.** If a card makes something require a reason, a
  permission or a record, find EVERY path that reaches it first — a gated front door with an
  open side door is worse than no gate, because the numbers now look complete. (K4 found a
  third exit, `Takeout` on a free row, after gating the two obvious ones.)
- **Leaving the old door open and filing a carry-forward looks disciplined and behaves like
  a trap.** If the card's purpose is that something now has ONE way in, closing the other
  ways is not the optional half of the job. Twice now a CF has been filed instead
  (2026-07-26 care plans, 2026-07-27 K4) — the second time the chat caught itself.
- **Claim a migration number at APPLY time, not at draft time.** Parallel lines take numbers
  while you dry-run: `list_migrations` immediately before applying, and expect to renumber.
  (K4 renumbered twice in one card.)
- Never rebuild anything a doc marks ALREADY EXISTS.
- Migration cards: check the remote tracker tail first (guardrail #8); drafts need Jess.
- Copy law `docs/COPY-STANDARD.md` (plain words; POD banned → "delivery photo") ·
  design law `docs/UI-KIT.md` · deploy law: main tip, both Pages projects, 4 canonicals.
- Chat stuck or inventing → close it, open a fresh one, paste the same line. No mercy.

## Kickoff sentences (copy exactly, change the card number)

> **⭐ EVERY ONE OF THESE OPENS WITH THE SAME FOUR STEPS** — `CLAIM → PUSH → VERIFY CLAIM →
> IMPLEMENTATION`, frozen by the PM 2026-07-29 and specified in full under **Standing laws**
> above. **A kickoff sentence is not permission to start writing code**; it is permission to
> claim the card. The claim is a pushed one-line status edit in the card's own queue doc
> (`🔨 CLAIMED <date> — <branch>`), re-verified on `origin` immediately before the PR is
> opened. **A chat that reaches step 4 without steps 1–3 has broken the rule even if the card
> turns out to be free** — the guard only works if it runs every time, and the two collisions
> it exists to stop (#495/#496, #509/#510) were both cases where the card WAS free when the
> chat started.

```
Read docs/delivery-execution-queue.md. Do card T4 ONLY. ...
Read docs/order-journey-execution-queue.md. Do card J1 ONLY. ...
Read docs/service-case-execution-queue.md. Do card S1 ONLY. ...
Read docs/PURCHASING-NEXT.md. Do card R1 ONLY. ...
Read docs/ready-stock-execution-queue.md. Do card K1 ONLY. ...
Read docs/PURCHASING-NEXT.md. Do card P1 ONLY. ...
Read docs/portal-core-execution-queue.md. Do card C2 ONLY. ...
```

**The To Order programme — paste one into each chat (Loo, 2026-08-04). All three carry the
same standing instruction: DELIVER, do not come back.**

```
Read docs/PURCHASING-NEXT.md — the "LOO UNFROZE To Order" block and card P8.
Do card P8 ONLY. CLAIM it first — set P8 to `🔨 CLAIMED <date> — <branch>` in that doc, push
that line, then verify the claim on origin. Loo's four rulings of 2026-08-04 are FINAL: do not
re-ask them. Inside OperationToOrder.tsx you may edit ONLY the CreatePurchaseDialog region
(line 1359+) — P9 owns the rail and footer, P10 owns the grid. Build it, test it, create the
PR, re-verify the claim, merge, deploy from main, verify production, then mark P8 ✅ with the
PR number. Engineer-Owned Delivery (CLAUDE.md §13.1) applies: do not ask about push, rebase,
merge, deploy, lint, tests or conflicts — find it, fix it, verify it, continue. Come back ONLY
for a new business rule. Report at the end: repo · migration · deploy · production check.
```

```
Read docs/PURCHASING-NEXT.md — the "LOO UNFROZE To Order" block and card P9.
Do card P9 ONLY. CLAIM it first — set P9 to `🔨 CLAIMED <date> — <branch>` in that doc, push
that line, then verify the claim on origin. Loo ruled: bare numbers, NO unit word; CATEGORY
counts UNITS while PO Schedule counts ORDERS. Inside OperationToOrder.tsx you may edit ONLY
the rail and footer regions — P8 owns the dialog, P10 owns the grid. Measure both numbers in a
real browser and quote them in the PR; jsdom cannot prove this. Build it, test it, create the
PR, re-verify the claim, merge, deploy from main, verify production, then mark P9 ✅ with the
PR number. Engineer-Owned Delivery applies: do not ask about push, rebase, merge, deploy, lint
or conflicts. Come back ONLY for a new business rule.
```

```
Read docs/ui-kit-execution-queue.md. Do card D0.5d ONLY. CLAIM it first — set D0.5d to
`🔨 CLAIMED <date> — <branch>` in that doc, push that line, then verify the claim on origin.
Every new prop is OPTIONAL and no existing signature changes — To Order, Purchase Orders and
Receiving all render through this component today and two of those pages are frozen. Row
expand is the one P10 is waiting on; ship it first if you split the card. Migrate no page.
Build it, test it, create the PR, re-verify the claim, merge, deploy from main, then mark
D0.5d ✅ with the PR number. Engineer-Owned Delivery applies. Come back ONLY for a business rule.
```

**One worktree per chat (guardrail #9) — create all three before you start:**

```bash
git worktree add .claude/worktrees/p8-purchase-demands -b claude/p8-purchase-demands main
```
```bash
git worktree add .claude/worktrees/p9-category-counts -b claude/p9-category-counts main
```
```bash
git worktree add .claude/worktrees/d05d-datatable -b claude/d05d-datatable main
```

**Every worktree needs `apps/web/.env.local`** (copy `apps/web/.env.production`) or the dev
server comes up unconfigured — a lesson this line has already paid for.

Full sentence template: "Read <doc>. Do card <n> ONLY. **CLAIM it first — set <n> to
`🔨 CLAIMED <date> — <branch>` in that doc, push that line, then verify the claim on origin.**
Build it, test it, create the PR, **re-verify the claim before opening it**, merge, deploy from
main, then mark <n> ✅ in the doc with the PR number. Do not touch any other card. Do not
redesign anything marked ALREADY EXISTS."
