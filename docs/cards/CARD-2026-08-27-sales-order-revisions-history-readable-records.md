# SALES ORDERS — CARD · MAKE REVISIONS AND HISTORY READABLE TO STAFF

**Module:** Sales Orders · **Object views:** Revisions + History
**Owner authority:** `docs/orders/MASTER.md` + `docs/ui/MASTER.md` — owner-approved / locked 2026-08-27
**Status:** EXECUTED · SHIPPED — implementation merged as `d14614a3` and verified on the
authenticated production UI, 2026-08-27. **NOT YET `PRODUCTION-VERIFIED`:** §9's five-second staff
walk and the true ~920px viewport reading are still owed — see §11.
**Lane:** BUILD / DELIVERY
**Base:** `origin/main` at `375d8c8a5143730f315233d52e0397ce04531a45`, plus the approved Blueprint commit `b8046992`

> **For the build agent:** read `CLAUDE.md`, `docs/orders/MASTER.md` (the four object
> views), `docs/ui/MASTER.md` (History + Revision three-rank grammar),
> `docs/COPY-STANDARD.md` and `docs/01-design-tokens.md` before editing. This Card contains no
> open owner decision. Engineering completes the normal repository delivery gates without asking
> the owner to choose implementation mechanics.

---

## 1 · Outcome

Make both Sales Order records understandable to a new staff member in five seconds:

```text
HISTORY

Order created
Jess · Principal · Mon, 24 Aug 11:16
No deposit · Online order

REVISIONS

Original order
Rev 1 · Current
Recorded by Jess · Mon, 24 Aug 11:16
```

The reader must be able to answer:

1. What happened?
2. Who did it?
3. When did it happen?
4. What important result was recorded?

The screen fails even when every database field is technically present if a new operator cannot
answer those questions without decoding roles, raw keys or dot-separated text.

## 2 · Current production defects

### Revisions

Current production shows a status chip followed by compressed supporting text:

```text
Rev 1 · current
Rev 1 · Mon, 24 Aug 11:16
Original — the agreement as first recorded
```

Problems:

- the version number is repeated while the record title is demoted;
- the person who recorded the version is absent even though `created_by` exists;
- the visual ranks do not say what to read first;
- the large empty panel makes the one record feel like a placeholder rather than a document door.

### History

Current production flattens the whole event into one developer-readable line:

```text
11:16  Unknown user · Principal · Order created · 0% deposit · online
```

Problems:

- time, actor, role, event and result all compete on one line;
- `Unknown user` is not useful employee copy;
- `0% deposit` and `online` are raw stored values, not governed employee words;
- the developer can read the schema, but a new operator has no reading path;
- the current code deliberately preserves this defect in tests.

This Card fixes the record grammar and the actor data chain together. A typography-only change is
not acceptable because a three-line layout that still says `Unknown user` does not answer “who?”.

## 3 · Approved UI contract

### 3.1 One record, up to three visual lines

| Rank | Content | Required token | Weight / colour |
|---|---|---|---|
| 1 | What happened / version title | `text-body` (13) | semibold · primary text |
| 2 | Who and when / revision identity | `text-meta` (12) | regular · secondary text |
| 3 | Important result or detail | `text-label` (11) | `font-normal` · quieter accessible text |

- Omit line 3 when the event has no important result.
- Never add an empty line to force equal height.
- Never concatenate the three ranks back into one dot-separated sentence at any viewport.
- Use the existing panel, border, spacing and colour tokens. Do not invent a new card system.
- Records are separated with the existing quiet divider/spacing grammar, not nested cards.

### 3.2 History records

Required examples:

```text
Order created
Jess · Principal · Mon, 24 Aug 11:16
No deposit · Online order

Customer delivery changed
Kimmy Lee · Salesperson · Tue, 25 Aug 09:42
Tue, 8 Sep → Thu, 10 Sep

Order cancelled
Wen Wei · Operation · Wed, 26 Aug 15:10
Customer changed their mind
```

Rules:

- Line 1 uses Primary School Standard English and names the event.
- Line 2 uses the authoritative real actor name, governed role word and actual `fmtDate()` date/time.
- Line 3 uses structured metadata or the one revision-diff arithmetic already owned by
  `describeRevisionChanges`; do not build a second Before → After engine.
- `0% deposit` renders as `No deposit`.
- order source `online` renders as `Online order` only when that is the authoritative source fact.
- Stored immutable history text is not rewritten in the database. Translate at the read/presentation
  boundary from structured facts.
- Group headings use the governed History chronology. The record itself still carries its actual
  weekday + date + time on line 2, so `Today`, `Yesterday` or `Earlier` never hides the date.

### 3.3 Revision records

Rev 1:

```text
Original order
Rev 1 · Current
Recorded by Jess · Mon, 24 Aug 11:16
```

Later version:

```text
Customer delivery changed
Rev 2 · Current
Recorded by Kimmy Lee · Tue, 25 Aug 09:42
```

Rules:

- The record title is the first line. `Rev n` is identity, not the title.
- Rev 1 always says `Original order`.
- A later version uses the governed applied change word from `change_type`; it does not expose an
  enum or raw field key.
- The current version says `Rev n · Current`. Older versions say `Rev n`.
- Selecting any record continues to open the complete Sales Order version. An older version remains
  read-only and retains its historical PDF/document truth.
- `Propose this version again` remains a governed proposal door; it does not rewrite history.

## 4 · Actor truth — fix the data chain, do not invent a person

### Human event

If a human acted, resolve and return the real display name from the authoritative identity source:

1. `app_users.id → app_users.name` for internal staff;
2. `salespersons.user_id → salespersons.name` for salesperson/dealer identities hidden by internal
   `app_users` RLS;
3. `app_users` wins when both sources answer for the same account.

The Sales Order detail endpoint already applies this rule to History. Reuse one resolver for History
and Revisions rather than copying the lookup arithmetic into two code blocks.

### System event

Use `System` only when the authoritative event source proves that the portal, scheduled job or
database automation performed the action. A missing person id does not by itself prove `System`.

### Missing actor

- `Unknown user` is deleted from employee-facing copy and from tests.
- Do not borrow `Principal`, `Operation` or `Salesperson` as if it were a person's name.
- Migration `0387_an_event_records_who_did_it.sql` stamps `auth.uid()` on new History writes. Verify
  that it is applied in the governed production database before claiming completion.
- There is no invented backfill for old rows: the actor was never captured. During implementation,
  unresolved legacy/test rows must remain a visible audit-data defect (`Actor was not recorded`),
  not a fabricated person and not a silent blank. Production acceptance uses a newly created order
  after `0387`, where the real actor must resolve.
- Revision `created_by` must receive the same name resolution. A newly minted human revision may not
  return a null actor name.

## 5 · Data contracts

### API History event

Keep the immutable event fields and return a resolved actor classification:

```ts
interface SalesOrderHistoryEvent {
  text: string;
  occurred_at: string;
  by_role: string | null;
  by_user_id: string | null;
  actor: string | null;
  actor_kind: "human" | "system" | "missing";
  metadata?: unknown;
}
```

`actor_kind` is derived server-side from authoritative facts. The browser does not infer `System`
from a null id.

### API Revision row

Extend the existing revision response without removing its immutable id:

```ts
interface SalesOrderRevisionRow {
  revision: number;
  snapshot: SalesOrderSnapshot;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  actor_kind: "human" | "system" | "missing";
  change_type?: "staff_correction" | "customer_change" | null;
  note?: string | null;
}
```

Do not resolve names in the browser. Do not discard `created_by`; it remains the audit identity.

### Presentation model

Create one small presentation formatter for each record type. It returns structured lines, not a
pre-concatenated sentence:

```ts
interface LedgerRecordWords {
  title: string;
  identity: string;
  detail?: string;
}
```

The component renders the ranks. It does not split raw strings on `·` and hope the storage text has
the correct meaning.

## 6 · Exact file scope

| File | Responsibility |
|---|---|
| `apps/api/src/routes/operation/orders.ts` | extract/reuse one actor-name resolver; return actor truth for History and Revisions |
| `apps/api/src/routes/operation/orders.test.ts` | internal staff, salesperson, System, missing actor and revision actor contracts |
| `apps/web/src/lib/queries.ts` | add the governed revision actor fields |
| `apps/web/src/pages/operation/SalesOrderLedger.tsx` | structured copy formatters + three-rank History/Revision DOM |
| `apps/web/src/pages/operation/SalesOrderLedger.test.tsx` | replace the old one-line and `Unknown user` locks with the approved contracts |
| `apps/web/src/pages/operation/SalesOrderWorkspace.ui-contract.test.ts` | preserve complete read-only old-version navigation and four-view separation |
| `supabase/migrations/0387_an_event_records_who_did_it.sql` | read-only verification target; do not edit this committed migration |
| `docs/cards/CARD-2026-08-27-sales-order-revisions-history-readable-records.md` | execution, CI, deployment and authenticated acceptance record |

A new migration is not expected. If governed production verification proves `0387` absent, stop and
report the migration drift; do not create a competing actor mechanism.

## 7 · Build tasks

### Task 1 · Lock the new copy and hierarchy with failing tests

- [ ] Delete test expectations for `Unknown user`.
- [ ] Assert a human event renders exactly three separate ranks.
- [ ] Assert a simple event renders exactly two ranks and no empty third line.
- [ ] Assert `No deposit · Online order`, not `0% deposit · online`.
- [ ] Assert the title is line 1 and the actor/date is line 2.
- [ ] Assert 13/12/11 token classes and line-2 regular weight.
- [ ] Assert no rendered record contains the old flattened sentence.
- [ ] Prove focused tests fail against the current implementation before changing production code.

### Task 2 · Give Revisions real actor names

- [ ] Extract one bounded actor resolver from the History route logic.
- [ ] Resolve the set of `sales_order_revisions.created_by` ids in bounded reads.
- [ ] Return `created_by_name` and `actor_kind` for every revision.
- [ ] Preserve oldest-first revision ordering and immutable snapshots.
- [ ] Add API tests for operation staff and salesperson identities.
- [ ] Assert each distinct id is looked up once, however many revisions/events it authored.

### Task 3 · Classify History actor source truthfully

- [ ] Keep the existing `by_user_id` and real-name resolution.
- [ ] Return `human`, `system` or `missing` from server facts.
- [ ] Never infer System from null alone.
- [ ] Preserve events when a name lookup fails; show the governed audit-defect words.
- [ ] Verify new human writes receive `by_user_id` through migration 0387.

### Task 4 · Replace string dumping with structured record words

- [ ] Format History as title / identity / optional detail.
- [ ] Format Revisions as title / revision identity / recorded-by line.
- [ ] Keep `historyDetailLines` on the one `describeRevisionChanges` arithmetic.
- [ ] Translate raw storage values only at the presentation boundary.
- [ ] Keep notes/reasons readable without exposing raw database field keys.

### Task 5 · Render the approved visual hierarchy

- [ ] Render semantic `<ul>` / `<li>` records.
- [ ] Use `text-body font-semibold` for line 1.
- [ ] Use `text-meta font-normal` for line 2.
- [ ] Use `text-label font-normal` for line 3.
- [ ] Use existing accessible text colours; do not make 11px copy low-contrast.
- [ ] Remove the duplicate Rev chip/list hierarchy. One revision record is one clickable door.
- [ ] Keep calm dividers/spacing; do not introduce nested cards.
- [ ] Keep the panel width and four object tabs unchanged.

### Task 6 · Preserve interactions and responsive behaviour

- [ ] Mouse and keyboard activate a revision record.
- [ ] Visible focus uses the existing focus token.
- [ ] Current state is stated in text, not colour alone.
- [ ] Old revision opens the complete read-only Sales Order version.
- [ ] At approximately 920px, the three ranks remain vertical and readable.
- [ ] Long names/details wrap inside the record; no horizontal page scroll and no one-line clipping.
- [ ] Loading, error and empty states keep governed copy (`No revisions recorded`, `No history recorded`).

## 8 · Tests and gates

### Focused automated gates

```text
apps/api/src/routes/operation/orders.test.ts
apps/web/src/pages/operation/SalesOrderLedger.test.tsx
apps/web/src/pages/operation/SalesOrderWorkspace.ui-contract.test.ts
```

Required cases:

1. newly created human order → real name + role + actual date/time;
2. salesperson identity resolves through `salespersons` when `app_users` cannot answer;
3. operation identity resolves through `app_users`;
4. proven automatic event → `System`;
5. unresolved legacy row → explicit audit-data defect, never a person guess;
6. History result uses governed plain words;
7. Rev 1 uses `Original order` and the real recorder;
8. later current revision names the governed applied change;
9. older revision opens the complete read-only version;
10. no regression to one-line dot-separated rendering;
11. semantic list and keyboard focus remain;
12. empty and error states remain readable.

Then run the repository's normal migration check, lint, typecheck, complete tests and production
build. Do not waive unrelated failures without reproducing and recording evidence.

## 9 · Authenticated production acceptance

Use a fresh Sales Order created after migration 0387 is present. Do not use the pre-migration
SO-1327 screenshot as proof that new actor capture works.

### 1440px and approximately 920px

- [ ] Revisions shows one clear record, not a repeated chip plus a second list.
- [ ] Rev 1 reads `Original order / Rev 1 · Current / Recorded by {real name} · {actual date/time}`.
- [ ] Selecting an older revision opens the complete read-only order.
- [ ] History shows event, actor/time and result on separate visual lines.
- [ ] `Unknown user`, `0% deposit` and raw `online` do not appear.
- [ ] Human action names the real person; automatic action says System only when proven.
- [ ] Long content wraps; nothing blends into a clipped sentence.
- [ ] Keyboard focus and activation are visible and correct.

### Five-second staff walk

Give the page to an operation staff member who did not build it. Without explanation, ask:

```text
What happened?
Who did it?
When?
What important result was recorded?
```

They must answer every applicable question within five seconds. “All fields are present” is not a
pass criterion.

## 10 · Explicit boundaries

Do not change:

```text
Sales Orders Register
Order page editing or amendment law
Order Route
Purchasing, Delivery, Stock, Payment or Service Case truth
revision snapshot arithmetic
historical PDF/document generation
database history rows or old committed migrations
sidebar, Quick Rail, Work Engine or document numbering
```

Do not backfill a guessed actor. Do not introduce avatars, new assignment logic, a new Activity
system, a second revision engine or a new overall order status.

## 11 · Completion record

```text
Implementation commit:      6a99cf55df911e6a74f7792122235965fd2fccce
PR:                         #931 — https://github.com/wenwei4046/Carres-Portal-v2/pull/931
CI:                         run 33040824230, verify SUCCESS on 6a99cf55
Merge SHA:                  d14614a3aa5bd2825898d3e17e19ece464050395
Deployment run:             33041528057, Deploy production SUCCESS on d14614a3
Production SHA:             d14614a3 on all five canonical surfaces
Migration 0387 verification: proved by behaviour on SO-1329 (see below)
Authenticated orders used:  SO-1329 (post-0387) · SO-1327 (pre-0387) · SO-1318 (6 revisions)
1440px acceptance:          PASS, measured at a 1475px viewport
~920px acceptance:          PROXY PASS — true viewport reading OWED
Five-second staff walk:     OWED — needs a human reader
Defects opened:             one 🟡, out of this Card's boundary (see below)
```

## 11.1 · Repository gates, re-run on the merged SHA

Run on `d14614a3` before this record was written — not quoted from the CI log:

```text
ci:migrations   402 migration filenames validated, 0 migration changes
typecheck       packages/shared · apps/api · apps/web — all clean
lint            exit 0 (design guard Stage 1, warn-only)
tests           apps/web 3494 · apps/api 2486 · packages/shared 2686 = 8666 passing
                focused: SalesOrderLedger 34 · SalesOrderWorkspace.ui-contract 42 · orders API 105
build           apps/web production build clean; deploy proof stamped
```

## 11.2 · What the authenticated production UI proved

`erp.carresofficial.com`, signed in, computed styles read from the live DOM.

**SO-1329 — a human order created after 0387.** History renders the three ranks as separate
elements, never one sentence:

```text
Order created                                     text-body   13px  weight 600
principal · Principal · Thu, 27 Aug 12:30         text-meta   12px  weight 400
No deposit · Online order                         text-label  11px  weight 400
```

The stored `0% deposit · online` reaches the reader as `No deposit · Online order`. The actor
resolved to a recorded account name rather than the retired unknown-user copy, which is the proof
0387's trigger stamped `by_user_id` on this order — the acceptance the Card demanded, and the
reason SO-1327's screenshot was refused as evidence. Revisions on the same order:

```text
Original order
Rev 1 · Current
Recorded by principal · Thu, 27 Aug 12:30
```

**SO-1327 — the exact record §2 cited as the defect.** `Unknown user · Principal · Order created ·
0% deposit · online` on one line has become:

```text
Order created
Actor was not recorded · Principal · Mon, 24 Aug 11:16
No deposit · Online order
```

The order predates 0387, so no actor was ever captured. The screen states that as the audit-data
defect it is and invents nobody — §4's required behaviour.

**SO-1318 — six revisions, a resolved human, and the version door.** Rev 1 reads `Original order`;
later versions carry the governed change words `Staff correction` and `Customer change`, never the
enum. The current version says `Rev 6 · Current` in text; older ones say `Rev n`. Each record is
ONE `<button>` inside `<li>` inside a `divide-y` list — the duplicate chip row is gone, no nested
cards. Keyboard focus lands on the record, the existing focus-ring token is on it, and Enter opens
`Viewing Rev 4 · read-only` with a `Back to current` door. The complete historical version renders
from that snapshot, and `Propose this version again` survives on non-current versions.

Name resolution demonstrably works: SO-1318's actor resolves to `E2E Test · operation`, which is
the literal `app_users.name` written by `scripts/seed-test-users.ts:129`. The API reads the name;
it never appends a role.

**Absent from every screen read:** `Unknown user` · `0% deposit` · bare `online`.

## 11.3 · The ~920px reading is a proxy, and here is exactly why

`SalesOrderLedger.tsx` contains no breakpoint class, and its panel is a plain
`mx-auto max-w-5xl` — nothing between 920px and 1475px changes the record's layout. Narrowing that
panel to 676px (the width it takes at a ~920px viewport) kept the three ranks vertically stacked at
13/12/11, wrapped inside the record, with no clipped element and no page horizontal scroll.

**That is a container measurement, not a viewport measurement, and it is recorded as one.** The
signed-in Chrome window was maximised; the extension cannot shrink a maximised window and its page
zoom is unavailable, so a true ~920px viewport could not be reached from this session. Re-read it
at a real 920px window before this line is upgraded.

## 11.4 · Defect found during acceptance — NOT fixed here, and that is deliberate

🟡 **An old revision opens with typable fields.** `SalesOrderWorkspace.tsx:1130` states the intent —
*"the same fields render, filled from THAT snapshot and locked"* — but on production the ten
customer/address/floor inputs report `readOnly = false` and `disabled = false` while the banner says
`Viewing Rev 3 · read-only`. No writer exists in that view (no Save, Edit or Amend control), so
nothing can be persisted and no data is at risk; the hazard is that an operator can type into a
photograph and believe they changed it.

It is **not this Card's defect**: `SalesOrderWorkspace.tsx` is untouched by `6a99cf55`, and §10
forbids this Card from changing Order page editing law. It needs its own Card.

## 11.5 · Two observations that are data, not code

- **`app_users.name` is answering with account labels.** `principal` and `E2E Test · operation` are
  what the identity table stores, so the resolver returns them correctly — but §9's *"Who did it?"*
  is answered by a label that reads like a role. The repair belongs to People/HR master data, and
  `CLAUDE.md` §6 forbids a backfill card for today's test rows. Real names will arrive with real
  accounts at go-live.
- **Migration `0387`'s own comment is now stale.** It says a null actor means *"the page says
  `Unknown user` … that is the honest answer and it stays the answer."* The 2026-08-27 ruling
  retired that copy in favour of `Actor was not recorded`. Red line 6 forbids editing a committed
  migration, so this section is the current meaning — the same precedent `orders/MASTER.md` set for
  migration `0104`'s stair-carry comment.

## 11.6 · What is still owed before `PRODUCTION-VERIFIED`

1. The §9 five-second staff walk, by an operation staff member who did not build the screen.
2. One reading of Revisions and History at a true ~920px viewport.

Until both land, `Status` stays `EXECUTED · SHIPPED`.
