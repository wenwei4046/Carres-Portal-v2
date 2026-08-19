STATUS: QUEUED
DATE: 2026-08-18
PR: pending
IMPLEMENTATION: APPROVED — owner ruled the shape with the architect 2026-08-18, build straight to production

# PURCHASING SIDEBAR — the module's pages leave the header and join the rail (one card)

**RAIL — `PortalSidebar` + `portal-nav.ts` + `PurchasingTabs.tsx`.** This card owns
the DOOR to every purchasing page. It may not touch what is INSIDE any of those
pages — no grid, no rail, no action, no copy on the page body changes here.

Read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md` §2.1 (the nav tree),
`docs/ui/MASTER.md` §4 · §6.4, `docs/purchasing/MASTER.md` §1,
`docs/COPY-STANDARD.md` (the module words) on the LATEST `origin/main`. Execute as
CONTINUOUS BUILD: implement → tests → release gate → PR → CI → merge → deploy →
prove SHA → overwrite the owning MASTERs in the same PRs. **If code structure
conflicts with this card, STOP and report — do not choose.**

## 1 · ONE rail, not two

Purchasing is about to hold eleven pages. Today the module hides all of them
behind a single sidebar word and lists them in a 44px tab strip at the top of
every page (`PurchasingTabs.tsx:64-83`). A tab strip is a good home for three
siblings and a bad home for eleven: it scrolls sideways, it cannot show a count
without shouting, and it cannot group.

The obvious fix — a second left column inside the module — is REFUSED. The portal
rail is already 232px (`PortalSidebar.tsx:179`) and a purchasing page already
carries a 200px right rail (`ui/MASTER.md` §5). A second left column would spend
roughly 430px of a 1440px screen on navigation before the first column of data.

**So the existing `Purchasing` item EXPANDS IN PLACE.** One rail. The pages become
its children, exactly the way the area groups already open and close in that same
file (`PortalSidebar.tsx:255-283`).

```
  Carres                 ⊏
  ─────────────────────────
  ▫ Dashboard
  ▫ Sales Orders      (3)
  ▾ Purchasing
      SO Batch Purchase  4
      Purchase Orders    2
      Receiving          1
      Supplier Claims
      Report
      Settings
  ▫ Delivery
  ▫ Stock
  ▫ Payments
```

Only the module you are standing in is open. Clicking `Purchasing` goes to its
first page and opens the list; clicking `Stock` closes Purchasing and opens Stock.
That is the rule the area groups already follow — *"the active area stays open"*
(`PortalSidebar.tsx:107`) — applied one level down, so nothing new is invented.

## 2 · The list, and the two renames

Six entries, and **only pages that actually exist today**:

```
SO Batch Purchase   ← `To Order` renamed
Purchase Orders
Receiving
Supplier Claims     ← `Claims` renamed
Report
Settings            ← manager only, server-gated (unchanged)
```

`To Order` → **`SO Batch Purchase`**. `To Order` reads like a status a row can be
in, not a place a buyer goes. The renamed word says whose demand it is (a sales
order's) and what the page does with it (batches it). The rename is already the
first section of `CARD-2026-08-18-so-batch-purchase.md`; whichever card ships
first performs it and the other inherits it.

`Claims` → **`Supplier Claims`**. Carres has claims in two directions — a customer
claiming from us, and us claiming from a supplier. The bare word is the one that
gets opened by mistake.

`Receiving` KEEPS ITS WORD. The eleven-page list approved on 2026-08-18 wrote
`Goods Receipts`, but `ERP-ARCHITECTURE.md:123` names pages after the job the
staff member does and blesses `Receiving` by name, and `purchasing/MASTER.md:768`
bans the letters `GRN` from a tab forever. `Goods Receipts` is a document name;
`Receiving` is the work. **The work wins.**

**NOT ADDED YET: the other seven pages.** `docs/ui-reference/03-page-patterns.md:149`
(Loo 2026-07-31): *"没建的区不可以放一个空壳。一个点了没反应的箭头是死控制。"* Seven
dead entries would teach the staff that this rail lies.

## 3 · What is left of the header row

`PurchasingTabs.tsx` STAYS and keeps drawing `ModuleHeader` — the shell law
(*"壳画头 — the shell draws the header, pages never do"*, Loo 2026-08-02) is not
being touched, and eight pages import it. **Only the `children` tab strip is
deleted.** The row keeps the nameplate, the page-meta slot and the global icons:

```
BEFORE  [🛍] Purchasing │ To Order  Purchase Orders  Receiving  Claims  Report  Settings ····· stamp │ 🔔 ❓ ⚙
AFTER   [🛍] Purchasing · Receiving ······························································· stamp │ 🔔 ❓ ⚙
```

The nameplate gains the page word after a `·`, because with the tabs gone the
header would otherwise no longer say which page you are on. `document.title` is
unchanged — it already prints `${page} · Purchasing — Carres`.

## 4 · Collapse — nothing new is invented

The rail already collapses to a 60px icon column and already remembers it
(`PortalSidebar.tsx:22` `ops-sidebar-collapsed`, `:179` width 60/232). **Reuse
both. Do not write a new width and do not write a new storage key.**

Collapsed, the children disappear and the module's ONE icon remains, exactly as
the collapsed rail behaves today (`:221-250`). A collapsed rail is for table room,
not for navigating six pages by guessing icons.

## 5 · Counts are work waiting, never totals

A number on a rail entry means **rows a human must act on today**, not how many
rows the table holds. `Purchase Orders` shows the count of POs waiting on
somebody, never every PO ever raised.

**At zero, nothing is printed.** No `0`, no grey dot, no empty pill. A zero badge
is a daily invitation to check a page that has nothing on it.

The parent `Purchasing` entry shows no number of its own. Summing its children
would produce a figure that matches no page and no queue.

Counts come from the existing `procurement` badge feed
(`portal-nav.ts:66`, `PortalSidebar.tsx:95-99`); this card only re-points and
splits them. **Any child whose count is not already fed shows no number** rather
than a guessed one.

## 6 · How the list grows

An entry joins the rail **on the day its page ships**, in the same PR that ships
it — never in advance, never in a batch at the end. The order stays the order of
the approved eleven-page list in `purchasing/MASTER.md` §1, so a page slots into
its final position the day it appears and the rail never reshuffles under a
staff member who has learned it.

## 7 · Copy

Every rail word comes from `docs/COPY-STANDARD.md`. **No new word is invented in
code.** The two renames above are added to the module-word list in the same PR.
Rail entries are nouns — a door is named for the place, not the verb; verbs are
the ACTION layer and may never share a name with a field or a door
(`purchasing/MASTER.md:211-216`).

## STILL LOCKED — do not touch

The 232/60 widths and the `ops-sidebar-collapsed` key · the area-group accordion
and its roles gating · `ModuleHeader`'s 44px white row, its colour law and the
global icon cluster · every route and `?tab=` value (this card changes the DOOR,
not the address) · the Settings server gate · the contents of all six pages ·
`StockTabs.tsx` and every other module's tab strip.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- Standing on any purchasing page, the rail shows the six children and the module
  is open; standing on Stock, Purchasing is closed.
- The six labels are exactly the six words in §2; `To Order` and `Claims` appear
  nowhere in the rendered rail.
- Settings does not render for a caller the server says may not edit.
- Collapsing hides the children, shows one icon, and survives a reload.
- A child with zero work prints no badge — assert the absence of the element, not
  a `0` string.
- The parent entry prints no count.
- The purchasing header renders the nameplate and page word and NO tab strip;
  every one of the eight importing pages still renders exactly one header.
- Every existing purchasing route still resolves from its old URL.
- Widths and row heights re-measured in a real browser; no guessed number is
  written down.

## Acceptance boundary

Authenticated production verification at 1440×900 and ~1920: the six entries under
an open `Purchasing`, both renames live, no tab strip on any purchasing page, the
collapse remembered across a reload, counts that mean work waiting and vanish at
zero, and every old purchasing link still landing on its page. Overwrite
`docs/ERP-ARCHITECTURE.md` §2.1 and `docs/ui/MASTER.md` §4 in the same PR under
the MASTER OVERWRITE LAW.
