# Portal Core execution queue — ONE CARD PER CHAT (Jess rulings 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/portal-core-execution-queue.md`. Do card C<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
>
> **Source — two rulings by Jess, 2026-07-27 (they supersede every older word law):**
> 1. **Dynamic Checklist** — an order shows ALL open actions at once, not one suggestion.
> 2. **"Chase" is banned** — every action label = verb + named party + measurable object
>    (`Call Ohana — confirm PO-88 ready date`, never `Chase Ohana`).
> The ONE law text lives in `docs/COPY-STANDARD.md` (already rewritten — old versions
> deleted, no transition notes). The C-cards make the CODE match the law.
>
> **Lane rule:** C1-C3 edit the Orders list + drawer — same lane as ① Delivery (T) and
> ② Journey (J): never run alongside a T or J chat. C4 edits Purchase/Payments pages —
> same lane as ④ R-cards. Recommended slot: C1-C3 right after T8, before T9, so
> T9-T11 are born speaking the new words.

## Ground truth (read before ANY card)

- The Next-action ladder is LIVE in `OperationOrdersControl.tsx` (~519-700) and already
  EVALUATES every rung — today it displays only the top one. The Dynamic Checklist is a
  PRESENTATION change over the same signals: no new state, no new engine.
- T7 queues are LIVE with the OLD step-2 word (`Chase logistic`); T5's progress spine and
  J1-J2 tabs live in the drawer. COPY-STANDARD (rewritten 2026-07-27) is the only word law.
- WhatsApp follow-up presets exist (wa-templates + drawer presets); Payments has
  "Ready-to-chase" queue wording; Purchase panel stages read Send · Chase · Receive.
- Tests assert old strings — renames must update the assertions WITH the strings.

## C1 · Orders + Delivery speak the new words

**Goal:** every visible label in the Orders list, queues and drawer follows
verb + named party + measurable object, and the word Chase disappears:

- queue `Chase logistic` → `Confirm delivery date`; row line
  `Call {carrier or customer} — confirm delivery date`
- ladder/next words `Chase supplier` (and kin) → `Call {supplier} — confirm ready date`
- drawer follow-up presets: `Call customer (book delivery)` → `Call {name} — book
  delivery date` · `Call customer (stock delay)` → `Call {name} — stock delay`
- the party is the REAL name when known (supplier/carrier/customer), role word otherwise

**Also in this card — the T1 leftover (found by the J3 chat, deliberately left for C1):**
`OrderDetailDrawer.tsx` still renders the banned word **`Unscheduled`** in TWO places —
line ~3814 (the header MiniBadge, carrier assigned + no date) and ~3853 (`statusWord` in
the delivery card). T1 banned the word and fixed the LIST; these two survived, and the
live bundle greps 1. Fix = the word T1 locked for exactly this state: **`need booking`**.
Its neighbours in both spots are already correct (`Confirmed` · `not confirmed · carrier
said {date}` · `No carrier`) — change only the two strings, and delete the stale word
"Unscheduled" from the comment block above 3837 so no future chat reads it as intended.
**Add a banned-word guard to the drawer's own test file** (`POD` / `Proof of Delivery` /
`Unscheduled` / `Not booked` / `Chase`) — `OrderDocuments`, `BookingSpine` and
`OrderJourneyHeader` each ship one already, which is precisely why nobody caught the
drawer: every component guarded ITSELF and the badge sat outside all three.

**No migration. Copy + label maps + tests.**
**Done when:** grep of the web bundle for visible `Chase` = 0 on Orders/Delivery
surfaces AND `Unscheduled` = 0; every renamed label carries a named party.

## C2 · Dynamic Checklist in the drawer

**Goal:** a `Dynamic Checklist` block in the drawer: ALL currently-firing actions,
one row each (verb + named party + measurable object), ladder priority order
(money first), each row ticking itself when its signal clears. Staff never add,
reorder, or manually tick.
**ALREADY EXISTS:** the ladder computes every signal; T5's spine shows delivery
progress (keep it — progress ≠ actions); this block is the ACTIONS view.
**No migration expected. Web (+ api only if a signal doesn't ride the payload).**
**Done when:** an order with 3 open actions shows 3 rows; closing one signal removes
exactly that row; the drawer never contradicts the list's NEXT column.

## C3 · List NEXT column shows the whole truth

**Goal:** the NEXT column renders the TOP checklist item + `+N` when more are open:
`Call Ohana — confirm ready date  +2`. Click still opens the drawer (C2's checklist).
**Done when:** a row with one action shows no `+N`; counts always equal C2's row count.

## C4 · Purchase + Payments sweep

**Goal:** the remaining Chase surfaces: Purchase stages `Send · Chase · Receive` →
`Send · Confirm ready date · Receive`; Payments `Ready-to-chase` → `Call to collect`
(row line `Call {customer} — collect balance RM X`); WhatsApp preset texts keep their
message bodies but their BUTTON labels follow the law.
**Lane:** shares ④'s pages — not alongside an R-chat.
**Done when:** visible `Chase` greps 0 across the whole web bundle.

## Status

| Card | Status | PR |
|---|---|---|
| C1 | ⬜ after T8 | — |
| C2 | ⬜ after C1 | — |
| C3 | ⬜ after C2 | — |
| C4 | ⬜ any time, not alongside R | — |
