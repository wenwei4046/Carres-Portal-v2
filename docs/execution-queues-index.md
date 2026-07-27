# Execution queues — THE index (Jess's build map, 2026-07-27)

> **The whole balance of work lives in SIX card-queue docs.** Open a new chat, pick ONE
> card from ONE line, paste the line's kickoff sentence. When a card ships, that chat
> marks ✅ + PR number in its own doc. These docs are the memory; chats are disposable.
>
> **Parallel law (upgraded 2026-07-27, after the serial version proved too cautious):**
> - WITHIN a line: strictly one card at a time, in order (R1 before R2, never together).
> - ACROSS lines: parallel chats are FINE when the lines live on different pages —
>   **R + S + K is a safe trio** (Purchasing · Service Cases · Stock never share files).
> - **① Delivery (T), ② Journey (J) and ⑥ Core C1-C3 may NEVER run at the same time** —
>   all edit the Orders list/drawer. Any ONE of them can run alongside R/S/K.
>   ⑥ C4 shares ④'s pages — not alongside an R-chat.
> - Migration-bearing cards: check the remote tracker tail immediately before apply
>   (guardrail #8). Two lines may take dual numbers the same day — cosmetic, the tracker
>   keys on timestamp; never renumber applied files.
> - **Business-rule documents may be edited only in a PLAN chat.** A BUILD chat implements
>   the existing standards; it never redesigns them. (It still REPORTS problems — Law 0.)
> - Deploys will occasionally collide: every chat already follows the union-tip rule
>   (fetch → `log HEAD..origin/main` empty → build from union → both Pages projects →
>   poll 4 canonicals). A "different hash" moment during polling is normal — it resolves.

## The six lines

| Line | Doc | Cards | State |
|---|---|---|---|
| ① Delivery | `docs/delivery-execution-queue.md` | T1-T11 | ✅ **LINE COMPLETE** — T1-T11 shipped |
| ② Order Journey | `docs/order-journey-execution-queue.md` | J1-J3 | ✅ **LINE COMPLETE** — J1 #385 · J2 #389 · J3 #394 |
| ③ Service Case wizard | `docs/service-case-execution-queue.md` | S1-S5 | S1 ✅ #397 · S2 ✅ #410 · S3 ✅ #431 |
| ④ Receiving & Supplier Claim | `docs/receiving-claim-execution-queue.md` | R1-R7 | not started |
| ⑤ Ready Stock | `docs/ready-stock-execution-queue.md` | K0-K5 | K0 ✅ #376 · K1 ✅ #400 |
| ⑥ Portal Core | `docs/portal-core-execution-queue.md` | C1-C9 | **C5 ✅ #447** · Jess rulings 2026-07-27 (Dynamic Checklist · Chase banned) |

**State 2026-07-27:** ① **LINE COMPLETE** (T1-T11, the last being #425 — the Delivery page
and the one new sidebar item) · ② **LINE COMPLETE** (J1 #385 · J2 #389 · J3 #394) ·
⑤ K0 #376 + K1 #400 ✅ · ⑥ **C5 ✅ #447**.
**Drawer lane, in this order:** C1 → C2 → C3 → C6 → C7 → C8. R/S/K run in parallel
throughout; C4 waits for a free R slot.

**What C5 actually changed (measured after shipping — it is NOT the disappearance this
line used to predict).** No order changes its action word today: all 55 control rows are
`booking_stage='none'`, so the ladder returns `Chase logistic` and never reaches the money
rung, and nothing leaves the Delivery board. What appears instead: the **Owing facet row
shows up for the first time** (`Owing · 18 · RM 56,859` — that row renders only when the
count is above zero, and the count was always zero), the `Collect $` pill finds those 18,
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
Purchasing          ← ④ R1-R3 (Receiving tab exists; Claims becomes a sibling tab)
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

- **Supplier production time must become a NUMBER.** The supplier master holds free text
  ("7-10 days") and 8 of 10 suppliers are empty, so nothing can compute a chase date. Frozen
  shape: `Standard production working days` (optionally min / max / default planning). Then
  `chase from = customer date − production working days − internal buffer`. **Belongs to the
  Purchasing line** — the Orders arrival window reads it once it exists.
- **Driver · vehicle · condominium registration: OUT OF SCOPE this phase.** Logistics owns
  the driver today, not Carres. Revisit only if Carres runs its own fleet.

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
```

Full sentence template: "Read <doc>. Do card <n> ONLY. Build it, test it, create the PR,
merge, deploy from main, then mark <n> ✅ in the doc with the PR number. Do not touch any
other card. Do not redesign anything marked ALREADY EXISTS."
