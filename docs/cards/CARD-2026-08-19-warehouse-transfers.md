STATUS: QUEUED
DATE: 2026-08-19
PR: pending
IMPLEMENTATION: APPROVED — Warehouse Blueprint item 8 (Transfers) and item 13
(navigation), owner-reviewed 2026-08-14; the owner directed 2026-08-19 to
continue the blueprint. This card builds the FIRST slice and turns the rail's
`Transfers` row live. Build straight to production.

# WAREHOUSE TRANSFERS — slice 1 (request → collection → arrival, exact units)

**SCOPE — the cross-site custody journey for exact units: a Transfer object,
its three governed doors, the derived lifecycle, and the Transfers register.
NOTHING ELSE.**

Explicitly OUT of this card (later slices): Positions/Operational Areas ·
partial-receipt exception Work · Receive With Issue condition flows ·
supplier/repair-partner destinations · the NETS Partner Portal · Counts ·
batch/dye-lot matching · any Settings surface.

Read `CLAUDE.md`, `docs/stock/MASTER.md`, `docs/ERP-ARCHITECTURE.md` §3.5,
`docs/ui/MASTER.md` (Register Template + §4.2), `docs/COPY-STANDARD.md`
(`stock transfer` row), on the LATEST `origin/main`. Execute as CONTINUOUS
BUILD: implement → tests → PR → CI → merge → deploy → prove SHA → overwrite
the owning MASTERs in the same PRs. **If code structure conflicts with this
card, STOP and report — do not choose.**

## 1 · The law (Warehouse Blueprint item 8, the slice-1 subset)

- **Same site = Move; different site = Transfer.** A cross-site relocation may
  NEVER be a direct edit of a unit's warehouse — a direct edit hides who
  handed over, who carried, and whether the destination really received the
  same unit. (`transferred` has had no writer anywhere until now — this card
  is that writer.)
- A Transfer names **exact units** (`ops_stock_items` rows), a from-site, a
  to-site, a purpose and an expected date. Slice-1 sites = the existing
  warehouse register entries; Positions do not exist yet and are not faked.
- **Collection and Arrival are TWO events, never one.** One confirmation may
  not pretend the goods both left and arrived.
- Lifecycle is **DERIVED from recorded events, never stored as an editable
  dropdown**: `Requested → In transit → Received`, plus `Cancelled` (allowed
  only BEFORE collection). After collection a Transfer cannot be cancelled —
  the way back is a new return Transfer.
- Between collection and arrival a unit is **In transit**: it stops counting
  in any availability arithmetic, cannot be reserved, picked or drawn, and
  its reservation (if any) survives untouched.
- Only units that are actually scanned/confirmed at the destination enter the
  destination's stock. Events are **append-only and deletion-refused at the
  database**; each records person, time and the unit set.
- A reserved unit may join a Transfer only when the move serves its own
  fulfilment; a held (`on_hold`) unit may not join a slice-1 Transfer at all.

## 2 · Doors and surfaces

- Three governed doors (API, role-gated like the handover doors):
  `Request transfer` (picks exact free/reserved units) · `Confirm collection`
  · `Confirm arrival`. Exact strings register in `COPY-STANDARD.md` in the
  same PR. A `Cancel transfer` door exists only pre-collection and records
  its reason.
- **Transfers register** (the rail row goes live in this PR by exactly two
  edits — drop the flag, the span becomes a link), Register Template,
  default columns:

```
Transfer No. | From | To | Units | Purpose | State | Collection | Expected arrival | Received
```

- Transfer numbering uses the locked `docNumber()` scheme (`TR-` prefix,
  reprint-stable).
- On hand: an in-transit unit renders its state honestly (In transit, not
  free); every pick/draw filter already excludes non-`free` — assert it.
- History: each event appends to the unit's movement ledger; nothing is
  edited in place.

## MIGRATIONS

**Number from the MAX of the tracker tail, the repository tail and every
branch at build time — never from `ls`.** (0363 was the applied tail when
this card was written; siblings may take numbers first.)

## TESTS AND DEPLOY — MANDATORY

- DB probes in rolled-back transactions: events append-only; deletion
  refused; a caller with no role refused; cancel-after-collection refused;
  an `on_hold` unit refused at request; collection alone does NOT derive
  `Received`.
- Shared arithmetic unit tests: state derives from events only; an
  in-transit unit is absent from every availability figure.
- Register live in production, columns as above; the rail row is a link.
- SHA convergence proven; screenshots attached to the PR.

## Acceptance boundary

`docs/stock/MASTER.md` gains the Transfers section (BUILT for this slice) in
the same PRs; the rail flag drop is recorded in ui MASTER §4.2's map. Owner
walk owed: one real test Transfer taken Requested → In transit → Received
between two sites, every event visible with its recorder.
