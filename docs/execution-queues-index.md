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

## The seven lines

| Line | Doc | Cards | State |
|---|---|---|---|
| ① Delivery | `docs/delivery-execution-queue.md` | T1-T11 | ✅ **LINE COMPLETE** — T1-T11 shipped |
| ② Order Journey | `docs/order-journey-execution-queue.md` | J1-J3 | ✅ **LINE COMPLETE** — J1 #385 · J2 #389 · J3 #394 |
| ③ Service Case wizard | `docs/service-case-execution-queue.md` | S1-S6 | ✅ **LINE COMPLETE** — S1 #397 · S2 #410 · S3 #431 · S4 #449 · S5 #474 |
| ④ Receiving & Supplier Claim | `docs/receiving-claim-execution-queue.md` | R1-R8 | R1 ✅ #401 · R2 ✅ #412 · R3 ✅ #428 · R4 ✅ #454 · R5 ✅ #475 — R6 · R7 · **R8** (`Contact`→`Call` rename, new 2026-07-28) left |
| ⑤ Ready Stock | `docs/ready-stock-execution-queue.md` | K0-K5 | ✅ **LINE COMPLETE** — K0 #376 · K1 #400 · K2 #409 · K3 #424 · K4 #434 · K5 #451 |
| ⑥ Portal Core | `docs/portal-core-execution-queue.md` | C1-C10 | **C1 ✅ #461 · C2 ✅ #466 · C3 ✅ #479 · C5 ✅ #447 · C6 ✅ #486 · C9 ✅ #472 · C10 ✅ #471** — C4 · C7 · C8 left |
| ⑦ Purchasing | `docs/purchasing-execution-queue.md` | P1-P5 | **NEW 2026-07-27** — flow file written, seven old docs deleted. **P1 is the next card** |
| ⑧ UI-KIT rebuild | `docs/ui-kit-execution-queue.md` | D0-D7 + T1-T4 | **NEW 2026-07-28** — D0 law ✅ · T1 hierarchy ✅ · T2 drawer ✅ `c9966ee3`. **T3 = Jess uses it for a day, after a deploy.** **D0.4 = retire `CARRES_ORDER_PORTAL_SPEC.md` completely (Loo 2026-07-28) — its own chat, safe beside anything, touches no page.** TEMPORARY doc — delete when the line ends |

**State 2026-07-28:** ① ② ③ ⑤ **LINE COMPLETE** · ④ R1-R5 ✅ · ⑥ C1 · C2 · C3 · C5 · C6 · C9 · C10 ✅ ·
⑦ opened, nothing built yet · ⑧ D0 + T1 + T2 ✅ (T3 is a Jess task, not a build card).

**⑧ obeys the Orders lane rule** — T2 edited `OrderDetailDrawer.tsx`, so a ⑧ card that
touches the drawer may not run beside C6/C7/C8. **D0.5a and D0.5b touch NO existing page**
(new components + a new `/ui` route only) and are safe beside anything; **D0.5c and D6 touch
the Orders list and drawer** and are not.
**Orders lane, in this order:** C7 → C8 (C4 any time a Purchasing slot is free).
**C7 is BLOCKED no longer** — the law conflict C3 found (COPY-STANDARD saying both that
`Issue delivery order` IS and is NOT an action) was ruled by Jess on 2026-07-27:
**it IS an action**, the system produces the document and the operator presses one button.
COPY-STANDARD now says so once.
S / R / P run in parallel throughout; **C4 and ⑦ P share the Purchasing pages with ④ R —
only ONE of those three at a time.**

**Purchasing lane, 2026-07-28: ④ R6 HOLDS IT.** Migrations `0301_warehouse_role` and
`0302_warehouse_files_its_own_receiving` are applied to live prod and neither file is on
main — an R6 chat is mid-flight. **⑦ P1 waits for R6 to merge** (Loo, 2026-07-28): R6 has
already changed the database, so stopping it half-way leaves prod carrying two migrations no
file explains. This is also how the lane rule is checked in future — **compare the tracker
tail to `supabase/migrations`; if the tracker is ahead, somebody is holding the lane.**

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
                       warehouse staff land on it through their own login (R6)
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

## The engine law (read before any C-card, and before any new module)

`docs/ACTION-FLOW-STANDARD.md` — two layers (compute every track · display picks one),
the six things every action must carry, the parallel tracks, the display priority, and the
no-paper rule. Every module uses it; no module invents its own action model.

## Standing laws (apply to every line)

- One card = one chat = one PR = one deploy. Never two cards in one chat.
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

```
Read docs/delivery-execution-queue.md. Do card T4 ONLY. ...
Read docs/order-journey-execution-queue.md. Do card J1 ONLY. ...
Read docs/service-case-execution-queue.md. Do card S1 ONLY. ...
Read docs/receiving-claim-execution-queue.md. Do card R1 ONLY. ...
Read docs/ready-stock-execution-queue.md. Do card K1 ONLY. ...
Read docs/purchasing-execution-queue.md. Do card P1 ONLY. ...
Read docs/portal-core-execution-queue.md. Do card C2 ONLY. ...
```

Full sentence template: "Read <doc>. Do card <n> ONLY. Build it, test it, create the PR,
merge, deploy from main, then mark <n> ✅ in the doc with the PR number. Do not touch any
other card. Do not redesign anything marked ALREADY EXISTS."
