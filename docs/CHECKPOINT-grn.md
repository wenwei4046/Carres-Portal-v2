# CHECKPOINT — Purchasing · GRN / Receiving Workspace

> **Handover, written 2026-08-02.** Self-contained on purpose: paste-able into any
> assistant (Claude / ChatGPT) with zero repo access and it still works. When the
> repo IS available, the file paths in §6 are the deeper truth.

---

## 0 · WHO YOU ARE TALKING TO: JESS — the boss. Her rules, non-negotiable.

1. **Her word is the top law.** UI-KIT, CLAUDE.md, older freezes, any doc — none may
   be used to resist her. Remind ONCE (one line, with the cost), then DO IT and
   record the override. Docs are records, not bosses.
2. **NEVER make her ask twice — let alone beg.** After every change AND after every
   answer of hers, run your OWN top-to-toe critical pass and serve every flaw WITH
   its fix before she points. If she repeats a question, your last answer was
   wrong — dig deeper. International-grade critic: name the master
   (SAP / Linear / GitHub / Excel / 2990), name the gap, attach the solution.
3. **Speak simply.** Plain beginner-level Chinese, step by step; English only for
   tech nouns (PO · SO · GRN · Engine). If she doesn't understand, the explanation
   failed — not her. Deliverables (ASCII mocks, UI copy, PR bodies, docs) = English.
4. **The rhythm never changes:** ASCII sketch → her yes → build →
   localhost:5221 → her yes → merge + deploy (web + Worker TOGETHER whenever
   `packages/shared` changed; after a squash-merge cut fresh from main).
5. **One recommendation with its why — never a bare menu.** Options only when a
   genuine fork exists, and lead with your pick.
6. Paste PR links and the erp link BARE, each on its own line.
7. **Copy the world's best, never invent.** Review asks only two questions: WHO is
   the master, and HOW FAITHFUL is the copy (fidelity score + missing list).
   Taste is never discussed.
8. **Only answer her.** No side quests, no unrequested scope. Out-of-scope findings
   go in one line at the end, never in code.

---

## 1 · HOW TO START THE NEW CHAT

1. Read this file top to bottom.
2. Confirm by quoting the 8 rules back in ONE line. Then WAIT for her.
3. Never start with UI. The frozen development order (hers, 2026-08-01):

```
Phase 1  Module Mission            (one sentence: what is Receiving FOR)
Phase 2  Golden Analysis Table     (Actor Type → Who → Action → Complete When → Next)
Phase 3  Workspace Layout          (Portal Workspace Standard v1 — see §3)
Phase 4  Workspace Sections
Phase 4.5 Business Date/Data Model (business dictionary BEFORE storage)
Phase 5A Field Ownership           (✅ Existing / 🟡 Derived / 🔴 Missing / 🔵 Pending)
Phase 5B Field Layout
Phase 6  Interaction   Phase 7  UI Copy   Phase 8  Prototype   Phase 9  Build
```

Stop at every phase for her yes. Five designs were once discarded in one day at
zero cost because none was built before her yes — keep it that way.

---

## 2 · THE MISSION (draft — she rules the final sentence)

**Receiving is where the Warehouse checks goods IN, in ONE step.** Today's real
flow (her words): warehouse Fiona takes the supplier DO, marks units one by one,
photos into a WhatsApp group, then office staff re-key the GRN from the photos —
a double job. The target: **Warehouse checks in directly (qty + photos + supplier
DO number) and that single act IS the completed GRN.** No second Operation step.
Warehouse login already exists (R6). Per-unit IDs already minted at PO-open
(id-xxx… codes, running since May); putting them ON SCREEN is Phase A, scan-to-
receive is Phase B — both queued, neither started.

---

## 3 · THE FROZEN LAWS THAT BIND THIS PAGE (Jess, 2026-08-01/02)

**Portal Workspace Standard v1** — every module:
```
Nav | Queue | Workspace | Context Panel
Queue     = WORK queue, not a data list. Grouping ONE level. Urgency colour/order
            comes from the Action Engine's dues, never a hand-picked date.
            Click = Open · ☑ = Select, never mixed. Width = same standard as
            To Order's rail (do not freeze a number).
Workspace = the ONLY place data changes. Four layers, always:
            Header → Tabs → Sections → Primary Actions.
Context   = the app-level right rail (already exists: Team/Calendar/Notes).
            A module USES it, never rebuilds it.
Page never scrolls; each region scrolls independently.
No H1, no breadcrumb duplication — the module tab IS the title.
No dead controls: a button ships only when its action works.
```

**Golden Analysis Method** — four actor types, fixed:
Human (does actions) · External (supplier/customer — only provides FACTS; their
row completes when WE record the fact) · Engine (only judges) · System (only
executes: PDF, templates, timeline). "Complete When" must be a MEASURABLE RECORD
("received_qty written"), never "user did it". No tick-box rows.

**Golden Design Flow** — Business Meaning → Owner → Business Rule → Data Model →
UI. **Data Model must obey the Business Dictionary, never the reverse** (a column
with no business word behind it gets retired).

**Purchasing Business Date Dictionary v1** (generic "ETA" is BANNED inside
Purchasing):
| Business Date | Owner | Editable |
|---|---|---|
| Purchase Order Date | Operation | ❌ never |
| Goods Arriving At | Supplier | ✅ many times (append-only promise ledger) |
| Balance Goods Arriving At | Supplier | ✅ repeatable |
| **Goods Received At** | **Warehouse** | ❌ managed by Receiving — **this page owns it** |

**Module boundary (hers):** Purchase Orders shows a Receiving SUMMARY only
(`Received 3/5` + an `Open Receiving` door) and can never edit receiving data.
Receiving owns the work. Data ownership rule: a field's owner = the module that
CREATED it; foreign fields display read-only with a jump to the owner module.

**Status is always DERIVED** from stored quantities (`received_qty` vs `qty`),
never typed by a human. A PO is finished by QUANTITY, never by the existence of a
receiving record.

---

## 4 · GOLDEN TABLE — Receiving's slice (starting draft; walk Phase 2 with her)

| Actor | Who | Action | Complete When (how the system knows) | Next |
|---|---|---|---|---|
| External | Supplier | Deliver goods | goods physically arrive | Warehouse |
| Human | Warehouse | Check in (count + photos + supplier DO no.) | `received_qty` + photos + DO recorded — **GRN complete, no second step** | System |
| System | Portal | Update receiving progress + stamp `short_since` | rows written (trigger already live) | Engine |
| Engine | Rules | Full? short? damaged? | derived from quantities | Human |
| Human | Operation | Confirm balance delivery date (short) | balance date recorded (BUILT, 0306) | External |
| Human | Operation | Claim (damaged/wrong) | claim raised (BUILT, R2-R4) | External |

Partial receiving is NORMAL, not an exception. The shortfall stays on the SAME PO.
A check-in is counted per ARRIVAL (one PO, three vans = three check-ins). A
check-in can never record more than ordered, and never twice for the same
supplier DO number.

---

## 5 · WHAT ALREADY EXISTS (do not rebuild — copy, wire, or replace knowingly)

- **Receiving tab** `apps/web/src/pages/operation/OperationReceiving.tsx` — P2 gave
  it the facet rail + click law. It is a LIST page, not yet a Workspace.
- **The receive door**: RPC `operation_receive_po_with_do` (0299) writes
  `received_qty` / `damaged_qty` / `wrong_item_qty`; a trigger (0306) stamps
  `purchase_order_lines.short_since` on every short delivery.
  ⚠️ **`po_receipts` is NEVER written** (zero references, measured) — so "which
  GRN, which day" has NO data home today. If the page needs a receipt identity
  (GRN number · date · who), that is a 🔴 Missing store to open properly —
  never print a number the database cannot back.
- **`ReceivePOModal`** — works, but R8 recorded it spells the act five different
  ways; its words are debt, its logic is reusable.
- **Quarantine** (R4/0299): damaged/wrong units flip `ops_stock_items` to
  `on_hold` under the claim; held units stop counting as future supply.
- **Warehouse login** (R6, 0301/0302) — warehouse staff have their own landing.
- **Engine**: `packages/shared/src/purchasing-supplier-calls.ts` (the two calls
  with dues) · `poReceivingProgress` (the 3/5 words) — Queue urgency reads THESE.
- **Per-unit stock rows** minted at PO-open since May (0153/0154). Phase A = show
  them; Phase B = scan-to-receive (touches the hot receive RPC — its own card).
- **Words**: `Check in` is the act; `GRN` survives only as the record's noun.
  `Chase` / `Receive`-as-verb / `Send back` are banned. Every new word needs a
  COPY-STANDARD row — a word not in the dictionary may not appear on screen.

## 6 · STATE OF THE WORLD (2026-08-02)

- Prod serves PR #546 (To Order final freeze). Migration tail on prod: **0309**
  (`purchase_requests`, applied; test row `Display · 6d88` = Jess's acceptance
  evidence, do not delete).
- Branch `claude/purchase-demands-migration-a0914c` (worktree
  `card-k5-ready-stock-queue-83d5ac`): To Order Checkpoint A (Create Purchase
  saves for real) — **built, NOT merged**. Checkpoints B/C/D pending, paused by
  Jess on 2026-08-02.
- Branch `claude/jess-workflow-setup-1585a7` (worktree
  `carres-portal-planning-e29002`): **Purchase Orders Workspace layout v1 —
  built 2026-08-02, NOT merged** (`OperationPurchaseOrders.tsx` at the bare
  `/operation/procurement` route; slug routes keep the legacy shell for `?po=`
  deep links). The full architecture record lives in the assistant memory file
  `purchase-orders-architecture-freeze-2026-08-01`.
- GRN work: start it in its OWN worktree/branch from main (guardrail: one
  worktree per workstream; never share a checkout with a parallel session).

## 7 · DEV ENVIRONMENT (how she reviews)

- Launch entries: **`api-planning`** (wrangler dev :8899; needs
  `apps/api/.dev.vars` copied from the main checkout) FIRST, then
  **`web-planning`** (vite :5221, `VITE_API_BASE_URL=http://127.0.0.1:8899`;
  needs `apps/web/.env.local` copied). Point both `-C` paths at YOUR worktree.
- Servers die between turns. When she says "cannot open 5221" — just restart
  both, no questions. Item/search returning nothing = the web is talking to the
  old prod Worker or the local api died — restart, not a bug. Opening :8899 in a
  browser shows 404 — that is the API, it is normal.
- Migrations: draft in chat/docs only; check the remote tracker tail BEFORE
  numbering AND before applying (shared prod, parallel sessions); never renumber
  an applied file. Deploy = web + Worker together when `packages/shared` changed;
  never deploy from a feature branch; never bare `wrangler deploy` (always
  `--env production`).

## 8 · OPEN QUESTIONS SHE HAS NOT RULED (ask at the right phase, not all at once)

- Receipt identity (GRN number · date) — open `po_receipts` properly, or keep
  quantity-only? (Phase 4.5)
- Where the pre-arrival supplier DO (number/photo) is stored. (Phase 4.5)
- Does Receiving become a Workspace (Queue = arrivals?) or stay a list page that
  gains the check-in flow? (Phase 3 — put the fork to her with ONE recommendation)
- The `Check in` words on ReceivePOModal (five spellings) — sweep when this page
  rebuilds the flow. (Phase 7)
