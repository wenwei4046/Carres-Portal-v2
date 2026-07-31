# CHECKPOINT — Purchasing · To Order

> **Handover, written 2026-07-31.** Overwritten in place; there is never a
> second version of this file.
>
> **Direction changed at the end of that session.** The page is to be rebuilt
> from the Golden Template, NOT extended from what is on screen today. This
> file is facts only — what survives, what does not, and what to read first.

---

## 0 · What is actually on screen right now

Live at `erp.carresofficial.com → Purchasing → To Order` (bundle
`index-23Unfs6W.js`, main `4073d502`).

**The accordion IS gone** — `Preview` and `PoBlock` were deleted, and
`Purchase Order Preview` greps **0** in the live bundle. Five regions render.

**What is still the 2026-07-30 page** is the SHELL around those regions, and
that is the part the new direction replaces:

| Still old | File · line |
|---|---|
| `Sidebar` — hand-rolled buttons, not a kit component | `OperationPurchase.tsx:295` |
| `DocRow` — same | `:381` |
| `StickyAction` — hand-rolled destination + button bar | `:435` |
| `IssuedPanel` — the post-issue screen | `:544` |
| `EmptyPanel` | `:584` |
| The search box | **decoration — the file contains ZERO `<input>` for it** |

`PurchaseOrderWorkspace` and `ItemsSection` are new and Design-System-based,
but they are mounted INSIDE that shell.

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

**Built, rendering on `/ui`, not yet proven by a business page:**
`Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading` · `Modal` · `Drawer` · `Select` ·
`Tooltip` · `Popover` · `Tabs` · `Checkbox` · `DatePicker` · `Toast` ·
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

## 4 · Old UI that must NOT be carried forward

1. **The whole page shell** listed in §0 — `Sidebar` · `DocRow` ·
   `StickyAction` · `IssuedPanel` · `EmptyPanel`. Hand-rolled, pre-Design-System.
2. **The 300px sidebar's search and filter** — decoration. Zero `<input>`.
3. **`Purchase Order Preview` as a concept.** The right pane is a workspace
   where an operator works, not a preview they read. The word is already gone
   from the bundle; do not reintroduce it.
4. **The accordion** — already deleted. Do not rebuild collapsible
   purchase-order strips.
5. **Anything in `docs/UI-KIT.md` §6 that a kit component now covers.**

---

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

Only the page-level wiring, and only if the rebuild replaces it:

- `OperationPurchase.tsx` — the shell in §4. The state it holds
  (`pickedKey` · `pickedDoc` · `destId` · `plan` · `issued`) is correct and can
  be lifted; the markup is not.
- `OperationPurchase.test.tsx` — 23 tests. The assertions about business
  behaviour are worth re-pointing; the ones anchored on `po-workspace`,
  `to-order-doc-*` and `to-order-include-*` describe the current shell.
- **Nothing in `packages/shared`, `components/kit` or `docs/` is discardable.**

Open question the next chat must answer, not assume: whether
`PurchaseOrderWorkspace.tsx` and `ItemsSection.tsx` survive the Golden Template
rebuild or are rebuilt inside it. They are Design-System-based and tested; they
are also shaped by the shell they currently sit in.

---

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

**Open the live page and report what is there. Change nothing.**

```
erp.carresofficial.com → Purchasing → To Order
```

Then state, as facts: which parts are the five regions, which parts are the old
shell from §0, and what the Golden Template requires that neither provides.

**No code until that report is accepted.**

---

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
`N lines · N units` · `Supplier Communication` · `Notes to Supplier`

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

## 14 · Baselines

| | |
|---|---|
| shared | 2017 / 2017 |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | **16** — `OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1 |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |
| design-standard | **8500** — the ratchet may never rise |

**The 17th failure under full-suite load is `OperationPurchase > names the real
purchase orders…`** — proved pre-existing by stashing every change and getting
the identical failure.

## 15 · Deployed

```
Main tip     4073d502
Web bundle   index-23Unfs6W.js · 4,592,479 bytes · SERVICE_ROLE 0
API Worker   c632a67e
Migration    none this session · prod applied tail 0308 · repo tail 0307
```
