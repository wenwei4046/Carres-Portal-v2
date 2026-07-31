# CHECKPOINT — Purchasing · To Order

> **Handover, updated 2026-07-31 (second session).** Overwritten in place;
> there is never a second version of this file.
>
> **The rebuild is DONE in the repo.** `OperationToOrder.tsx` was written from
> zero on the kit, the mount in `OperationApp.tsx` points at it, and
> `OperationPurchase.tsx` + `purchase-order/*` were deleted whole — one change,
> no window where the tab was missing. Deploy state is §15.

---

## 0 · What is actually on screen right now

**The rebuilt page** — `apps/web/src/pages/operation/OperationToOrder.tsx`,
one file, assembly only. No hand-rolled shell survives: the queue rail is
tokens-only page markup (no kit component renders a two-line picking list yet
— extracted on its second occurrence), and every box is a kit component:

| Region | Rendered by |
|---|---|
| Queue rail (proposals + nested POs) | page-local, tokens only · `Loading` skeleton |
| PO bar — include · `PO 1 of N` · customer · SO | `Checkbox` (kit) |
| Header line — supplier · category ···· Order by | `SectionHeader` permanent |
| Items | `SectionHeader` + `DataTable` + `DropdownMenu` + `Button` + `Icon` |
| Not on any purchase order (when applicable) | `Panel` + ghost `Button` |
| Issue — Destination · count · the one blue button | `Card` + `Select` + primary `Button` |
| Issued result / empty / loading | `Panel` / `Card` + `EmptyState` / `Loading` |

**Absent by ruling, not by gap** (recorded in `03-page-patterns.md`):
Supplier Communication and Notes to Supplier are NOT rendered — an unbuilt
region is never an empty placeholder. The search box (decoration, zero
`<input>` in the old file) is deleted, words kept in `TO_ORDER_WORDS`.
Destination has ONE home: the Issue region. Selection is `blue-3` per
`01 §2.3`; `blue-9` appears once, on Issue Purchase Order.

**One defect fixed in the move**: the old Move menu numbered targets by the
FILTERED list, so `PO 2 of 2` called itself `Purchase Order 1` in its own
menu. Targets are now numbered by queue position.

---

## 1 · Business logic that must be kept

None of this is UI. All of it survives any rebuild.

**`packages/shared/src/to-order.ts`** — the whole projection, pure, 2017 tests
green.
- `buildToOrder` — supplier × category grouping, build grouping, net requirements
- `nameBuild` · `composeSummary` · `pickSpecToken` · `unitLabel` · `categoryLabel`
- `sortToOrderRows` — a row with no date sinks under every column, both directions
- `isOnePoPerOrder` — sofa is one purchase order per customer order
- `toOrderBuilds` · `defaultDocuments` · `planFromDocuments` · `planPurchaseOrders`
- `validateIssuePlan` + `ISSUE_BATCH_MAX` — the six refusals
- `TO_ORDER_WORDS` + `purchaseOrderCount` · `issuedHeadline` · `unresolvedHeadline`
  · `itemsCount` · `moveToTarget` — **the ONE word list. A string not here has
  not been ruled.**

**`apps/web/src/pages/operation/to-order-preview.ts`** — the arrangement state
machine. Pure, UI-free, reusable by any layout:
`initialState` · `describe` · `check` · `canRearrange` · `toggleInclude` ·
`removeBuild` · `restoreBuild` · `removedBuilds` · `splitOut` · `moveBuild`

**`apps/api/src/routes/operation/to-order.ts`** — the read and the issue write.
⚠ Its comment block on `.in()` is load-bearing, see §9.

**`operation_create_pos_batch`** — one plpgsql function, so an issue is ONE
transaction. Six refusals: `unknown_build` · `duplicate_build` ·
`empty_document` · `sofa_merge` · `batch_too_large` · `no_documents`, plus
`demand_unresolved`.

**The write contract, unchanged and not to be widened:**
```
POST /api/operation/purchase/to-order/issue
{ supplierId, category, destinationId, purchaseOrders: [{ key, include, buildKeys }] }
```
The client posts an ARRANGEMENT and nothing else — no SKU, no quantity, no
price. The server reads those from its own recomputation.

---

## 2 · Design System components already built

**In `apps/web/src/components/kit/` — 27 files. Proven by a real page and
documented in `02-components.md`:**

| Component | Proven by |
|---|---|
| `DataTable` | Items — 40px rows, percentage colgroup, never scrolls horizontally, header word from the column def, formats nothing |
| `DropdownMenu` | the Items row `⋯` — no submenus, keyboard-openable |
| `Icon` | 40 meanings, a name outside the union does not compile |
| `Button` | forwards its ref, which every `asChild` overlay needs |
| **`SectionHeader`** | **built this session** — collapsing is a discriminated union, so a permanent region has no chevron and no button at all |

**Proven by the rebuilt To Order page (2026-07-31), written up in
`02-components.md`:** `Checkbox` · `Select` · `Panel` · `Card` · `EmptyState`
· `Loading`

**Built, rendering on `/ui`, not yet proven by a business page:**
`Input` · `Textarea` · `SearchInput` · `Badge` · `StatusPill` · `Modal` ·
`Drawer` · `Tooltip` · `Popover` · `Tabs` · `DatePicker` · `Toast` ·
`PageShell` · `DetailShell` · `DialogFrame`

**Kit house rules, enforced by `kit-source.test.ts`:** no raw hex · no
`className`/`style` prop anywhere · only the eight spacing steps · no
`font-bold` · `lucide-react` imported in exactly one file · z-index named in
one file.

---

## 3 · Files that are now the source of truth

```
docs/01-design-tokens.md      the visual rules
docs/02-components.md         components — written up only when a real page proves one
docs/03-page-patterns.md      page shapes + Carres Examples (this page lives there)
```

Supporting:
```
apps/web/src/components/kit/tokens.ts   the machine mirror of 01
scripts/check-design.mjs                the scan · 8500 findings · the ratchet may never rise
packages/shared/src/to-order.ts         the business projection AND the word list
docs/COPY-STANDARD.md                   every visible word (Jess owns it)
docs/CHECKPOINT-to-order.md             this file
```

**`docs/UI-KIT.md` is ⛔ SUPERSEDED** and kept as a migration bridge with a
ledger at its head — 2,020 lines, ten live pages, findings keyed to its
§ numbers. Nothing new goes into it. Deleted when the ledger empties. **Do not
delete it early.**

**No module ever gets its own standards document.** A page's shape is a Carres
Example under the pattern it uses.

---

## 4 · The method: build new, delete old. Do NOT amend. — ✅ EXECUTED

**Done 2026-07-31, exactly as written**: `OperationToOrder.tsx` written from
zero; the mount changed and `OperationPurchase.tsx`, its 23 shell tests,
`PurchaseOrderWorkspace.tsx` and `ItemsSection.tsx` deleted in the SAME change.
The old file was read once for its state (`pickedKey` · `pickedDoc` · `destId`
· `plan` · `issued`), the mutation body and the deep link — those survived as
logic; not one line survived as markup.

**The method stands for every future rebuild**: a file you keep opening is a
file whose shape you keep. R8's source scan (`purchasing-words.test.ts`) is the
tripwire — deleting a lane file makes it fail by name, so a rename can never
silently empty the suite.

## 5 · Commits to keep

On `main`, this session:

| | |
|---|---|
| `dfef1360` (#531) | five commits: size + quantity on a To Order line · Items on `DataTable` · **the Design System lands** · `SectionHeader` · Items gets one word list |
| `4073d502` (#532) | two commits: the count is stated once · **the page becomes five regions** |

**Keep all of them.** Everything in `packages/shared`, `components/kit`,
`docs/0*` and `scripts/check-design.mjs` is independent of the page layout.

---

## 6 · Work that should be discarded

**Discard as markup — every one of these is deleted with the old file:**

```
OperationPurchase.tsx     the whole page shell
  Sidebar · DocRow · StickyAction · IssuedPanel · EmptyPanel
OperationPurchase.test.tsx   23 tests anchored on that shell
```

**Discard the SHAPE, not the decisions.** `PurchaseOrderWorkspace.tsx` and
`ItemsSection.tsx` were written inside the old shell and inherit its
assumptions — a document header bar the shell needed, a `MoveTarget` list the
shell composed, an `ItemsSection` that renders a `SectionHeader` because the
shell had nowhere else to put one. **The next chat rebuilds both from the
Golden Template rather than importing them.** What carries across is the
decisions they encode, which are listed in §10 and in `03-page-patterns.md`,
not the files.

**Discard NOTHING from:**
```
packages/shared/           the projection, the state machine, the word list
apps/web/src/components/kit/   27 components, house rules, tests
docs/0*.md                 the Design System
scripts/check-design.mjs   the scan and its ratchet
apps/api/                  the read and the issue write
```

## 7 · What the next chat must read before writing code

In this order:

1. **`docs/CHECKPOINT-to-order.md`** — this file
2. **`docs/03-page-patterns.md`** → Review → Carres Examples — the frozen shape
3. **`docs/01-design-tokens.md`** and **`docs/02-components.md`**
4. **`packages/shared/src/to-order.ts`** — the business rules and the word list
5. **`CLAUDE.md`** — the four laws and the deploy rules
6. `apps/web/src/components/kit/kit-source.test.ts` — what the kit refuses

---

## 8 · The first task for the next chat

**Draw the new page from the Golden Template, in ASCII, before writing a line
of code.** `03-page-patterns.md` → Review → Carres Examples holds the frozen
region order; §2 holds the components available to build it from; §12 holds the
columns that do not exist and therefore cannot be drawn.

Name, for each region, which kit component renders it and which of §1's
functions feeds it. Where neither exists, say so — do not invent a component
and do not invent a word.

**No code until that drawing is accepted.**

Then, in ONE change: the new file, the route pointed at it, and
`OperationPurchase.tsx` deleted.

## 9 · Rules that survive, and cost real money when broken

**A SKU may never go into a PostgREST `.in()` list.** `order_lines.sku` is free
text and 16 live lines contain a double quote; the filter breaks and the server
returns a short answer. The catalog is read whole. A source test enforces it.
⚠ `apps/api/src/routes/operation/purchase.ts` (`/today`) still uses
`.in("sku", …)` and has the same bug.

**A number that surprises you is a measurement to check, not a fact to explain.**

**A fix aimed at a cause you have not proved is a fix that hides the cause.**

**A negative control that does not fail is a test measuring nothing.**

**One fact, one place.** Broken twice this session in the same way: a count
stated by two elements in one block, the second time reintroduced by a layout
that had just removed it.

---

## 10 · Frozen business rules (do not re-open)

**Every Purchase Order has exactly one fulfilment destination.** Arithmetic,
not policy. Single-customer PO → warehouse · partner · customer address.
Multi-customer PO → warehouse · partner only. Want one customer direct off a
merged PO? **Split first** — Split is the door to direct delivery.
⚠ Needs a column that does not exist: a destination meaning *this PO's customer*.

**Communication is an EVENT, never a Status.**
`Draft → Issued → Supplier Acknowledged` is status; `WhatsApp opened` is an
event outside it. Adding SMS or a portal later adds events and changes no status.

**There is no `Sent` state and never will be.** The portal cannot observe
WhatsApp. `Open WhatsApp group` copies the message, downloads the PDF, opens
the group, and records `Opened WhatsApp group`. `Send via WhatsApp` and
`I have sent it` were both **rejected** — kept here so nobody rebuilds them.
The gap is closed by a due action: no acknowledgement after N working days →
`Call {supplier} — confirm they received the purchase order`.
`POST /api/supplier/pos/:id/acknowledge` is already live, and Nice Future and
Ohana both have `portal_enabled = true`.

**Two independent communication drafts** — WhatsApp short, Email formal with a
Subject, both visible at once. One channel → full row. No channel →
`Download PDF` + `Add a channel`, and **Issue is never blocked**.

**Version is `Rev 1 / Rev 2` only.** Draft and Issued are status. A revision
keeps the PO number and is refused once `received_qty > 0`.

**The PO document** — no money (the real Carres PO's `Total` is blank), line by
line with a `Ref` column, no signature block, `Prepared by {name} · {phone}` +
`This purchase order is computer generated and is valid without a signature`.
Sofa carries the plan-view drawing; the mattress PO carries no customer data.

**Two rulings that override written law, on record:**
1. `Open Customer Order` overrides `COPY-STANDARD:826`'s `Open order`.
2. Items is the first business page to render kit components — CLAUDE.md
   records D0.5c as components-only with adoption at D6, *"a RULING, not a gap"*.

---

## 11 · Words owed to COPY-STANDARD

Live on screen, ruled by Loo 2026-07-31, **not in Jess's dictionary**:

`Items` · `Ref` · `Item` · `Size` · `Qty` · `More` ·
`Create Another Purchase Order` · `Remove` · `Open Customer Order` ·
`Move to Purchase Order {N}` · `Nothing on this purchase order.` ·
`N lines · N units` · `PO {i} of {N}` (now `poIndexLabel` in
`packages/shared/src/to-order.ts` — was a literal typed twice in markup) ·
`Supplier Communication` · `Notes to Supplier`

Designed, not built: `Live Purchase Order` · `Review message` ·
`Supplier acknowledged` · `Re-open WhatsApp group` · `Send revision` ·
`Edit header` · `Add note`.

---

## 12 · Columns and tables that do not exist

```
po_sends                              v1/v2 · channel · opened_at · opened_by
purchase_orders.approved_by           nothing records who issued a PO
purchase_orders — revision            Rev N + a lock once received_qty > 0
suppliers                             address · tel · attn · terms  (all four)
suppliers.contact                     10/10 NULL
purchasing_destinations.address       3/3 NULL — column exists, data missing
purchase_orders.expected_ready_date   column exists, nobody writes it
a destination meaning "this PO's customer"
```

`operation_create_pos_batch` writes **no audit row** — measured, `prosrc` does
not mention `audit_log`.

---

## 13 · Live data facts (measured 2026-07-31)

```
sofa geometry     21/21 lines carry module_code · x · y · rot · sofa_height
                  → the plan-view drawing needs no migration
sofa fabric       4/21 lines    ← a factory cannot start without colour
sofa leg height   16/21 lines
mattress demand   14 lines = 16 units
suppliers         2 of 10 have email · 5 have WhatsApp · 4 have neither
purchase orders   7 live, all SHORT (issued while the `.in()` bug was live) —
                  not a correct example of the output
```

---

## 14 · Baselines (re-measured after the rebuild, 2026-07-31)

| | |
|---|---|
| shared | 2018 / 2018 (2017 + `poIndexLabel`) |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | **16** — `OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1. The new page's own suite is 16/16. |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |
| design-standard | **8438** — deleting the old shell dropped it 62; the ratchet may never rise |

**The 17th failure under full-suite load died with its file** —
`OperationPurchase.test.tsx` was deleted whole in the rebuild.

**Negative control, proven not assumed**: smuggling `sku` into the issue
mutation body makes `posts the ARRANGEMENT and nothing else` fail (1/16);
reverting restores 16/16.

## 15 · Deployed

```
Rebuild      built + verified on branch, NOT yet merged/deployed —
             awaiting Loo's review. Update this block after deploy.
Last live    main 4073d502 · index-23Unfs6W.js · 4,592,479 bytes · SERVICE_ROLE 0
API Worker   c632a67e (no api change in the rebuild — web only)
Migration    none this session · prod applied tail 0308 · repo tail 0307
```
