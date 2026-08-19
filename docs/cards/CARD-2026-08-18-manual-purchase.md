STATUS: IN BUILD — slice 1 (create + register + first act) shipped; approval and issue slices follow
DATE: 2026-08-18
PR: slice 1 on claude/manual-purchase
IMPLEMENTATION: APPROVED — owner ruled the lane with the architect 2026-08-18, build straight to production

# MANUAL PURCHASE — the request, the approval, the order (one card)

**PAGE — `Manual Purchase`, new.** This card owns that ONE page and the ONE thing
it takes away from `SO Batch Purchase`: the `+ Create Purchase` dialog. It may not
touch Receiving, Claims, Report or Settings files, and it may not touch the SO
Batch Purchase grid itself (that is `CARD-2026-08-18-so-batch-purchase.md`).

Read `CLAUDE.md`, `docs/purchasing/MASTER.md` (§1 · §3's Manual Purchase block ·
§8's Settings list), `docs/ERP-ARCHITECTURE.md`, `docs/ui/MASTER.md` (§4 · §4.1 ·
§6.4), `docs/COPY-STANDARD.md` (the PURCHASING five-string table, the nine verbs)
on the LATEST `origin/main`. Execute as CONTINUOUS BUILD: implement in your own
slice order → tests → release gate → PR → CI → merge → deploy → prove SHA →
overwrite the owning MASTERs in the same PRs. **If code structure conflicts with
this card, STOP and report — do not choose.**

## 1 · The lane, and the first act

Two lanes bear a PO and they never merge (`purchasing/MASTER.md:110-116`):

```
Sales Order  ····read···▶ SO Batch Purchase ─┐
                                             ├─▶ Purchase Order ─▶ Receiving
             a human asks ▶ Manual Purchase ─┘
```

**First act: `+ Create Purchase` moves off the SO Batch Purchase rail** and becomes
this page's `+ New request`. The 600px dialog
(`CreatePurchaseDialog.tsx`, 636 lines) is retired, not re-skinned — its header /
lines split survives, its container does not. The SO Batch Purchase card holds the
button in place *"until the Manual Purchase card ships"*; this card is that ship.

**Typed demand also leaves the SO Batch Purchase grid.** Today `purchase_demands`
rows sit in the same list as customer demand and are issued by the same button.
After this card, that grid answers ONE question — *what have customers ordered that
we still have to buy* — and this page answers the other. **Two lanes, two Issue
buttons, and a PO that can always say which lane bore it.**

## 2 · The five purposes, and one contradiction resolved

`Need for` — **`Ready Stock` · `Display` · `Office` · `Warranty` · `Spare Parts`**.

**One contradiction, stated once:** §1's tree lists four purposes, §3 and the report
split list five (Warranty included), and the live gate `purchasing_create_demand`
already admits `warranty` (migration 0323). **Recommendation taken: five, and
Warranty requires approval like the rest** — the service note that justifies a
warranty replacement lives in another module with no link built to this one, so
there is nothing for the system to read as authority yet. The day Service hands
over a note reference, Warranty joins the customer lane's exemption.

`Spare Parts` is not offered by the live gate and this card adds it.

## 3 · The create workspace — full page, never a dialog

```
NEW REQUEST                                              [Cancel] [Send for approval]

Need for   [Display        ▾]      Deliver to  [HOUZS Balakong ▾]
Needed by  [ 12 Sep 2026   ]       Raised by   Siti (you)

Why        ┌──────────────────────────────────────────────────────────┐
           │ Balakong floor sofa is 14 months old, fabric is marked.   │
           └──────────────────────────────────────────────────────────┘

ITEMS                                                            [+ Add line]
  SKU · Model                    Qty   Note                        Supplier
  5539-2NA  Ohana 2 Seater        1    grey, not beige              Ohana     [Remove]

  WHAT WE ALREADY HAVE
    free stock      2
    already on PO   1   PO-2041 · 22 Aug
    still needed    0   ← this request may not be needed at all
```

- **`Why` may not be blank and the Send button stays off until it is filled.** It is
  the sentence the approver reads; *"restock"* answers nothing.
- **`WHAT WE ALREADY HAVE` computes BEFORE submit, per line.** Half of these requests
  are for goods Carres already has or already bought, and the cheapest approval is
  the one nobody had to make. `free` calls the same server rule the picker already
  calls — it is never recomputed here (the P15 rule the dialog already carries).
- **No price anywhere on this form.** Purchasing has no money
  (`purchasing/MASTER.md:1517`); the requester never sees one.
- Header once, lines N — the split the existing dialog already proved
  (`CreatePurchaseDialog.tsx:161-165`), because buying three things for one showroom
  is one reason and three items. `Why` is the header's one new field; the per-line
  `Note` maps onto the `remark` column that already exists.
- **One request submits as ONE act with a per-row result** — created lines stay
  created, a failed line keeps its row with the server's own words, and pressing
  `Send for approval` again retries exactly those. Same behaviour as today's dialog
  and the same reason: rolling three good lines back for a fourth bad SKU is the
  failure that behaviour exists to stop.

## 4 · Approval — one request, one decision, and the number is `still needed`

**Every purpose requires approval; a customer order requires none — the order IS the
authority** (`purchasing/MASTER.md:339`, Settings §8). The switch is per purpose and
**carries no amount**, because a threshold would make three operators judge prices.

The approver's row and button come from the five-string table already ruled
(`COPY-STANDARD.md:390`) and no new word is invented:

```
Approve the purchase  →  Approve {n} {model} for {purpose}
                      →  [Approve] [Refuse]  →  Approved — {n} {model}
                      →  empty: Nothing waiting for you.
```

- **The quantity on the Approve control is pre-filled with `still needed`, not with
  what was asked** (`purchasing/MASTER.md:449`). An approver who has to do the
  subtraction will not do it.
- **The approver may cut the quantity; cutting is not refusing** and the request goes
  forward at the cut number with the original on the record.
- **`Refuse` carries a reason and the reason is required.** Without it a refused
  request is simply never touched again and three months later nobody can say why.
- **Money appears on this surface, for the approver only** — server-gated, the same
  gate Settings already uses. An operator opening the same request sees the same
  screen minus the money, not a permission error.

## 5 · The states, and the one that is a FACT not a button

```
Waiting for approval   →  Ready to order  →  Ordered  →  Arrived
Waiting for the SKU    ↗                                 Not going ahead
```

- `Waiting` always names what it waits ON (`COPY-STANDARD.md`).
- A purpose whose approval switch is off starts at `Ready to order` — and **still
  records why it was bought** (`purchasing/MASTER.md:1520`).
- No SKU on file → `Waiting for the SKU`, and the New SKU work goes to the month's
  PO duty. The request waits on it and says so.
- **`Arrived` IS NOT A BUTTON.** The system already observes it: the PO this request
  became has a posted receipt. A fact the portal directly observes is a FACT on the
  record, never a task in a queue (the Observation Law,
  `ACTION-FLOW-STANDARD` Law 8). Nobody ticks it and nobody can forget to.
- `Not going ahead` is a required exit and carries its reason.

## 6 · Issue — no PO day, and consolidation is an OFFER

**APPROVED REQUESTS DO NOT WAIT FOR A PO DAY** (`purchasing/MASTER.md:342-347`).
Consolidation windows buy price and freight from large vendors; a furniture factory
charges the same for one order or three, so waiting buys nothing and costs days.
PO days stay on the customer lane, where they let a factory plan production.

When several approved requests share a supplier the page **offers**
`Issue as one PO?` — and **issuing them separately is always available on the same
screen.** An offer that cannot be declined is a gate wearing an offer's clothes.

The order form itself is **2990s' full-page create form, unchanged**
(`PurchaseOrderNew.tsx` — two-column header + inline line table, with the sofa
variant block: fabric · gap · divan height · leg height · seat size). **Only the
entrance differs: 2990s starts blank, Carres starts pre-filled from the approved
request.** A sofa PO without its fabric and configuration is a factory building the
wrong sofa.

**The PO carries the reason it was born for.** Report splits the month by
`Customer Sales · Ready Stock · Display · Office · Warranty · Spare Parts`.
🔴 `purchase_orders` carries NO reason column and `purchase_order_lines` carries no
link back to its demand (measured 2026-08-06, `purchasing/MASTER.md:117-121`).
**This card owes that migration** — without it the lane is unprovable downstream.

## 7 · The register, and the rail

The list is an Excel row (Register Law 11) — one request per row, and the row NEVER
owns workflow (Law 8):

```
Ref       Need for   What                  Qty  Deliver to      Needed by   Raised by  Status
REQ-0114  Display    Ohana 2 Seater grey    1   HOUZS Balakong  12 Sep 26   Siti       Waiting for approval
```

**`REQ-` is the series.** `PR-` is refused: 2990s already prints `PR` for a purchase
return (`GoodsReceivedList.tsx:98`), and a prefix a new hire can read two ways is a
prefix that gets filed wrong.

Rail (200px, collapsible — `ui/MASTER.md` §5):

```
Queues              Need for
  Approve the purchase   Ready Stock
  Issue PO               Display
  Check the SKU          Office
                         Warranty
                         Spare Parts
```

No `STATUS` facet is added — status is the pill on the row, and a facet filtering
by it competes with the queue rows for the same job. Counts on queue rows are work
waiting; **at zero nothing is printed.**

## 8 · The object detail

Shape is `ui/MASTER.md` §4.1 and is not re-argued here. Contents are already ruled
(`purchasing/MASTER.md:445-450`) — raised by / what / how many / deliver to /
needed by / **why, never blank**; then `WHAT WE ALREADY HAVE` with free stock,
already on PO and **still needed**; money for the approver only. **ONE SCROLL, no
tabs** — nothing here runs on a parallel track and nothing here is rarely-opened
reference.

## 9 · Copy

Every string comes from the PURCHASING five-string table in `COPY-STANDARD.md`.
**No new word is invented in code.** Rail words are nouns; buttons are verbs; a
field name may never be an action name (`purchasing/MASTER.md:211-216`). The three
this page uses — `Approve the purchase`, `Issue PO`, `Check the SKU` — all exist.
Any string this build finds it needs and cannot find in the table is added to
`COPY-STANDARD.md` in the same PR, never invented inline.

## 10 · WHAT EXISTS TODAY — measured 2026-08-19, so the build starts from facts

- **`purchase_demands` exists** (migration 0319) with `purpose` CHECK
  `ready_stock · display · office · warranty` — **no `spare_parts`**, this card
  adds it to the CHECK and the door.
- **There is NO `why` column.** `remark` exists per row; `why` is new, header
  level, door-enforced non-blank.
- **There is NO approval layer, BY DESIGN, and 0323's own comment says so:**
  *"No proposal and no approval layer, because today one person decides and
  Operation executes."* This card is the ruling that changes that sentence —
  approval fields (approved/refused, by whom, at what qty, refuse reason) are
  NEW, and 0323's table comment is overwritten in the same migration.
- **There is NO `status` column and none may be added for `Ordered`/`Arrived`:**
  0323 rules `open/ordered/done derive from po_id` — the Observation Law was
  already in the schema. `Arrived` derives from the linked PO's posted receipt.
  Only the states a human DECIDES (approval, refusal, `Not going ahead`) get
  columns; the rest stay derived.
- **Partial issue + cancel already work** (0320 `issued_qty`/`remaining_qty`,
  0321 `purchasing_cancel_demand` with its required reason) — reuse, do not
  duplicate. `Not going ahead` maps onto 0321's cancel with reason.
- **The write door is `purchasing_create_demand`** (0323): supplier DERIVED from
  the SKU, never chosen. Keep both properties; add `p_why`, admit `spare_parts`,
  and read the approval switch per purpose from Settings.
- **`purchase_orders` (0001:322) has NO reason column; `purchase_order_lines`
  has NO demand link** — confirmed against the migrations, not only the MASTER's
  2026-08-06 note. §6's owed migration is real.
- Migration numbering: next free is **0359**. *(This line first said 0337,
  measured on the parked omnibus branch; by execution day main and the applied
  production tracker both ended at 0358 — red line #7, MAX of every tail.)*

## BUILD RECORD

**P0 FOUND AND CURED ON THE WAY (2026-08-19).** Production carried a
`purchase_requests` PROTOTYPE this repository never heard of — applied
migrations `0308`/`0309` whose files died with closed PR #522 (the exact P0 of
red line #7). It was a line-level, display-only "Checkpoint A" store with two
doors and `purchase_order_lines.purchase_request_id`; zero application code
references it and it held one test row. 0359 renames it aside
(`purchase_requests_checkpoint_a`, nothing dropped), revokes its doors, and
the two lost files are RECOVERED into the repo from production's own schema,
marked as reconstructions.

**Slice 1 — IMPLEMENTED 2026-08-19** (migration `0359`): `purchase_requests`
header (REQ- series, five purposes with `spare_parts`, door-enforced `why`,
approval fields stamped from the new per-purpose switches in
`purchasing_purpose_approval`) · `purchase_demands.request_id` + `approved_qty`
· `OperationManualPurchase.tsx` (register + rail + full-page create workspace
with per-line `WHAT WE ALREADY HAVE` and a PRINTED `still needed`) ·
`+ Create Purchase` and the 600px dialog left SO Batch Purchase; the rail
entry went live by the two ruled edits. **Re-sequencing, stated:** typed
`purchase_demands` rows stay in the SO Batch Purchase grid until the ISSUE
slice ships the manual lane's own Issue — pulling them out earlier would make
an approved request unissuable, and an operator regression is not a slice
boundary. §1's grid split therefore lands with §6, not before it.

## STILL LOCKED — do not touch

The SO Batch Purchase grid, its hierarchy and its sofa-by-SO rule · the engine
numbers and `expectedArrivalOf` · PO days on the customer lane · the single
`purchasing_issue_pos_batch` authority · Receiving, Claims, Report files ·
Settings' seven numbers and its server gate (this card READS the approval switches,
it does not build the Settings screen) · the arrival-provenance colour law · the
nine measured column widths of the Purchase Orders register.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- `+ Create Purchase` no longer renders on SO Batch Purchase; `+ New request`
  renders on Manual Purchase.
- `purchase_demands` rows no longer appear in the SO Batch Purchase grid.
- Send stays disabled while `Why` is blank; a whitespace-only `Why` does not pass.
- `free stock` / `already on PO` / `still needed` render before submit and
  `still needed` is arithmetic the screen PRINTS, never leaves to the reader.
- All five purposes are offered, including `Spare Parts` and `Warranty`.
- A purpose with approval OFF lands at `Ready to order` and still stores its reason.
- The Approve control pre-fills `still needed`, not the asked quantity.
- `Refuse` cannot be submitted without a reason.
- No price renders for a non-approver; the same request renders for both roles.
- `Arrived` cannot be set by any control — assert no such button exists — and flips
  when the linked PO's receipt posts.
- Approved requests are issuable the same day; no PO-day gate is applied.
- `Issue as one PO?` is declinable and separate issue works from the same screen.
- Issued POs carry their reason; the reason survives a round trip through the API.
- A multi-line submit with one bad SKU keeps the good lines created.
- No string on the page is absent from `COPY-STANDARD.md`.
- Widths re-measured in a real browser; no guessed number is written down.

## Acceptance boundary

Authenticated production verification at 1440×900 and ~1920 on real demand: a
request raised in the full-page workspace with a required `Why` and live
already-have numbers, approved by a manager at `still needed` with money visible
only to them, refused with a reason on a second request, issued the same day with
the consolidation offer declined once and accepted once, the PO carrying its reason,
and `Arrived` appearing without anyone pressing anything. Overwrite
`docs/purchasing/MASTER.md` §1 and §3 in the same PR under the MASTER OVERWRITE
LAW, replacing the APPROVED-NOT-YET-BUILT blocks with what shipped.
